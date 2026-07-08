# Team Mode WebSocket Server — Design Spec

**Date:** 2026-07-08

## Goal

Allow a host running Streamline to share their live chat feed with teammates. Teammates install Streamline, paste an invite code + passphrase, and get a real-time window into the host's session with full send and moderate capability.

---

## Security Model

- **Passphrase** — host chooses a passphrase (e.g. `purple-monkey-7`). It is stored in keytar, never in SQLite.
- **Invite code** — `AES-256-GCM encrypt(localIP:port, PBKDF2(passphrase, salt))` → base64url → chunked (e.g. `A3xK-m9Pq-7rBz`). The passphrase is never embedded in the code. Salt is fixed per host (stored in keytar alongside passphrase).
- **Authentication** — on WebSocket connect, client sends `{type:'auth', passphrase}`. Server verifies with `crypto.timingSafeEqual`. No passphrase = connection closed immediately.
- **Transport** — plain WebSocket (WS, not WSS). Intended for LAN use; internet users should connect via VPN. TLS with self-signed certs is not included (cert pinning complexity outweighs benefit for a trusted mod team).

---

## AppSettings Changes

Add to `src/shared/types.ts`:
```ts
teamInviteCode: string   // the encrypted blob, derived — not stored, computed on read
```

Passphrase and salt are stored in keytar under service `streamchat-app`, keys `team-passphrase` and `team-salt`. They are NOT in AppSettings/SQLite.

---

## Host Settings UI

Team Mode section in `Settings.tsx` expands when `teamModeEnabled` is true:

```
┌─ Team Mode ──────────────────────────────────────┐
│ Enable team mode          [toggle]               │
│ Port                      [7350      ]           │
│ Passphrase                [••••••••••••••   ]    │
│ Invite code    A3xK-m9Pq-7rBz        [Copy]     │
│ Connected teammates       2                      │
└──────────────────────────────────────────────────┘
```

- Passphrase field is `type="password"` with a show/hide toggle
- Invite code is read-only text, regenerated whenever passphrase or port changes
- "Connected teammates" is a live count pushed via IPC from the main process
- Passphrase saved to keytar on blur

---

## Teammate Settings UI

New "Join Team" section in `Settings.tsx`, always visible (independent of team mode toggle):

```
┌─ Join Team ──────────────────────────────────────┐
│ Invite code    [A3xK-m9Pq-7rBz        ]         │
│ Passphrase     [••••••••••••••         ]         │
│ [Connect]      ● Disconnected                    │
└──────────────────────────────────────────────────┘
```

- Status: `Disconnected` / `Connecting…` / `Connected to <ip>` / `Error: <reason>`
- Connect button becomes Disconnect when connected
- When connected: chat feed shows host messages only; local platform connections are paused (adapters not started or stopped if running)
- Invite code + passphrase stored in keytar (`team-invite-code`, `team-join-passphrase`) — not in SQLite

---

## New Files

### `src/main/invite-code.ts`

Pure functions, no new dependencies (Node built-in `crypto` only):

```ts
export function generateInviteCode(ip: string, port: number, passphrase: string, salt: Buffer): string
// PBKDF2(passphrase, salt, 100000, 32, 'sha256') → AES-256-GCM key
// encrypt(`${ip}:${port}`) → iv + authTag + ciphertext → base64url → chunk every 4 chars with '-'

export function decodeInviteCode(code: string, passphrase: string, salt: Buffer): { ip: string; port: number }
// reverse: strip '-', base64url decode, AES-256-GCM decrypt → split on ':'
// throws if decryption fails (wrong passphrase or corrupted code)
```

### `src/main/team-server.ts`

```ts
export class TeamServer {
  constructor(private bus: ChatBus, private db: Db) {}
  start(port: number, passphrase: string): void
  stop(): void
  getClientCount(): number
  on(event: 'clientCountChanged', handler: (count: number) => void): void
}
```

- Uses `ws` WebSocket server (already a dependency)
- On client connect: wait for `{type:'auth', passphrase}`, verify with `timingSafeEqual`, close on failure
- On auth success: send `{type:'history', messages: recentMessages(db, 200)}`
- Subscribe to `bus.on('message')` and `bus.on('modResult')` — broadcast to all authenticated clients
- On `sendMessage` from client: call `bus.sendMessage(...)`
- On `moderate` from client: call `bus.moderate(...)`
- Emits `clientCountChanged` when a client connects or disconnects

