import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  PlatformAdapter,
  ChatMessage,
  Credentials,
  ConnectionStatus
} from '../../shared/types'

const GRAPH_API = 'https://graph.facebook.com/v19.0'
const POLL_INTERVAL_MS = 5000

interface FacebookComment {
  id: string
  from?: { id: string; name: string }
  message: string
  created_time: string
}

export class FacebookAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'facebook' as const
  private credentials: Credentials | null = null
  private status: ConnectionStatus = 'disconnected'
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private seenIds = new Set<string>()
  private since = 0

  async connect(credentials: Credentials): Promise<void> {
    this.credentials = credentials
    this.since = Math.floor(Date.now() / 1000)
    this.seenIds.clear()
    this.setStatus('connecting')

    const res = await fetch(
      `${GRAPH_API}/${credentials.channelId}?fields=id,title&access_token=${credentials.token}`
    )
    if (!res.ok) throw new Error(`Facebook auth failed: ${res.status}`)

    this.setStatus('connected')
    this.schedulePoll(POLL_INTERVAL_MS)
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    this.setStatus('disconnected')
  }

  async sendMessage(_channelId: string, text: string): Promise<void> {
    if (!this.credentials) throw new Error('Facebook not connected')
    const res = await fetch(
      `${GRAPH_API}/${this.credentials.channelId}/comments?access_token=${this.credentials.token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      }
    )
    if (!res.ok) throw new Error(`Facebook send failed: ${res.status}`)
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.credentials) throw new Error('Facebook not connected')
    const res = await fetch(
      `${GRAPH_API}/${messageId}?access_token=${this.credentials.token}`,
      { method: 'DELETE' }
    )
    if (!res.ok) throw new Error(`Facebook delete failed: ${res.status}`)
  }

  async timeoutUser(_userId: string, _durationSeconds: number): Promise<void> {
    throw new Error('Facebook: timeout is not supported via Graph API')
  }

  async banUser(userId: string): Promise<void> {
    if (!this.credentials) throw new Error('Facebook not connected')
    const pageId = this.credentials.userId
    if (!pageId) throw new Error('Facebook: pageId required in credentials.userId for ban')
    const res = await fetch(
      `${GRAPH_API}/${pageId}/blocked?access_token=${this.credentials.token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userId })
      }
    )
    if (!res.ok) throw new Error(`Facebook ban failed: ${res.status}`)
  }

  async unbanUser(userId: string): Promise<void> {
    console.warn(`[facebook] unbanUser called for ${userId} — Facebook unban not yet implemented`)
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s
    this.emit('status', s)
  }

  private schedulePoll(delayMs: number): void {
    this.pollTimer = setTimeout(() => { void this.poll() }, delayMs)
  }

  private async poll(): Promise<void> {
    if (!this.credentials) return
    try {
      const url = `${GRAPH_API}/${this.credentials.channelId}/live_comments?fields=id,from,message,created_time&since=${this.since}&access_token=${this.credentials.token}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Facebook poll failed: ${res.status}`)

      const body = await res.json() as { data?: FacebookComment[] }
      for (const comment of body.data ?? []) {
        if (this.seenIds.has(comment.id)) continue
        this.seenIds.add(comment.id)
        const ts = new Date(comment.created_time).getTime()
        this.since = Math.max(this.since, Math.floor(ts / 1000))
        const msg: ChatMessage = {
          id: comment.id,
          platform: 'facebook',
          channelId: this.credentials.channelId,
          userId: comment.from?.id ?? randomUUID(),
          username: comment.from?.name ?? 'Unknown',
          displayName: comment.from?.name ?? 'Unknown',
          avatarUrl: '',
          text: comment.message,
          timestamp: ts,
          isDeleted: false,
          badges: []
        }
        this.emit('message', msg)
      }

      this.schedulePoll(POLL_INTERVAL_MS)
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      if (this.status !== 'disconnected') {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      }
    }
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
