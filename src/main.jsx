import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Alert, Box, Button, Chip, CssBaseline, Dialog, DialogActions, DialogContent, DialogTitle,
  Drawer, LinearProgress, MenuItem, Paper, Stack, TextField, ThemeProvider, Typography, createTheme,
} from '@mui/material'
import modules from '../shared/modules.json'
import './styles.css'

const theme = createTheme({
  palette: { primary: { main: '#285442' }, background: { default: '#f5f6f0', paper: '#ffffff' } },
  typography: { fontFamily: 'Inter, system-ui, sans-serif', button: { textTransform: 'none', fontWeight: 700 } },
  shape: { borderRadius: 12 },
})
const groups = [
  ['Essentials', modules.slice(0, 7)],
  ['Daily life', modules.slice(7, 13)],
  ['Personal', modules.slice(13)],
]
const statuses = { planned: 'Planned', in_progress: 'In progress', done: 'Done' }
const intervals = { none: 'One time', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const formatDate = value => value ? dateFormat.format(new Date(value)) : 'Unscheduled'
const formatAmount = (value, unit) => unit === 'INR' ? money.format(value) : `${value} ${unit}`
const modulePath = slug => `/modules/${slug}`

async function request(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? 'The dashboard could not complete the request.')
  return data
}

function dateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function RecordForm({ module, original, onClose, onSave }) {
  const [draft, setDraft] = useState({
    title: original?.title ?? '', notes: original?.notes ?? '', kind: original?.kind ?? module.kinds[0],
    amount: original?.amount ?? '', status: original?.status ?? 'planned',
    due: dateInput(original?.dueAt), recurrence: original?.recurrence ?? 'none',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const field = name => ({ value: draft[name], onChange: event => setDraft({ ...draft, [name]: event.target.value }) })

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { due, amount, ...fields } = draft
      await onSave({
        ...fields, amount: amount === '' ? null : Number(amount),
        dueAt: due ? new Date(due).toISOString() : null,
      })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
    <Box component="form" onSubmit={submit}>
      <DialogTitle>{original ? 'Edit entry' : 'Add entry'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Title" required autoFocus slotProps={{ htmlInput: { maxLength: 160 } }} {...field('title')} />
          <TextField select label="Category" {...field('kind')}>
            {module.kinds.map(kind => <MenuItem key={kind} value={kind}>{kind}</MenuItem>)}
          </TextField>
          <TextField select label="Status" {...field('status')}>
            {Object.entries(statuses).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField type="datetime-local" label={module.slug === 'reminders' ? 'First scheduled alert' : 'Date and time'}
            required={module.slug === 'reminders'} slotProps={{ inputLabel: { shrink: true } }} {...field('due')} />
          {module.slug === 'reminders' && <TextField select label="Repeat" {...field('recurrence')}>
            {Object.entries(intervals).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>}
          {module.unit && <TextField type="number" label={module.unit === 'INR' ? 'Amount (INR)' : `Duration (${module.unit})`}
            slotProps={{ htmlInput: { min: 0, step: 0.01, max: 999999999999.99 } }} {...field('amount')} />}
          <TextField label="Notes" multiline minRows={3} slotProps={{ htmlInput: { maxLength: 5000 } }} {...field('notes')} />
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</Button></DialogActions>
    </Box>
  </Dialog>
}

function Suggestions({ navigate }) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function suggest(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const data = await request('/suggestions', 'POST', { text: input })
      setResult(data.suggestions)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Paper component="section" variant="outlined" className="suggestion">
    <Typography component="h2" variant="h6">Find the right module</Typography>
    <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={suggest} sx={{ mt: 1.5 }}>
      <TextField size="small" fullWidth label="What would you like to track?" value={input}
        slotProps={{ htmlInput: { maxLength: 1000 } }} onChange={event => setInput(event.target.value)} />
      <Button type="submit" variant="contained" disabled={!input.trim() || busy}>{busy ? 'Checking…' : 'Suggest'}</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    {result?.length === 0 && <Typography sx={{ mt: 2 }}>No match yet. Try a more specific description.</Typography>}
    {result?.map(({ module, matchedTerms }) => <Box key={module} sx={{ mt: 1 }}>
      <Button component="a" href={modulePath(module)} onClick={event => navigate(event, modulePath(module))}>
        {modules.find(item => item.slug === module).name}
      </Button>
      <Typography variant="caption" color="text.secondary">{matchedTerms.join(', ')}</Typography>
    </Box>)}
  </Paper>
}

function ModuleView({ module, records, openEditor, remove }) {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const visible = records.filter(record => (status === 'all' || record.status === status) &&
    (category === 'all' || record.kind === category) &&
    `${record.title} ${record.kind} ${record.notes}`.toLowerCase().includes(search.trim().toLowerCase()))
  const upcoming = records.filter(record => {
    const date = module.slug === 'reminders' ? record.nextAlertAt : record.dueAt
    return record.status !== 'done' && date && new Date(date) >= new Date()
  }).length
  return <>
    <section className="hero module-hero">
      <Box>
        <Typography component="h1" variant="h3">{module.name}</Typography>
        <Typography className="hero-detail">{module.description}</Typography>
      </Box>
      <Button variant="contained" className="hero-action" onClick={() => openEditor(null)}>Add entry</Button>
    </section>
    <div className="stats">
      {[['Total entries', records.length], ['Upcoming', upcoming], ['Completed', records.filter(item => item.status === 'done').length]].map(([label, value]) =>
        <Paper key={label} variant="outlined" className="stat"><Typography color="text.secondary" variant="body2">{label}</Typography>
          <Typography component="p" variant="h4">{value}</Typography></Paper>)}
    </div>
    <section className="category-section" aria-label="Categories">
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Chip label="All categories" onClick={() => setCategory('all')} color={category === 'all' ? 'primary' : 'default'} />
        {module.kinds.map(kind => {
          const items = records.filter(record => record.kind === kind)
          const total = items.reduce((sum, record) => sum + (record.amount ?? 0), 0)
          const showTotal = ['finance', 'fitness', 'learning', 'mindfulness'].includes(module.slug) &&
            items.some(record => record.amount !== null)
          return <Chip key={kind} onClick={() => setCategory(kind)} color={category === kind ? 'primary' : 'default'}
            label={`${kind} · ${items.length}${showTotal ? ` · ${formatAmount(total, module.unit)}` : ''}`} />
        })}
      </Stack>
    </section>
    <Paper component="section" variant="outlined" className="entries">
      <Typography component="h2" variant="h6">Entries</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ my: 2 }}>
        <TextField fullWidth size="small" label="Search entries" value={search} onChange={event => setSearch(event.target.value)} />
        <TextField select size="small" label="Status" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="all">All statuses</MenuItem>
          {Object.entries(statuses).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
        </TextField>
      </Stack>
      {!visible.length && <Typography color="text.secondary">{records.length ? 'No entries match these filters.' : 'No entries yet.'}</Typography>}
      {visible.map(record => <article key={record.id} className="entry">
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{record.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {[record.kind, formatDate(record.dueAt), record.amount !== null && formatAmount(record.amount, module.unit),
              module.slug === 'reminders' && intervals[record.recurrence]].filter(Boolean).join(' · ')}
          </Typography>
          {record.nextAlertAt && <Typography variant="body2">Next alert {formatDate(record.nextAlertAt)}</Typography>}
          {record.notes && <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.notes}</Typography>}
        </Box>
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
          <Chip size="small" label={statuses[record.status]} />
          <Button size="small" onClick={() => openEditor(record)}>Edit</Button>
          <Button size="small" color="error" onClick={() => remove(record)}>Delete</Button>
        </Stack>
      </article>)}
    </Paper>
  </>
}

function App() {
  const [path, setPath] = useState(location.pathname)
  const [records, setRecords] = useState([])
  const [alerts, setAlerts] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [inbox, setInbox] = useState(false)
  const [editor, setEditor] = useState(false)
  const [deletion, setDeletion] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const module = modules.find(item => modulePath(item.slug) === path)
  const unread = alerts.filter(alert => !alert.readAt).length

  async function refresh() {
    const [entries, messages] = await Promise.all([request('/records'), request('/alerts')])
    setRecords(entries)
    setAlerts(messages)
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [entries, messages] = await Promise.all([request('/records'), request('/alerts')])
        if (active) {
          setRecords(entries)
          setAlerts(messages)
          setError('')
        }
      } catch (failure) {
        if (active) setError(failure.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    function pop() {
      setEditor(false)
      setPath(location.pathname)
    }
    load()
    const timer = setInterval(load, 30000)
    window.addEventListener('popstate', pop)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('popstate', pop)
    }
  }, [])

  function navigate(event, destination) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    history.pushState(null, '', destination)
    setPath(destination)
    setDrawer(false)
    window.scrollTo(0, 0)
  }

  async function reloadAfterWrite() {
    try {
      await refresh()
      setError('')
    } catch {
      setError('Change saved. The dashboard could not refresh its data.')
    }
  }

  async function save(data) {
    const url = `/modules/${module.slug}/records`
    await request(editor ? `${url}/${editor.id}` : url, editor ? 'PUT' : 'POST', data)
    setEditor(false)
    await reloadAfterWrite()
  }

  async function remove() {
    setDeleting(true)
    try {
      await request(`/modules/${deletion.module}/records/${deletion.id}`, 'DELETE')
      setDeletion(null)
      await reloadAfterWrite()
    } catch (failure) {
      setError(failure.message)
      setDeletion(null)
    } finally {
      setDeleting(false)
    }
  }

  async function markRead(id) {
    try {
      await request(`/alerts/${id}`, 'PATCH')
      await reloadAfterWrite()
    } catch (failure) {
      setError(failure.message)
      setInbox(false)
    }
  }

  function link(label, destination) {
    return <a key={destination} className="nav-link" href={destination}
      aria-current={path === destination ? 'page' : undefined} onClick={event => navigate(event, destination)}>{label}</a>
  }

  const navigation = <nav className="navigation" aria-label="Dashboard modules">
    <div className="brand">Life Dashboard</div>
    {link('Overview', '/')}
    {groups.map(([label, items]) => <div key={label} className="nav-group">
      <div className="nav-label">{label}</div>
      {items.map(item => link(item.name, modulePath(item.slug)))}
    </div>)}
  </nav>

  return <div className="layout">
    <aside className="desktop-nav">{navigation}</aside>
    <Drawer open={drawer} onClose={() => setDrawer(false)}>{navigation}</Drawer>
    <main className="main">
      <header className="topbar">
        <Button className="mobile-menu" onClick={() => setDrawer(true)}>Modules</Button>
        <Typography variant="body2" color="text.secondary">{module?.name ?? 'Overview'}</Typography>
        <Button variant="outlined" onClick={() => setInbox(true)}>Alerts{unread > 0 ? ` (${unread})` : ''}</Button>
      </header>
      {loading && <LinearProgress aria-label="Loading dashboard" />}
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      {module ? <ModuleView key={module.slug} module={module} records={records.filter(item => item.module === module.slug)}
        openEditor={setEditor} remove={setDeletion} /> : path === '/' ? <>
        <section className="hero">
          <Typography component="h1" variant="h3">Life Dashboard</Typography>
          <Typography className="hero-detail">Manage your personal life, family commitments and work in one place.</Typography>
          <div className="hero-summary"><span><strong>{modules.length}</strong> modules</span>
            <span><strong>{records.length}</strong> entries</span><span><strong>{unread}</strong> unread alerts</span></div>
        </section>
        <Suggestions navigate={navigate} />
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>Modules</Typography>
        <div className="module-grid">{modules.map(item =>
          <Paper key={item.slug} component="a" variant="outlined" className="module-card"
            href={modulePath(item.slug)} onClick={event => navigate(event, modulePath(item.slug))}>
            <Typography component="h3" fontWeight={750}>{item.name}</Typography>
            <Typography color="text.secondary" variant="body2">{item.description}</Typography>
          </Paper>)}
        </div>
      </> : <Alert severity="warning">Module not found. Open a module from the menu.</Alert>}
    </main>
    {editor !== false && module && <RecordForm key={`${module.slug}-${editor?.id ?? 'new'}`} module={module}
      original={editor} onClose={() => setEditor(false)} onSave={save} />}
    <Dialog open={Boolean(deletion)} onClose={deleting ? undefined : () => setDeletion(null)}>
      <DialogTitle>Delete entry?</DialogTitle>
      <DialogContent>{deletion?.title}</DialogContent>
      <DialogActions><Button disabled={deleting} onClick={() => setDeletion(null)}>Cancel</Button>
        <Button disabled={deleting} color="error" onClick={remove}>Delete</Button></DialogActions>
    </Dialog>
    <Drawer anchor="right" open={inbox} onClose={() => setInbox(false)}>
      <Box sx={{ width: { xs: 300, sm: 400 }, p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography component="h2" variant="h6">Scheduled alerts</Typography><Button onClick={() => setInbox(false)}>Close</Button>
        </Stack>
        {!alerts.length && <Typography color="text.secondary">No alerts yet.</Typography>}
        {alerts.map(item => <article className="entry" key={item.id}>
          <Box><Typography fontWeight={700}>{item.title}</Typography>
            <Typography variant="body2" color="text.secondary">{formatDate(item.occurrenceAt)}</Typography></Box>
          {!item.readAt && <Button size="small" onClick={() => markRead(item.id)}>Mark read</Button>}
        </article>)}
      </Box>
    </Drawer>
  </div>
}

createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>)
