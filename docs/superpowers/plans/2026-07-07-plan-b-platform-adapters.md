# Plan B: Platform Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube, Kick, TikTok, and Facebook platform adapters so the app reads, moderates, and replies across all 5 platforms, and wire them into the Electron main process with channel-ID inputs in the Account Manager.

**Architecture:** Each adapter extends `EventEmitter` and implements `PlatformAdapter` from `src/shared/types.ts`, following the same pattern as `src/main/adapters/twitch.ts`. YouTube and Facebook use HTTP polling via official APIs; Kick uses the unofficial Pusher WebSocket; TikTok uses the unofficial `tiktok-live-connector` library. All adapters apply exponential backoff on reconnect: `Math.min(1000 * 2 ** attempt, 30000)` ms. The main process auto-connects every platform that has both a stored token and a configured channel ID.

**Tech Stack:** `googleapis` (YouTube Data API v3), `pusher-js` (Kick Pusher WebSocket), `tiktok-live-connector` (TikTok unofficial), native `fetch` Node 18+ (Facebook Graph API + Kick REST moderation), `keytar` (token storage, already installed), `better-sqlite3` (settings, already installed).

## Global Constraints

- All OAuth tokens stored via keytar — never written to SQLite or any file. Service name: `streamchat-app`.
- `contextBridge.exposeInMainWorld('electronAPI', ...)` — key must be exactly `'electronAPI'`.
- `BrowserWindow` must have `contextIsolation: true, nodeIntegration: false`.
- SQLite database file: `app.getPath('userData')/streamchat.db`.
- All adapters must implement `PlatformAdapter` exactly as defined in `src/shared/types.ts` — do not change that interface.
- `platform` property on each adapter: `'youtube' as const`, `'kick' as const`, `'tiktok' as const`, `'facebook' as const`.
- Reconnect backoff formula (verbatim from TwitchAdapter): `Math.min(1000 * 2 ** attempt, 30000)`.
- Tests live in `tests/main/adapters/` — one file per adapter.
- `jest.config.ts` `moduleNameMapper` must map each new npm module to a hand-written mock in `tests/__mocks__/`.
- Node 18+ required (native `fetch` used).
- TikTok and Kick: `sendMessage` and moderation operations that are genuinely unsupported must throw an `Error` with a descriptive message (e.g., `'TikTok: sending messages is not supported via unofficial API'`). Do **not** silently no-op.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/shared/types.ts` | Modify | Add `youtubeChannelId`, `kickChannelId`, `tiktokChannelId`, `facebookLiveVideoId`, `facebookPageId` to `AppSettings` |
| `jest.config.ts` | Modify | Add `moduleNameMapper` entries for `googleapis`, `pusher-js`, `tiktok-live-connector` |
| `tests/__mocks__/googleapis.ts` | Create | Mock YouTube API client |
| `tests/__mocks__/pusher-js.ts` | Create | Mock Pusher client |
| `tests/__mocks__/tiktok-live-connector.ts` | Create | Mock WebcastPushConnection |
| `src/main/adapters/youtube.ts` | Create | YouTubeAdapter — polls liveChatMessages |
| `tests/main/adapters/youtube.test.ts` | Create | Tests for YouTubeAdapter |
| `src/main/adapters/kick.ts` | Create | KickAdapter — Pusher WebSocket + REST moderation |
| `tests/main/adapters/kick.test.ts` | Create | Tests for KickAdapter |
| `src/main/adapters/tiktok.ts` | Create | TikTokAdapter — WebcastPushConnection (read-only) |
| `tests/main/adapters/tiktok.test.ts` | Create | Tests for TikTokAdapter |
| `src/main/adapters/facebook.ts` | Create | FacebookAdapter — polls live_comments |
| `tests/main/adapters/facebook.test.ts` | Create | Tests for FacebookAdapter |
| `src/main/index.ts` | Modify | Auto-connect all 5 platforms on startup |
| `src/renderer/pages/AccountManager.tsx` | Modify | Add channel-ID text inputs per platform |
| `tests/renderer/pages/AccountManager.test.tsx` | Modify | Add channel-ID input tests |

---

### Task 1: Dependencies, AppSettings Extension & Test Infrastructure

**Files:**
- Modify: `package.json` (add runtime deps)
- Modify: `src/shared/types.ts` (extend AppSettings + DEFAULT_SETTINGS)
- Modify: `jest.config.ts` (add moduleNameMapper entries)
- Create: `tests/__mocks__/googleapis.ts`
- Create: `tests/__mocks__/pusher-js.ts`
- Create: `tests/__mocks__/tiktok-live-connector.ts`

**Interfaces:**
- Consumes: `AppSettings`, `DEFAULT_SETTINGS` from `src/shared/types.ts`
- Produces: extended `AppSettings` with `youtubeChannelId?: string`, `kickChannelId?: string`, `tiktokChannelId?: string`, `facebookLiveVideoId?: string`, `facebookPageId?: string`; three mock modules importable from tests

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install googleapis pusher-js tiktok-live-connector
```

Expected: packages added to `node_modules/`, `package.json` updated with the three deps under `"dependencies"`.

- [ ] **Step 2: Extend AppSettings in `src/shared/types.ts`**

Open `src/shared/types.ts`. The current `AppSettings` interface ends with `twitchChannelId?: string`. Add five new optional fields immediately after it:

```typescript
export interface AppSettings {
  theme: 'dark' | 'light'
  fontSize: 'sm' | 'md' | 'lg'
  maxMessagesPerPlatform: number
  notificationSounds: Record<Platform, boolean>
  teamModeEnabled: boolean
  teamModePort: number
  twitchChannelId?: string
  youtubeChannelId?: string
  kickChannelId?: string
  tiktokChannelId?: string
  facebookLiveVideoId?: string
  facebookPageId?: string
}
```

Update `DEFAULT_SETTINGS` to include the new fields:

```typescript
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
  twitchChannelId: '',
  youtubeChannelId: '',
  kickChannelId: '',
  tiktokChannelId: '',
  facebookLiveVideoId: '',
  facebookPageId: ''
}
```

