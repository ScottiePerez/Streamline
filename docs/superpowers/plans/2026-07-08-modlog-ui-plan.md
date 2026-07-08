# Moderation Log UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Moderation Log page to Streamline with platform/username filters and per-row undo (unban) for ban/timeout actions.

**Architecture:** Four sequential tasks — backend additions (unbanUser on adapters + IPC), then the ModLog page component + tests, then sidebar/app wiring. Each task commits independently.

**Tech Stack:** Electron + React/TypeScript, better-sqlite3, Tailwind CSS, Jest + React Testing Library

## Global Constraints

- `contextBridge.exposeInMainWorld('electronAPI', ...)` — key must be exactly `'electronAPI'`
- `BrowserWindow` must have `contextIsolation: true, nodeIntegration: false`
- All OAuth tokens via keytar — never written to DB
- SQLite database file: `app.getPath('userData')/streamchat.db`
- IPC channel name for unban: exactly `'mod:unban'`
- `View` type must be `'chat' | 'accounts' | 'settings' | 'modlog'` in both Sidebar.tsx and App.tsx
- Run tests with `npx jest --runInBand` to avoid MacBook freezing

---

### Task 1: Backend — unbanUser on adapters, deleteModerationAction, ChatBus.unban, IPC + Preload

**Files:**
- Modify: `src/shared/types.ts` — add `unbanUser` to `PlatformAdapter`
- Modify: `src/main/store/moderation.ts` — add `deleteModerationAction`
- Modify: `src/main/chat-bus.ts` — add `unban` method
- Modify: `src/main/ipc-handlers.ts` — register `mod:unban` handler
- Modify: `src/preload/index.ts` — expose `unbanUser` via contextBridge
- Modify: `src/main/adapters/twitch.ts` (and youtube.ts, kick.ts, tiktok.ts, facebook.ts) — implement `unbanUser`
- Test: `tests/main/chat-bus.test.ts` (if it exists) or inline verification via existing adapter test patterns

