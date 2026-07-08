# Team Mode WebSocket Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WebSocket-based team mode that lets the host broadcast their live chat feed to authenticated teammates running Streamline, with full send and moderate capability.

**Architecture:** A `TeamServer` class runs in the Electron main process when team mode is enabled, broadcasting ChatBus events to authenticated WebSocket clients. A `TeamClient` class connects to a remote host, feeding received messages into the same IPC channel local adapters use — so the renderer needs zero changes. An `InviteCode` module handles AES-256-GCM encode/decode of `ip:port` using a PBKDF2-derived key from the shared passphrase.

**Tech Stack:** Node.js built-in `crypto`, `ws` (already installed at v8.21.0), keytar (already installed), Electron IPC, Jest

## Global Constraints

- `contextBridge.exposeInMainWorld('electronAPI', ...)` — key must be exactly `'electronAPI'`
- `BrowserWindow` must have `contextIsolation: true, nodeIntegration: false`
- Keytar service name: `streamchat-app` (existing constant in `src/main/auth/keychain.ts`)
- Keytar keys for team mode: `team-passphrase`, `team-salt` (stored as hex strings)
- SQLite database file: `app.getPath('userData')/streamchat.db` — team passphrase/salt NOT stored here
- Run tests with `npx jest --runInBand` to avoid MacBook freezing
- `ws` WebSocket server — plain WS (not WSS), LAN use, VPN for internet
- PBKDF2: 100000 iterations, 32-byte key, sha256, 16-byte salt
- AES-256-GCM: 12-byte IV, 16-byte auth tag

---

## File Structure

**Create:**
- `src/main/invite-code.ts` — pure encode/decode functions, no side effects
- `src/main/team-server.ts` — `TeamServer` class (host side)
- `src/main/team-client.ts` — `TeamClient` class (teammate side)
- `tests/main/invite-code.test.ts`
- `tests/main/team-server.test.ts`
- `tests/main/team-client.test.ts`

**Modify:**
- `src/main/auth/keychain.ts` — add generic `getSecret`/`setSecret`/`deleteSecret` for non-platform keys
- `src/main/ipc-handlers.ts` — register team mode IPC handlers
- `src/preload/index.ts` — expose team IPC methods
- `src/renderer/pages/Settings.tsx` — expand team mode section (host) + add join team section (teammate)
- `src/main/index.ts` — start TeamServer on boot if enabled; wire TeamClient
- `tests/renderer/pages/Settings.test.tsx` — add tests for new UI
- All existing renderer test mocks — add new electronAPI methods

---

### Task 1: Keychain helpers + InviteCode module

**Files:**
- Modify: `src/main/auth/keychain.ts`
- Create: `src/main/invite-code.ts`
- Create: `tests/main/invite-code.test.ts`

**Interfaces:**
- Produces:
  - `getSecret(key: string): Promise<string | null>`
  - `setSecret(key: string, value: string): Promise<void>`
  - `deleteSecret(key: string): Promise<void>`
  - `generateInviteCode(ip: string, port: number, passphrase: string, saltHex: string): string`
  - `decodeInviteCode(code: string, passphrase: string, saltHex: string): { ip: string; port: number }`
  - `generateSalt(): string` — returns 16-byte random hex string

- [ ] **Step 1: Write failing tests for invite-code**

Create `tests/main/invite-code.test.ts`:

```ts
import { generateInviteCode, decodeInviteCode, generateSalt } from '../../../src/main/invite-code'

describe('invite-code', () => {
  const ip = '192.168.1.42'
  const port = 7350
  const passphrase = 'purple-monkey-7'
  let salt: string

  beforeEach(() => {
    salt = generateSalt()
  })

  it('round-trips ip and port', () => {
    const code = generateInviteCode(ip, port, passphrase, salt)
    const result = decodeInviteCode(code, passphrase, salt)
    expect(result.ip).toBe(ip)
    expect(result.port).toBe(port)
  })

  it('generates a non-empty chunked string', () => {
    const code = generateInviteCode(ip, port, passphrase, salt)
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })

  it('throws on wrong passphrase', () => {
    const code = generateInviteCode(ip, port, passphrase, salt)
    expect(() => decodeInviteCode(code, 'wrong-passphrase', salt)).toThrow()
  })

  it('throws on corrupted code', () => {
    expect(() => decodeInviteCode('XXXX-XXXX-XXXX', passphrase, salt)).toThrow()
  })

  it('generateSalt returns a 32-char hex string (16 bytes)', () => {
    const s = generateSalt()
    expect(s).toMatch(/^[0-9a-f]{32}$/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest --runInBand tests/main/invite-code.test.ts
```
Expected: FAIL — "Cannot find module '../../../src/main/invite-code'"