- [ ] **Step 3: Add moduleNameMapper entries to `jest.config.ts`**

Open `jest.config.ts`. In **both** project objects (the `main` one and the `renderer` one), add three entries to `moduleNameMapper`:

```typescript
import type { Config } from 'jest'

const config: Config = {
  projects: [
    {
      displayName: 'main',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/main/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.node.json' }] },
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
        '^keytar$': '<rootDir>/tests/__mocks__/keytar.ts',
        '^googleapis$': '<rootDir>/tests/__mocks__/googleapis.ts',
        '^pusher-js$': '<rootDir>/tests/__mocks__/pusher-js.ts',
        '^tiktok-live-connector$': '<rootDir>/tests/__mocks__/tiktok-live-connector.ts'
      }
    },
    {
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/renderer/**/*.test.tsx', '<rootDir>/tests/renderer/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.web.json' }] },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
        '^keytar$': '<rootDir>/tests/__mocks__/keytar.ts',
        '^googleapis$': '<rootDir>/tests/__mocks__/googleapis.ts',
        '^pusher-js$': '<rootDir>/tests/__mocks__/pusher-js.ts',
        '^tiktok-live-connector$': '<rootDir>/tests/__mocks__/tiktok-live-connector.ts'
      }
    }
  ]
}

export default config
```

- [ ] **Step 4: Create `tests/__mocks__/googleapis.ts`**

```typescript
// Jest module mock for googleapis — provides mock YouTube API client functions
// that tests can control via the exported _mocks object.

export const _mocks = {
  liveBroadcastsList: jest.fn(),
  liveChatMessagesList: jest.fn(),
  liveChatMessagesInsert: jest.fn(),
  liveChatMessagesDelete: jest.fn(),
  liveChatBansInsert: jest.fn(),
  oauth2SetCredentials: jest.fn()
}

const mockYoutubeClient = {
  liveBroadcasts: { list: _mocks.liveBroadcastsList },
  liveChatMessages: {
    list: _mocks.liveChatMessagesList,
    insert: _mocks.liveChatMessagesInsert,
    delete: _mocks.liveChatMessagesDelete
  },
  liveChatBans: { insert: _mocks.liveChatBansInsert }
}

export const google = {
  auth: {
    OAuth2: jest.fn().mockImplementation(() => ({
      setCredentials: _mocks.oauth2SetCredentials
    }))
  },
  youtube: jest.fn().mockReturnValue(mockYoutubeClient)
}
```

- [ ] **Step 5: Create `tests/__mocks__/pusher-js.ts`**

```typescript
// Jest module mock for pusher-js — provides a controllable Pusher client
// with a _getChannel() helper for emitting test events.

type Handler = (...args: unknown[]) => void

export class MockChannel {
  private handlers: Record<string, Handler[]> = {}

  bind(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] ?? []).forEach(h => h(...args))
  }
}

export class MockConnection {
  private handlers: Record<string, Handler[]> = {}

  bind(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] ?? []).forEach(h => h(...args))
  }
}

export class MockPusher {
  readonly connection = new MockConnection()
  private channels: Record<string, MockChannel> = {}
  readonly disconnect = jest.fn()

  subscribe(channelName: string): MockChannel {
    this.channels[channelName] = this.channels[channelName] ?? new MockChannel()
    return this.channels[channelName]
  }

  _getChannel(channelName: string): MockChannel {
    return this.channels[channelName]
  }
}

let lastInstance: MockPusher | null = null

const MockPusherConstructor = jest.fn().mockImplementation(() => {
  lastInstance = new MockPusher()
  return lastInstance
})

export function _getLastInstance(): MockPusher | null {
  return lastInstance
}

export default MockPusherConstructor
```

- [ ] **Step 6: Create `tests/__mocks__/tiktok-live-connector.ts`**

```typescript
// Jest module mock for tiktok-live-connector — provides a controllable
// WebcastPushConnection with a _emit() helper for test events.

type Handler = (...args: unknown[]) => void

export class MockWebcastPushConnection {
  private handlers: Record<string, Handler[]> = {}
  readonly connect = jest.fn().mockResolvedValue(undefined)
  readonly disconnect = jest.fn()

  on(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] ?? []).forEach(h => h(...args))
  }
}

let lastInstance: MockWebcastPushConnection | null = null

export const WebcastPushConnection = jest.fn().mockImplementation(() => {
  lastInstance = new MockWebcastPushConnection()
  return lastInstance
})

export function _getLastInstance(): MockWebcastPushConnection | null {
  return lastInstance
}
```

- [ ] **Step 7: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected output: all existing 51 tests pass. Zero failures. The new `moduleNameMapper` entries don't break anything because no existing test imports those three modules.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts jest.config.ts tests/__mocks__/googleapis.ts tests/__mocks__/pusher-js.ts tests/__mocks__/tiktok-live-connector.ts package.json package-lock.json
git commit -m "feat: install platform adapter deps, extend AppSettings, add test mocks"
```

---

### Task 2: YouTube Adapter

**Files:**
- Create: `src/main/adapters/youtube.ts`
- Create: `tests/main/adapters/youtube.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `ChatMessage`, `Credentials`, `ConnectionStatus`, `Badge` from `src/shared/types.ts`; `_mocks` from `tests/__mocks__/googleapis.ts`
- Produces: `YouTubeAdapter` — exported class implementing `PlatformAdapter`, `readonly platform = 'youtube' as const`

**YouTube API behaviour this adapter relies on:**
- `youtube.liveBroadcasts.list({ part: ['snippet', 'status'], mine: true })` → find the first broadcast whose `status.lifeCycleStatus` is `'live'` or `'testing'`. The `snippet.liveChatId` is the chat room ID.
- `youtube.liveChatMessages.list({ liveChatId, part: ['snippet', 'authorDetails'], pageToken? })` → returns `{ items, nextPageToken, pollingIntervalMillis }`. Only emit items where `snippet.type === 'textMessageEvent'`.
- `youtube.liveChatMessages.insert(...)` — send a message.
- `youtube.liveChatMessages.delete({ id: messageId })` — delete.
- `youtube.liveChatBans.insert(...)` — timeout (`type: 'temporary'`, `banDurationSeconds`) or ban (`type: 'permanent'`).

