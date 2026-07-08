import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  PlatformAdapter,
  ChatMessage,
  Credentials,
  ConnectionStatus
} from '../../shared/types'

interface TikTokChatData {
  userId: string
  uniqueId: string
  nickname?: string
  profilePictureUrl?: string
  comment: string
}

interface TikTokConnection {
  on(event: string, handler: (...args: unknown[]) => void): void
  connect(): Promise<unknown>
  disconnect(): void
}

export class TikTokAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'tiktok' as const
  private connection: TikTokConnection | null = null
  private credentials: Credentials | null = null
  private status: ConnectionStatus = 'disconnected'

  async connect(credentials: Credentials): Promise<void> {
    this.credentials = credentials
    this.setStatus('connecting')

    // tiktok-live-connector is ESM-only; must use dynamic import in CJS context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { WebcastPushConnection } = await import('tiktok-live-connector') as any
    this.connection = new WebcastPushConnection(credentials.channelId) as TikTokConnection

    this.connection.on('chat', (...args: unknown[]) => {
      const data = args[0] as TikTokChatData
      const msg: ChatMessage = {
        id: randomUUID(),
        platform: 'tiktok',
        channelId: credentials.channelId,
        userId: data.userId,
        username: data.uniqueId,
        displayName: data.nickname ?? data.uniqueId,
        avatarUrl: data.profilePictureUrl ?? '',
        text: data.comment,
        timestamp: Date.now(),
        isDeleted: false,
        badges: []
      }
      this.emit('message', msg)
    })

    this.connection.on('disconnected', () => {
      if (this.status !== 'disconnected') {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      }
    })

    this.connection.on('error', (...args: unknown[]) => {
      const err = args[0]
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    })

    await this.connection.connect()
    this.setStatus('connected')
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.disconnect()
      this.connection = null
    }
    this.setStatus('disconnected')
  }

  async sendMessage(_channelId: string, _text: string): Promise<void> {
    throw new Error('TikTok: sending messages is not supported via unofficial API')
  }

  async deleteMessage(_messageId: string): Promise<void> {
    throw new Error('TikTok: deleting messages is not supported via unofficial API')
  }

  async timeoutUser(_userId: string, _durationSeconds: number): Promise<void> {
    throw new Error('TikTok: timeout is not supported via unofficial API')
  }

  async banUser(_userId: string): Promise<void> {
    throw new Error('TikTok: ban is not supported via unofficial API')
  }

  async unbanUser(_userId: string): Promise<void> {
    throw new Error('TikTok: unban is not supported via unofficial API')
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s
    this.emit('status', s)
  }

  private scheduleReconnect(attempt = 1): void {
    const delay = Math.min(1000 * 2 ** attempt, 30000)
    setTimeout(async () => {
      if (this.status === 'reconnecting' && this.credentials) {
        try {
          await this.connect(this.credentials)
        } catch {
          this.scheduleReconnect(attempt + 1)
        }
      }
    }, delay)
  }
}
