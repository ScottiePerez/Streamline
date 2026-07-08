import { EventEmitter } from 'events'
import type { PlatformAdapter, ChatMessage, Platform, ConnectionStatus } from '../shared/types'
import type { Db } from './store/db'
import { insertMessage, pruneMessages } from './store/messages'
import { insertModerationAction, deleteModerationAction } from './store/moderation'
import { getSettings } from './store/settings'
import { randomUUID } from 'crypto'

export interface ModerationResult {
  success: boolean
  platform: Platform
  actionType: 'delete' | 'timeout' | 'ban'
  targetUserId: string
  messageId?: string
  error?: string
}

export class ChatBus extends EventEmitter {
  private adapters = new Map<Platform, PlatformAdapter>()
  private db: Db

  constructor(db: Db) {
    super()
    this.db = db
  }

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter)

    adapter.on('message', (msg: ChatMessage) => {
      insertMessage(this.db, msg)
      const settings = getSettings(this.db)
      pruneMessages(this.db, msg.platform, settings.maxMessagesPerPlatform)
      this.emit('message', msg)
    })

    adapter.on('error', (err: Error) => {
      this.emit('platformError', adapter.platform, err)
    })

    adapter.on('status', (status: ConnectionStatus) => {
      this.emit('status', adapter.platform, status)
    })
  }

  async sendMessage(platform: Platform, channelId: string, text: string): Promise<void> {
    const adapter = this.adapters.get(platform)
    if (!adapter) throw new Error(`No adapter registered for ${platform}`)
    await adapter.sendMessage(channelId, text)
  }

  async moderate(
    platform: Platform,
    actionType: 'delete' | 'timeout' | 'ban',
    targetUserId: string,
    messageId?: string,
    durationSeconds?: number,
    moderatorName = 'host'
  ): Promise<ModerationResult> {
    const adapter = this.adapters.get(platform)
    if (!adapter) {
      return { success: false, platform, actionType, targetUserId, error: `No adapter for ${platform}` }
    }

    try {
      if (actionType === 'delete' && messageId) {
        await adapter.deleteMessage(messageId)
      } else if (actionType === 'timeout') {
        await adapter.timeoutUser(targetUserId, durationSeconds ?? 60)
      } else if (actionType === 'ban') {
        await adapter.banUser(targetUserId)
      }

      insertModerationAction(this.db, {
        id: randomUUID(),
        platform,
        type: actionType,
        targetUserId,
        targetUsername: targetUserId,
        moderatorName,
        duration: durationSeconds,
        timestamp: Date.now()
      })

      const result: ModerationResult = { success: true, platform, actionType, targetUserId, messageId }
      this.emit('modResult', result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      const result: ModerationResult = { success: false, platform, actionType, targetUserId, error }
      this.emit('modResult', result)
      return result
    }
  }

  async unban(
    platform: Platform,
    userId: string,
    actionId: string
  ): Promise<{ success: boolean; error?: string }> {
    const adapter = this.adapters.get(platform)
    if (!adapter) {
      return { success: false, error: `No adapter for ${platform}` }
    }
    try {
      await adapter.unbanUser(userId)
      deleteModerationAction(this.db, actionId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