- [ ] **Step 1: Write the failing tests in `tests/main/adapters/youtube.test.ts`**

```typescript
import { YouTubeAdapter } from '../../../src/main/adapters/youtube'
import { google, _mocks } from 'googleapis'

jest.useFakeTimers()

describe('YouTubeAdapter', () => {
  let adapter: YouTubeAdapter

  const ACTIVE_BROADCAST_RESPONSE = {
    data: {
      items: [{
        id: 'broadcast1',
        status: { lifeCycleStatus: 'live' },
        snippet: { liveChatId: 'chatId123' }
      }]
    }
  }

  const EMPTY_POLL_RESPONSE = {
    data: { items: [], nextPageToken: null, pollingIntervalMillis: 60000 }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new YouTubeAdapter()
    _mocks.liveBroadcastsList.mockResolvedValue(ACTIVE_BROADCAST_RESPONSE)
    _mocks.liveChatMessagesList.mockResolvedValue(EMPTY_POLL_RESPONSE)
  })

  afterEach(async () => {
    await adapter.disconnect()
    jest.clearAllTimers()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('emits connecting then connected', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    expect(statuses).toEqual(['connecting', 'connected'])
    expect(adapter.getStatus()).toBe('connected')
  })

  it('throws when no active broadcast', async () => {
    _mocks.liveBroadcastsList.mockResolvedValue({ data: { items: [] } })
    await expect(
      adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    ).rejects.toThrow('No active YouTube live broadcast found')
  })

  it('emits chat messages from poll', async () => {
    _mocks.liveChatMessagesList
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: 'msg1',
            snippet: {
              type: 'textMessageEvent',
              publishedAt: '2024-01-01T00:00:00.000Z',
              textMessageDetails: { messageText: 'hello world' }
            },
            authorDetails: {
              channelId: 'userId1',
              displayName: 'TestUser',
              profileImageUrl: 'https://example.com/avatar.jpg',
              isChatModerator: false,
              isChatOwner: false,
              isChatSponsor: false
            }
          }],
          nextPageToken: 'page2',
          pollingIntervalMillis: 60000
        }
      })
      .mockResolvedValue(EMPTY_POLL_RESPONSE)

    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    // Let the scheduled poll execute
    await jest.runAllTimersAsync()

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('hello world')
    expect(messages[0].platform).toBe('youtube')
    expect(messages[0].username).toBe('TestUser')
    expect(messages[0].avatarUrl).toBe('https://example.com/avatar.jpg')
    expect(messages[0].isDeleted).toBe(false)
  })

  it('filters non-text-message events from poll', async () => {
    _mocks.liveChatMessagesList.mockResolvedValueOnce({
      data: {
        items: [{
          id: 'sc1',
          snippet: { type: 'superChatEvent', publishedAt: '2024-01-01T00:00:00.000Z' },
          authorDetails: { channelId: 'u1', displayName: 'Donor' }
        }],
        pollingIntervalMillis: 60000
      }
    }).mockResolvedValue(EMPTY_POLL_RESPONSE)

    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await jest.runAllTimersAsync()
    expect(messages).toHaveLength(0)
  })

  it('attaches moderator badge', async () => {
    _mocks.liveChatMessagesList.mockResolvedValueOnce({
      data: {
        items: [{
          id: 'msg2',
          snippet: { type: 'textMessageEvent', publishedAt: '2024-01-01T00:00:00.000Z', textMessageDetails: { messageText: 'hi' } },
          authorDetails: { channelId: 'u2', displayName: 'Mod', isChatModerator: true, isChatOwner: false, isChatSponsor: false }
        }],
        pollingIntervalMillis: 60000
      }
    }).mockResolvedValue(EMPTY_POLL_RESPONSE)

    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await jest.runAllTimersAsync()
    expect(messages[0].badges).toEqual([{ id: 'moderator', label: 'Moderator' }])
  })

  it('sends a message', async () => {
    _mocks.liveChatMessagesInsert.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.sendMessage('UCxxx', 'hello chat')
    expect(_mocks.liveChatMessagesInsert).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: 'chatId123',
          type: 'textMessageEvent',
          textMessageDetails: { messageText: 'hello chat' }
        }
      }
    })
  })

  it('deletes a message', async () => {
    _mocks.liveChatMessagesDelete.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.deleteMessage('msgId42')
    expect(_mocks.liveChatMessagesDelete).toHaveBeenCalledWith({ id: 'msgId42' })
  })

  it('times out a user', async () => {
    _mocks.liveChatBansInsert.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.timeoutUser('userId99', 600)
    expect(_mocks.liveChatBansInsert).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: 'chatId123',
          type: 'temporary',
          banDurationSeconds: 600,
          bannedUserDetails: { channelId: 'userId99' }
        }
      }
    })
  })

  it('bans a user permanently', async () => {
    _mocks.liveChatBansInsert.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.banUser('userId99')
    expect(_mocks.liveChatBansInsert).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: 'chatId123',
          type: 'permanent',
          bannedUserDetails: { channelId: 'userId99' }
        }
      }
    })
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.disconnect()
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('throws on send when disconnected', async () => {
    await expect(adapter.sendMessage('ch', 'hi')).rejects.toThrow('YouTube not connected')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern="youtube" --passWithNoTests
```

Expected: test file is not found yet (0 tests) or TypeScript import error — not a pass.

- [ ] **Step 3: Implement `src/main/adapters/youtube.ts`**

```typescript
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
          banDurationSeconds: durationSeconds,
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test -- --testPathPattern="youtube"
```

Expected: all tests in `tests/main/adapters/youtube.test.ts` pass.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/adapters/youtube.ts tests/main/adapters/youtube.test.ts
git commit -m "feat: YouTube adapter with live chat polling"
```

---

### Task 3: Kick Adapter

**Files:**
- Create: `src/main/adapters/kick.ts`
- Create: `tests/main/adapters/kick.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `ChatMessage`, `Credentials`, `ConnectionStatus`, `Badge` from `src/shared/types.ts`; `MockPusher`, `_getLastInstance` from `tests/__mocks__/pusher-js.ts`
- Produces: `KickAdapter` — exported class, `readonly platform = 'kick' as const`

