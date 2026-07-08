# Streaming Chat Manager — Foundation (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Twitch-connected streaming chat desktop app with the full foundation — Electron shell, SQLite store, ChatBus, IPC bridge, and React UI showing a unified feed with reply and basic moderation.

**Architecture:** Electron main process owns all platform connections via isolated adapters that emit normalized `ChatMessage` objects to a central `ChatBus`. ChatBus writes to SQLite and broadcasts via IPC to a React renderer. The preload bridge exposes a typed `contextBridge` API — no direct Node access from the UI.

**Tech Stack:** Electron 31, React 18, TypeScript 5, Tailwind CSS 3, SQLite via `better-sqlite3`, `keytar` for OS keychain, `tmi.js` for Twitch, `electron-vite` for build tooling, Jest + ts-jest for unit tests, `@testing-library/react` for component tests.

## Global Constraints

- Node.js >= 20 required
- TypeScript strict mode enabled (`"strict": true` in tsconfig)
- All OAuth tokens stored via `keytar` — never written to SQLite or any file
- `PlatformAdapter` interface in `src/shared/types.ts` must not change after Task 2 — it is the contract between all adapters and ChatBus
- IPC channel names: `chat:message` (inbound), `chat:send` (outbound), `mod:action`, `mod:result`, `account:status`, `account:connect`, `settings:get`, `settings:set`
- Tailwind dark mode via `class` strategy — root element gets `class="dark"` by default
- SQLite database file lives at `app.getPath('userData')/streamchat.db`
- Service name for keytar: `streamchat-app`

---

## File Map

```
/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.js
├── postcss.config.js
├── jest.config.ts
├── src/
│   ├── shared/
│   │   └── types.ts                  # All shared TypeScript interfaces
│   ├── main/
│   │   ├── index.ts                  # Electron main entry, window creation
│   │   ├── ipc-handlers.ts           # Registers all IPC handlers
│   │   ├── chat-bus.ts               # Central message broker
│   │   ├── store/
│   │   │   ├── db.ts                 # SQLite connection + schema migrations
│   │   │   ├── messages.ts           # Message insert/query functions
│   │   │   ├── moderation.ts         # Moderation log insert/query/export
│   │   │   └── settings.ts           # App settings get/set
│   │   ├── adapters/
│   │   │   └── twitch.ts             # Twitch adapter (tmi.js)
│   │   └── auth/
│   │       └── keychain.ts           # keytar wrapper (getToken/setToken/deleteToken)
│   ├── preload/
│   │   └── index.ts                  # contextBridge API exposed to renderer
│   └── renderer/
│       ├── index.html
│       ├── main.tsx                  # React root
│       ├── App.tsx                   # Layout shell, view routing
│       ├── components/
│       │   ├── ChatFeed.tsx          # Scrollable unified message feed
│       │   ├── MessageRow.tsx        # Single message with context menu
│       │   ├── PlatformBadge.tsx     # Colored platform pill
│       │   ├── FilterBar.tsx         # Platform/keyword/user filter controls
│       │   └── ReplyBar.tsx          # Input + platform selector + send button
│       ├── hooks/
│       │   └── useChat.ts            # IPC subscription, message state, filter logic
│       └── pages/
│           └── AccountManager.tsx    # OAuth connect flow + connection status
├── tests/
│   ├── setup.ts                      # Jest global setup
│   ├── main/
│   │   ├── chat-bus.test.ts
│   │   ├── store/
│   │   │   ├── messages.test.ts
│   │   │   ├── moderation.test.ts
│   │   │   └── settings.test.ts
│   │   ├── adapters/
│   │   │   └── twitch.test.ts
│   │   └── auth/
│   │       └── keychain.test.ts
│   └── renderer/
│       ├── components/
│       │   ├── ChatFeed.test.tsx
│       │   ├── MessageRow.test.tsx
│       │   ├── FilterBar.test.tsx
│       │   └── ReplyBar.test.tsx
│       └── hooks/
│           └── useChat.test.ts
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `jest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx` (placeholder)

**Interfaces:**
- Produces: runnable Electron app skeleton with `npm run dev`, passing `npm test`

- [ ] **Step 1: Initialize package.json**

```bash
cd "/Users/sperez/Desktop/Streaming Chat App"
npm init -y
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install react react-dom better-sqlite3 keytar tmi.js ws
npm install --save-dev electron electron-vite vite @vitejs/plugin-react typescript \
  tailwindcss postcss autoprefixer \
  jest ts-jest @types/jest @types/node @types/react @types/react-dom \
  @types/better-sqlite3 @types/tmi.js @types/ws \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jest-environment-jsdom electron-builder
```

- [ ] **Step 3: Write package.json scripts and config**

Replace the contents of `package.json` with:

```json
{
  "name": "streamchat",
  "version": "0.1.0",
  "description": "Multi-platform streaming chat manager",
  "main": "dist-electron/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "better-sqlite3": "^11.0.0",
    "keytar": "^7.9.0",
    "tmi.js": "^1.8.0",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/tmi.js": "^1.8.0",
    "@types/ws": "^8.5.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "jest-environment-jsdom": "^29.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

- [ ] **Step 4: Write electron.vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    css: {
      postcss: './postcss.config.js'
    }
  }
})
```

- [ ] **Step 5: Write tsconfig files**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "CommonJS",
    "moduleResolution": "node",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-electron",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 6: Write Tailwind config**

`tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        twitch: '#9146FF',
        youtube: '#FF0000',
        kick: '#53FC18',
        tiktok: '#010101',
        facebook: '#1877F2'
      }
    }
  },
  plugins: []
}
```

`postcss.config.js`:
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 7: Write jest.config.ts**

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
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
      }
    },
    {
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/renderer/**/*.test.tsx'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.web.json' }] },
      setupFilesAfterFramework: ['<rootDir>/tests/setup.ts'],
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
      }
    }
  ]
}

export default config
```

- [ ] **Step 8: Write test setup and electron mock**

`tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

`tests/__mocks__/electron.ts`:
```typescript
const ipcRenderer = {
  on: jest.fn(),
  once: jest.fn(),
  send: jest.fn(),
  invoke: jest.fn(),
  removeListener: jest.fn()
}

const ipcMain = {
  on: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn()
}

const app = {
  getPath: jest.fn(() => ':memory:'),
  on: jest.fn(),
  quit: jest.fn()
}

const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  webContents: { send: jest.fn() },
  on: jest.fn()
}))

export { ipcRenderer, ipcMain, app, BrowserWindow }
```

- [ ] **Step 9: Write renderer skeleton**

`src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StreamChat</title>
  </head>
  <body class="bg-gray-900 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/renderer/App.tsx`:
```tsx
import React from 'react'

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <p className="m-auto text-gray-400">StreamChat loading…</p>
    </div>
  )
}
```

- [ ] **Step 10: Write placeholder main process entry**

`src/main/index.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

`src/preload/index.ts`:
```typescript
// Populated in Task 7
export {}
```

- [ ] **Step 11: Verify dev server starts**

```bash
npm run dev
```

Expected: Electron window opens showing "StreamChat loading…" on a dark background. No console errors.

- [ ] **Step 12: Run tests (should pass with 0 tests)**

```bash
npm test
```

Expected: `Test Suites: 0 passed, 0 total` — no failures.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: project scaffold — Electron, React, TypeScript, Tailwind, Jest"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

**Interfaces:**
- Produces: `ChatMessage`, `ModerationAction`, `Platform`, `Credentials`, `PlatformAdapter`, `ConnectionStatus`, `AppSettings`, `Badge` — used by every subsequent task

- [ ] **Step 1: Write the failing type test**

Create `tests/main/shared-types.test.ts`:
```typescript
import type {
  ChatMessage,
  ModerationAction,
  Platform,
  Credentials,
  ConnectionStatus,
  AppSettings,
  Badge
} from '../../src/shared/types'

