# Twitch OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `window.prompt()` paste-token flow for Twitch with Authorization Code + PKCE OAuth — user clicks Connect, approves in their browser, and the token is stored automatically.

**Architecture:** A new `twitch-oauth.ts` module handles PKCE generation, a localhost HTTP server that catches the Twitch redirect, and token exchange. An IPC handler in `ipc-handlers.ts` calls that module and stores the result via keytar + settings. The AccountManager renderer calls `startTwitchOAuth()` through the preload instead of `window.prompt()`.

**Tech Stack:** Node.js `crypto` (PKCE), Node.js `http` (localhost callback server), Electron `shell.openExternal` (browser open), `fetch` (Twitch token + user endpoints), keytar (token storage), better-sqlite3 (username storage via existing settings).

## Global Constraints

- `contextBridge.exposeInMainWorld('electronAPI', ...)` — key must be exactly `'electronAPI'`
- `BrowserWindow` must have `contextIsolation: true, nodeIntegration: false`
- All OAuth tokens stored via keytar — service name: `streamchat-app`, account: `'twitch'`
- SQLite database file: `app.getPath('userData')/streamchat.db`
- Test command: `npm test -- --runInBand` (avoids MacBook freeze)
- Client ID constant lives only in `src/main/auth/twitch-oauth.ts` — not in the database or keychain
- Error messages surfaced to the UI must be exactly: `'Authorization cancelled'`, `'Could not start auth server — close other apps and try again'`, `'Authorization failed — please try again'`

---

### Task 1: twitch-oauth module + PKCE unit tests

**Files:**
- Create: `src/main/auth/twitch-oauth.ts`
- Modify: `tests/__mocks__/electron.ts` (add `shell`)
- Create: `tests/main/auth/twitch-oauth.test.ts`

**Interfaces:**
- Produces:
  - `generatePkce(): PkceParams` where `PkceParams = { codeVerifier: string; codeChallenge: string }`
  - `exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<string>` — returns access token
  - `fetchUsername(token: string): Promise<string>` — returns display name
  - `startTwitchOAuth(): Promise<{ token: string; username: string }>` — full orchestration (called by Task 2)
  - `TWITCH_CLIENT_ID: string` — exported so tests can assert against it

- [ ] **Step 1: Add `shell` to the Electron mock**

Open `tests/__mocks__/electron.ts`. The file currently exports `ipcRenderer`, `ipcMain`, `app`, `BrowserWindow`. Add `shell` so that tests importing `twitch-oauth.ts` don't fail on the `shell` import:

```typescript
// add before the existing exports:
const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined)
}

// update the export line to include shell:
export { ipcRenderer, ipcMain, app, BrowserWindow, shell }
```

- [ ] **Step 2: Write the failing tests**

Create `tests/main/auth/twitch-oauth.test.ts`:

```typescript
import { generatePkce, exchangeCode, fetchUsername, TWITCH_CLIENT_ID } from '../../../src/main/auth/twitch-oauth'
import { createHash } from 'crypto'

global.fetch = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('generatePkce', () => {
  it('returns a codeVerifier of 43 base64url chars (32 bytes)', () => {
    const { codeVerifier } = generatePkce()
    expect(/^[A-Za-z0-9\-_]+$/.test(codeVerifier)).toBe(true)
    expect(codeVerifier.length).toBe(43)
  })

  it('codeChallenge is SHA-256 base64url of codeVerifier', () => {
    const { codeVerifier, codeChallenge } = generatePkce()
    const expected = createHash('sha256').update(codeVerifier).digest('base64url')
    expect(codeChallenge).toBe(expected)
  })

  it('generates unique values on each call', () => {
    const a = generatePkce()
    const b = generatePkce()
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
  })
})

describe('exchangeCode', () => {
  it('POSTs to Twitch token endpoint with all required fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123' })
    })
    const token = await exchangeCode('mycode', 'myverifier', 'http://localhost:7373/callback')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://id.twitch.tv/oauth2/token',
      expect.objectContaining({ method: 'POST' })
    )
    const body = new URLSearchParams(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string
    )
    expect(body.get('client_id')).toBe(TWITCH_CLIENT_ID)
    expect(body.get('code')).toBe('mycode')
    expect(body.get('code_verifier')).toBe('myverifier')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('redirect_uri')).toBe('http://localhost:7373/callback')
    expect(token).toBe('tok123')
  })

  it('throws "Authorization failed" when response is not ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
    await expect(
      exchangeCode('bad', 'v', 'http://localhost:7373/callback')
    ).rejects.toThrow('Authorization failed — please try again')
  })
})

describe('fetchUsername', () => {
  it('calls Helix users endpoint with correct Authorization and Client-Id headers', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ display_name: 'StreamerDude' }] })
    })
    const name = await fetchUsername('mytoken')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.twitch.tv/helix/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mytoken',
          'Client-Id': TWITCH_CLIENT_ID
        })
      })
    )
    expect(name).toBe('StreamerDude')
  })

  it('throws "Authorization failed" when response is not ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
    await expect(fetchUsername('badtoken')).rejects.toThrow(
      'Authorization failed — please try again'
    )
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test -- --runInBand --testPathPattern="twitch-oauth"
```