**Kick API details:**
- Channel info (unauthenticated): `GET https://kick.com/api/v2/channels/{slug}` → `{ chatroom: { id: number } }`
- Pusher app key: `'32cbd69e4b950bf97679'`, cluster: `'us2'`
- Pusher channel name: `chatrooms.{chatroomId}.v2`
- Pusher event: `'App\\Events\\ChatMessageEvent'`
- Send message: `POST https://kick.com/api/v2/messages/send/{chatroomId}` with `{ content, type: 'message' }` and `Authorization: Bearer {token}` header
- Delete message: `DELETE https://kick.com/api/v2/channels/{chatroomId}/messages/{messageId}` with auth header
- Timeout: `POST https://kick.com/api/v2/channels/{chatroomId}/bans` with `{ banned_username, duration, permanent: false }` (duration in seconds) and auth header
- Ban: `POST https://kick.com/api/v2/channels/{chatroomId}/bans` with `{ banned_username, permanent: true }` and auth header
- The `credentials.channelId` is the Kick channel **slug** (e.g., `'xqc'`). Resolve to the numeric chatroom ID during `connect()`.

**Kick chat message event shape:**
```typescript
interface KickChatMessage {
  id: string
  chatroom_id: number
  content: string
  type: string
  created_at: string  // ISO 8601
  sender: {
    id: number
    username: string
    slug: string
    identity?: {
      color: string
      badges: Array<{ type: string; text: string }>
    }
  }
}
```

- [ ] **Step 1: Write the failing tests in `tests/main/adapters/kick.test.ts`**

```typescript
import { KickAdapter } from '../../../src/main/adapters/kick'
import { _getLastInstance } from '../../__mocks__/pusher-js'

// native fetch is mocked per-test via jest.spyOn

describe('KickAdapter', () => {
  let adapter: KickAdapter
  let fetchSpy: jest.SpyInstance

  const CHANNEL_SLUG = 'testchannel'
  const CHATROOM_ID = 123456
  const TOKEN = 'kick-token-abc'

  function mockFetch(handler: (url: string) => { ok: boolean; json?: () => Promise<unknown> }): void {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = input.toString()
      const result = handler(url)
      return {
        ok: result.ok,
        json: result.json ?? (async () => ({})),
        status: result.ok ? 200 : 400,
        text: async () => ''
      } as Response
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new KickAdapter()
    mockFetch(url => {
      if (url.includes(`/api/v2/channels/${CHANNEL_SLUG}`)) {
        return { ok: true, json: async () => ({ chatroom: { id: CHATROOM_ID } }) }
      }
      return { ok: true }
    })
  })

  afterEach(async () => {
    await adapter.disconnect()
    fetchSpy?.mockRestore()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('resolves chatroom ID and subscribes to Pusher channel', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    const pusher = _getLastInstance()!
    expect(pusher).toBeTruthy()
    const channel = pusher._getChannel(`chatrooms.${CHATROOM_ID}.v2`)
    expect(channel).toBeTruthy()
    expect(adapter.getStatus()).toBe('connected')
  })

  it('emits messages from Pusher chat event', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })

    const pusher = _getLastInstance()!
    const channel = pusher._getChannel(`chatrooms.${CHATROOM_ID}.v2`)
    channel._emit('App\\Events\\ChatMessageEvent', {
      id: 'msg-uuid-1',
      chatroom_id: CHATROOM_ID,
      content: 'Hello Kick!',
      type: 'message',
      created_at: '2024-01-01T12:00:00.000000Z',
      sender: {
        id: 42,
        username: 'KickUser',
        slug: 'kickuser',
        identity: { color: '#FF0000', badges: [{ type: 'subscriber', text: 'Sub' }] }
      }
    })

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello Kick!')
    expect(messages[0].platform).toBe('kick')
    expect(messages[0].username).toBe('kickuser')
    expect(messages[0].displayName).toBe('KickUser')
    expect(messages[0].userId).toBe('42')
    expect(messages[0].badges).toEqual([{ id: 'subscriber', label: 'Sub' }])
  })

  it('sends a message', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.sendMessage(CHANNEL_SLUG, 'test message')
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/messages/send/${CHATROOM_ID}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        body: JSON.stringify({ content: 'test message', type: 'message' })
      })
    )
  })

  it('deletes a message', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.deleteMessage('msg-id-99')
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/channels/${CHATROOM_ID}/messages/msg-id-99`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('times out a user', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.timeoutUser('baduser', 600)
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/channels/${CHATROOM_ID}/bans`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ banned_username: 'baduser', duration: 600, permanent: false })
      })
    )
  })

  it('bans a user permanently', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.banUser('baduser')
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/channels/${CHATROOM_ID}/bans`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ banned_username: 'baduser', permanent: true })
      })
    )
  })

  it('throws on API error during connect', async () => {
    mockFetch(() => ({ ok: false }))
    await expect(
      adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    ).rejects.toThrow('Kick: failed to resolve channel')
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.disconnect()
    const pusher = _getLastInstance()!
    expect(pusher.disconnect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('throws on send when disconnected', async () => {
    await expect(adapter.sendMessage(CHANNEL_SLUG, 'hi')).rejects.toThrow('Kick not connected')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern="kick"
```

Expected: error — `KickAdapter` not found.

- [ ] **Step 3: Implement `src/main/adapters/kick.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test -- --testPathPattern="kick"
```

Expected: all Kick tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/adapters/kick.ts tests/main/adapters/kick.test.ts
git commit -m "feat: Kick adapter via Pusher WebSocket"
```

---

### Task 4: TikTok Adapter

**Files:**
- Create: `src/main/adapters/tiktok.ts`
- Create: `tests/main/adapters/tiktok.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `ChatMessage`, `Credentials`, `ConnectionStatus` from `src/shared/types.ts`; `WebcastPushConnection`, `_getLastInstance` from `tests/__mocks__/tiktok-live-connector.ts`
- Produces: `TikTokAdapter` — exported class, `readonly platform = 'tiktok' as const`

**TikTok API details:**
- `WebcastPushConnection` constructor takes the TikTok username (stored as `credentials.channelId`).
- Events: `'chat'` data shape `{ userId: string, uniqueId: string, nickname?: string, profilePictureUrl?: string, comment: string }`.
- Events: `'disconnected'` — trigger reconnect. `'error'` — emit error.
- `sendMessage`, `deleteMessage`, `timeoutUser`, `banUser` all throw `Error` — TikTok's unofficial API is read-only. Error messages must be exactly:
  - `'TikTok: sending messages is not supported via unofficial API'`
  - `'TikTok: deleting messages is not supported via unofficial API'`
  - `'TikTok: timeout is not supported via unofficial API'`
  - `'TikTok: ban is not supported via unofficial API'`

- [ ] **Step 1: Write the failing tests in `tests/main/adapters/tiktok.test.ts`**

```typescript
import { TikTokAdapter } from '../../../src/main/adapters/tiktok'
import { _getLastInstance } from '../../__mocks__/tiktok-live-connector'

describe('TikTokAdapter', () => {
  let adapter: TikTokAdapter

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new TikTokAdapter()
  })

  afterEach(async () => {
    await adapter.disconnect()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('emits connecting then connected on connect()', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })
    expect(statuses).toEqual(['connecting', 'connected'])
    expect(adapter.getStatus()).toBe('connected')
  })

  it('passes the username to WebcastPushConnection', async () => {
    const { WebcastPushConnection } = await import('tiktok-live-connector')
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'xqcow' })
    expect(WebcastPushConnection).toHaveBeenCalledWith('xqcow')
  })

  it('emits messages from chat event', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })

    const conn = _getLastInstance()!
    conn._emit('chat', {
      userId: 'uid123',
      uniqueId: 'tiktokstar',
      nickname: 'TikTok Star',
      profilePictureUrl: 'https://example.com/pic.jpg',
      comment: 'Great stream!'
    })

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Great stream!')
    expect(messages[0].platform).toBe('tiktok')
    expect(messages[0].userId).toBe('uid123')
    expect(messages[0].username).toBe('tiktokstar')
    expect(messages[0].displayName).toBe('TikTok Star')
    expect(messages[0].avatarUrl).toBe('https://example.com/pic.jpg')
    expect(messages[0].badges).toEqual([])
    expect(messages[0].isDeleted).toBe(false)
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })
    await adapter.disconnect()
    const conn = _getLastInstance()!
    expect(conn.disconnect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('throws on sendMessage', async () => {
    await expect(adapter.sendMessage('ch', 'hi')).rejects.toThrow(
      'TikTok: sending messages is not supported via unofficial API'
    )
  })

  it('throws on deleteMessage', async () => {
    await expect(adapter.deleteMessage('id')).rejects.toThrow(
      'TikTok: deleting messages is not supported via unofficial API'
    )
  })

  it('throws on timeoutUser', async () => {
    await expect(adapter.timeoutUser('uid', 60)).rejects.toThrow(
      'TikTok: timeout is not supported via unofficial API'
    )
  })

  it('throws on banUser', async () => {
    await expect(adapter.banUser('uid')).rejects.toThrow(
      'TikTok: ban is not supported via unofficial API'
    )
  })

  it('triggers reconnect on disconnected event', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })

    const conn = _getLastInstance()!
    conn._emit('disconnected')

    expect(statuses).toContain('reconnecting')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern="tiktok"
