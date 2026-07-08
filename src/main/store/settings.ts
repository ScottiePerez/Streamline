import type { Db } from './db'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

export function getSettings(db: Db): AppSettings {
  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as
    | { data: string }
    | undefined
  if (!row) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.data) as Partial<AppSettings>) }
}

export function setSettings(db: Db, partial: Partial<AppSettings>): AppSettings {
  const current = getSettings(db)
  const updated = { ...current, ...partial }
  db.prepare(
    'INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)'
  ).run(JSON.stringify(updated))
  return updated
}