Expected: FAIL — `Cannot find module '../../../src/main/auth/twitch-oauth'`

- [ ] **Step 4: Create `src/main/auth/twitch-oauth.ts`**

```typescript
import { createHash, randomBytes } from 'crypto'
import { createServer } from 'http'
import { shell } from 'electron'

export const TWITCH_CLIENT_ID = 'REPLACE_WITH_YOUR_CLIENT_ID'

const SCOPES = 'chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users'
const REDIRECT_PORTS = [7373, 7374, 7375, 7376, 7377]
const TIMEOUT_MS = 5 * 60 * 1000

export interface PkceParams {
  codeVerifier: string
  codeChallenge: string
}

export function generatePkce(): PkceParams {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }).toString()
  })
  if (!res.ok) throw new Error('Authorization failed — please try again')
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function fetchUsername(token: string): Promise<string> {
  const res = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': TWITCH_CLIENT_ID
    }
  })
  if (!res.ok) throw new Error('Authorization failed — please try again')
  const data = await res.json() as { data: Array<{ display_name: string }> }
  return data.data[0]?.display_name ?? ''
}

export async function startTwitchOAuth(): Promise<{ token: string; username: string }> {
  const { codeVerifier, codeChallenge } = generatePkce()

  let port: number | null = null
  for (const p of REDIRECT_PORTS) {
    if (await isPortAvailable(p)) { port = p; break }
  }
  if (port === null) {
    throw new Error('Could not start auth server — close other apps and try again')
  }

  const redirectUri = `http://localhost:${port}/callback`
  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize')
  authUrl.searchParams.set('client_id', TWITCH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  await shell.openExternal(authUrl.toString())

  const code = await waitForCode(port, TIMEOUT_MS)
  if (code === null) throw new Error('Authorization cancelled')

  const token = await exchangeCode(code, codeVerifier, redirectUri)
  const username = await fetchUsername(token)
  return { token, username }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const srv = createServer()
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)))
    srv.on('error', () => resolve(false))
  })
}

function waitForCode(port: number, timeoutMs: number): Promise<string | null> {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      const url = new URL(req.url ?? '', `http://localhost:${port}`)
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return }
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<p>Authorization successful, you can close this tab.</p>')
      srv.close()
      clearTimeout(timer)
      resolve(code)
    })
    srv.listen(port, '127.0.0.1')
    const timer = setTimeout(() => { srv.close(); resolve(null) }, timeoutMs)
  })
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- --runInBand --testPathPattern="twitch-oauth"
```

Expected: 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/auth/twitch-oauth.ts tests/main/auth/twitch-oauth.test.ts tests/__mocks__/electron.ts
git commit -m "feat: twitch-oauth module — PKCE, token exchange, username fetch"
```

---

### Task 2: Types + IPC handler + Preload + mock updates

**Files:**
- Modify: `src/shared/types.ts` — add `twitchUsername?: string` to `AppSettings`
- Modify: `src/main/ipc-handlers.ts` — add `twitch:startOAuth` handler
- Modify: `src/preload/index.ts` — expose `startTwitchOAuth(): Promise<string>`
- Modify: `tests/renderer/pages/AccountManager.test.tsx` — add mock
- Modify: `tests/renderer/pages/Settings.test.tsx` — add mock
- Modify: `tests/renderer/pages/ModLog.test.tsx` — add mock
- Modify: `tests/renderer/hooks/useChat.test.ts` — add mock
- Modify: `tests/renderer/components/ReplyBar.test.tsx` — find and add mock

**Interfaces:**
- Consumes: `startTwitchOAuth()` from `src/main/auth/twitch-oauth.ts` (Task 1)
- Produces: `window.electronAPI.startTwitchOAuth(): Promise<string>` — returns Twitch display name on success, rejects with error message on failure

- [ ] **Step 1: Add `twitchUsername` to `AppSettings` in `src/shared/types.ts`**