```

Expected: error — `TikTokAdapter` not found.

- [ ] **Step 3: Implement `src/main/adapters/tiktok.ts`**

```typescript
import { WebcastPushConnection } from 'tiktok-live-connector'
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

export class TikTokAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'tiktok' as const
  private connection: InstanceType<typeof WebcastPushConnection> | null = null
  private credentials: Credentials | null = null
  private status: ConnectionStatus = 'disconnected'

  async connect(credentials: Credentials): Promise<void> {
    this.credentials = credentials
    this.setStatus('connecting')

    this.connection = new WebcastPushConnection(credentials.channelId)

    this.connection.on('chat', (data: TikTokChatData) => {
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

    this.connection.on('error', (err: Error) => this.emit('error', err))

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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test -- --testPathPattern="tiktok"
```

Expected: all TikTok tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/adapters/tiktok.ts tests/main/adapters/tiktok.test.ts
git commit -m "feat: TikTok adapter via tiktok-live-connector (read-only)"
```

---

### Task 5: Facebook Adapter

**Files:**
- Create: `src/main/adapters/facebook.ts`
- Create: `tests/main/adapters/facebook.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `ChatMessage`, `Credentials`, `ConnectionStatus` from `src/shared/types.ts`; global `fetch`
- Produces: `FacebookAdapter` — exported class, `readonly platform = 'facebook' as const`

**Facebook Graph API details (base URL: `https://graph.facebook.com/v19.0`):**
- Verify connection: `GET /{liveVideoId}?fields=id,title&access_token={token}` — if `res.ok` is false, throw.
- Poll comments: `GET /{liveVideoId}/live_comments?fields=id,from,message,created_time&since={since}&access_token={token}`
  - `since` is a Unix timestamp (seconds). On first connect set to `Math.floor(Date.now() / 1000)`.
  - Keep a `Set<string>` of seen comment IDs to deduplicate (Facebook may return the same comment on overlapping polls).
  - Poll every 5000 ms.
- Send comment: `POST /{liveVideoId}/comments?access_token={token}` with JSON body `{ message: text }`.
- Delete comment: `DELETE /{commentId}?access_token={token}`.
- Timeout: throw `Error('Facebook: timeout is not supported via Graph API')`.
- Ban user: `POST /{pageId}/blocked?access_token={token}` with JSON body `{ user: userId }`. The `pageId` is stored as `credentials.userId`. If `credentials.userId` is empty, throw `Error('Facebook: pageId required in credentials.userId for ban')`.
- The `credentials.channelId` is the live video ID (e.g., `'987654321'`).

**Comment shape returned by Graph API:**
```typescript
interface FacebookComment {
  id: string
  from?: { id: string; name: string }
  message: string
  created_time: string  // ISO 8601
}
```

- [ ] **Step 1: Write the failing tests in `tests/main/adapters/facebook.test.ts`**

```typescript
import { FacebookAdapter } from '../../../src/main/adapters/facebook'

describe('FacebookAdapter', () => {
  let adapter: FacebookAdapter
  let fetchSpy: jest.SpyInstance

  const VIDEO_ID = '987654321'
  const PAGE_ID = '111222333'
  const TOKEN = 'fb-page-token'
  const BASE = 'https://graph.facebook.com/v19.0'

  function makeFetchMock(
    handler: (url: string, init?: RequestInit) => { ok: boolean; json?: unknown }
  ): void {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const { ok, json } = handler(input.toString(), init as RequestInit)
      return {
        ok,
        status: ok ? 200 : 400,
        json: async () => json ?? {},
        text: async () => ''
      } as Response
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    adapter = new FacebookAdapter()
    makeFetchMock(url => {
      if (url.includes(`/${VIDEO_ID}?fields=id,title`)) return { ok: true, json: { id: VIDEO_ID } }
      if (url.includes('/live_comments')) return { ok: true, json: { data: [] } }
      return { ok: true, json: {} }
    })
  })

  afterEach(async () => {
    await adapter.disconnect()
    jest.useRealTimers()
    fetchSpy?.mockRestore()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('emits connecting then connected', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    expect(statuses).toEqual(['connecting', 'connected'])
  })

  it('throws on bad token during connect', async () => {
    makeFetchMock(() => ({ ok: false }))
    await expect(
      adapter.connect({ platform: 'facebook', token: 'bad', channelId: VIDEO_ID })
    ).rejects.toThrow('Facebook auth failed')
  })

  it('polls live_comments and emits messages', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))

    makeFetchMock(url => {
      if (url.includes(`/${VIDEO_ID}?fields=id,title`)) return { ok: true, json: { id: VIDEO_ID } }
      if (url.includes('/live_comments')) {
        return {
          ok: true,
          json: {
            data: [{
              id: 'comment1',
              from: { id: 'user1', name: 'Fan One' },
              message: 'Love this stream!',
              created_time: '2024-01-01T12:00:00+0000'
            }]
          }
        }
      }
      return { ok: true, json: {} }
    })

    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await jest.runAllTimersAsync()

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Love this stream!')
    expect(messages[0].platform).toBe('facebook')
    expect(messages[0].userId).toBe('user1')
    expect(messages[0].username).toBe('Fan One')
    expect(messages[0].id).toBe('comment1')
  })

  it('deduplicates comments across polls', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))

    const comment = {
      id: 'comment1',
      from: { id: 'u1', name: 'Fan' },
      message: 'hi',
      created_time: '2024-01-01T12:00:00+0000'
    }

    makeFetchMock(url => {
      if (url.includes(`/${VIDEO_ID}?fields=id,title`)) return { ok: true, json: { id: VIDEO_ID } }
      if (url.includes('/live_comments')) return { ok: true, json: { data: [comment] } }
      return { ok: true, json: {} }
    })

    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    // Two poll cycles
    await jest.runAllTimersAsync()
    await jest.runAllTimersAsync()

    expect(messages).toHaveLength(1) // not duplicated
  })

  it('sends a comment', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await adapter.sendMessage(VIDEO_ID, 'Hello Facebook!')
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/${VIDEO_ID}/comments?access_token=${TOKEN}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'Hello Facebook!' })
      })
    )
  })

  it('deletes a comment', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await adapter.deleteMessage('comment42')
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/comment42?access_token=${TOKEN}`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('bans a user via page blocked endpoint', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID, userId: PAGE_ID })
    await adapter.banUser('userToBlock')
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/${PAGE_ID}/blocked?access_token=${TOKEN}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user: 'userToBlock' })
      })
    )
  })

  it('throws on banUser when pageId missing', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await expect(adapter.banUser('user1')).rejects.toThrow(
      'Facebook: pageId required in credentials.userId for ban'
    )
  })

  it('throws on timeoutUser', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await expect(adapter.timeoutUser('uid', 60)).rejects.toThrow(
      'Facebook: timeout is not supported via Graph API'
    )
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await adapter.disconnect()
    expect(adapter.getStatus()).toBe('disconnected')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern="facebook"
```

Expected: error — `FacebookAdapter` not found.

- [ ] **Step 3: Implement `src/main/adapters/facebook.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test -- --testPathPattern="facebook"
```

Expected: all Facebook tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/adapters/facebook.ts tests/main/adapters/facebook.test.ts
git commit -m "feat: Facebook adapter with Graph API live comment polling"
```

---

### Task 6: Wire All Adapters + AccountManager Channel-ID Inputs

**Files:**
- Modify: `src/main/index.ts` (auto-connect all 5 platforms)
- Modify: `src/renderer/pages/AccountManager.tsx` (channel-ID inputs)
- Modify: `tests/renderer/pages/AccountManager.test.tsx` (add channel-ID tests)

**Interfaces:**
- Consumes: `YouTubeAdapter`, `KickAdapter`, `TikTokAdapter`, `FacebookAdapter` from their respective adapter files; `AppSettings` from `src/shared/types.ts`; `getSettings`, `setSettings` from `src/main/store/settings.ts`; `getToken` from `src/main/auth/keychain.ts`; `window.electronAPI.getSettings`, `window.electronAPI.setSettings` in renderer

**What this task does:**
1. Main process: for each of the 5 platforms, if a keychain token and the corresponding settings channel-ID are both present, create an adapter, register it with ChatBus, and call `connect()`. The settings field per platform:
   - twitch → `settings.twitchChannelId`
   - youtube → `settings.youtubeChannelId`
   - kick → `settings.kickChannelId`
   - tiktok → `settings.tiktokChannelId`
   - facebook → `settings.facebookLiveVideoId` and `settings.facebookPageId`

2. AccountManager: add a text input below each platform's connect/disconnect button for the channel ID. When the input value changes (on blur), call `window.electronAPI.setSettings({ [settingsKey]: value })`. Load existing values on mount via `window.electronAPI.getSettings()`. The label and settings key per platform:
   - twitch: label `'Channel name'`, key `'twitchChannelId'`
   - youtube: label `'YouTube channel ID'`, key `'youtubeChannelId'`
   - kick: label `'Channel slug'`, key `'kickChannelId'`
   - tiktok: label `'TikTok username'`, key `'tiktokChannelId'`
   - facebook: label `'Live video ID'`, key `'facebookLiveVideoId'` (and a second input for `'Page ID'` → `'facebookPageId'`)

- [ ] **Step 1: Update `src/main/index.ts`**

Replace the file's entire content with:

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDb } from './store/db'
import { ChatBus } from './chat-bus'
import { TwitchAdapter } from './adapters/twitch'
import { YouTubeAdapter } from './adapters/youtube'
import { KickAdapter } from './adapters/kick'
import { TikTokAdapter } from './adapters/tiktok'
import { FacebookAdapter } from './adapters/facebook'
import { registerIpcHandlers } from './ipc-handlers'
import { getToken } from './auth/keychain'
import { getSettings } from './store/settings'
import type { Platform, Credentials } from '../shared/types'