describe('shared types', () => {
  it('ChatMessage shape is correct', () => {
    const msg: ChatMessage = {
      id: 'abc',
      platform: 'twitch',
      channelId: 'chan1',
      userId: 'u1',
      username: 'streamer',
      displayName: 'Streamer',
      avatarUrl: 'https://example.com/avatar.png',
      text: 'hello',
      timestamp: Date.now(),
      isDeleted: false,
      badges: []
    }
    expect(msg.platform).toBe('twitch')
  })

  it('ModerationAction shape is correct', () => {
    const action: ModerationAction = {
      id: 'mod1',
      platform: 'twitch',
      type: 'ban',
      targetUserId: 'u2',
      targetUsername: 'baduser',
      moderatorName: 'mod',
      timestamp: Date.now()
    }
    expect(action.type).toBe('ban')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="shared-types"
```

Expected: FAIL — `Cannot find module '../../src/shared/types'`

- [ ] **Step 3: Write src/shared/types.ts**

```typescript
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
  teamModePort: 7350
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="shared-types"
```

Expected: PASS — `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/main/shared-types.test.ts
git commit -m "feat: add shared TypeScript types (ChatMessage, PlatformAdapter, etc.)"
```

---

### Task 3: SQLite Store

**Files:**
- Create: `src/main/store/db.ts`
- Create: `src/main/store/messages.ts`
- Create: `src/main/store/moderation.ts`
- Create: `src/main/store/settings.ts`
- Create: `tests/main/store/messages.test.ts`
- Create: `tests/main/store/moderation.test.ts`
- Create: `tests/main/store/settings.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `ModerationAction`, `AppSettings`, `DEFAULT_SETTINGS`, `Platform` from `../../src/shared/types`
- Produces:
  - `openDb(path: string): Database` from `db.ts`
  - `insertMessage(db, msg: ChatMessage): void` from `messages.ts`
  - `getRecentMessages(db, limit: number): ChatMessage[]` from `messages.ts`
  - `markMessageDeleted(db, id: string): void` from `messages.ts`
  - `pruneMessages(db, platform: Platform, maxCount: number): void` from `messages.ts`
  - `insertModerationAction(db, action: ModerationAction): void` from `moderation.ts`
  - `getModerationActions(db, filters?: { platform?: Platform; targetUserId?: string }): ModerationAction[]` from `moderation.ts`
  - `exportModerationCsv(db): string` from `moderation.ts`
  - `getSettings(db): AppSettings` from `settings.ts`
  - `setSettings(db, partial: Partial<AppSettings>): AppSettings` from `settings.ts`

- [ ] **Step 1: Write failing tests for db + messages**

Create `tests/main/store/messages.test.ts`:
```typescript
import { openDb } from '../../../src/main/store/db'
import {
  insertMessage,
  getRecentMessages,
  markMessageDeleted,
  pruneMessages
} from '../../../src/main/store/messages'
import type { ChatMessage } from '../../../src/shared/types'

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    platform: 'twitch',
    channelId: 'chan1',
    userId: 'u1',
    username: 'user1',
    displayName: 'User1',
    avatarUrl: '',
    text: 'hello',
    timestamp: 1000,
    isDeleted: false,
    badges: [],
    ...overrides
  }
}

describe('messages store', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => {
    db = openDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('inserts and retrieves a message', () => {
    insertMessage(db, makeMsg())
    const results = getRecentMessages(db, 10)
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('hello')
    expect(results[0].badges).toEqual([])
  })

  it('returns messages newest-first', () => {
    insertMessage(db, makeMsg({ id: 'a', timestamp: 1000 }))
    insertMessage(db, makeMsg({ id: 'b', timestamp: 2000 }))
    const results = getRecentMessages(db, 10)
    expect(results[0].id).toBe('b')
    expect(results[1].id).toBe('a')
  })

  it('marks a message as deleted', () => {
    insertMessage(db, makeMsg({ id: 'x' }))
    markMessageDeleted(db, 'x')
    const results = getRecentMessages(db, 10)
    expect(results[0].isDeleted).toBe(true)
  })

  it('prunes oldest messages when over limit', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, makeMsg({ id: `msg-${i}`, timestamp: i }))
    }
    pruneMessages(db, 'twitch', 3)
    const results = getRecentMessages(db, 10)
    expect(results).toHaveLength(3)
    expect(results.map(m => m.id)).toContain('msg-4')
    expect(results.map(m => m.id)).not.toContain('msg-0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="store/messages"
```

Expected: FAIL — `Cannot find module '../../../src/main/store/db'`

- [ ] **Step 3: Write src/main/store/db.ts**

```typescript
import Database from 'better-sqlite3'

export type Db = Database.Database

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS moderation_actions (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      type TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      moderator_name TEXT NOT NULL,
      reason TEXT,
      duration INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
  `)
}
```

- [ ] **Step 4: Write src/main/store/messages.ts**

```typescript
import type { Db } from './db'
import type { ChatMessage, Platform, Badge } from '../../shared/types'

interface MessageRow {
  id: string
  platform: string
  channel_id: string
  user_id: string
  username: string
  display_name: string
  avatar_url: string
  text: string
  timestamp: number
  is_deleted: number
  badges: string
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    platform: row.platform as Platform,
    channelId: row.channel_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    text: row.text,
    timestamp: row.timestamp,
    isDeleted: row.is_deleted === 1,
    badges: JSON.parse(row.badges) as Badge[]
  }
}

export function insertMessage(db: Db, msg: ChatMessage): void {
  db.prepare(`
    INSERT OR REPLACE INTO messages
      (id, platform, channel_id, user_id, username, display_name, avatar_url, text, timestamp, is_deleted, badges)
    VALUES
      (@id, @platform, @channelId, @userId, @username, @displayName, @avatarUrl, @text, @timestamp, @isDeleted, @badges)
  `).run({
    ...msg,
    isDeleted: msg.isDeleted ? 1 : 0,
    badges: JSON.stringify(msg.badges)
  })
}

export function getRecentMessages(db: Db, limit: number): ChatMessage[] {
  const rows = db.prepare(
    'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?'
  ).all(limit) as MessageRow[]
  return rows.map(rowToMessage)
}

export function markMessageDeleted(db: Db, id: string): void {
  db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?').run(id)
}

export function pruneMessages(db: Db, platform: Platform, maxCount: number): void {
  db.prepare(`
    DELETE FROM messages
    WHERE platform = ? AND id NOT IN (
      SELECT id FROM messages WHERE platform = ?
      ORDER BY timestamp DESC LIMIT ?
    )
  `).run(platform, platform, maxCount)
}
```

- [ ] **Step 5: Run messages tests to verify they pass**

```bash
npm test -- --testPathPattern="store/messages"
```

Expected: PASS — `4 passed`

- [ ] **Step 6: Write failing tests for moderation store**

Create `tests/main/store/moderation.test.ts`:
```typescript
import { openDb } from '../../../src/main/store/db'
import {
  insertModerationAction,
  getModerationActions,
  exportModerationCsv
} from '../../../src/main/store/moderation'
import type { ModerationAction } from '../../../src/shared/types'

function makeAction(overrides: Partial<ModerationAction> = {}): ModerationAction {
  return {
    id: 'action-1',
    platform: 'twitch',
    type: 'ban',
    targetUserId: 'u99',
    targetUsername: 'baduser',
    moderatorName: 'mod1',
    timestamp: 1000,
    ...overrides
  }
}

describe('moderation store', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  it('inserts and retrieves a moderation action', () => {
    insertModerationAction(db, makeAction())
    const results = getModerationActions(db)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('ban')
  })

  it('filters by platform', () => {
    insertModerationAction(db, makeAction({ id: 'a', platform: 'twitch' }))
    insertModerationAction(db, makeAction({ id: 'b', platform: 'youtube' }))
    const results = getModerationActions(db, { platform: 'twitch' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('filters by targetUserId', () => {
    insertModerationAction(db, makeAction({ id: 'a', targetUserId: 'u1' }))
    insertModerationAction(db, makeAction({ id: 'b', targetUserId: 'u2' }))
    const results = getModerationActions(db, { targetUserId: 'u1' })
    expect(results).toHaveLength(1)
  })

  it('exports CSV with header row', () => {
    insertModerationAction(db, makeAction({ reason: 'spam' }))
    const csv = exportModerationCsv(db)
    expect(csv).toContain('id,platform,type,targetUsername,moderatorName,reason,duration,timestamp')
    expect(csv).toContain('baduser')
    expect(csv).toContain('spam')
  })
})
```

- [ ] **Step 7: Write src/main/store/moderation.ts**

```typescript
import type { Db } from './db'
import type { ModerationAction, Platform } from '../../shared/types'

interface ActionRow {
  id: string
  platform: string
  type: string
  target_user_id: string
  target_username: string
  moderator_name: string
  reason: string | null
  duration: number | null
  timestamp: number
}

function rowToAction(row: ActionRow): ModerationAction {
  return {
    id: row.id,
    platform: row.platform as Platform,
    type: row.type as ModerationAction['type'],
    targetUserId: row.target_user_id,
    targetUsername: row.target_username,
    moderatorName: row.moderator_name,
    reason: row.reason ?? undefined,
    duration: row.duration ?? undefined,
    timestamp: row.timestamp
  }
}

export function insertModerationAction(db: Db, action: ModerationAction): void {
  db.prepare(`
    INSERT OR REPLACE INTO moderation_actions
      (id, platform, type, target_user_id, target_username, moderator_name, reason, duration, timestamp)
    VALUES
      (@id, @platform, @type, @targetUserId, @targetUsername, @moderatorName, @reason, @duration, @timestamp)
  `).run({
    ...action,
    reason: action.reason ?? null,
    duration: action.duration ?? null
  })
}

export function getModerationActions(
  db: Db,
  filters: { platform?: Platform; targetUserId?: string } = {}
): ModerationAction[] {
  let query = 'SELECT * FROM moderation_actions WHERE 1=1'
  const params: (string | number)[] = []

  if (filters.platform) {
    query += ' AND platform = ?'
    params.push(filters.platform)
  }
  if (filters.targetUserId) {
    query += ' AND target_user_id = ?'
    params.push(filters.targetUserId)
  }

  query += ' ORDER BY timestamp DESC'
  return (db.prepare(query).all(...params) as ActionRow[]).map(rowToAction)
}

export function exportModerationCsv(db: Db): string {
  const actions = getModerationActions(db)
  const header = 'id,platform,type,targetUsername,moderatorName,reason,duration,timestamp'
  const rows = actions.map(a =>
    [a.id, a.platform, a.type, a.targetUsername, a.moderatorName,
     a.reason ?? '', a.duration ?? '', a.timestamp].join(',')
  )
  return [header, ...rows].join('\n')
}
```

- [ ] **Step 8: Write failing tests for settings store**

Create `tests/main/store/settings.test.ts`:
```typescript
import { openDb } from '../../../src/main/store/db'
import { getSettings, setSettings } from '../../../src/main/store/settings'
import { DEFAULT_SETTINGS } from '../../../src/shared/types'

describe('settings store', () => {
  let db: ReturnType<typeof openDb>

  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  it('returns DEFAULT_SETTINGS when no settings exist', () => {
    const settings = getSettings(db)
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('persists and retrieves settings', () => {
    setSettings(db, { theme: 'light', fontSize: 'lg' })
    const settings = getSettings(db)
    expect(settings.theme).toBe('light')
    expect(settings.fontSize).toBe('lg')
    expect(settings.maxMessagesPerPlatform).toBe(DEFAULT_SETTINGS.maxMessagesPerPlatform)
  })

  it('merges partial updates', () => {
    setSettings(db, { theme: 'light' })
    setSettings(db, { fontSize: 'sm' })
    const settings = getSettings(db)
    expect(settings.theme).toBe('light')
    expect(settings.fontSize).toBe('sm')
  })
})
```

- [ ] **Step 9: Write src/main/store/settings.ts**

```typescript
import type { Db } from './db'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

export function getSettings(db: Db): AppSettings {
  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get() as
    | { data: string }
    | undefined
  if (!row) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.data) as Partial<AppSettings>) }
}

export function setSettings(db: Db, partial: Partial<AppSettings>): AppSettings {
  const current = getSettings(db)
  const updated = { ...current, ...partial }
  db.prepare(
    'INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)'
  ).run(JSON.stringify(updated))
  return updated
}
```

- [ ] **Step 10: Run all store tests**

```bash
npm test -- --testPathPattern="store/"
```

Expected: PASS — `11 passed`

- [ ] **Step 11: Commit**

```bash
git add src/main/store/ tests/main/store/ tests/main/shared-types.test.ts
git commit -m "feat: SQLite store — messages, moderation log, settings with migrations"
```

---

### Task 4: ChatBus

**Files:**
- Create: `src/main/chat-bus.ts`
- Create: `tests/main/chat-bus.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `ChatMessage`, `ModerationAction`, `Platform` from `../../shared/types`; `insertMessage`, `pruneMessages` from `./store/messages`; `insertModerationAction` from `./store/moderation`; `Db` from `./store/db`
- Produces: `class ChatBus` with methods:
  - `registerAdapter(adapter: PlatformAdapter): void`
  - `sendMessage(platform: Platform, channelId: string, text: string): Promise<void>`
  - `moderate(platform: Platform, action: 'delete' | 'timeout' | 'ban', targetUserId: string, messageId?: string, durationSeconds?: number): Promise<ModerationResult>`
  - `on(event: 'message', handler: (msg: ChatMessage) => void): void`
  - `on(event: 'modResult', handler: (result: ModerationResult) => void): void`
  - `on(event: 'status', handler: (platform: Platform, status: ConnectionStatus) => void): void`

```typescript
export interface ModerationResult {
  success: boolean
  platform: Platform
  actionType: 'delete' | 'timeout' | 'ban'
  targetUserId: string
  error?: string
}
```

- [ ] **Step 1: Write failing ChatBus tests**

Create `tests/main/chat-bus.test.ts`:
```typescript
import { ChatBus, ModerationResult } from '../../src/main/chat-bus'
import type { ChatMessage, PlatformAdapter, ConnectionStatus, Credentials, Platform } from '../../src/shared/types'
import { openDb } from '../../src/main/store/db'

function makeMockAdapter(platform: Platform = 'twitch'): jest.Mocked<PlatformAdapter> {
  const handlers: Record<string, Function[]> = {}
  return {
    platform,
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    timeoutUser: jest.fn().mockResolvedValue(undefined),
    banUser: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue('connected' as ConnectionStatus),
    on: jest.fn((event, handler) => {
      handlers[event] = handlers[event] || []
      handlers[event].push(handler)
    }),
    off: jest.fn(),
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] || []).forEach(h => h(...args))
    }
  } as unknown as jest.Mocked<PlatformAdapter> & { _emit: Function }
}

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg1', platform: 'twitch', channelId: 'chan1', userId: 'u1',
    username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
    timestamp: Date.now(), isDeleted: false, badges: [], ...overrides
  }
}

describe('ChatBus', () => {
  let db: ReturnType<typeof openDb>
  let bus: ChatBus

  beforeEach(() => {
    db = openDb(':memory:')
    bus = new ChatBus(db)
  })

  afterEach(() => { db.close() })

  it('broadcasts messages from registered adapter', () => {
    const adapter = makeMockAdapter()
    bus.registerAdapter(adapter)
    const received: ChatMessage[] = []
    bus.on('message', msg => received.push(msg))

    const emitter = adapter as unknown as { _emit: Function }
    emitter._emit('message', makeMsg())

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('hi')
  })

  it('stores messages in SQLite on receive', () => {
    const adapter = makeMockAdapter()
    bus.registerAdapter(adapter)
    const emitter = adapter as unknown as { _emit: Function }
    emitter._emit('message', makeMsg({ id: 'stored-1' }))

    const { getRecentMessages } = require('../../src/main/store/messages')
    const stored = getRecentMessages(db, 10)
    expect(stored.some((m: ChatMessage) => m.id === 'stored-1')).toBe(true)
  })

  it('routes sendMessage to the correct adapter', async () => {
    const adapter = makeMockAdapter('twitch')
    bus.registerAdapter(adapter)
    await bus.sendMessage('twitch', 'chan1', 'hello world')
    expect(adapter.sendMessage).toHaveBeenCalledWith('chan1', 'hello world')
  })

  it('returns success result for a successful ban', async () => {
    const adapter = makeMockAdapter('twitch')
    bus.registerAdapter(adapter)
    const result = await bus.moderate('twitch', 'ban', 'u99')
    expect(result.success).toBe(true)
    expect(adapter.banUser).toHaveBeenCalledWith('u99')
  })

  it('returns error result when adapter throws', async () => {
    const adapter = makeMockAdapter('twitch')
    adapter.banUser.mockRejectedValue(new Error('API error'))
    bus.registerAdapter(adapter)
    const result = await bus.moderate('twitch', 'ban', 'u99')
    expect(result.success).toBe(false)
    expect(result.error).toBe('API error')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="chat-bus"
```

Expected: FAIL — `Cannot find module '../../src/main/chat-bus'`

- [ ] **Step 3: Write src/main/chat-bus.ts**

```typescript
import { EventEmitter } from 'events'
import type { PlatformAdapter, ChatMessage, Platform, ConnectionStatus } from '../shared/types'
import type { Db } from './store/db'
import { insertMessage, pruneMessages } from './store/messages'
import { insertModerationAction } from './store/moderation'
import { getSettings } from './store/settings'
import { randomUUID } from 'crypto'

export interface ModerationResult {
  success: boolean
  platform: Platform
  actionType: 'delete' | 'timeout' | 'ban'
  targetUserId: string
  messageId?: string
  error?: string
}

export class ChatBus extends EventEmitter {
  private adapters = new Map<Platform, PlatformAdapter>()
  private db: Db

  constructor(db: Db) {
    super()
    this.db = db
  }

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter)

    adapter.on('message', (msg: ChatMessage) => {
      insertMessage(this.db, msg)
      const settings = getSettings(this.db)
      pruneMessages(this.db, msg.platform, settings.maxMessagesPerPlatform)
      this.emit('message', msg)
    })

    adapter.on('error', (err: Error) => {
      this.emit('platformError', adapter.platform, err)
    })

    adapter.on('status', (status: ConnectionStatus) => {
      this.emit('status', adapter.platform, status)
    })
  }

  async sendMessage(platform: Platform, channelId: string, text: string): Promise<void> {
    const adapter = this.adapters.get(platform)
    if (!adapter) throw new Error(`No adapter registered for ${platform}`)
    await adapter.sendMessage(channelId, text)
  }

  async moderate(
    platform: Platform,
    actionType: 'delete' | 'timeout' | 'ban',
    targetUserId: string,
    messageId?: string,
    durationSeconds?: number,
    moderatorName = 'host'
  ): Promise<ModerationResult> {
    const adapter = this.adapters.get(platform)
    if (!adapter) {
      return { success: false, platform, actionType, targetUserId, error: `No adapter for ${platform}` }
    }

    try {
      if (actionType === 'delete' && messageId) {
        await adapter.deleteMessage(messageId)
      } else if (actionType === 'timeout') {
        await adapter.timeoutUser(targetUserId, durationSeconds ?? 60)
      } else if (actionType === 'ban') {
        await adapter.banUser(targetUserId)
      }

      insertModerationAction(this.db, {
        id: randomUUID(),
        platform,
        type: actionType,
        targetUserId,
        targetUsername: targetUserId,
        moderatorName,
        duration: durationSeconds,
        timestamp: Date.now()
      })

      const result: ModerationResult = { success: true, platform, actionType, targetUserId, messageId }
      this.emit('modResult', result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      const result: ModerationResult = { success: false, platform, actionType, targetUserId, error }
      this.emit('modResult', result)
      return result
    }
  }
}
```

- [ ] **Step 4: Run ChatBus tests**

```bash
npm test -- --testPathPattern="chat-bus"
```

Expected: PASS — `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/main/chat-bus.ts tests/main/chat-bus.test.ts
git commit -m "feat: ChatBus — event broker connecting adapters to SQLite and IPC"
```

---

### Task 5: Keychain Wrapper

**Files:**
- Create: `src/main/auth/keychain.ts`
- Create: `tests/main/auth/keychain.test.ts`
- Create: `tests/__mocks__/keytar.ts`

**Interfaces:**
- Consumes: `Platform` from `../../shared/types`
- Produces:
  - `getToken(platform: Platform): Promise<string | null>`
  - `setToken(platform: Platform, token: string): Promise<void>`
  - `deleteToken(platform: Platform): Promise<void>`

- [ ] **Step 1: Write keytar mock**

Create `tests/__mocks__/keytar.ts`:
```typescript
const store = new Map<string, string>()

const keytar = {
  getPassword: jest.fn(async (_service: string, account: string) =>
    store.get(account) ?? null
  ),
  setPassword: jest.fn(async (_service: string, account: string, password: string) => {
    store.set(account, password)
  }),
  deletePassword: jest.fn(async (_service: string, account: string) => {
    store.delete(account)
    return true
  }),
  _reset() { store.clear() }
}

export default keytar
export const { getPassword, setPassword, deletePassword } = keytar
```

- [ ] **Step 2: Write failing keychain tests**

Create `tests/main/auth/keychain.test.ts`:
```typescript
import { getToken, setToken, deleteToken } from '../../../src/main/auth/keychain'

jest.mock('keytar', () => require('../../__mocks__/keytar'))

const mockKeytar = require('../../__mocks__/keytar').default

beforeEach(() => { mockKeytar._reset() })

describe('keychain', () => {
  it('returns null when no token stored', async () => {
    const token = await getToken('twitch')
    expect(token).toBeNull()
  })

  it('stores and retrieves a token', async () => {
    await setToken('twitch', 'oauth:abc123')
    const token = await getToken('twitch')
    expect(token).toBe('oauth:abc123')
  })

  it('deletes a token', async () => {
    await setToken('youtube', 'token-xyz')
    await deleteToken('youtube')
    const token = await getToken('youtube')
    expect(token).toBeNull()
  })

  it('stores tokens per platform independently', async () => {
    await setToken('twitch', 'twitch-token')
    await setToken('youtube', 'youtube-token')
    expect(await getToken('twitch')).toBe('twitch-token')
    expect(await getToken('youtube')).toBe('youtube-token')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="keychain"
```

Expected: FAIL — `Cannot find module '../../../src/main/auth/keychain'`

- [ ] **Step 4: Write src/main/auth/keychain.ts**

```typescript
import keytar from 'keytar'
import type { Platform } from '../../shared/types'

const SERVICE = 'streamchat-app'

export async function getToken(platform: Platform): Promise<string | null> {
  return keytar.getPassword(SERVICE, platform)
}

export async function setToken(platform: Platform, token: string): Promise<void> {
  await keytar.setPassword(SERVICE, platform, token)
}

export async function deleteToken(platform: Platform): Promise<void> {
  await keytar.deletePassword(SERVICE, platform)
}
```

- [ ] **Step 5: Run keychain tests**

```bash
npm test -- --testPathPattern="keychain"
```

Expected: PASS — `4 passed`

- [ ] **Step 6: Commit**

```bash
git add src/main/auth/keychain.ts tests/main/auth/ tests/__mocks__/keytar.ts
git commit -m "feat: keychain wrapper for OS-native token storage via keytar"
```

---

### Task 6: Twitch Adapter

**Files:**
- Create: `src/main/adapters/twitch.ts`
- Create: `tests/main/adapters/twitch.test.ts`
- Create: `tests/__mocks__/tmi.js.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `ChatMessage`, `Credentials`, `ConnectionStatus`, `Platform` from `../../shared/types`
- Produces: `class TwitchAdapter implements PlatformAdapter`

- [ ] **Step 1: Write tmi.js mock**

Create `tests/__mocks__/tmi.js.ts`:
```typescript
type Handler = (...args: unknown[]) => void

class MockClient {
  private handlers: Record<string, Handler[]> = {}
  connect = jest.fn().mockResolvedValue(undefined)
  disconnect = jest.fn().mockResolvedValue(undefined)
  say = jest.fn().mockResolvedValue(undefined)
  ban = jest.fn().mockResolvedValue(undefined)
  timeout = jest.fn().mockResolvedValue(undefined)
  deletemessage = jest.fn().mockResolvedValue(undefined)

  on(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] || []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    (this.handlers[event] || []).forEach(h => h(...args))
  }
}

export const Client = jest.fn(() => new MockClient())
```

- [ ] **Step 2: Write failing Twitch adapter tests**

Create `tests/main/adapters/twitch.test.ts`:
```typescript
import { TwitchAdapter } from '../../../src/main/adapters/twitch'
import type { Credentials, ChatMessage } from '../../../src/shared/types'

jest.mock('tmi.js', () => require('../../__mocks__/tmi.js'))

const { Client } = require('../../__mocks__/tmi.js')

const credentials: Credentials = {
  platform: 'twitch',
  token: 'oauth:testtoken',
  channelId: 'testchannel',
  username: 'testbot'
}

describe('TwitchAdapter', () => {
  let adapter: TwitchAdapter
  let mockClient: ReturnType<typeof Client>

  beforeEach(() => {
    Client.mockClear()
    adapter = new TwitchAdapter()
    mockClient = Client.mock.results[0]?.value
  })

  it('connects and creates a tmi.js client', async () => {
    await adapter.connect(credentials)
    expect(mockClient.connect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('connected')
  })

  it('emits normalized ChatMessage on tmi.js chat event', async () => {
    await adapter.connect(credentials)
    const received: ChatMessage[] = []
    adapter.on('message', msg => received.push(msg))

    mockClient._emit('chat', '#testchannel', { username: 'viewer1', 'display-name': 'Viewer1', badges: {} }, 'hello', false)

    expect(received).toHaveLength(1)
    expect(received[0].platform).toBe('twitch')
    expect(received[0].text).toBe('hello')
    expect(received[0].username).toBe('viewer1')
    expect(received[0].channelId).toBe('testchannel')
  })

  it('sends a message via client.say', async () => {
    await adapter.connect(credentials)
    await adapter.sendMessage('testchannel', 'hello from bot')
    expect(mockClient.say).toHaveBeenCalledWith('#testchannel', 'hello from bot')
  })

  it('bans a user', async () => {
    await adapter.connect(credentials)
    await adapter.banUser('baduser')
    expect(mockClient.ban).toHaveBeenCalledWith('testchannel', 'baduser')
  })

  it('times out a user', async () => {
    await adapter.connect(credentials)
    await adapter.timeoutUser('baduser', 300)
    expect(mockClient.timeout).toHaveBeenCalledWith('testchannel', 'baduser', 300)
  })

  it('deletes a message', async () => {
    await adapter.connect(credentials)
    await adapter.deleteMessage('msg-uuid-123')
    expect(mockClient.deletemessage).toHaveBeenCalledWith('testchannel', 'msg-uuid-123')
  })

  it('disconnects', async () => {
    await adapter.connect(credentials)
    await adapter.disconnect()
    expect(mockClient.disconnect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('disconnected')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="adapters/twitch"
```

Expected: FAIL — `Cannot find module '../../../src/main/adapters/twitch'`

- [ ] **Step 4: Write src/main/adapters/twitch.ts**

```typescript
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

    this.client.on('chat', (_channel, userstate, message, _self) => {
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
        badges: this.parseBadges(userstate.badges ?? {})
      }
      this.emit('message', msg)
    })

    this.client.on('disconnected', () => {
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
```

- [ ] **Step 5: Run Twitch adapter tests**

```bash
npm test -- --testPathPattern="adapters/twitch"
```

Expected: PASS — `7 passed`

- [ ] **Step 6: Commit**

```bash
git add src/main/adapters/twitch.ts tests/main/adapters/ tests/__mocks__/tmi.js.ts
git commit -m "feat: Twitch adapter implementing PlatformAdapter via tmi.js"
```

---

### Task 7: IPC Bridge

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/main/ipc-handlers.ts`

**Interfaces:**
- Consumes: `ChatBus`, `ModerationResult` from `../main/chat-bus`; `getSettings`, `setSettings` from `../main/store/settings`; `getRecentMessages` from `../main/store/messages`; `getModerationActions`, `exportModerationCsv` from `../main/store/moderation`; `getToken`, `setToken`, `deleteToken` from `../main/auth/keychain`; all types from `../shared/types`
- Produces: `window.electronAPI` typed object in renderer with:
  - `onMessage(handler: (msg: ChatMessage) => void): () => void`
  - `onModResult(handler: (result: ModerationResult) => void): () => void`
  - `onPlatformStatus(handler: (platform: Platform, status: ConnectionStatus) => void): () => void`
  - `sendMessage(platform: Platform, channelId: string, text: string): Promise<void>`
  - `moderate(platform: Platform, action: 'delete'|'timeout'|'ban', targetUserId: string, messageId?: string, duration?: number): Promise<ModerationResult>`
  - `getRecentMessages(limit: number): Promise<ChatMessage[]>`
  - `getSettings(): Promise<AppSettings>`
  - `setSettings(partial: Partial<AppSettings>): Promise<AppSettings>`
  - `getToken(platform: Platform): Promise<string | null>`
  - `setToken(platform: Platform, token: string): Promise<void>`
  - `deleteToken(platform: Platform): Promise<void>`
  - `getModerationActions(filters?: { platform?: Platform; targetUserId?: string }): Promise<ModerationAction[]>`
  - `exportModerationCsv(): Promise<string>`

- [ ] **Step 1: Write src/preload/index.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, ModerationAction, AppSettings, Platform, ConnectionStatus } from '../shared/types'
import type { ModerationResult } from '../main/chat-bus'

const electronAPI = {
  onMessage(handler: (msg: ChatMessage) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, msg: ChatMessage) => handler(msg)
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.removeListener('chat:message', listener)
  },

  onModResult(handler: (result: ModerationResult) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, result: ModerationResult) => handler(result)
    ipcRenderer.on('mod:result', listener)
    return () => ipcRenderer.removeListener('mod:result', listener)
  },

  onPlatformStatus(handler: (platform: Platform, status: ConnectionStatus) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, platform: Platform, status: ConnectionStatus) =>
      handler(platform, status)
    ipcRenderer.on('account:status', listener)
    return () => ipcRenderer.removeListener('account:status', listener)
  },

  sendMessage(platform: Platform, channelId: string, text: string): Promise<void> {
    return ipcRenderer.invoke('chat:send', platform, channelId, text)
  },

  moderate(
    platform: Platform,
    action: 'delete' | 'timeout' | 'ban',
    targetUserId: string,
    messageId?: string,
    duration?: number
  ): Promise<ModerationResult> {
    return ipcRenderer.invoke('mod:action', platform, action, targetUserId, messageId, duration)
  },

  getRecentMessages(limit: number): Promise<ChatMessage[]> {
    return ipcRenderer.invoke('chat:history', limit)
  },

  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:get')
  },

  setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:set', partial)
  },

  getToken(platform: Platform): Promise<string | null> {
    return ipcRenderer.invoke('account:getToken', platform)
  },

  setToken(platform: Platform, token: string): Promise<void> {
    return ipcRenderer.invoke('account:setToken', platform, token)
  },

  deleteToken(platform: Platform): Promise<void> {
    return ipcRenderer.invoke('account:deleteToken', platform)
  },

  getModerationActions(filters?: { platform?: Platform; targetUserId?: string }): Promise<ModerationAction[]> {
    return ipcRenderer.invoke('mod:getActions', filters)
  },

  exportModerationCsv(): Promise<string> {
    return ipcRenderer.invoke('mod:exportCsv')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
```

- [ ] **Step 2: Write src/main/ipc-handlers.ts**

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import type { ChatBus } from './chat-bus'
import type { Db } from './store/db'
import type { Platform, AppSettings } from '../shared/types'
import { getRecentMessages } from './store/messages'
import { getModerationActions, exportModerationCsv } from './store/moderation'
import { getSettings, setSettings } from './store/settings'
import { getToken, setToken, deleteToken } from './auth/keychain'

export function registerIpcHandlers(bus: ChatBus, db: Db, win: BrowserWindow): void {
  bus.on('message', msg => win.webContents.send('chat:message', msg))
  bus.on('modResult', result => win.webContents.send('mod:result', result))
  bus.on('status', (platform: Platform, status: string) =>
    win.webContents.send('account:status', platform, status)
  )

  ipcMain.handle('chat:send', async (_e, platform: Platform, channelId: string, text: string) => {
    await bus.sendMessage(platform, channelId, text)
  })

  ipcMain.handle('mod:action', async (
    _e,
    platform: Platform,
    action: 'delete' | 'timeout' | 'ban',
    targetUserId: string,
    messageId?: string,
    duration?: number
  ) => {
    return bus.moderate(platform, action, targetUserId, messageId, duration)
  })

  ipcMain.handle('chat:history', (_e, limit: number) => {
    return getRecentMessages(db, limit)
  })

  ipcMain.handle('settings:get', () => getSettings(db))

  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => {
    return setSettings(db, partial)
  })

  ipcMain.handle('account:getToken', (_e, platform: Platform) => getToken(platform))

  ipcMain.handle('account:setToken', (_e, platform: Platform, token: string) =>
    setToken(platform, token)
  )

  ipcMain.handle('account:deleteToken', (_e, platform: Platform) => deleteToken(platform))

  ipcMain.handle('mod:getActions', (_e, filters?: { platform?: Platform; targetUserId?: string }) =>
    getModerationActions(db, filters)
  )

  ipcMain.handle('mod:exportCsv', () => exportModerationCsv(db))
}
```

- [ ] **Step 3: Add ElectronAPI type declaration for the renderer**

Create `src/renderer/electron.d.ts`:
```typescript
import type { ElectronAPI } from '../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles without errors**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: no errors printed

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/main/ipc-handlers.ts src/renderer/electron.d.ts
git commit -m "feat: IPC bridge — contextBridge API + main process handlers"
```

---

### Task 8: Electron Main Process Wiring

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `openDb` from `./store/db`; `ChatBus` from `./chat-bus`; `TwitchAdapter` from `./adapters/twitch`; `registerIpcHandlers` from `./ipc-handlers`; `getToken` from `./auth/keychain`; `getSettings` from `./store/settings`
- Produces: fully wired Electron app that connects to Twitch on launch if a token exists

- [ ] **Step 1: Replace src/main/index.ts with wired version**

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDb } from './store/db'
import { ChatBus } from './chat-bus'
import { TwitchAdapter } from './adapters/twitch'
import { registerIpcHandlers } from './ipc-handlers'
import { getToken } from './auth/keychain'
import { getSettings } from './store/settings'

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

  // Auto-connect Twitch if token exists
  const twitchToken = await getToken('twitch')
  if (twitchToken) {
    const settings = getSettings(db)
    const adapter = new TwitchAdapter()
    bus.registerAdapter(adapter)
    // channelId will come from settings in a future task; use a placeholder for now
    const channelId = (settings as unknown as Record<string, string>)['twitchChannelId'] ?? ''
    if (channelId) {
      adapter.connect({ platform: 'twitch', token: twitchToken, channelId }).catch(err => {
        console.error('Twitch auto-connect failed:', err)
      })
    }
  }
}

app.whenReady().then(main)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 2: Run dev to verify startup**

```bash
npm run dev
```

Expected: Electron window opens, dark gray background, "StreamChat loading…" text, no console errors in the main process terminal output.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire Electron main process — DB, ChatBus, IPC, auto-connect Twitch"
```

---

### Task 9: UI Shell & Theme

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/Sidebar.tsx`

**Interfaces:**
- Produces: two-panel layout (sidebar nav + main content) in dark theme, with `view` state switching between `'chat'` and `'accounts'`

- [ ] **Step 1: Write failing component test**

Create `tests/renderer/components/Sidebar.test.tsx`:
```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from '../../../src/renderer/components/Sidebar'

describe('Sidebar', () => {
  it('renders navigation links', () => {
    render(<Sidebar activeView="chat" onViewChange={jest.fn()} />)
    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accounts/i })).toBeInTheDocument()
  })

  it('calls onViewChange when a nav item is clicked', async () => {
    const onViewChange = jest.fn()
    render(<Sidebar activeView="chat" onViewChange={onViewChange} />)
    await userEvent.click(screen.getByRole('button', { name: /accounts/i }))
    expect(onViewChange).toHaveBeenCalledWith('accounts')
  })

  it('highlights the active view', () => {
    render(<Sidebar activeView="accounts" onViewChange={jest.fn()} />)
    const accountsBtn = screen.getByRole('button', { name: /accounts/i })
    expect(accountsBtn.className).toContain('bg-')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="components/Sidebar"
```

Expected: FAIL — `Cannot find module '../../../src/renderer/components/Sidebar'`

- [ ] **Step 3: Write src/renderer/components/Sidebar.tsx**

```tsx
import React from 'react'

type View = 'chat' | 'accounts'

interface Props {
  activeView: View
  onViewChange: (view: View) => void
}

const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'chat', label: 'Chat', icon: '💬' },
  { view: 'accounts', label: 'Accounts', icon: '🔑' }
]

export default function Sidebar({ activeView, onViewChange }: Props): React.JSX.Element {
  return (
    <aside className="flex flex-col w-16 bg-gray-950 border-r border-gray-800">
      <div className="flex items-center justify-center h-12 border-b border-gray-800">
        <span className="text-lg">📡</span>
      </div>
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {navItems.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={label}
            aria-label={label}
            className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs gap-1 transition-colors ${
              activeView === view
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 4: Write updated App.tsx**

```tsx
import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'

type View = 'chat' | 'accounts'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Chat feed loads here (Task 10)
          </div>
        )}
        {view === 'accounts' && <AccountManager />}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Create AccountManager placeholder (filled out in Task 13)**

Create `src/renderer/pages/AccountManager.tsx`:
```tsx
import React from 'react'

export default function AccountManager(): React.JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      Account Manager (Task 13)
    </div>
  )
}
```

- [ ] **Step 6: Run Sidebar tests**

```bash
npm test -- --testPathPattern="components/Sidebar"
```

Expected: PASS — `3 passed`

- [ ] **Step 7: Verify visually in dev**

```bash
npm run dev
```

Expected: Electron window shows dark sidebar on left with Chat and Accounts nav buttons. Clicking Accounts shows placeholder text. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Sidebar.tsx src/renderer/pages/AccountManager.tsx tests/renderer/components/Sidebar.test.tsx
git commit -m "feat: UI shell — sidebar nav, view routing, dark theme"
```

---

### Task 10: ChatFeed & MessageRow

**Files:**
- Create: `src/renderer/hooks/useChat.ts`
- Create: `src/renderer/components/PlatformBadge.tsx`
- Create: `src/renderer/components/ChatFeed.tsx`
- Create: `src/renderer/components/MessageRow.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.onMessage`, `window.electronAPI.getRecentMessages` from preload; `ChatMessage`, `Platform` from `../../shared/types`
- Produces:
  - `useChat(filters): { messages: ChatMessage[] }` hook
  - `<ChatFeed />` component that renders the feed
  - `<MessageRow message={ChatMessage} onModerate={...} />` component
  - `<PlatformBadge platform={Platform} />` component

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/hooks/useChat.test.ts`:
```typescript
import { renderHook, act } from '@testing-library/react'
import { useChat } from '../../../src/renderer/hooks/useChat'
import type { ChatMessage } from '../../../src/shared/types'

const mockMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg1', platform: 'twitch', channelId: 'chan1', userId: 'u1',
  username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: [], ...overrides
})

const mockUnsubscribe = jest.fn()

beforeEach(() => {
  window.electronAPI = {
    onMessage: jest.fn((handler) => {
      (window as unknown as Record<string, unknown>)._chatHandler = handler
      return mockUnsubscribe
    }),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    onModResult: jest.fn(() => mockUnsubscribe),
    onPlatformStatus: jest.fn(() => mockUnsubscribe),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn(),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
})

describe('useChat', () => {
  it('starts with empty messages', () => {
    const { result } = renderHook(() => useChat({}))
    expect(result.current.messages).toEqual([])
  })

  it('adds messages received via IPC', async () => {
    const { result } = renderHook(() => useChat({}))
    act(() => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ text: 'hello' }))
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].text).toBe('hello')
  })

  it('filters by platform', () => {
    const { result } = renderHook(() => useChat({ platforms: ['youtube'] }))
    act(() => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
      handler(mockMsg({ id: 'msg2', platform: 'youtube' }))
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].platform).toBe('youtube')
  })

  it('filters by keyword', () => {
    const { result } = renderHook(() => useChat({ keyword: 'world' }))
    act(() => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ text: 'hello world' }))
      handler(mockMsg({ id: 'msg2', text: 'just hello' }))
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].text).toBe('hello world')
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useChat({}))
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
```

Create `tests/renderer/components/MessageRow.test.tsx`:
```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageRow from '../../../src/renderer/components/MessageRow'
import type { ChatMessage } from '../../../src/shared/types'

const msg: ChatMessage = {
  id: 'msg1', platform: 'twitch', channelId: 'chan', userId: 'u1',
  username: 'viewer1', displayName: 'Viewer1', avatarUrl: '',
  text: 'hello chat', timestamp: 1700000000000, isDeleted: false, badges: []
}

describe('MessageRow', () => {
  it('renders the message text', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} />)
    expect(screen.getByText('hello chat')).toBeInTheDocument()
  })

  it('renders the display name', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} />)
    expect(screen.getByText('Viewer1')).toBeInTheDocument()
  })

  it('shows deleted style when isDeleted=true', () => {
    const deleted = { ...msg, isDeleted: true }
    render(<MessageRow message={deleted} onModerate={jest.fn()} />)
    const row = screen.getByTestId('message-row')
    expect(row.className).toContain('opacity')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="(useChat|MessageRow)"
```

Expected: FAIL — modules not found

- [ ] **Step 3: Write src/renderer/hooks/useChat.ts**

```typescript
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, Platform } from '../../shared/types'

export interface ChatFilters {
  platforms?: Platform[]
  keyword?: string
  username?: string
}

function matchesFilters(msg: ChatMessage, filters: ChatFilters): boolean {
  if (filters.platforms && filters.platforms.length > 0) {
    if (!filters.platforms.includes(msg.platform)) return false
  }
  if (filters.keyword) {
    if (!msg.text.toLowerCase().includes(filters.keyword.toLowerCase())) return false
  }
  if (filters.username) {
    if (!msg.username.toLowerCase().includes(filters.username.toLowerCase())) return false
  }
  return true
}

const MAX_FEED_MESSAGES = 500

export function useChat(filters: ChatFilters): { messages: ChatMessage[] } {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => {
    window.electronAPI.getRecentMessages(100).then(history => {
      setMessages(history.filter(m => matchesFilters(m, filtersRef.current)))
    })
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.onMessage(msg => {
      if (!matchesFilters(msg, filtersRef.current)) return
      setMessages(prev => {
        const next = [msg, ...prev]
        return next.length > MAX_FEED_MESSAGES ? next.slice(0, MAX_FEED_MESSAGES) : next
      })
    })
    return unsub
  }, [])

  return { messages }
}
```

- [ ] **Step 4: Write src/renderer/components/PlatformBadge.tsx**

```tsx
import React from 'react'
import type { Platform } from '../../shared/types'

const PLATFORM_COLORS: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-500',
  tiktok: 'bg-gray-900 border border-gray-600',
  facebook: 'bg-blue-600'
}

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: 'TW',
  youtube: 'YT',
  kick: 'KI',
  tiktok: 'TK',
  facebook: 'FB'
}

interface Props {
  platform: Platform
}

export default function PlatformBadge({ platform }: Props): React.JSX.Element {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-4 rounded text-[10px] font-bold text-white leading-none ${PLATFORM_COLORS[platform]}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  )
}
```

- [ ] **Step 5: Write src/renderer/components/MessageRow.tsx**

```tsx
import React, { useState, useCallback } from 'react'
import type { ChatMessage } from '../../shared/types'
import PlatformBadge from './PlatformBadge'

interface ModerateAction {
  type: 'delete' | 'timeout' | 'ban'
  message: ChatMessage
}

interface Props {
  message: ChatMessage
  onModerate: (action: ModerateAction) => void
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageRow({ message, onModerate }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }, [])

  return (
    <div
      data-testid="message-row"
      onContextMenu={handleContextMenu}
      onClick={() => setMenuOpen(false)}
      className={`relative flex items-start gap-2 px-3 py-1.5 hover:bg-gray-800 group text-sm ${
        message.isDeleted ? 'opacity-40 line-through' : ''
      }`}
    >
      <PlatformBadge platform={message.platform} />
      <span className="font-semibold text-indigo-300 shrink-0">{message.displayName}</span>
      <span className="text-gray-300 break-words min-w-0">{message.text}</span>
      <span className="ml-auto text-xs text-gray-600 shrink-0 opacity-0 group-hover:opacity-100">
        {formatTime(message.timestamp)}
      </span>

      {menuOpen && (
        <div className="absolute right-0 top-full z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 text-sm min-w-36">
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-700"
            onClick={() => { onModerate({ type: 'delete', message }); setMenuOpen(false) }}
          >
            Delete message
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-700"
            onClick={() => { onModerate({ type: 'timeout', message }); setMenuOpen(false) }}
          >
            Timeout (10 min)
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-red-900 text-red-400"
            onClick={() => { onModerate({ type: 'ban', message }); setMenuOpen(false) }}
          >
            Ban user
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Write src/renderer/components/ChatFeed.tsx**

```tsx
import React, { useEffect, useRef } from 'react'
import MessageRow from './MessageRow'
import type { ChatFilters } from '../hooks/useChat'
import type { ChatMessage, Platform } from '../../shared/types'
import { useChat } from '../hooks/useChat'

interface Props {
  filters: ChatFilters
}

export default function ChatFeed({ filters }: Props): React.JSX.Element {
  const { messages } = useChat(filters)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when new messages arrive, unless user has scrolled up
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleModerate = ({ type, message }: { type: 'delete' | 'timeout' | 'ban'; message: ChatMessage }) => {
    const platform: Platform = message.platform
    if (type === 'delete') {
      window.electronAPI.moderate(platform, 'delete', message.userId, message.id)
    } else if (type === 'timeout') {
      window.electronAPI.moderate(platform, 'timeout', message.userId, undefined, 600)
    } else {
      window.electronAPI.moderate(platform, 'ban', message.userId)
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto flex flex-col-reverse">
      <div ref={bottomRef} />
      {messages.map(msg => (
        <MessageRow key={msg.id} message={msg} onModerate={handleModerate} />
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Run component and hook tests**

```bash
npm test -- --testPathPattern="(useChat|MessageRow|ChatFeed)"
```

Expected: PASS — `8 passed`

- [ ] **Step 8: Wire ChatFeed into App.tsx**

Modify the chat view section in `src/renderer/App.tsx` to replace the placeholder:

```tsx
// Replace:
//   {view === 'chat' && (
//     <div className="flex-1 flex items-center justify-center text-gray-500">
//       Chat feed loads here (Task 10)
//     </div>
//   )}
// With:
{view === 'chat' && (
  <div className="flex-1 flex flex-col overflow-hidden">
    <ChatFeed filters={{}} />
  </div>
)}
```

Add import at top of App.tsx:
```tsx
import ChatFeed from './components/ChatFeed'
```

- [ ] **Step 9: Verify in dev**

```bash
npm run dev
```

Expected: Chat view shows an empty dark scrollable feed. No console errors.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/hooks/useChat.ts src/renderer/components/ tests/renderer/
git commit -m "feat: ChatFeed, MessageRow, PlatformBadge, useChat hook"
```

---

### Task 11: FilterBar

**Files:**
- Create: `src/renderer/components/FilterBar.tsx`
- Modify: `src/renderer/App.tsx` (add filter state, pass to ChatFeed)

**Interfaces:**
- Consumes: `ChatFilters` from `../hooks/useChat`; `Platform` from `../../shared/types`
- Produces: `<FilterBar filters={ChatFilters} onChange={(filters: ChatFilters) => void} />` component

- [ ] **Step 1: Write failing FilterBar tests**

Create `tests/renderer/components/FilterBar.test.tsx`:
```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from '../../../src/renderer/components/FilterBar'
import type { ChatFilters } from '../../../src/renderer/hooks/useChat'

const ALL_PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']

describe('FilterBar', () => {
  it('renders all platform toggle buttons', () => {
    render(<FilterBar filters={{}} onChange={jest.fn()} />)
    ALL_PLATFORMS.forEach(p => {
      expect(screen.getByRole('button', { name: new RegExp(p, 'i') })).toBeInTheDocument()
    })
  })

  it('calls onChange with platform filter when a platform is clicked', async () => {
    const onChange = jest.fn()
    render(<FilterBar filters={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /twitch/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ platforms: ['twitch'] }))
  })

  it('deselects a platform on second click', async () => {
    const onChange = jest.fn()
    const filters: ChatFilters = { platforms: ['twitch'] }
    render(<FilterBar filters={filters} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /twitch/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ platforms: [] }))
  })

  it('calls onChange with keyword when typing in search', async () => {
    const onChange = jest.fn()
    render(<FilterBar filters={{}} onChange={onChange} />)
    const input = screen.getByPlaceholderText(/search/i)
    await userEvent.type(input, 'hello')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'hello' }))
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- --testPathPattern="components/FilterBar"
```

Expected: FAIL — module not found

- [ ] **Step 3: Write src/renderer/components/FilterBar.tsx**

```tsx
import React from 'react'
import type { ChatFilters } from '../hooks/useChat'
import type { Platform } from '../../shared/types'

const PLATFORMS: { id: Platform; label: string; color: string }[] = [
  { id: 'twitch', label: 'Twitch', color: 'bg-purple-600' },
  { id: 'youtube', label: 'YouTube', color: 'bg-red-600' },
  { id: 'kick', label: 'Kick', color: 'bg-green-500' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-700' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' }
]

interface Props {
  filters: ChatFilters
  onChange: (filters: ChatFilters) => void
}

export default function FilterBar({ filters, onChange }: Props): React.JSX.Element {
  const activePlatforms = filters.platforms ?? []

  function togglePlatform(platform: Platform): void {
    const next = activePlatforms.includes(platform)
      ? activePlatforms.filter(p => p !== platform)
      : [...activePlatforms, platform]
    onChange({ ...filters, platforms: next })
  }

  function handleKeyword(e: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...filters, keyword: e.target.value })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-950">
      {PLATFORMS.map(({ id, label, color }) => (
        <button
          key={id}
          onClick={() => togglePlatform(id)}
          aria-label={label}
          className={`px-2 py-0.5 rounded text-xs font-semibold text-white transition-opacity ${color} ${
            activePlatforms.includes(id) || activePlatforms.length === 0
              ? 'opacity-100'
              : 'opacity-30'
          }`}
        >
          {label}
        </button>
      ))}
      <input
        type="text"
        placeholder="Search messages…"
        value={filters.keyword ?? ''}
        onChange={handleKeyword}
        className="ml-auto bg-gray-800 text-gray-200 placeholder-gray-500 text-sm px-3 py-1 rounded border border-gray-700 focus:outline-none focus:border-indigo-500 w-48"
      />
    </div>
  )
}
```

- [ ] **Step 4: Add filter state to App.tsx**

Modify `src/renderer/App.tsx`:

```tsx
import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatFeed from './components/ChatFeed'
import FilterBar from './components/FilterBar'
import AccountManager from './pages/AccountManager'
import type { ChatFilters } from './hooks/useChat'

type View = 'chat' | 'accounts'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [filters, setFilters] = useState<ChatFilters>({})

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <>
            <FilterBar filters={filters} onChange={setFilters} />
            <ChatFeed filters={filters} />
          </>
        )}
        {view === 'accounts' && <AccountManager />}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run FilterBar tests**

```bash
npm test -- --testPathPattern="components/FilterBar"
```

Expected: PASS — `4 passed`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/FilterBar.tsx src/renderer/App.tsx tests/renderer/components/FilterBar.test.tsx
git commit -m "feat: FilterBar — platform toggles and keyword search"
```

---

### Task 12: ReplyBar

**Files:**
- Create: `src/renderer/components/ReplyBar.tsx`
- Modify: `src/renderer/App.tsx` (add ReplyBar below ChatFeed)

**Interfaces:**
- Consumes: `window.electronAPI.sendMessage`; `Platform` from `../../shared/types`
- Produces: `<ReplyBar />` component with platform selector and send button

- [ ] **Step 1: Write failing ReplyBar tests**

Create `tests/renderer/components/ReplyBar.test.tsx`:
```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReplyBar from '../../../src/renderer/components/ReplyBar'

const mockSendMessage = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  window.electronAPI = {
    sendMessage: mockSendMessage,
    onMessage: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    onPlatformStatus: jest.fn(() => jest.fn()),
    moderate: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn(),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
  mockSendMessage.mockClear()
})