In the `AppSettings` interface, after `facebookPageId?: string`, add:

```typescript
twitchUsername?: string
```

The `DEFAULT_SETTINGS` object does not need updating — `twitchUsername` is optional and managed by OAuth, not user-entered.

- [ ] **Step 2: Add `twitch:startOAuth` IPC handler to `src/main/ipc-handlers.ts`**

At the top of the file, add `startTwitchOAuth` to the existing import from `./auth/twitch-oauth` (create the import if it doesn't exist yet):

```typescript
import { startTwitchOAuth } from './auth/twitch-oauth'
```

Inside `registerIpcHandlers`, after the `account:deleteToken` handler (around line 60), add:

```typescript
ipcMain.handle('twitch:startOAuth', async () => {
  const { token, username } = await startTwitchOAuth()
  await setToken('twitch', token)
  setSettings(db, { twitchUsername: username })
  return username
})
```

- [ ] **Step 3: Expose `startTwitchOAuth` in `src/preload/index.ts`**

Inside the `electronAPI` object, after `deleteToken`, add:

```typescript
startTwitchOAuth(): Promise<string> {
  return ipcRenderer.invoke('twitch:startOAuth')
},
```

- [ ] **Step 4: Add `startTwitchOAuth` mock to all 5 renderer test files**

In each file below, find the `window.electronAPI = { ... }` block in `beforeEach` and add this line alongside the other mocks:

```typescript
startTwitchOAuth: jest.fn().mockResolvedValue('StreamerDude'),
```

Files to update:
- `tests/renderer/pages/AccountManager.test.tsx`
- `tests/renderer/pages/Settings.test.tsx`
- `tests/renderer/pages/ModLog.test.tsx`
- `tests/renderer/hooks/useChat.test.ts`
- `tests/renderer/components/ReplyBar.test.tsx`

- [ ] **Step 5: Run all renderer tests — verify they pass**

```bash
npm test -- --runInBand --testPathPattern="tests/renderer"
```

Expected: all existing renderer tests PASS (no new tests yet — those are in Task 3)

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/ipc-handlers.ts src/preload/index.ts \
  tests/renderer/pages/AccountManager.test.tsx \
  tests/renderer/pages/Settings.test.tsx \
  tests/renderer/pages/ModLog.test.tsx \
  tests/renderer/hooks/useChat.test.ts \
  tests/renderer/components/ReplyBar.test.tsx
git commit -m "feat: twitch:startOAuth IPC handler and preload"
```

---

### Task 3: AccountManager UI

**Files:**
- Modify: `src/renderer/pages/AccountManager.tsx`
- Modify: `tests/renderer/pages/AccountManager.test.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.startTwitchOAuth(): Promise<string>` (Task 2)
- Consumes: `AppSettings.twitchUsername?: string` (Task 2)

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `tests/renderer/pages/AccountManager.test.tsx` at the end of the file:

```typescript
describe('AccountManager — Twitch OAuth', () => {
  beforeEach(() => {
    ;(window.electronAPI.startTwitchOAuth as jest.Mock).mockResolvedValue('StreamerDude')
  })

  it('Twitch Connect button calls startTwitchOAuth, not window.prompt', async () => {
    const promptSpy = jest.spyOn(window, 'prompt')
    render(<AccountManager />)
    await waitFor(() => screen.getAllByRole('button', { name: /connect/i }))
    const connectButtons = screen.getAllByRole('button', { name: /connect/i })
    // Twitch is first in the list
    fireEvent.click(connectButtons[0])
    await waitFor(() =>
      expect(window.electronAPI.startTwitchOAuth).toHaveBeenCalled()
    )
    expect(promptSpy).not.toHaveBeenCalled()
    promptSpy.mockRestore()
  })

  it('shows "Connected as StreamerDude" after successful OAuth', async () => {
    render(<AccountManager />)
    await waitFor(() => screen.getAllByRole('button', { name: /connect/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /connect/i })[0])
    expect(await screen.findByText('Connected as StreamerDude')).toBeInTheDocument()
  })

  it('shows error message inline when OAuth fails', async () => {
    ;(window.electronAPI.startTwitchOAuth as jest.Mock).mockRejectedValueOnce(
      new Error('Authorization cancelled')
    )
    render(<AccountManager />)
    await waitFor(() => screen.getAllByRole('button', { name: /connect/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /connect/i })[0])
    expect(await screen.findByText('Authorization cancelled')).toBeInTheDocument()
  })

  it('loads twitchUsername from settings on mount', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      twitchUsername: 'ExistingStreamer'
    })
    ;(window.electronAPI.getToken as jest.Mock).mockResolvedValue('oauth:stored-token')
    render(<AccountManager />)
    expect(await screen.findByText('Connected as ExistingStreamer')).toBeInTheDocument()
  })

  it('clears username on Disconnect', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      twitchUsername: 'ExistingStreamer'
    })
    ;(window.electronAPI.getToken as jest.Mock).mockResolvedValue('oauth:stored-token')
    render(<AccountManager />)
    await screen.findByText('Connected as ExistingStreamer')
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))
    await waitFor(() =>
      expect(screen.queryByText('Connected as ExistingStreamer')).not.toBeInTheDocument()
    )
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twitchUsername: '' })
    )
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --runInBand --testPathPattern="AccountManager"
```

Expected: FAIL — the new tests fail because AccountManager still uses `window.prompt`

- [ ] **Step 3: Rewrite `src/renderer/pages/AccountManager.tsx`**

Replace the entire file content:

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
  const [twitchUsername, setTwitchUsername] = useState<string>('')
  const [twitchError, setTwitchError] = useState<string>('')

  useEffect(() => {
    void (async () => {
      const settings = await window.electronAPI.getSettings()
      setChannelIds(settings)
      if (settings.twitchUsername) setTwitchUsername(settings.twitchUsername)
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
    if (platform === 'twitch') {
      setTwitchError('')
      try {
        const username = await window.electronAPI.startTwitchOAuth()
        setTokens(prev => ({ ...prev, twitch: 'connected' }))
        setTwitchUsername(username)
      } catch (e) {
        setTwitchError((e as Error).message)
      }
      return
    }
    const token = window.prompt(`Paste your ${platform} OAuth token:`)
    if (!token) return
    await window.electronAPI.setToken(platform, token)
    setTokens(prev => ({ ...prev, [platform]: token }))
  }

  async function handleDisconnect(platform: Platform): Promise<void> {
    await window.electronAPI.deleteToken(platform)
    setTokens(prev => ({ ...prev, [platform]: null }))
    setStatuses(prev => ({ ...prev, [platform]: 'disconnected' }))
    if (platform === 'twitch') {
      setTwitchUsername('')
      void window.electronAPI.setSettings({ twitchUsername: '' })
    }
  }

  function handleChannelIdBlur(key: keyof AppSettings, value: string): void {
    setChannelIds(prev => ({ ...prev, [key]: value }))
    void window.electronAPI.setSettings({ [key]: value } as Partial<AppSettings>)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Connected Accounts</h1>
      <div className="flex flex-col gap-4 max-w-xl">
        {PLATFORMS.map(({ id, label, color, note, channelFields }) => {
          const hasToken = !!tokens[id]
          const status: ConnectionStatus = statuses[id] ?? (hasToken ? 'connecting' : 'disconnected')

          return (
            <div
              key={id}
              className="bg-white rounded-lg px-4 py-3 border border-gray-200 dark:bg-gray-800 dark:border-gray-700"
            >
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white ${color}`}>
                  {label[0]}
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{label}</div>
                  <div className={`text-xs ${STATUS_COLORS[status]}`}>
                    {status}{note ? ` · ${note}` : ''}
                  </div>
                  {id === 'twitch' && twitchUsername && (
                    <div className="text-xs text-gray-400 mt-0.5">Connected as {twitchUsername}</div>
                  )}
                  {id === 'twitch' && twitchError && (
                    <p className="text-xs text-red-400 mt-0.5">{twitchError}</p>
                  )}
                </div>
                {hasToken ? (
                  <button
                    onClick={() => void handleDisconnect(id)}
                    className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
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
                    className="w-full bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
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

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npm test -- --runInBand
```

Expected: all tests PASS (71 existing + 5 new = 76 total renderer tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/AccountManager.tsx tests/renderer/pages/AccountManager.test.tsx
git commit -m "feat: AccountManager Twitch Connect uses OAuth flow"
```

---

## Before testing end-to-end

You must replace the Client ID placeholder before the OAuth flow will work:

1. Go to [dev.twitch.tv/console](https://dev.twitch.tv/console) and register a new application
2. Set the OAuth Redirect URL to `http://localhost:7373` (add 7374–7377 as extras)
3. Copy your Client ID
4. Open `src/main/auth/twitch-oauth.ts` and replace `'REPLACE_WITH_YOUR_CLIENT_ID'` with your actual Client ID

Then run `npm run dev` and click Connect on the Twitch row to test the full flow.