async function tryConnect(
  bus: ChatBus,
  platform: Platform,
  credentials: Credentials
): Promise<void> {
  const adapters = {
    twitch: () => new TwitchAdapter(),
    youtube: () => new YouTubeAdapter(),
    kick: () => new KickAdapter(),
    tiktok: () => new TikTokAdapter(),
    facebook: () => new FacebookAdapter()
  }
  const adapter = adapters[platform]()
  bus.registerAdapter(adapter)
  await adapter.connect(credentials)
}

async function main(): Promise<void> {
  const db = openDb(join(app.getPath('userData'), 'streamchat.db'))
  const bus = new ChatBus(db)

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  registerIpcHandlers(bus, db, win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }

  const settings = getSettings(db)

  // Auto-connect each platform if token + channelId are present
  const autoConnects: Array<() => Promise<void>> = []

  const twitchToken = await getToken('twitch')
  if (twitchToken && settings.twitchChannelId) {
    autoConnects.push(() =>
      tryConnect(bus, 'twitch', {
        platform: 'twitch',
        token: twitchToken,
        channelId: settings.twitchChannelId!
      })
    )
  }

  const youtubeToken = await getToken('youtube')
  if (youtubeToken && settings.youtubeChannelId) {
    autoConnects.push(() =>
      tryConnect(bus, 'youtube', {
        platform: 'youtube',
        token: youtubeToken,
        channelId: settings.youtubeChannelId!
      })
    )
  }

  const kickToken = await getToken('kick')
  if (kickToken && settings.kickChannelId) {
    autoConnects.push(() =>
      tryConnect(bus, 'kick', {
        platform: 'kick',
        token: kickToken,
        channelId: settings.kickChannelId!
      })
    )
  }

  const tiktokToken = await getToken('tiktok')
  if (tiktokToken && settings.tiktokChannelId) {
    autoConnects.push(() =>
      tryConnect(bus, 'tiktok', {
        platform: 'tiktok',
        token: tiktokToken ?? '',
        channelId: settings.tiktokChannelId!
      })
    )
  }

  const facebookToken = await getToken('facebook')
  if (facebookToken && settings.facebookLiveVideoId) {
    autoConnects.push(() =>
      tryConnect(bus, 'facebook', {
        platform: 'facebook',
        token: facebookToken,
        channelId: settings.facebookLiveVideoId!,
        userId: settings.facebookPageId ?? ''
      })
    )
  }

  for (const connect of autoConnects) {
    connect().catch(err => console.error('Auto-connect failed:', err))
  }
}