- [ ] **Step 3: Add generic keychain helpers to `src/main/auth/keychain.ts`**

Add after the existing `deleteToken` function:

```ts
export async function getSecret(key: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, key)
}

export async function setSecret(key: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE, key, value)
}

export async function deleteSecret(key: string): Promise<void> {
  await keytar.deletePassword(SERVICE, key)
}
```

- [ ] **Step 4: Implement `src/main/invite-code.ts`**

```ts
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto'

const ITERATIONS = 100000
const KEY_LEN = 32
const DIGEST = 'sha256'
const IV_LEN = 12
const TAG_LEN = 16

function deriveKey(passphrase: string, saltHex: string): Buffer {
  const salt = Buffer.from(saltHex, 'hex')
  return pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LEN, DIGEST)
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

export function generateInviteCode(ip: string, port: number, passphrase: string, saltHex: string): string {
  const key = deriveKey(passphrase, saltHex)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = `${ip}:${port}`
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  const b64 = combined.toString('base64url')
  // chunk every 4 chars with '-'
  return b64.match(/.{1,4}/g)!.join('-')
}

export function decodeInviteCode(code: string, passphrase: string, saltHex: string): { ip: string; port: number } {
  const key = deriveKey(passphrase, saltHex)
  const b64 = code.replace(/-/g, '')
  const combined = Buffer.from(b64, 'base64url')
  const iv = combined.subarray(0, IV_LEN)
  const tag = combined.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const encrypted = combined.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  const lastColon = decrypted.lastIndexOf(':')
  const ip = decrypted.slice(0, lastColon)
  const port = parseInt(decrypted.slice(lastColon + 1), 10)
  if (!ip || isNaN(port)) throw new Error('Invalid invite code')
  return { ip, port }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest --runInBand tests/main/invite-code.test.ts
```
Expected: 5/5 PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/auth/keychain.ts src/main/invite-code.ts tests/main/invite-code.test.ts
git commit -m "feat: invite code encode/decode and generic keychain helpers"
```

---

### Task 2: TeamServer

**Files:**
- Create: `src/main/team-server.ts`
- Create: `tests/main/team-server.test.ts`

**Interfaces:**
- Consumes:
  - `ChatBus` from `src/main/chat-bus.ts` — `bus.on('message', handler)`, `bus.on('modResult', handler)`, `bus.sendMessage(platform, channelId, text)`, `bus.moderate(platform, action, targetUserId, messageId?, duration?)`
  - `getRecentMessages(db, limit)` from `src/main/store/messages.ts`
  - `Db` from `src/main/store/db.ts`
- Produces:
  - `class TeamServer` with methods:
    - `start(port: number, passphrase: string): void`
    - `stop(): void`
    - `getClientCount(): number`
    - `on(event: 'clientCountChanged', handler: (count: number) => void): void`
    - `off(event: 'clientCountChanged', handler: (count: number) => void): void`

- [ ] **Step 1: Write failing tests**

Create `tests/main/team-server.test.ts`:

```ts
import WebSocket from 'ws'
import { TeamServer } from '../../../src/main/team-server'
import { EventEmitter } from 'events'
import type { ChatMessage, ModerationResult } from '../../../src/shared/types'

const TEST_PORT = 17350
const PASSPHRASE = 'test-pass'

const mockMsg: ChatMessage = {
  id: 'm1', platform: 'twitch', channelId: 'c1', userId: 'u1',
  username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: []
}

function makeBus(): any {
  const emitter = new EventEmitter()
  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    sendMessage: jest.fn(),
    moderate: jest.fn().mockResolvedValue({ success: true })
  }
}

function makeDb(): any {
  return {
    prepare: jest.fn().mockReturnValue({
      all: jest.fn().mockReturnValue([])
    })
  }
}

async function connectAndAuth(passphrase = PASSPHRASE): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', passphrase }))
    })
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'auth' && msg.success) resolve(ws)
      if (msg.type === 'auth' && !msg.success) reject(new Error(msg.error))
    })
    ws.on('error', reject)
    setTimeout(() => reject(new Error('timeout')), 3000)
  })
}

