import type { Db } from './db'
import type { ModerationAction, Platform } from '../../shared/types'

interface ActionRow {
  id: string
  platform: string
  type: string
  target_user_id: string
  target_username: string
  moderator_name: string
  reason: string | null
  duration: number | null
  timestamp: number
}

function rowToAction(row: ActionRow): ModerationAction {
  return {
    id: row.id,
    platform: row.platform as Platform,
    type: row.type as ModerationAction['type'],
    targetUserId: row.target_user_id,
    targetUsername: row.target_username,
    moderatorName: row.moderator_name,
    reason: row.reason ?? undefined,
    duration: row.duration ?? undefined,
    timestamp: row.timestamp
  }
}

export function insertModerationAction(db: Db, action: ModerationAction): void {
  db.prepare(`
    INSERT OR REPLACE INTO moderation_actions
      (id, platform, type, target_user_id, target_username, moderator_name, reason, duration, timestamp)
    VALUES
      (@id, @platform, @type, @targetUserId, @targetUsername, @moderatorName, @reason, @duration, @timestamp)
  `).run({
    ...action,
    reason: action.reason ?? null,
    duration: action.duration ?? null
  })
}

export function getModerationActions(
  db: Db,
  filters: { platform?: Platform; targetUserId?: string } = {}
): ModerationAction[] {
  let query = 'SELECT * FROM moderation_actions WHERE 1=1'
  const params: (string | number)[] = []

  if (filters.platform) {
    query += ' AND platform = ?'
    params.push(filters.platform)
  }
  if (filters.targetUserId) {
    query += ' AND target_user_id = ?'
    params.push(filters.targetUserId)
  }

  query += ' ORDER BY timestamp DESC'
  return (db.prepare(query).all(...params) as ActionRow[]).map(rowToAction)
}

function csvCell(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || /^[=+\-@]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function exportModerationCsv(db: Db): string {
  const actions = getModerationActions(db)
  const header = 'id,platform,type,targetUsername,moderatorName,reason,duration,timestamp'
  const rows = actions.map(a =>
    [a.id, a.platform, a.type, a.targetUsername, a.moderatorName,
     a.reason ?? '', a.duration ?? '', a.timestamp].map(csvCell).join(',')
  )
  return [header, ...rows].join('\n')
}