app.whenReady().then(main)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 2: Write failing tests for AccountManager channel-ID inputs**

Open `tests/renderer/pages/AccountManager.test.tsx`. This file exists from Plan A. Append these additional test cases. (Do **not** remove existing tests — add after them.)

First, read the existing file to see its current structure, then append:

```typescript
describe('AccountManager — channel ID inputs', () => {
  it('renders a channel-ID input for each platform', async () => {
    render(<AccountManager />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Channel name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('YouTube channel ID')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Channel slug')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('TikTok username')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Live video ID')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Page ID')).toBeInTheDocument()
    })
  })

  it('loads existing channel IDs from settings on mount', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      twitchChannelId: 'mychannel',
      youtubeChannelId: 'UCxxx',
      kickChannelId: 'kickslug',
      tiktokChannelId: 'tiktokuser',
      facebookLiveVideoId: '123456',
      facebookPageId: '999888'
    })
    render(<AccountManager />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Channel name')).toHaveValue('mychannel')
      expect(screen.getByPlaceholderText('YouTube channel ID')).toHaveValue('UCxxx')
      expect(screen.getByPlaceholderText('Channel slug')).toHaveValue('kickslug')
      expect(screen.getByPlaceholderText('TikTok username')).toHaveValue('tiktokuser')
      expect(screen.getByPlaceholderText('Live video ID')).toHaveValue('123456')
      expect(screen.getByPlaceholderText('Page ID')).toHaveValue('999888')
    })
  })

  it('calls setSettings on blur with the updated value', async () => {
    render(<AccountManager />)
    await waitFor(() => screen.getByPlaceholderText('Channel name'))

    const input = screen.getByPlaceholderText('Channel name')
    fireEvent.change(input, { target: { value: 'newchannel' } })
    fireEvent.blur(input)

    expect(window.electronAPI.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twitchChannelId: 'newchannel' })
    )
  })
})
```

Also verify the imports at the top of the test file include `fireEvent` from `@testing-library/react`. If not present, add it. The existing file already imports `render`, `screen`, `waitFor` — add `fireEvent` to the same import.

- [ ] **Step 3: Run AccountManager tests to confirm the new ones fail**