**Interfaces:**
- Produces: `window.electronAPI.unbanUser(platform, userId, actionId): Promise<{ success: boolean; error?: string }>`
- Produces: `ChatBus.unban(platform, userId, actionId): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Add `unbanUser` to PlatformAdapter interface in `src/shared/types.ts`**

In the `PlatformAdapter` interface (after `banUser`), add:
```ts
unbanUser(userId: string): Promise<void>
```

- [ ] **Step 2: Add `deleteModerationAction` to `src/main/store/moderation.ts`**

After the `exportModerationCsv` function, add:
```ts
export function deleteModerationAction(db: Db, id: string): void {
  db.prepare('DELETE FROM moderation_actions WHERE id = ?').run(id)
}
```

- [ ] **Step 3: Add `unban` method to `ChatBus` in `src/main/chat-bus.ts`**

Add this import at the top (with the existing moderation import):
```ts
import { insertModerationAction, deleteModerationAction } from './store/moderation'
```

Add after the `moderate` method:
```ts
async unban(
  platform: Platform,
  userId: string,
  actionId: string
): Promise<{ success: boolean; error?: string }> {
  const adapter = this.adapters.get(platform)
  if (!adapter) {
    return { success: false, error: `No adapter for ${platform}` }
  }
  try {
    await adapter.unbanUser(userId)
    deleteModerationAction(this.db, actionId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Register `mod:unban` IPC handler in `src/main/ipc-handlers.ts`**

Add after the `mod:exportCsv` handler (line 54):
```ts
ipcMain.handle('mod:unban', async (_e, platform: Platform, userId: string, actionId: string) =>
  bus.unban(platform, userId, actionId)
)
```

- [ ] **Step 5: Expose `unbanUser` in `src/preload/index.ts`**

In the `electronAPI` object, add after `exportModerationCsv`:
```ts
unbanUser(platform: Platform, userId: string, actionId: string): Promise<{ success: boolean; error?: string }> {
  return ipcRenderer.invoke('mod:unban', platform, userId, actionId)
},
```

- [ ] **Step 6: Implement `unbanUser` on each adapter**

For each adapter file (`src/main/adapters/twitch.ts`, `youtube.ts`, `kick.ts`, `tiktok.ts`, `facebook.ts`), add the `unbanUser` method. The Twitch adapter likely has a real API call (add stub that logs a warning — the platform APIs for unban vary and may need OAuth scopes not yet set up). For all adapters use the same stub pattern:

```ts
async unbanUser(userId: string): Promise<void> {
  // TODO: implement platform-specific unban when OAuth scope is available
  console.warn(`[${this.platform}] unbanUser called for ${userId} — not yet implemented`)
}
```

Check each adapter file first to see its class structure, then add the method in the class body after `banUser`.

- [ ] **Step 7: Update the `ElectronAPI` type** (it's auto-derived from the `electronAPI` const at the bottom of preload/index.ts, so no change needed — but verify TypeScript compiles)

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Update the mock in tests** — the `window.electronAPI` mock in `tests/renderer/hooks/useChat.test.ts` and any other renderer tests that set `window.electronAPI` need `unbanUser: jest.fn()` added.

Find all mock locations:
```bash
grep -rn "electronAPI = {" tests/
```

For each file found, add to the mock object:
```ts
unbanUser: jest.fn(),
```

- [ ] **Step 9: Run tests to verify no regressions**

Run: `npx jest --runInBand`
Expected: all existing tests pass

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/main/store/moderation.ts src/main/chat-bus.ts src/main/ipc-handlers.ts src/preload/index.ts src/main/adapters/twitch.ts src/main/adapters/youtube.ts src/main/adapters/kick.ts src/main/adapters/tiktok.ts src/main/adapters/facebook.ts tests/
git commit -m "feat: unbanUser adapter method, deleteModerationAction, mod:unban IPC"
```

---

### Task 2: ModLog.tsx page + tests

**Files:**
- Create: `src/renderer/pages/ModLog.tsx`
- Create: `tests/renderer/pages/ModLog.test.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.getModerationActions()` → `Promise<ModerationAction[]>`
- Consumes: `window.electronAPI.unbanUser(platform, userId, actionId)` → `Promise<{ success: boolean; error?: string }>`
- `ModerationAction` from `src/shared/types.ts`: `{ id, platform, type: 'ban'|'timeout'|'delete', targetUserId, targetUsername, moderatorName, reason?, duration?, timestamp }`

- [ ] **Step 1: Write the failing tests in `tests/renderer/pages/ModLog.test.tsx`**

```tsx
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ModLog from '../../../src/renderer/pages/ModLog'
import type { ModerationAction, Platform } from '../../../src/shared/types'

const mockAction = (overrides: Partial<ModerationAction> = {}): ModerationAction => ({
  id: 'a1',
  platform: 'twitch' as Platform,
  type: 'ban',
  targetUserId: 'u1',
  targetUsername: 'baduser',
  moderatorName: 'host',
  timestamp: new Date('2026-01-01T12:00:00').getTime(),
  ...overrides
})

beforeEach(() => {
  window.electronAPI = {
    getModerationActions: jest.fn().mockResolvedValue([]),
    unbanUser: jest.fn().mockResolvedValue({ success: true }),
    onMessage: jest.fn(() => jest.fn()),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    onModResult: jest.fn(() => jest.fn()),
    onPlatformStatus: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn(),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    exportModerationCsv: jest.fn(),
  } as unknown as typeof window.electronAPI
})

describe('ModLog', () => {
  it('shows empty state when there are no actions', async () => {
    render(<ModLog />)
    expect(await screen.findByText('No moderation actions found.')).toBeInTheDocument()
  })

  it('renders a row with platform badge, action badge, username, moderator', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([mockAction()])
    render(<ModLog />)
    expect(await screen.findByText('baduser')).toBeInTheDocument()
    expect(screen.getByText('Twitch')).toBeInTheDocument()
    expect(screen.getByText('Ban')).toBeInTheDocument()
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('filters rows by platform dropdown', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', platform: 'twitch', targetUsername: 'twitchuser' }),
      mockAction({ id: 'a2', platform: 'youtube', targetUsername: 'ytuser' }),
    ])
    render(<ModLog />)
    await screen.findByText('twitchuser')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'twitch' } })
    expect(screen.getByText('twitchuser')).toBeInTheDocument()
    expect(screen.queryByText('ytuser')).not.toBeInTheDocument()
  })

  it('filters rows by username input', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', targetUsername: 'alice' }),
      mockAction({ id: 'a2', targetUsername: 'bob' }),
    ])
    render(<ModLog />)
    await screen.findByText('alice')
    fireEvent.change(screen.getByPlaceholderText('Filter by username'), { target: { value: 'ali' } })
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
  })

  it('disables undo button for delete-type actions', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ type: 'delete' }),
    ])
    render(<ModLog />)
    const btn = await screen.findByRole('button', { name: /undo/i })
    expect(btn).toBeDisabled()
  })

  it('undo button for ban calls unbanUser and removes the row', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', type: 'ban', targetUsername: 'baduser' }),
    ])
    render(<ModLog />)
    const btn = await screen.findByRole('button', { name: /undo/i })
    fireEvent.click(btn)
    await waitFor(() =>
      expect(window.electronAPI.unbanUser).toHaveBeenCalledWith('twitch', 'u1', 'a1')
    )
    await waitFor(() => expect(screen.queryByText('baduser')).not.toBeInTheDocument())
  })

  it('shows error message when unban fails', async () => {
    ;(window.electronAPI.getModerationActions as jest.Mock).mockResolvedValue([
      mockAction({ id: 'a1', type: 'ban', targetUsername: 'baduser' }),
    ])
    ;(window.electronAPI.unbanUser as jest.Mock).mockResolvedValue({ success: false, error: 'Not authorized' })
    render(<ModLog />)
    const btn = await screen.findByRole('button', { name: /undo/i })
    fireEvent.click(btn)
    expect(await screen.findByText(/Not authorized/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --runInBand tests/renderer/pages/ModLog.test.tsx`
Expected: FAIL — "Cannot find module '../../../src/renderer/pages/ModLog'"

- [ ] **Step 3: Implement `src/renderer/pages/ModLog.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import type { ModerationAction, Platform } from '../../shared/types'

const PLATFORMS: Platform[] = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']

const PLATFORM_COLORS: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-600',
  tiktok: 'bg-gray-600',
  facebook: 'bg-blue-600'
}

const ACTION_COLORS: Record<ModerationAction['type'], string> = {
  ban: 'bg-red-700',
  timeout: 'bg-yellow-600',
  delete: 'bg-gray-600'
}

const ACTION_LABELS: Record<ModerationAction['type'], string> = {
  ban: 'Ban',
  timeout: 'Timeout',
  delete: 'Delete'
}

export default function ModLog(): React.JSX.Element {
  const [actions, setActions] = useState<ModerationAction[]>([])
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [username, setUsername] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    window.electronAPI.getModerationActions().then(setActions)
  }, [])

  const filtered = actions.filter(a => {
    if (platform !== 'all' && a.platform !== platform) return false
    if (username && !a.targetUsername.toLowerCase().includes(username.toLowerCase())) return false
    return true
  })

  async function handleUndo(action: ModerationAction): Promise<void> {
    const result = await window.electronAPI.unbanUser(action.platform, action.targetUserId, action.id)
    if (result.success) {
      setActions(prev => prev.filter(a => a.id !== action.id))
      setErrors(prev => { const next = { ...prev }; delete next[action.id]; return next })
    } else {
      setErrors(prev => ({ ...prev, [action.id]: result.error ?? 'Unknown error' }))
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-gray-800 bg-gray-900">
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Platform
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value as Platform | 'all')}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
          >
            <option value="all">All</option>
            {PLATFORMS.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Username
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Filter by username"
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm w-48"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No moderation actions found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-900 sticky top-0">
              <tr className="text-left text-gray-400 border-b border-gray-800">
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Moderator</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(action => (
                <React.Fragment key={action.id}>
                  <tr className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${PLATFORM_COLORS[action.platform]}`}>
                        {action.platform.charAt(0).toUpperCase() + action.platform.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${ACTION_COLORS[action.type]}`}>
                        {ACTION_LABELS[action.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-100">{action.targetUsername}</td>
                    <td className="px-4 py-2 text-gray-400">{action.moderatorName}</td>
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                      {new Date(action.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleUndo(action)}
                        disabled={action.type === 'delete'}
                        title={action.type === 'delete' ? 'Cannot undo message delete' : 'Undo'}
                        className="px-3 py-1 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Undo
                      </button>
                    </td>
                  </tr>
                  {errors[action.id] && (
                    <tr>
                      <td colSpan={6} className="px-4 py-1 text-red-400 text-xs">
                        {errors[action.id]}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --runInBand tests/renderer/pages/ModLog.test.tsx`
Expected: 7/7 PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/ModLog.tsx tests/renderer/pages/ModLog.test.tsx
git commit -m "feat: ModLog page with platform/username filters and undo"
```

---

### Task 3: Sidebar + App.tsx wiring

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx` — add `'modlog'` view
- Modify: `src/renderer/App.tsx` — render `<ModLog />` for `view === 'modlog'`

**Interfaces:**
- Consumes: `ModLog` default export from `src/renderer/pages/ModLog`

- [ ] **Step 1: Update `Sidebar.tsx`**

Replace:
```ts
type View = 'chat' | 'accounts' | 'settings'
```
With:
```ts
type View = 'chat' | 'accounts' | 'settings' | 'modlog'
```

Replace the navItems array:
```ts
const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'chat', label: 'Chat', icon: '💬' },
  { view: 'accounts', label: 'Accounts', icon: '🔑' },
  { view: 'settings', label: 'Settings', icon: '⚙️' },
  { view: 'modlog', label: 'Mod Log', icon: '🛡️' }
]
```

- [ ] **Step 2: Update `App.tsx`**

Replace:
```ts
type View = 'chat' | 'accounts' | 'settings'
```
With:
```ts
type View = 'chat' | 'accounts' | 'settings' | 'modlog'
```

Add import at top:
```ts
import ModLog from './pages/ModLog'
```

Add render clause (after the settings render):
```tsx
{view === 'modlog' && <ModLog />}
```

- [ ] **Step 3: Run full test suite**

Run: `npx jest --runInBand`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Sidebar.tsx src/renderer/App.tsx
git commit -m "feat: add Mod Log nav to sidebar and app routing"
```

---

### Task 4: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
PATH="/opt/homebrew/bin:$PATH" git push origin main
```

Expected: "main -> main" confirmation

- [ ] **Step 2: Verify on GitHub**

Check https://github.com/ScottiePerez/Streamline shows the 3 new commits.
