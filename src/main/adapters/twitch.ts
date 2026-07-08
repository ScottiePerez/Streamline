import * as tmi from 'tmi.js'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  PlatformAdapter,
  ChatMessage,
  Credentials,
  ConnectionStatus,
  Badge
} from '../../shared/types'

export class TwitchAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'twitch' as const
  private client: tmi.Client | null = null
  private credentials: Credentials | null = null
  private status: ConnectionStatus = 'disconnected'

  async connect(credentials: Credentials): Promise<void> {
    this.credentials = credentials
    this.setStatus('connecting')

    this.client = new tmi.Client({
      identity: {
        username: credentials.username ?? 'justinfan12345',
        password: credentials.token
      },
      channels: [credentials.channelId]
    })

    this.client.on('chat', (_channel: string, userstate: tmi.ChatUserstate, message: string, _self: boolean) => {
      const msg: ChatMessage = {
        id: randomUUID(),
        platform: 'twitch',
        channelId: credentials.channelId,
        userId: userstate['user-id'] ?? userstate.username ?? '',
        username: userstate.username ?? '',
        displayName: userstate['display-name'] ?? userstate.username ?? '',
        avatarUrl: '',
        text: message,
        timestamp: Date.now(),
        isDeleted: false,
        badges: this.parseBadges((userstate.badges ?? {}) as Record<string, string>)
      }
      this.emit('message', msg)
    })

    this.client.on('disconnected', (_reason: string) => {
      if (this.status !== 'disconnected') {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      }
    })

    await this.client.connect()
    this.setStatus('connected')
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect()
      this.client = null
    }
    this.setStatus('disconnected')
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    if (!this.client) throw new Error('Twitch client not connected')
    await this.client.say(`#${channelId}`, text)
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.client || !this.credentials) throw new Error('Twitch client not connected')
    await this.client.deletemessage(this.credentials.channelId, messageId)
  }

  async timeoutUser(userId: string, durationSeconds: number): Promise<void> {
    if (!this.client || !this.credentials) throw new Error('Twitch client not connected')
    await this.client.timeout(this.credentials.channelId, userId, durationSeconds)
  }

  async banUser(userId: string): Promise<void> {
    if (!this.client || !this.credentials) throw new Error('Twitch client not connected')
    await this.client.ban(this.credentials.channelId, userId)
  }

  async unbanUser(userId: string): Promise<void> {
    if (!this.client || !this.credentials) throw new Error('Twitch client not connected')
    await this.client.unban(this.credentials.channelId, userId)
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status
    this.emit('status', status)
  }

  private parseBadges(badges: Record<string, string>): Badge[] {
    return Object.entries(badges).map(([id, version]) => ({
      id: `${id}/${version}`,
      label: id
    }))
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