```bash
npm test -- --testPathPattern="AccountManager"
```

Expected: existing tests still pass, new channel-ID tests fail (inputs not in the DOM yet).

- [ ] **Step 4: Update `src/renderer/pages/AccountManager.tsx`**

Replace the entire file with:

```typescript
import React, { useEffect, useState } from 'react'
import type { Platform, ConnectionStatus, AppSettings } from '../../shared/types'

const PLATFORMS: {
  id: Platform
  label: string
  color: string
  note?: string
  channelFields: Array<{ key: keyof AppSettings; placeholder: string }>
}[] = [
  {
    id: 'twitch',
    label: 'Twitch',
    color: 'bg-purple-600',
    channelFields: [{ key: 'twitchChannelId', placeholder: 'Channel name' }]
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: 'bg-red-600',
    channelFields: [{ key: 'youtubeChannelId', placeholder: 'YouTube channel ID' }]
  },
  {
    id: 'kick',
    label: 'Kick',
    color: 'bg-green-500',
    note: 'Unofficial API',
    channelFields: [{ key: 'kickChannelId', placeholder: 'Channel slug' }]
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: 'bg-gray-700',
    note: 'Unofficial API',
    channelFields: [{ key: 'tiktokChannelId', placeholder: 'TikTok username' }]
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: 'bg-blue-600',
    channelFields: [
      { key: 'facebookLiveVideoId', placeholder: 'Live video ID' },
      { key: 'facebookPageId', placeholder: 'Page ID' }
    ]
  }
]

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'text-green-400',
  connecting: 'text-yellow-400',
  reconnecting: 'text-yellow-400',
  disconnected: 'text-gray-500',
  error: 'text-red-400'
}

export default function AccountManager(): React.JSX.Element {
  const [tokens, setTokens] = useState<Partial<Record<Platform, string | null>>>({})
  const [statuses, setStatuses] = useState<Partial<Record<Platform, ConnectionStatus>>>({})
  const [channelIds, setChannelIds] = useState<Partial<AppSettings>>({})

  useEffect(() => {
    void (async () => {
      const settings = await window.electronAPI.getSettings()
      setChannelIds(settings)
      await Promise.all(
        PLATFORMS.map(async ({ id }) => {
          const token = await window.electronAPI.getToken(id)
          setTokens(prev => ({ ...prev, [id]: token }))
        })
      )
    })()

    const unsub = window.electronAPI.onPlatformStatus((platform, status) => {
      setStatuses(prev => ({ ...prev, [platform]: status }))
    })
    return unsub
  }, [])

  async function handleConnect(platform: Platform): Promise<void> {
    const token = window.prompt(`Paste your ${platform} OAuth token:`)
    if (!token) return
    await window.electronAPI.setToken(platform, token)
    setTokens(prev => ({ ...prev, [platform]: token }))
  }

  async function handleDisconnect(platform: Platform): Promise<void> {
    await window.electronAPI.deleteToken(platform)
    setTokens(prev => ({ ...prev, [platform]: null }))
    setStatuses(prev => ({ ...prev, [platform]: 'disconnected' }))
  }

  function handleChannelIdBlur(key: keyof AppSettings, value: string): void {
    setChannelIds(prev => ({ ...prev, [key]: value }))
    void window.electronAPI.setSettings({ [key]: value } as Partial<AppSettings>)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-100 mb-6">Connected Accounts</h1>
      <div className="flex flex-col gap-4 max-w-xl">
        {PLATFORMS.map(({ id, label, color, note, channelFields }) => {
          const hasToken = !!tokens[id]
          const status: ConnectionStatus = statuses[id] ?? (hasToken ? 'connecting' : 'disconnected')

          return (
            <div
              key={id}
              className="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700"
            >
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white ${color}`}>
                  {label[0]}
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-100">{label}</div>
                  <div className={`text-xs ${STATUS_COLORS[status]}`}>
                    {status}{note ? ` · ${note}` : ''}
                  </div>
                </div>
                {hasToken ? (
                  <button
                    onClick={() => void handleDisconnect(id)}
                    className="px-3 py-1 text-sm text-red-400 border border-red-800 rounded hover:bg-red-950"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => void handleConnect(id)}
                    className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                  >
                    Connect
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1 pl-12">
                {channelFields.map(({ key, placeholder }) => (
                  <input
                    key={key}
                    type="text"
                    placeholder={placeholder}
                    defaultValue={(channelIds[key] as string | undefined) ?? ''}
                    onBlur={e => handleChannelIdBlur(key, e.currentTarget.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run AccountManager tests**

```bash
npm test -- --testPathPattern="AccountManager"
```

Expected: all tests — both existing and the new channel-ID tests — pass.

- [ ] **Step 6: Run full suite**

```bash
npm test
```

Expected: all tests pass (prior 51 + new adapter tests + new AccountManager tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/renderer/pages/AccountManager.tsx tests/renderer/pages/AccountManager.test.tsx
git commit -m "feat: wire all platform adapters in main process + channel ID inputs in Account Manager"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task that covers it |
|---|---|
| YouTube HTTP polling via YouTube Data API v3 | Task 2 |
| Kick unofficial WebSocket (Pusher-based) | Task 3 |
| TikTok unofficial WebSocket | Task 4 |
| Facebook Graph API polling | Task 5 |
| Full two-way (read, reply, moderate) where API allows | Tasks 2–5 (TikTok/Facebook partial per API limits) |
| Per-platform connection status: Connected / Reconnecting / Error | All adapters emit 'status' events |
| Exponential backoff reconnect | All 4 adapters |
| Tokens stored via OS keychain | Auto-connect reads from keytar, no SQLite token writes |
| Channel IDs configurable from UI | Task 6 (AccountManager inputs) |
| Auto-connect on startup | Task 6 (main/index.ts) |

**Placeholder scan:** None found.

**Type consistency:** All adapters use `Platform`, `ChatMessage`, `Credentials`, `ConnectionStatus`, `Badge` exactly as defined in `src/shared/types.ts`. `AppSettings` new fields match exactly the keys used in `AccountManager.tsx` and `main/index.ts`.