describe('ReplyBar', () => {
  it('renders text input and send button', () => {
    render(<ReplyBar channelId="testchannel" />)
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('sends message to selected platforms on submit', async () => {
    render(<ReplyBar channelId="testchannel" />)
    const input = screen.getByPlaceholderText(/message/i)
    await userEvent.type(input, 'hello chat')
    fireEvent.submit(input.closest('form')!)
    expect(mockSendMessage).toHaveBeenCalledWith('twitch', 'testchannel', 'hello chat')
  })

  it('clears input after send', async () => {
    render(<ReplyBar channelId="testchannel" />)
    const input = screen.getByPlaceholderText(/message/i) as HTMLInputElement
    await userEvent.type(input, 'hello')
    fireEvent.submit(input.closest('form')!)
    expect(input.value).toBe('')
  })

  it('does not send when input is empty', async () => {
    render(<ReplyBar channelId="testchannel" />)
    const form = screen.getByRole('button', { name: /send/i }).closest('form')!
    fireEvent.submit(form)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- --testPathPattern="components/ReplyBar"
```

Expected: FAIL — module not found

- [ ] **Step 3: Write src/renderer/components/ReplyBar.tsx**

```tsx
import React, { useState } from 'react'
import type { Platform } from '../../shared/types'

const ALL_PLATFORMS: Platform[] = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']

const PLATFORM_COLORS: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-500',
  tiktok: 'bg-gray-600',
  facebook: 'bg-blue-600'
}

interface Props {
  channelId: string
}

export default function ReplyBar({ channelId }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['twitch'])

  function togglePlatform(platform: Platform): void {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!text.trim() || selectedPlatforms.length === 0) return
    await Promise.allSettled(
      selectedPlatforms.map(p => window.electronAPI.sendMessage(p, channelId, text.trim()))
    )
    setText('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-800 bg-gray-950">
      <div className="flex gap-1">
        {ALL_PLATFORMS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => togglePlatform(p)}
            title={p}
            className={`w-6 h-6 rounded text-[10px] font-bold text-white transition-opacity ${PLATFORM_COLORS[p]} ${
              selectedPlatforms.includes(p) ? 'opacity-100' : 'opacity-25'
            }`}
          >
            {p[0].toUpperCase()}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Send a message…"
        className="flex-1 bg-gray-800 text-gray-200 placeholder-gray-500 text-sm px-3 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-indigo-500"
      />
      <button
        type="submit"
        aria-label="Send"
        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded disabled:opacity-40"
        disabled={!text.trim()}
      >
        Send
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Add ReplyBar to App.tsx chat view**

Modify the chat section in `src/renderer/App.tsx`:

```tsx
import ReplyBar from './components/ReplyBar'

// In the JSX, replace:
//   {view === 'chat' && (
//     <>
//       <FilterBar filters={filters} onChange={setFilters} />
//       <ChatFeed filters={filters} />
//     </>
//   )}
// With:
{view === 'chat' && (
  <>
    <FilterBar filters={filters} onChange={setFilters} />
    <ChatFeed filters={filters} />
    <ReplyBar channelId="your-channel" />
  </>
)}
```

- [ ] **Step 5: Run ReplyBar tests**

```bash
npm test -- --testPathPattern="components/ReplyBar"
```

Expected: PASS — `4 passed`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ReplyBar.tsx src/renderer/App.tsx tests/renderer/components/ReplyBar.test.tsx
git commit -m "feat: ReplyBar — multi-platform message input with platform selector"
```

---

### Task 13: Account Manager

**Files:**
- Modify: `src/renderer/pages/AccountManager.tsx`
- Modify: `src/main/index.ts` (register custom protocol for OAuth)
- Modify: `src/main/store/settings.ts` (add twitchChannelId to settings schema)

**Interfaces:**
- Consumes: `window.electronAPI.getToken`, `setToken`, `deleteToken`, `onPlatformStatus`; `Platform`, `ConnectionStatus` from `../../shared/types`
- Produces: Account Manager page showing per-platform connection status with connect/disconnect buttons

- [ ] **Step 1: Write failing AccountManager tests**

Create `tests/renderer/pages/AccountManager.test.tsx`:
```tsx
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountManager from '../../../src/renderer/pages/AccountManager'

beforeEach(() => {
  window.electronAPI = {
    getToken: jest.fn().mockResolvedValue(null),
    setToken: jest.fn().mockResolvedValue(undefined),
    deleteToken: jest.fn().mockResolvedValue(undefined),
    onPlatformStatus: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
})

describe('AccountManager', () => {
  it('renders all five platforms', async () => {
    render(<AccountManager />)
    await waitFor(() => {
      expect(screen.getByText('Twitch')).toBeInTheDocument()
      expect(screen.getByText('YouTube')).toBeInTheDocument()
      expect(screen.getByText('Kick')).toBeInTheDocument()
      expect(screen.getByText('TikTok')).toBeInTheDocument()
      expect(screen.getByText('Facebook')).toBeInTheDocument()
    })
  })

  it('shows Connect button when no token exists', async () => {
    render(<AccountManager />)
    await waitFor(() => {
      const connectButtons = screen.getAllByRole('button', { name: /connect/i })
      expect(connectButtons.length).toBeGreaterThan(0)
    })
  })

  it('shows Disconnect button when token exists', async () => {
    (window.electronAPI.getToken as jest.Mock).mockResolvedValue('oauth:test-token')
    render(<AccountManager />)
    await waitFor(() => {
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i })
      expect(disconnectButtons.length).toBeGreaterThan(0)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- --testPathPattern="pages/AccountManager"
```

Expected: FAIL — module not found or import error

- [ ] **Step 3: Write src/renderer/pages/AccountManager.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import type { Platform, ConnectionStatus } from '../../shared/types'

const PLATFORMS: { id: Platform; label: string; color: string; note?: string }[] = [
  { id: 'twitch', label: 'Twitch', color: 'bg-purple-600' },
  { id: 'youtube', label: 'YouTube', color: 'bg-red-600' },
  { id: 'kick', label: 'Kick', color: 'bg-green-500', note: 'Unofficial API' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-gray-700', note: 'Unofficial API' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' }
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

  useEffect(() => {
    PLATFORMS.forEach(async ({ id }) => {
      const token = await window.electronAPI.getToken(id)
      setTokens(prev => ({ ...prev, [id]: token }))
    })

    const unsub = window.electronAPI.onPlatformStatus((platform, status) => {
      setStatuses(prev => ({ ...prev, [platform]: status }))
    })
    return unsub
  }, [])

  async function handleConnect(platform: Platform): Promise<void> {
    // Opens system browser for OAuth — token is stored by main process on callback
    // For Twitch: user pastes their OAuth token as a temporary UX (full OAuth in future)
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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-100 mb-6">Connected Accounts</h1>
      <div className="flex flex-col gap-3 max-w-xl">
        {PLATFORMS.map(({ id, label, color, note }) => {
          const hasToken = !!tokens[id]
          const status: ConnectionStatus = statuses[id] ?? (hasToken ? 'connecting' : 'disconnected')

          return (
            <div
              key={id}
              className="flex items-center gap-4 bg-gray-800 rounded-lg px-4 py-3 border border-gray-700"
            >
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
                  onClick={() => handleDisconnect(id)}
                  className="px-3 py-1 text-sm text-red-400 border border-red-800 rounded hover:bg-red-950"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(id)}
                  className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                >
                  Connect
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run AccountManager tests**

```bash
npm test -- --testPathPattern="pages/AccountManager"
```

Expected: PASS — `3 passed`

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Count will be approximately 30+ passing, 0 failing.

- [ ] **Step 6: Launch and manually verify the full app**

```bash
npm run dev
```

Manual checks:
1. App opens in dark mode with sidebar
2. Click "Accounts" — all 5 platforms listed with Connect buttons
3. Click "Connect" on Twitch — prompt appears for OAuth token
4. Click "Chat" — empty feed with FilterBar at top and ReplyBar at bottom
5. Platform toggles in FilterBar visually activate/deactivate
6. Typing in the search input works
7. No console errors in the Electron terminal

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/AccountManager.tsx tests/renderer/pages/
git commit -m "feat: Account Manager — per-platform OAuth token storage and connection status"
```

---

## What's Next

**Plan B** will add the remaining four platform adapters:
- YouTube adapter (HTTP polling via YouTube Data API v3)
- Kick adapter (Pusher WebSocket, unofficial)
- TikTok adapter (unofficial WebSocket)
- Facebook adapter (Graph API polling)

**Plan C** will add:
- Per-platform side-by-side panel view
- User profiles sidebar (click username → message history + mod log)
- Moderation log page (filterable, CSV export button)
- Settings page (theme, font size, notification sounds, team mode)
- Team mode (local WebSocket server + mod client connection)
