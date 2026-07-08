import Pusher from 'pusher-js'
import { EventEmitter } from 'events'
import type {
  PlatformAdapter,
  ChatMessage,
  Credentials,
  ConnectionStatus,
  Badge
} from '../../shared/types'

const KICK_PUSHER_KEY = '32cbd69e4b950bf97679'
const KICK_PUSHER_CLUSTER = 'us2'
const KICK_API = 'https://kick.com/api/v2'

interface KickChatMessage {
  id: string
  chatroom_id: number
  content: string
  type: string
  created_at: string
  sender: {
    id: number
    username: string
    slug: string
    identity?: { color: string; badges: Array<{ type: string; text: string }> }
  }
}

export class KickAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'kick' as const
  private pusher: Pusher | null = null
  private credentials: Credentials | null = null
  private chatroomId: number | null = null
  private status: ConnectionStatus = 'disconnected'

  async connect(credentials: Credentials): Promise<void> {
    this.credentials = credentials
    this.setStatus('connecting')

    // Resolve slug → numeric chatroom ID
    const res = await fetch(`${KICK_API}/channels/${credentials.channelId}`)
    if (!res.ok) throw new Error(`Kick: failed to resolve channel '${credentials.channelId}'`)
    const data = await res.json() as { chatroom: { id: number } }
    this.chatroomId = data.chatroom.id

    this.pusher = new Pusher(KICK_PUSHER_KEY, { cluster: KICK_PUSHER_CLUSTER })

    const channel = this.pusher.subscribe(`chatrooms.${this.chatroomId}.v2`)
    channel.bind('App\\Events\\ChatMessageEvent', (msg: KickChatMessage) => {
      const chat: ChatMessage = {
        id: msg.id,
        platform: 'kick',
        channelId: credentials.channelId,
        userId: String(msg.sender.id),
        username: msg.sender.slug,
        displayName: msg.sender.username,
        avatarUrl: '',
        text: msg.content,
        timestamp: new Date(msg.created_at).getTime(),
        isDeleted: false,
        badges: this.parseBadges(msg.sender.identity?.badges ?? [])
      }
      this.emit('message', chat)
    })

    this.pusher.connection.bind('disconnected', () => {
      if (this.status !== 'disconnected') {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      }
    })
    this.pusher.connection.bind('error', (err: Error) => this.emit('error', err))

    this.setStatus('connected')
  }

  async disconnect(): Promise<void> {
    if (this.pusher) {
      this.pusher.disconnect()
      this.pusher = null
    }
    this.setStatus('disconnected')
  }

  async sendMessage(_channelId: string, text: string): Promise<void> {
    if (!this.credentials || this.chatroomId === null) throw new Error('Kick not connected')
    const res = await fetch(`${KICK_API}/messages/send/${this.chatroomId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: text, type: 'message' })
    })
    if (!res.ok) throw new Error(`Kick send failed: ${res.status}`)
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.credentials || this.chatroomId === null) throw new Error('Kick not connected')
    const res = await fetch(`${KICK_API}/channels/${this.chatroomId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.credentials.token}` }
    })
    if (!res.ok) throw new Error(`Kick delete failed: ${res.status}`)
  }

  async timeoutUser(userId: string, durationSeconds: number): Promise<void> {
    if (!this.credentials || this.chatroomId === null) throw new Error('Kick not connected')
    const res = await fetch(`${KICK_API}/channels/${this.chatroomId}/bans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ banned_username: userId, duration: durationSeconds, permanent: false })
    })
    if (!res.ok) throw new Error(`Kick timeout failed: ${res.status}`)
  }

  async banUser(userId: string): Promise<void> {
    if (!this.credentials || this.chatroomId === null) throw new Error('Kick not connected')
    const res = await fetch(`${KICK_API}/channels/${this.chatroomId}/bans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ banned_username: userId, permanent: true })
    })
    if (!res.ok) throw new Error(`Kick ban failed: ${res.status}`)
  }

  async unbanUser(userId: string): Promise<void> {
    console.warn(`[kick] unbanUser called for ${userId} — Kick unban not yet implemented`)
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s
    this.emit('status', s)
  }

  private parseBadges(badges: Array<{ type: string; text: string }>): Badge[] {
    return badges.map(b => ({ id: b.type, label: b.text }))
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