### `src/main/team-client.ts`

```ts
export class TeamClient extends EventEmitter {
  connect(code: string, passphrase: string, salt: Buffer): Promise<void>
  disconnect(): void
  sendMessage(platform: Platform, channelId: string, text: string): void
  moderate(platform: Platform, action: string, targetUserId: string, messageId?: string, duration?: number): void
  // emits: 'message' (ChatMessage), 'modResult' (ModerationResult), 'status' (TeamClientStatus)
}

export type TeamClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
```

- Decodes invite code → gets `ip:port`
- Connects to `ws://ip:port`
- Sends `{type:'auth', passphrase}`, waits for `{type:'auth', success:true}`
- On `history`: emits each message as `'message'` events
- On `message`/`modResult`: emits corresponding events
- Reconnects automatically on disconnect (exponential backoff, max 30s)

---

## IPC Changes

### New IPC channels

| Channel | Direction | Purpose |
|---|---|---|
| `team:getInviteCode` | renderer → main | Returns current invite code string |
| `team:getClientCount` | renderer → main | Returns authenticated client count |
| `team:clientCountChanged` | main → renderer | Push count on change |
| `team:connect` | renderer → main | Start TeamClient with code + passphrase |
| `team:disconnect` | renderer → main | Stop TeamClient |
| `team:status` | main → renderer | Push TeamClientStatus changes |
| `team:setPassphrase` | renderer → main | Save passphrase to keytar, regenerate invite code |

### Preload additions (`src/preload/index.ts`)

```ts
getTeamInviteCode(): Promise<string>
getTeamClientCount(): Promise<number>
onTeamClientCount(handler: (count: number) => void): () => void
connectToTeam(code: string, passphrase: string): Promise<void>
disconnectFromTeam(): Promise<void>
onTeamStatus(handler: (status: TeamClientStatus) => void): () => void
setTeamPassphrase(passphrase: string): Promise<void>
```

---

## `main/index.ts` Changes

After `registerIpcHandlers`:

```ts
const settings = getSettings(db)
const teamServer = new TeamServer(bus, db)
const teamClient = new TeamClient()

if (settings.teamModeEnabled) {
  const passphrase = await getToken('team-passphrase') // keytar reuse
  if (passphrase) teamServer.start(settings.teamModePort, passphrase)
}

// Watch settings changes to start/stop server live
bus.on('settingsChanged', (partial) => {
  if ('teamModeEnabled' in partial || 'teamModePort' in partial) {
    teamServer.stop()
    if (partial.teamModeEnabled) teamServer.start(...)
  }
})
```

The `TeamClient`, when connected, feeds its `'message'` events into `win.webContents.send('chat:message', msg)` — exactly the same IPC the local adapters use. The renderer sees no difference.

---

## Chat Feed Behavior (Teammate)

When `TeamClient` status becomes `connected`:
- `main/index.ts` stops auto-connecting local adapters (or disconnects them if running)
- All `chat:message` IPC events come from `TeamClient` instead
- Send/moderate actions go through `TeamClient` instead of local `bus`

The renderer (`App.tsx`, `ChatFeed`, `ReplyBar`) requires zero changes.

---

## Error Handling

- Wrong passphrase on connect: server sends `{type:'auth', success:false, error:'Invalid passphrase'}`, closes connection. Client emits `status: 'error'`, shows reason in UI.
- Host unreachable: connection times out after 10s, status → `error: 'Could not reach host'`
- Host goes offline mid-session: client auto-reconnects with backoff, status → `connecting`
- Port already in use: server start fails, IPC returns error, Settings shows "Port in use — choose another"

---

## Testing

- `tests/main/invite-code.test.ts` — round-trip encode/decode, wrong passphrase throws, corrupted code throws
- `tests/main/team-server.test.ts` — auth success/failure, message broadcast, command forwarding, client count events
- `tests/main/team-client.test.ts` — connects, auth flow, receives messages, reconnect on disconnect
