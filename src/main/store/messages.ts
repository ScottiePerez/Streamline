import type { Db } from './db'
import type { ChatMessage, Platform, Badge } from '../../shared/types'

interface MessageRow {
  id: string
  platform: string
  channel_id: string
  user_id: string
  username: string
  display_name: string
  avatar_url: string
  text: string
  timestamp: number
  is_deleted: number
  badges: string
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    platform: row.platform as Platform,
    channelId: row.channel_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    text: row.text,
    timestamp: row.timestamp,
    isDeleted: row.is_deleted === 1,
    badges: JSON.parse(row.badges) as Badge[]
  }
}

export function insertMessage(db: Db, msg: ChatMessage): void {
  db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, platform, channel_id, user_id, username, display_name, avatar_url, text, timestamp, is_deleted, badges)
    VALUES
      (@id, @platform, @channelId, @userId, @username, @displayName, @avatarUrl, @text, @timestamp, @isDeleted, @badges)
  `).run({
    ...msg,
    isDeleted: msg.isDeleted ? 1 : 0,
    badges: JSON.stringify(msg.badges)
  })
}

export function getRecentMessages(db: Db, limit: number): ChatMessage[] {
  const rows = db.prepare(
    'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?'
  ).all(limit) as MessageRow[]
  return rows.map(rowToMessage)
}

export function markMessageDeleted(db: Db, id: string): void {
  db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?').run(id)
}

export function pruneMessages(db: Db, platform: Platform, maxCount: number): void {
  db.prepare(`
    DELETE FROM messages
    WHERE platform = ? AND id NOT IN (
      SELECT id FROM messages WHERE platform = ?
      ORDER BY timestamp DESC LIMIT ?
    )
  `).run(platform, platform, maxCount)
}
