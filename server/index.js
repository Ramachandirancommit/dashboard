import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import mysql from 'mysql2/promise'
import { moduleBySlug, validateRecord } from './records.js'

const { DASHBOARD_PASSWORD, DASHBOARD_USER = 'dashboard', DB_HOST = '127.0.0.1',
  DB_PORT = '3306', DB_USER = 'dashboard', DB_PASSWORD, DB_NAME = 'dashboard', PORT = '3000' } = process.env
if (!DASHBOARD_PASSWORD || DASHBOARD_PASSWORD.length < 16 || !DB_PASSWORD) {
  throw new Error('Set DB_PASSWORD and a DASHBOARD_PASSWORD with at least 16 characters.')
}

const pool = mysql.createPool({
  host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD,
  database: DB_NAME, timezone: 'Z', connectionLimit: 8, decimalNumbers: true,
})
const app = express()
app.disable('x-powered-by')
const digest = value => crypto.createHash('sha256').update(value).digest()
const credential = digest(`${DASHBOARD_USER}:${DASHBOARD_PASSWORD}`)
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const classifier = fileURLToPath(new URL('../jobs/classify.py', import.meta.url))
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

app.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() === 'basic' && token &&
      crypto.timingSafeEqual(credential, digest(Buffer.from(token, 'base64')))) return next()
  res.set('WWW-Authenticate', 'Basic realm="Life Dashboard", charset="UTF-8"')
  res.status(401).json({ error: 'Dashboard sign-in required.' })
})
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Dashboard-Request') !== '1') {
    return res.status(403).json({ error: 'Request header required.' })
  }
  next()
})
app.use(express.json({ limit: '32kb' }))

const columns = 'id, module, kind, title, notes, status, amount, due_at AS dueAt, next_alert_at AS nextAlertAt, recurrence'
app.get('/api/records', async (req, res) => {
  const [records] = await pool.query(`SELECT ${columns} FROM records ORDER BY id DESC`)
  res.json(records)
})

app.param('module', (req, res, next, slug) => {
  req.dashboardModule = moduleBySlug.get(slug)
  if (!req.dashboardModule) return res.status(404).json({ error: 'Module not found.' })
  next()
})
app.param('id', (req, res, next, id) => {
  if (!/^\d{1,10}$/.test(id) || Number(id) < 1 || Number(id) > 4294967295) {
    return res.status(404).json({ error: 'Record not found.' })
  }
  next()
})

function input(req, res, next) {
  try {
    req.record = validateRecord(req.body, req.dashboardModule)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
  next()
}

app.post('/api/modules/:module/records', input, async (req, res) => {
  const { title, kind, notes, status, amount, due, recurrence } = req.record
  const slug = req.dashboardModule.slug
  const nextAlert = slug === 'reminders' && status !== 'done' ? due : null
  const [result] = await pool.execute(
    'INSERT INTO records (module, title, kind, notes, status, amount, due_at, recurrence, next_alert_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [slug, title, kind, notes, status, amount, due, recurrence, nextAlert],
  )
  res.status(201).json({ id: result.insertId })
})

app.put('/api/modules/:module/records/:id', input, async (req, res) => {
  const { title, kind, notes, status, amount, due, recurrence } = req.record
  const slug = req.dashboardModule.slug
  const [result] = await pool.execute(`
    UPDATE records SET
      next_alert_at = CASE
        WHEN module <> 'reminders' OR ? = 'done' THEN NULL
        WHEN status = 'done' OR NOT (due_at <=> ?) OR recurrence <> ? THEN ?
        ELSE next_alert_at
      END,
      title = ?, kind = ?, notes = ?, status = ?, amount = ?, due_at = ?, recurrence = ?
    WHERE id = ? AND module = ?`,
    [status, due, recurrence, due, title, kind, notes, status, amount, due, recurrence, req.params.id, slug],
  )
  res.status(result.affectedRows ? 200 : 404).json(result.affectedRows ? { id: Number(req.params.id) } : { error: 'Record not found.' })
})

app.delete('/api/modules/:module/records/:id', async (req, res) => {
  const [result] = await pool.execute('DELETE FROM records WHERE id = ? AND module = ?', [req.params.id, req.dashboardModule.slug])
  if (!result.affectedRows) return res.status(404).json({ error: 'Record not found.' })
  res.status(204).end()
})

app.get('/api/alerts', async (req, res) => {
  const [alerts] = await pool.query(`
    SELECT id, title, occurrence_at AS occurrenceAt, read_at AS readAt
    FROM alerts ORDER BY read_at IS NOT NULL ASC, occurrence_at DESC, id DESC LIMIT 100`)
  res.json(alerts)
})

app.patch('/api/alerts/:id', async (req, res) => {
  const [result] = await pool.execute('UPDATE alerts SET read_at = COALESCE(read_at, UTC_TIMESTAMP()) WHERE id = ?', [req.params.id])
  if (!result.affectedRows) return res.status(404).json({ error: 'Alert not found.' })
  res.status(204).end()
})

let classificationRunning = false
app.post('/api/suggestions', async (req, res) => {
  const value = req.body?.text
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
    return res.status(400).json({ error: 'Enter between 1 and 1,000 characters.' })
  }
  if (classificationRunning) return res.status(429).json({ error: 'Suggestion in progress. Try again shortly.' })
  classificationRunning = true
  try {
    const [examples] = await pool.query('SELECT module, title FROM records ORDER BY id DESC LIMIT 400')
    const result = await new Promise((resolve, reject) => {
      const child = spawn('python3', [classifier], { stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 })
      let output = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => { output += chunk })
      child.stdin.on('error', reject)
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) return reject(new Error('Classifier exited unsuccessfully.'))
        try {
          resolve(JSON.parse(output))
        } catch (error) {
          reject(error)
        }
      })
      child.stdin.end(JSON.stringify({ text: value, examples }))
    })
    res.json(result)
  } finally {
    classificationRunning = false
  }
})

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }))
app.use(express.static(dist, { cacheControl: false }))
app.get(['/', '/modules/:slug'], (req, res) => res.sendFile(path.join(dist, 'index.html'), { cacheControl: false }))
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.status === 400 || error.status === 413) return res.status(error.status).json({ error: 'Invalid request body.' })
  console.error(error.code ?? error.name)
  res.status(500).json({ error: 'The dashboard could not complete the request.' })
})

for (let attempt = 0; ; attempt++) {
  try {
    await pool.query('SELECT id FROM records LIMIT 0')
    break
  } catch (error) {
    if (attempt >= 19) throw error
    await pause(1500)
  }
}
app.listen(Number(PORT), '0.0.0.0', () => console.log(`Dashboard listening on port ${PORT}`))
