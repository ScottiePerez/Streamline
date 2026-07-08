export type Platform = 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'

export interface Badge {
  id: string
  label: string
  imageUrl?: string
}

export interface ChatMessage {
  id: string
  platform: Platform
  channelId: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string
  text: string
  timestamp: number
  isDeleted: boolean
  badges: Badge[]
}

export interface ModerationAction {
  id: string
  platform: Platform
  type: 'ban' | 'timeout' | 'delete'
  targetUserId: string
  targetUsername: string
  moderatorName: string
  reason?: string
  duration?: number
  timestamp: number
}

export interface Credentials {
  platform: Platform
  token: string
  channelId: string
  userId?: string
  username?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface PlatformAdapter {
  readonly platform: Platform
  connect(credentials: Credentials): Promise<void>
  disconnect(): Promise<void>
  sendMessage(channelId: string, text: string): Promise<void>
  deleteMessage(messageId: string): Promise<void>
  timeoutUser(userId: string, durationSeconds: number): Promise<void>
  banUser(userId: string): Promise<void>
  getStatus(): ConnectionStatus
  on(event: 'message', handler: (msg: ChatMessage) => void): void
  on(event: 'error', handler: (err: Error) => void): void
  on(event: 'status', handler: (status: ConnectionStatus) => void): void
  off(event: 'message' | 'error' | 'status', handler: Function): void
}

export interface AppSettings {
  theme: 'dark' | 'light'
  fontSize: 'sm' | 'md' | 'lg'
  maxMessagesPerPlatform: number
  notificationSounds: Record<Platform, boolean>
  teamModeEnabled: boolean
  teamModePort: number
  twitchChannelId?: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  maxMessagesPerPlatform: 10000,
  notificationSounds: {
    twitch: false,
    youtube: false,
    kick: false,
    tiktok: false,
    facebook: false
  },
  teamModeEnabled: false,
  teamModePort: 7350,
  twitchChannelId: ''
}
