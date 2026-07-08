import { google } from 'googleapis'
import type { youtube_v3 } from 'googleapis'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  PlatformAdapter,
  ChatMessage,
  Credentials,
  ConnectionStatus,
  Badge
} from '../../shared/types'

export class YouTubeAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'youtube' as const
  private yt: youtube_v3.Youtube | null = null
  private liveChatId: string | null = null
  private credentials: Credentials | null = null
  private status: ConnectionStatus = 'disconnected'
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private pageToken: string | undefined

  async connect(credentials: Credentials): Promise<void> {
    this.credentials = credentials
    this.setStatus('connecting')

    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: credentials.token })
    this.yt = google.youtube({ version: 'v3', auth })

    const broadcasts = await this.yt.liveBroadcasts.list({
      part: ['snippet', 'status'],
      mine: true
    })

    const active = (broadcasts.data.items ?? []).find(
      b => b.status?.lifeCycleStatus === 'live' || b.status?.lifeCycleStatus === 'testing'
    )

    if (!active?.snippet?.liveChatId) {
      throw new Error('No active YouTube live broadcast found')
    }

    this.liveChatId = active.snippet.liveChatId
    this.setStatus('connected')
    this.schedulePoll(2000)
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    this.yt = null
    this.liveChatId = null
    this.pageToken = undefined
    this.setStatus('disconnected')
  }

  async sendMessage(_channelId: string, text: string): Promise<void> {
    if (!this.yt || !this.liveChatId) throw new Error('YouTube not connected')
    await this.yt.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: text }
        }
      }
    })
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.yt) throw new Error('YouTube not connected')
    await this.yt.liveChatMessages.delete({ id: messageId })
  }

  async timeoutUser(userId: string, durationSeconds: number): Promise<void> {
    if (!this.yt || !this.liveChatId) throw new Error('YouTube not connected')
    await this.yt.liveChatBans.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'temporary',
          banDurationSeconds: String(durationSeconds),
          bannedUserDetails: { channelId: userId }
        }
      }
    })
  }

  async banUser(userId: string): Promise<void> {
    if (!this.yt || !this.liveChatId) throw new Error('YouTube not connected')
    await this.yt.liveChatBans.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'permanent',
          bannedUserDetails: { channelId: userId }
        }
      }
    })
  }

  async unbanUser(userId: string): Promise<void> {
    console.warn(`[youtube] unbanUser called for ${userId} — YouTube Live Chat unban not yet implemented`)
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
    if (!this.yt || !this.liveChatId) return
    try {
      const res = await this.yt.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: this.pageToken
      })
      this.pageToken = res.data.nextPageToken ?? undefined
      const interval = res.data.pollingIntervalMillis ?? 5000

      for (const item of res.data.items ?? []) {
        if (item.snippet?.type !== 'textMessageEvent') continue
        const msg: ChatMessage = {
          id: item.id ?? randomUUID(),
          platform: 'youtube',
          channelId: this.credentials?.channelId ?? '',
          userId: item.authorDetails?.channelId ?? '',
          username: item.authorDetails?.displayName ?? '',
          displayName: item.authorDetails?.displayName ?? '',
          avatarUrl: item.authorDetails?.profileImageUrl ?? '',
          text: item.snippet.textMessageDetails?.messageText ?? '',
          timestamp: new Date(item.snippet.publishedAt ?? 0).getTime(),
          isDeleted: false,
          badges: this.parseBadges(item.authorDetails ?? null)
        }
        this.emit('message', msg)
      }

      this.schedulePoll(interval)
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      if (this.status !== 'disconnected') {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      }
    }
  }

  private parseBadges(d: youtube_v3.Schema$LiveChatMessageAuthorDetails | null): Badge[] {
    if (!d) return []
    const badges: Badge[] = []
    if (d.isChatOwner) badges.push({ id: 'owner', label: 'Owner' })
    if (d.isChatModerator) badges.push({ id: 'moderator', label: 'Moderator' })
    if (d.isChatSponsor) badges.push({ id: 'member', label: 'Member' })
    return badges
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