describe('TeamServer', () => {
  let server: TeamServer
  let bus: any

  beforeEach(() => {
    bus = makeBus()
    server = new TeamServer(bus, makeDb())
    server.start(TEST_PORT, PASSPHRASE)
  })

  afterEach(() => {
    server.stop()
  })

  it('accepts authenticated client and sends history', async () => {
    const ws = await connectAndAuth()
    ws.close()
  })

  it('rejects wrong passphrase', async () => {
    await expect(connectAndAuth('wrong')).rejects.toThrow()
  })

  it('broadcasts chat message to authenticated clients', async () => {
    const ws = await connectAndAuth()
    const received = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'message') resolve(msg)
      })
      bus.emit('message', mockMsg)
    })
    expect(received.data.id).toBe('m1')
    ws.close()
  })

  it('tracks client count', async () => {
    expect(server.getClientCount()).toBe(0)
    const ws = await connectAndAuth()
    expect(server.getClientCount()).toBe(1)
    ws.close()
    await new Promise(r => setTimeout(r, 100))
    expect(server.getClientCount()).toBe(0)
  })

  it('emits clientCountChanged events', async () => {
    const counts: number[] = []
    server.on('clientCountChanged', c => counts.push(c))
    const ws = await connectAndAuth()
    ws.close()
    await new Promise(r => setTimeout(r, 100))
    expect(counts).toContain(1)
    expect(counts).toContain(0)
  })

  it('forwards sendMessage command from client to bus', async () => {
    const ws = await connectAndAuth()
    ws.send(JSON.stringify({ type: 'sendMessage', platform: 'twitch', channelId: 'c1', text: 'hello' }))
    await new Promise(r => setTimeout(r, 100))
    expect(bus.sendMessage).toHaveBeenCalledWith('twitch', 'c1', 'hello')
    ws.close()
  })

  it('forwards moderate command from client to bus', async () => {
    const ws = await connectAndAuth()
    ws.send(JSON.stringify({ type: 'moderate', platform: 'twitch', action: 'ban', targetUserId: 'u1' }))
    await new Promise(r => setTimeout(r, 100))
    expect(bus.moderate).toHaveBeenCalledWith('twitch', 'ban', 'u1', undefined, undefined)
    ws.close()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest --runInBand tests/main/team-server.test.ts
```
Expected: FAIL — "Cannot find module '../../../src/main/team-server'"

- [ ] **Step 3: Implement `src/main/team-server.ts`**

```ts
import { EventEmitter } from 'events'
import { createHash, timingSafeEqual } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import type { ChatBus } from './chat-bus'
import type { Db } from './store/db'
import { getRecentMessages } from './store/messages'

type TeamServerEvent = 'clientCountChanged'

export class TeamServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private authenticatedClients = new Set<WebSocket>()
  private passphraseHash: Buffer | null = null
  private msgHandler: ((msg: any) => void) | null = null
  private modHandler: ((result: any) => void) | null = null

  constructor(private bus: ChatBus, private db: Db) {
    super()
  }

  start(port: number, passphrase: string): void {
    this.passphraseHash = createHash('sha256').update(passphrase).digest()
    this.wss = new WebSocketServer({ port })

    this.msgHandler = (msg: any) => {
      const payload = JSON.stringify({ type: 'message', data: msg })
      this.authenticatedClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      })
    }
    this.modHandler = (result: any) => {
      const payload = JSON.stringify({ type: 'modResult', data: result })
      this.authenticatedClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      })
    }

    this.bus.on('message', this.msgHandler)
    this.bus.on('modResult', this.modHandler)

    this.wss.on('connection', (ws) => this.handleConnection(ws))
  }

  stop(): void {
    if (this.msgHandler) this.bus.off('message', this.msgHandler)
    if (this.modHandler) this.bus.off('modResult', this.modHandler)
    this.authenticatedClients.clear()
    this.wss?.close()
    this.wss = null
  }

  getClientCount(): number {
    return this.authenticatedClients.size
  }

  private handleConnection(ws: WebSocket): void {
    let authed = false
    const timeout = setTimeout(() => { if (!authed) ws.close() }, 5000)

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (!authed) {
          if (msg.type !== 'auth') { ws.close(); return }
          const incoming = createHash('sha256').update(msg.passphrase ?? '').digest()
          const valid = timingSafeEqual(this.passphraseHash!, incoming)
          if (!valid) {
            ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Invalid passphrase' }))
            ws.close()
            return
          }
          clearTimeout(timeout)
          authed = true
          this.authenticatedClients.add(ws)
          this.emit('clientCountChanged', this.authenticatedClients.size)
          ws.send(JSON.stringify({ type: 'auth', success: true }))
          const history = getRecentMessages(this.db, 200)
          ws.send(JSON.stringify({ type: 'history', messages: history }))
          return
        }

        if (msg.type === 'sendMessage') {
          await this.bus.sendMessage(msg.platform, msg.channelId, msg.text)
        } else if (msg.type === 'moderate') {
          await this.bus.moderate(msg.platform, msg.action, msg.targetUserId, msg.messageId, msg.duration)
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      this.authenticatedClients.delete(ws)
      this.emit('clientCountChanged', this.authenticatedClients.size)
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest --runInBand tests/main/team-server.test.ts
```
Expected: 7/7 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/team-server.ts tests/main/team-server.test.ts
git commit -m "feat: TeamServer — WebSocket host with auth and command forwarding"
```

---

### Task 3: TeamClient

**Files:**
- Create: `src/main/team-client.ts`
- Create: `tests/main/team-client.test.ts`

**Interfaces:**
- Consumes:
  - `decodeInviteCode(code, passphrase, saltHex)` from `src/main/invite-code.ts`
- Produces:
  - `class TeamClient extends EventEmitter` with methods:
    - `connect(code: string, passphrase: string, saltHex: string): Promise<void>` — resolves on auth success, rejects on failure
    - `disconnect(): void`
    - `sendMessage(platform: Platform, channelId: string, text: string): void`
    - `moderate(platform: Platform, action: string, targetUserId: string, messageId?: string, duration?: number): void`
    - `getStatus(): TeamClientStatus`
  - Events emitted: `'message'` (ChatMessage), `'modResult'` (ModerationResult), `'status'` (TeamClientStatus)
  - `type TeamClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error'`

- [ ] **Step 1: Write failing tests**

Create `tests/main/team-client.test.ts`:

```ts
import { WebSocketServer, WebSocket } from 'ws'
import { TeamClient } from '../../../src/main/team-client'
import type { ChatMessage } from '../../../src/shared/types'

const TEST_PORT = 17351
const PASSPHRASE = 'test-pass'
// generateSalt() output — fixed for tests
const SALT = 'aabbccdd00112233aabbccdd00112233'

const mockMsg: ChatMessage = {
  id: 'm1', platform: 'twitch', channelId: 'c1', userId: 'u1',
  username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: []
}

// Minimal fake server that accepts auth
function makeFakeServer(port: number, passphrase: string): WebSocketServer {
  const wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'auth' && msg.passphrase === passphrase) {
        ws.send(JSON.stringify({ type: 'auth', success: true }))
        ws.send(JSON.stringify({ type: 'history', messages: [] }))
      } else if (msg.type === 'auth') {
        ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Invalid passphrase' }))
        ws.close()
      }
      // Echo sendMessage/moderate back for test verification
      if (msg.type === 'sendMessage' || msg.type === 'moderate') {
        ;(ws as any)._lastCmd = msg
      }
    })
  })
  return wss
}

// For invite code we use a real encode so TeamClient can decode
import { generateInviteCode } from '../../../src/main/invite-code'

describe('TeamClient', () => {
  let fakeServer: WebSocketServer
  let client: TeamClient
  let inviteCode: string

  beforeEach((done) => {
    fakeServer = makeFakeServer(TEST_PORT, PASSPHRASE)
    client = new TeamClient()
    inviteCode = generateInviteCode('127.0.0.1', TEST_PORT, PASSPHRASE, SALT)
    fakeServer.on('listening', done)
  })

  afterEach((done) => {
    client.disconnect()
    fakeServer.close(done)
  })

  it('connects and reaches connected status', async () => {
    await client.connect(inviteCode, PASSPHRASE, SALT)
    expect(client.getStatus()).toBe('connected')
  })

  it('rejects on wrong passphrase', async () => {
    const badCode = generateInviteCode('127.0.0.1', TEST_PORT, 'wrong', SALT)
    await expect(client.connect(badCode, 'wrong', SALT)).rejects.toThrow()
  })

  it('emits message events from server', async () => {
    await client.connect(inviteCode, PASSPHRASE, SALT)
    const received = await new Promise<ChatMessage>((resolve) => {
      client.on('message', resolve)
      // get server ws to push a message
      const serverWs = [...fakeServer.clients][0] as WebSocket
      serverWs.send(JSON.stringify({ type: 'message', data: mockMsg }))
    })
    expect(received.id).toBe('m1')
  })

  it('emits status changes', async () => {
    const statuses: string[] = []
    client.on('status', (s) => statuses.push(s))
    await client.connect(inviteCode, PASSPHRASE, SALT)
    expect(statuses).toContain('connecting')
    expect(statuses).toContain('connected')
  })

  it('starts disconnected', () => {
    expect(client.getStatus()).toBe('disconnected')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest --runInBand tests/main/team-client.test.ts
```
Expected: FAIL — "Cannot find module '../../../src/main/team-client'"

- [ ] **Step 3: Implement `src/main/team-client.ts`**

```ts
import { EventEmitter } from 'events'
import { WebSocket } from 'ws'
import { decodeInviteCode } from './invite-code'
import type { Platform } from '../shared/types'

export type TeamClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export class TeamClient extends EventEmitter {
  private ws: WebSocket | null = null
  private status: TeamClientStatus = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private shouldReconnect = false
  private lastConnectArgs: { code: string; passphrase: string; saltHex: string } | null = null

  connect(code: string, passphrase: string, saltHex: string): Promise<void> {
    this.lastConnectArgs = { code, passphrase, saltHex }
    this.shouldReconnect = true
    return this.doConnect(code, passphrase, saltHex)
  }

  private doConnect(code: string, passphrase: string, saltHex: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let { ip, port } = decodeInviteCode(code, passphrase, saltHex)
      this.setStatus('connecting')
      const ws = new WebSocket(`ws://${ip}:${port}`)
      this.ws = ws

      const connectTimeout = setTimeout(() => {
        ws.close()
        this.setStatus('error')
        reject(new Error('Could not reach host'))
      }, 10000)

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'auth', passphrase }))
      })

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'auth') {
          clearTimeout(connectTimeout)
          if (msg.success) {
            this.reconnectDelay = 1000
            this.setStatus('connected')
            resolve()
          } else {
            this.shouldReconnect = false
            this.setStatus('error')
            ws.close()
            reject(new Error(msg.error ?? 'Auth failed'))
          }
          return
        }

        if (msg.type === 'history') {
          for (const m of msg.messages) this.emit('message', m)
          return
        }

        if (msg.type === 'message') {
          this.emit('message', msg.data)
          return
        }

        if (msg.type === 'modResult') {
          this.emit('modResult', msg.data)
        }
      })

      ws.on('close', () => {
        this.setStatus('disconnected')
        if (this.shouldReconnect && this.lastConnectArgs) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
            this.doConnect(
              this.lastConnectArgs!.code,
              this.lastConnectArgs!.passphrase,
              this.lastConnectArgs!.saltHex
            ).catch(() => {})
          }, this.reconnectDelay)
        }
      })

      ws.on('error', () => {
        clearTimeout(connectTimeout)
      })
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.setStatus('disconnected')
  }

  sendMessage(platform: Platform, channelId: string, text: string): void {
    this.ws?.send(JSON.stringify({ type: 'sendMessage', platform, channelId, text }))
  }

  moderate(platform: Platform, action: string, targetUserId: string, messageId?: string, duration?: number): void {
    this.ws?.send(JSON.stringify({ type: 'moderate', platform, action, targetUserId, messageId, duration }))
  }

  getStatus(): TeamClientStatus {
    return this.status
  }

  private setStatus(s: TeamClientStatus): void {
    this.status = s
    this.emit('status', s)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest --runInBand tests/main/team-client.test.ts
```
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/team-client.ts tests/main/team-client.test.ts
git commit -m "feat: TeamClient — WebSocket teammate client with reconnect"
```

---

### Task 4: IPC + Preload wiring

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes:
  - `TeamServer` from `src/main/team-server.ts`
  - `TeamClient`, `TeamClientStatus` from `src/main/team-client.ts`
  - `generateInviteCode`, `generateSalt` from `src/main/invite-code.ts`
  - `getSecret`, `setSecret` from `src/main/auth/keychain.ts`
  - `getSettings` from `src/main/store/settings.ts`
- Produces (new IPC channels and preload methods):
  - `team:getInviteCode` → `getTeamInviteCode(): Promise<string>`
  - `team:getClientCount` → `getTeamClientCount(): Promise<number>`
  - `team:onClientCount` → `onTeamClientCount(h: (n: number) => void): () => void`
  - `team:setPassphrase` → `setTeamPassphrase(p: string): Promise<void>`
  - `team:connect` → `connectToTeam(code: string, passphrase: string): Promise<void>`
  - `team:disconnect` → `disconnectFromTeam(): Promise<void>`
  - `team:onStatus` → `onTeamStatus(h: (s: TeamClientStatus) => void): () => void`
  - `team:getStatus` → `getTeamStatus(): Promise<TeamClientStatus>`

- [ ] **Step 1: Update `src/main/ipc-handlers.ts`**

Add imports at the top of the file (after existing imports):
```ts
import type { TeamServer } from './team-server'
import type { TeamClient, TeamClientStatus } from './team-client'
import { generateInviteCode, generateSalt } from './invite-code'
import { getSecret, setSecret } from './auth/keychain'
import os from 'os'
```

Change the function signature from:
```ts
export function registerIpcHandlers(bus: ChatBus, db: Db, win: BrowserWindow): void {
```
to:
```ts
export function registerIpcHandlers(
  bus: ChatBus,
  db: Db,
  win: BrowserWindow,
  teamServer: TeamServer,
  teamClient: TeamClient
): void {
```

Add at the end of `registerIpcHandlers` (before the closing `}`):
```ts
  // Team server — host side
  teamServer.on('clientCountChanged', (count) => {
    win.webContents.send('team:clientCount', count)
  })

  ipcMain.handle('team:getClientCount', () => teamServer.getClientCount())

  ipcMain.handle('team:getInviteCode', async () => {
    const passphrase = await getSecret('team-passphrase')
    let salt = await getSecret('team-salt')
    if (!salt) {
      salt = generateSalt()
      await setSecret('team-salt', salt)
    }
    if (!passphrase) return ''
    const settings = getSettings(db)
    const ip = getLocalIp()
    return generateInviteCode(ip, settings.teamModePort, passphrase, salt)
  })

  ipcMain.handle('team:setPassphrase', async (_e, passphrase: string) => {
    await setSecret('team-passphrase', passphrase)
    let salt = await getSecret('team-salt')
    if (!salt) {
      salt = generateSalt()
      await setSecret('team-salt', salt)
    }
  })

  // Team client — teammate side
  ipcMain.handle('team:connect', async (_e, code: string, passphrase: string) => {
    const salt = await getSecret('team-salt') ?? generateSalt()
    await teamClient.connect(code, passphrase, salt)
  })

  ipcMain.handle('team:disconnect', () => {
    teamClient.disconnect()
  })

  ipcMain.handle('team:getStatus', () => teamClient.getStatus())

  teamClient.on('status', (status: TeamClientStatus) => {
    win.webContents.send('team:status', status)
  })

  teamClient.on('message', (msg) => {
    win.webContents.send('chat:message', msg)
  })

  teamClient.on('modResult', (result) => {
    win.webContents.send('mod:result', result)
  })
```

Add helper function after `registerIpcHandlers`:
```ts
function getLocalIp(): string {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return '127.0.0.1'
}
```

- [ ] **Step 2: Update `src/preload/index.ts`**

Add `TeamClientStatus` import at top:
```ts
import type { TeamClientStatus } from '../main/team-client'
```

Add to the `electronAPI` object (after `unbanUser`):
```ts
  getTeamInviteCode(): Promise<string> {
    return ipcRenderer.invoke('team:getInviteCode')
  },
  getTeamClientCount(): Promise<number> {
    return ipcRenderer.invoke('team:getClientCount')
  },
  onTeamClientCount(handler: (count: number) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, count: number) => handler(count)
    ipcRenderer.on('team:clientCount', listener)
    return () => ipcRenderer.removeListener('team:clientCount', listener)
  },
  setTeamPassphrase(passphrase: string): Promise<void> {
    return ipcRenderer.invoke('team:setPassphrase', passphrase)
  },
  connectToTeam(code: string, passphrase: string): Promise<void> {
    return ipcRenderer.invoke('team:connect', code, passphrase)
  },
  disconnectFromTeam(): Promise<void> {
    return ipcRenderer.invoke('team:disconnect')
  },
  getTeamStatus(): Promise<TeamClientStatus> {
    return ipcRenderer.invoke('team:getStatus')
  },
  onTeamStatus(handler: (status: TeamClientStatus) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, status: TeamClientStatus) => handler(status)
    ipcRenderer.on('team:status', listener)
    return () => ipcRenderer.removeListener('team:status', listener)
  },
```

- [ ] **Step 3: Update `src/main/index.ts`**

Add imports at top:
```ts
import { TeamServer } from './team-server'
import { TeamClient } from './team-client'
import { getSecret } from './auth/keychain'
```

In the `main()` function, after `const bus = new ChatBus(db)` add:
```ts
  const teamServer = new TeamServer(bus, db)
  const teamClient = new TeamClient()
```

Change the `registerIpcHandlers` call from:
```ts
  registerIpcHandlers(bus, db, win)
```
to:
```ts
  registerIpcHandlers(bus, db, win, teamServer, teamClient)
```

After `registerIpcHandlers`, add:
```ts
  // Start team server if enabled in settings
  if (settings.teamModeEnabled) {
    const passphrase = await getSecret('team-passphrase')
    if (passphrase) {
      teamServer.start(settings.teamModePort, passphrase)
    }
  }

  app.on('before-quit', () => {
    teamServer.stop()
    teamClient.disconnect()
  })
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts src/main/index.ts
git commit -m "feat: team mode IPC handlers and preload wiring"
```

---

### Task 5: Settings UI — host + teammate

**Files:**
- Modify: `src/renderer/pages/Settings.tsx`
- Modify: `tests/renderer/pages/Settings.test.tsx`
- Modify all renderer test files that mock `window.electronAPI` — add new methods

**Interfaces:**
- Consumes all new `window.electronAPI` methods added in Task 4
- `TeamClientStatus` type — import from `'../../main/team-client'` (shared type; if TS path issue, inline the type as a string union)

- [ ] **Step 1: Update all existing electronAPI mocks**

Find all mock locations:
```bash
grep -rn "unbanUser: jest.fn()" tests/
```

In every file found, add after `unbanUser: jest.fn()`:
```ts
    getTeamInviteCode: jest.fn().mockResolvedValue('ABCD-EFGH-IJKL'),
    getTeamClientCount: jest.fn().mockResolvedValue(0),
    onTeamClientCount: jest.fn(() => jest.fn()),
    setTeamPassphrase: jest.fn().mockResolvedValue(undefined),
    connectToTeam: jest.fn().mockResolvedValue(undefined),
    disconnectFromTeam: jest.fn().mockResolvedValue(undefined),
    getTeamStatus: jest.fn().mockResolvedValue('disconnected'),
    onTeamStatus: jest.fn(() => jest.fn()),
```

- [ ] **Step 2: Write failing tests for new Settings UI sections**

Add to `tests/renderer/pages/Settings.test.tsx` (append after existing tests):

```tsx
describe('Settings — team mode host', () => {
  it('shows passphrase field when team mode enabled', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      theme: 'dark', fontSize: 'md', maxMessagesPerPlatform: 500,
      notificationSounds: { twitch: false, youtube: false, kick: false, tiktok: false, facebook: false },
      teamModeEnabled: true, teamModePort: 7350
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByPlaceholderText('Choose a passphrase')).toBeInTheDocument()
  })

  it('shows invite code when team mode enabled', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      theme: 'dark', fontSize: 'md', maxMessagesPerPlatform: 500,
      notificationSounds: { twitch: false, youtube: false, kick: false, tiktok: false, facebook: false },
      teamModeEnabled: true, teamModePort: 7350
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText('ABCD-EFGH-IJKL')).toBeInTheDocument()
  })

  it('shows connected teammates count', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      theme: 'dark', fontSize: 'md', maxMessagesPerPlatform: 500,
      notificationSounds: { twitch: false, youtube: false, kick: false, tiktok: false, facebook: false },
      teamModeEnabled: true, teamModePort: 7350
    })
    ;(window.electronAPI.getTeamClientCount as jest.Mock).mockResolvedValue(2)
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText(/2 connected/i)).toBeInTheDocument()
  })
})

describe('Settings — join team', () => {
  beforeEach(() => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      theme: 'dark', fontSize: 'md', maxMessagesPerPlatform: 500,
      notificationSounds: { twitch: false, youtube: false, kick: false, tiktok: false, facebook: false },
      teamModeEnabled: false, teamModePort: 7350
    })
  })

  it('shows join team section always', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText('Join Team')).toBeInTheDocument()
  })

  it('connect button calls connectToTeam with code and passphrase', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findByText('Join Team')
    fireEvent.change(screen.getByPlaceholderText('Paste invite code'), { target: { value: 'ABCD-EFGH' } })
    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'mypass' } })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))
    await waitFor(() =>
      expect(window.electronAPI.connectToTeam).toHaveBeenCalledWith('ABCD-EFGH', 'mypass')
    )
  })

  it('shows disconnected status initially', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText(/disconnected/i)).toBeInTheDocument()
  })
})
```

Add missing imports at top of `tests/renderer/pages/Settings.test.tsx` if not already there:
```tsx
import { waitFor } from '@testing-library/react'
```

- [ ] **Step 3: Run tests to verify new tests fail**

```bash
npx jest --runInBand tests/renderer/pages/Settings.test.tsx
```
Expected: new tests FAIL, existing tests still PASS

- [ ] **Step 4: Implement the expanded Settings UI**

In `src/renderer/pages/Settings.tsx`, add these imports at the top:
```tsx
import type { TeamClientStatus } from '../../main/team-client'
```

Add new state variables inside the `Settings` component (after existing state):
```tsx
  const [passphrase, setPassphrase] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [clientCount, setClientCount] = useState(0)
  const [joinCode, setJoinCode] = useState('')
  const [joinPassphrase, setJoinPassphrase] = useState('')
  const [teamStatus, setTeamStatus] = useState<TeamClientStatus>('disconnected')
  const [copied, setCopied] = useState(false)
```

Add to the `useEffect` (after the existing `getSettings` call), inside a new `useEffect`:
```tsx
  useEffect(() => {
    window.electronAPI.getTeamStatus().then(setTeamStatus)
    window.electronAPI.getTeamClientCount().then(setClientCount)
    const unsubStatus = window.electronAPI.onTeamStatus(setTeamStatus)
    const unsubCount = window.electronAPI.onTeamClientCount(setClientCount)
    return () => { unsubStatus(); unsubCount() }
  }, [])

  useEffect(() => {
    if (!settings?.teamModeEnabled) return
    window.electronAPI.getTeamInviteCode().then(setInviteCode)
  }, [settings?.teamModeEnabled, settings?.teamModePort, passphrase])
```

Replace the existing Team Mode `<section>` (the one with `<SectionHeading>Team Mode</SectionHeading>`) entirely with:

```tsx
        {/* Team Mode — Host */}
        <section>
          <SectionHeading>Team Mode</SectionHeading>
          <div className="bg-white rounded-lg px-4 py-4 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span id="team-mode-label" className="text-sm text-gray-700 dark:text-gray-200">
                Enable team mode
              </span>
              <Toggle
                id="enable-team-mode"
                ariaLabelledBy="team-mode-label"
                checked={settings.teamModeEnabled}
                onChange={val => save({ teamModeEnabled: val })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="team-mode-port" className={`text-sm ${settings.teamModeEnabled ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                Port
              </label>
              <input
                id="team-mode-port"
                aria-label="Port"
                type="number"
                min={1024}
                max={65535}
                defaultValue={settings.teamModePort}
                disabled={!settings.teamModeEnabled}
                onBlur={e => save({ teamModePort: Number(e.currentTarget.value) })}
                className="w-24 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
            </div>
            {settings.teamModeEnabled && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm text-gray-700 dark:text-gray-200">Passphrase</label>
                  <input
                    type="password"
                    placeholder="Choose a passphrase"
                    value={passphrase}
                    onChange={e => setPassphrase(e.target.value)}
                    onBlur={async () => {
                      if (passphrase) await window.electronAPI.setTeamPassphrase(passphrase)
                    }}
                    className="w-48 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-200">Invite code</span>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400 truncate max-w-xs">{inviteCode || '—'}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteCode)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                      disabled={!inviteCode}
                      className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Connected teammates</span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">{clientCount} connected</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Join Team — Teammate */}
        <section>
          <SectionHeading>Join Team</SectionHeading>
          <div className="bg-white rounded-lg px-4 py-4 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-gray-200 shrink-0">Invite code</label>
              <input
                type="text"
                placeholder="Paste invite code"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-gray-200 shrink-0">Passphrase</label>
              <input
                type="password"
                placeholder="Passphrase"
                value={joinPassphrase}
                onChange={e => setJoinPassphrase(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
            </div>
            <div className="flex items-center justify-between">
              {teamStatus === 'connected' ? (
                <button
                  onClick={() => window.electronAPI.disconnectFromTeam()}
                  className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => window.electronAPI.connectToTeam(joinCode, joinPassphrase)}
                  disabled={!joinCode || !joinPassphrase || teamStatus === 'connecting'}
                  className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-40"
                >
                  {teamStatus === 'connecting' ? 'Connecting…' : 'Connect'}
                </button>
              )}
              <span className={`text-sm ${
                teamStatus === 'connected' ? 'text-green-500' :
                teamStatus === 'error' ? 'text-red-500' :
                teamStatus === 'connecting' ? 'text-yellow-500' :
                'text-gray-400 dark:text-gray-500'
              }`}>
                {teamStatus === 'connected' ? '● Connected' :
                 teamStatus === 'connecting' ? '● Connecting…' :
                 teamStatus === 'error' ? '● Error' :
                 '○ Disconnected'}
              </span>
            </div>
          </div>
        </section>
```

- [ ] **Step 5: Run all renderer tests**

```bash
npx jest --runInBand tests/renderer/
```
Expected: all tests PASS

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/Settings.tsx tests/renderer/pages/Settings.test.tsx tests/renderer/
git commit -m "feat: team mode Settings UI — host passphrase/invite code and join team"
```

---

### Task 6: Push to GitHub

- [ ] **Step 1: Run full test suite**

```bash
npx jest --runInBand tests/main/ && npx jest --runInBand tests/renderer/
```
Expected: all tests pass

- [ ] **Step 2: Push**

```bash
PATH="/opt/homebrew/bin:$PATH" git push origin main
```

Expected: "main -> main" confirmation
