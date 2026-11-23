import fs from 'node:fs'

export const modules = JSON.parse(fs.readFileSync(new URL('../shared/modules.json', import.meta.url)))
export const moduleBySlug = new Map(modules.map(module => [module.slug, module]))

export function validateRecord(body, module) {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const { kind, amount = null, dueAt = null, notes = '', status = 'planned', recurrence = 'none' } = body ?? {}
  if (!title || title.length > 160) throw new Error('Enter a title of 1–160 characters.')
  if (!module.kinds.includes(kind)) throw new Error('Choose a category from this module.')
  if (typeof notes !== 'string' || notes.length > 5000) throw new Error('Notes can contain up to 5,000 characters.')
  if (!['planned', 'in_progress', 'done'].includes(status)) throw new Error('Choose a valid status.')
  if (!['none', 'weekly', 'monthly', 'yearly'].includes(recurrence) ||
      (module.slug !== 'reminders' && recurrence !== 'none')) throw new Error('Choose a supported recurrence.')
  if (amount !== null && (!module.unit || !Number.isFinite(amount) || amount < 0 || amount > 999999999999.99)) {
    throw new Error('Enter a valid non-negative amount.')
  }
  let due = null
  if (dueAt !== null) {
    if (typeof dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dueAt) ||
        !Number.isFinite(Date.parse(dueAt)) || new Date(dueAt).toISOString() !== dueAt ||
        dueAt < '1000-01-01' || dueAt > '9999-12-30') throw new Error('Enter a valid date and time.')
    due = dueAt.slice(0, 19).replace('T', ' ')
  }
  if (module.slug === 'reminders' && !due) throw new Error('Choose when the reminder is due.')
  return { title, kind, notes, status, amount, due, recurrence }
}
