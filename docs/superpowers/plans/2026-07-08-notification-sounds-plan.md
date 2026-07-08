# Notification Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each platform a distinct default alert tone and let streamers replace any platform's sound with a custom audio file, with a preview button in Settings.

**Architecture:** A new `tones.ts` module generates distinct per-platform tones via the Web Audio API. `useChat.ts` gets a new `notificationSoundPaths` param — when a message arrives, it plays the custom file (via `Audio`) if set, otherwise calls the tone generator. Three new IPC handlers handle file picking, copying, and deletion. Settings.tsx expands each notification row with Preview/Change/Reset buttons.

**Tech Stack:** Web Audio API (AudioContext), Node.js `fs/promises` + `path`, Electron `dialog`, React, Jest + React Testing Library

## Global Constraints

- `contextBridge.exposeInMainWorld('electronAPI', ...)` — key must be exactly `'electronAPI'`
- `BrowserWindow` must have `contextIsolation: true, nodeIntegration: false`
- Keytar service name: `streamchat-app`
- SQLite database file: `app.getPath('userData')/streamchat.db`
- Custom sound files stored at: `app.getPath('userData')/sounds/<platform>.<ext>`
- Supported audio extensions: `mp3`, `wav`, `ogg`
- Run tests with `npx jest --runInBand` to avoid MacBook freezing
- Test import paths: `tests/renderer/` files import from `../../../src/`; `tests/main/` files import from `../../src/`

---

## File Structure

**Create:**
- `src/renderer/audio/tones.ts` — `playDefaultTone(platform: Platform): void`
- `tests/renderer/audio/tones.test.ts`

**Modify:**
- `src/shared/types.ts` — add `notificationSoundPaths` to `AppSettings` + `DEFAULT_SETTINGS`
- `src/main/ipc-handlers.ts` — add `sounds:setCustom`, `sounds:clearCustom`, `sounds:pick`
- `src/preload/index.ts` — expose `setCustomSound`, `clearCustomSound`, `pickSoundFile`
- `src/renderer/hooks/useChat.ts` — accept + use `notificationSoundPaths`
- `src/renderer/components/ChatFeed.tsx` — pass `notificationSoundPaths` to `useChat`
- `src/renderer/App.tsx` — load + track `notificationSoundPaths`
- `src/renderer/pages/Settings.tsx` — expand notification sounds UI
- `tests/renderer/hooks/useChat.test.ts` — update for new param + custom path tests
- `tests/renderer/pages/Settings.test.tsx` — preview/change/reset tests
- All other renderer test mock objects — add new electronAPI methods

---

### Task 1: Types + default tone generator

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/renderer/audio/tones.ts`
- Create: `tests/renderer/audio/tones.test.ts`

**Interfaces:**
- Produces:
  - `AppSettings.notificationSoundPaths: Record<Platform, string | null>`
  - `DEFAULT_SETTINGS.notificationSoundPaths` all null
  - `playDefaultTone(platform: Platform): void` — exported from `src/renderer/audio/tones.ts`

- [ ] **Step 1: Write failing tests for tones**

Create `tests/renderer/audio/tones.test.ts`:

```ts
import { playDefaultTone } from '../../../src/renderer/audio/tones'

describe('playDefaultTone', () => {
  let mockOscillator: any
  let mockGain: any
  let mockCtx: any

  beforeEach(() => {
    mockOscillator = {
      connect: jest.fn(),
      frequency: { value: 0 },
      type: 'sine' as OscillatorType,
      start: jest.fn(),
      stop: jest.fn(),
    }
    mockGain = {
      connect: jest.fn(),
      gain: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn()
      }
    }
    mockCtx = {
      currentTime: 0,
      createOscillator: jest.fn(() => mockOscillator),
      createGain: jest.fn(() => mockGain),
      destination: {}
    }
    ;(global as any).AudioContext = jest.fn(() => mockCtx)
  })

  afterEach(() => {
    delete (global as any).AudioContext
  })

  it('plays twitch tone without throwing', () => {
    expect(() => playDefaultTone('twitch')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('plays two notes for youtube', () => {
    expect(() => playDefaultTone('youtube')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('plays two notes for tiktok', () => {
    expect(() => playDefaultTone('tiktok')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('does not throw when AudioContext is unavailable', () => {
    delete (global as any).AudioContext
    expect(() => playDefaultTone('twitch')).not.toThrow()
  })

  it('plays kick tone without throwing', () => {
    expect(() => playDefaultTone('kick')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('plays facebook tone without throwing', () => {
    expect(() => playDefaultTone('facebook')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest --runInBand tests/renderer/audio/tones.test.ts
```
Expected: FAIL — "Cannot find module '../../../src/renderer/audio/tones'"

- [ ] **Step 3: Add `notificationSoundPaths` to `src/shared/types.ts`**

In the `AppSettings` interface, add after `notificationSounds`:
```ts
  notificationSoundPaths: Record<Platform, string | null>
```

In `DEFAULT_SETTINGS`, add after `notificationSounds`:
```ts
  notificationSoundPaths: {
    twitch: null,
    youtube: null,
    kick: null,
    tiktok: null,
    facebook: null
  },
```

- [ ] **Step 4: Implement `src/renderer/audio/tones.ts`**

```ts
import type { Platform } from '../../shared/types'

type ToneConfig = {
  frequencies: number[]
  duration: number
  gap?: number
}

const TONES: Record<Platform, ToneConfig> = {
  twitch:   { frequencies: [440],      duration: 0.15 },
  youtube:  { frequencies: [520, 660], duration: 0.08 },
  kick:     { frequencies: [550],      duration: 0.10 },
  tiktok:   { frequencies: [880, 880], duration: 0.06, gap: 0.08 },
  facebook: { frequencies: [330],      duration: 0.20 },
}

export function playDefaultTone(platform: Platform): void {
  const AC = (typeof AudioContext !== 'undefined' ? AudioContext : (window as any).webkitAudioContext) as typeof AudioContext | undefined
  if (!AC) return
  const ctx = new AC()
  const config = TONES[platform]
  let startTime = ctx.currentTime

  for (const freq of config.frequencies) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, startTime)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + config.duration)
    osc.start(startTime)
    osc.stop(startTime + config.duration)
    startTime += config.duration + (config.gap ?? 0)
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest --runInBand tests/renderer/audio/tones.test.ts
```
Expected: 6/6 PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/renderer/audio/tones.ts tests/renderer/audio/tones.test.ts
git commit -m "feat: per-platform default tones and notificationSoundPaths setting"
```

---

### Task 2: IPC handlers + preload for custom sounds

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: all renderer test mock files (add new API methods)

**Interfaces:**
- Consumes: nothing new from prior tasks
- Produces:
  - IPC `sounds:setCustom(platform, sourcePath) → string` — copies file, returns dest path
  - IPC `sounds:clearCustom(platform) → void` — deletes file
  - IPC `sounds:pick() → string | null` — opens file dialog
  - Preload: `setCustomSound(platform: Platform, sourcePath: string): Promise<string>`
  - Preload: `clearCustomSound(platform: Platform): Promise<void>`
  - Preload: `pickSoundFile(): Promise<string | null>`

- [ ] **Step 1: Update `src/main/ipc-handlers.ts`**

Add imports at the top of the file (after existing imports):
```ts
import { dialog, app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
```

Add at the end of `registerIpcHandlers` (before the closing `}`):
```ts
  ipcMain.handle('sounds:pick', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose alert sound',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('sounds:setCustom', async (_e, platform: Platform, sourcePath: string) => {
    const soundsDir = path.join(app.getPath('userData'), 'sounds')
    await fs.mkdir(soundsDir, { recursive: true })
    for (const ext of ['.mp3', '.wav', '.ogg']) {
      await fs.unlink(path.join(soundsDir, `${platform}${ext}`)).catch(() => {})
    }
    const destExt = path.extname(sourcePath)
    const dest = path.join(soundsDir, `${platform}${destExt}`)
    await fs.copyFile(sourcePath, dest)
    return dest
  })

  ipcMain.handle('sounds:clearCustom', async (_e, platform: Platform) => {
    const soundsDir = path.join(app.getPath('userData'), 'sounds')
    for (const ext of ['.mp3', '.wav', '.ogg']) {
      await fs.unlink(path.join(soundsDir, `${platform}${ext}`)).catch(() => {})
    }
  })
```

- [ ] **Step 2: Update `src/preload/index.ts`**

Add after the `onTeamStatus` method (before the closing `}`):
```ts
  ,

  setCustomSound(platform: Platform, sourcePath: string): Promise<string> {
    return ipcRenderer.invoke('sounds:setCustom', platform, sourcePath)
  },

  clearCustomSound(platform: Platform): Promise<void> {
    return ipcRenderer.invoke('sounds:clearCustom', platform)
  },

  pickSoundFile(): Promise<string | null> {
    return ipcRenderer.invoke('sounds:pick')
  }
```

- [ ] **Step 3: Add new methods to all renderer test mocks**

Find all mock files:
```bash
grep -rn "onTeamStatus: jest.fn" tests/renderer/
```

In every file found, after `onTeamStatus: jest.fn(() => jest.fn())` add:
```ts
    setCustomSound: jest.fn().mockResolvedValue('/userData/sounds/twitch.mp3'),
    clearCustomSound: jest.fn().mockResolvedValue(undefined),
    pickSoundFile: jest.fn().mockResolvedValue(null),
```

The files to update are:
- `tests/renderer/pages/Settings.test.tsx`
- `tests/renderer/components/ReplyBar.test.tsx`
- `tests/renderer/hooks/useChat.test.ts`
- `tests/renderer/pages/ModLog.test.tsx`
- `tests/renderer/pages/AccountManager.test.tsx`

- [ ] **Step 4: Verify all renderer tests still pass**

```bash
npx jest --runInBand tests/renderer/
```
Expected: all tests pass (no new tests added this task — IPC handlers are wired but not unit-tested separately since the main test suite can't easily run Electron dialog)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts tests/renderer/
git commit -m "feat: sounds IPC handlers and preload — pick, setCustom, clearCustom"
```

---

### Task 3: useChat + ChatFeed + App — wire sound paths through

**Files:**
- Modify: `src/renderer/hooks/useChat.ts`
- Modify: `src/renderer/components/ChatFeed.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `tests/renderer/hooks/useChat.test.ts`

**Interfaces:**
- Consumes:
  - `playDefaultTone(platform: Platform): void` from `src/renderer/audio/tones.ts`
  - `AppSettings.notificationSoundPaths: Record<Platform, string | null>` from Task 1
- Produces:
  - `useChat(filters, notificationSounds, notificationSoundPaths)` — updated signature

- [ ] **Step 1: Update useChat tests first**

Replace the entire `describe('useChat — notification sounds', ...)` block in `tests/renderer/hooks/useChat.test.ts` with:

```ts
import { playDefaultTone } from '../../../src/renderer/audio/tones'

jest.mock('../../../src/renderer/audio/tones', () => ({
  playDefaultTone: jest.fn()
}))

const ALL_OFF: Record<Platform, boolean> = {
  twitch: false, youtube: false, kick: false, tiktok: false, facebook: false
}
const ALL_NULL: Record<Platform, string | null> = {
  twitch: null, youtube: null, kick: null, tiktok: null, facebook: null
}

describe('useChat — notification sounds', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not play sound when platform sound is disabled', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    ;(global as any).Audio = jest.fn().mockImplementation(() => ({ play: mockPlay }))

    renderHook(() => useChat({}, ALL_OFF, ALL_NULL))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
    })
    expect(mockPlay).not.toHaveBeenCalled()
    expect(playDefaultTone).not.toHaveBeenCalled()
  })

  it('plays default tone when sound enabled and no custom path', async () => {
    renderHook(() => useChat({}, { ...ALL_OFF, twitch: true }, ALL_NULL))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
    })
    expect(playDefaultTone).toHaveBeenCalledWith('twitch')
  })

  it('plays custom file when custom path is set', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    const MockAudio = jest.fn().mockImplementation(() => ({ play: mockPlay }))
    ;(global as any).Audio = MockAudio

    const paths = { ...ALL_NULL, twitch: '/userData/sounds/twitch.mp3' }
    renderHook(() => useChat({}, { ...ALL_OFF, twitch: true }, paths))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'twitch' }))
    })
    expect(MockAudio).toHaveBeenCalledWith('file:///userData/sounds/twitch.mp3')
    expect(mockPlay).toHaveBeenCalled()
    expect(playDefaultTone).not.toHaveBeenCalled()
  })

  it('does not play sound for a different platform that is disabled', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    ;(global as any).Audio = jest.fn().mockImplementation(() => ({ play: mockPlay }))

    renderHook(() => useChat({}, { ...ALL_OFF, twitch: true }, ALL_NULL))
    await act(async () => {
      const handler = (window as unknown as Record<string, Function>)._chatHandler
      handler(mockMsg({ platform: 'youtube' }))
    })
    expect(mockPlay).not.toHaveBeenCalled()
    expect(playDefaultTone).not.toHaveBeenCalled()
  })
})
```

Also add `import type { Platform } from '../../../src/shared/types'` to the top of the file if not already present. Remove the old `jest.mock('../../../src/renderer/assets/notify.mp3', ...)` line — it's no longer needed.

- [ ] **Step 2: Run tests to confirm the notification sound tests fail**

```bash
npx jest --runInBand tests/renderer/hooks/useChat.test.ts
```
Expected: notification sound tests FAIL, other useChat tests still PASS

- [ ] **Step 3: Rewrite `src/renderer/hooks/useChat.ts`**

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, Platform } from '../../shared/types'
import { playDefaultTone } from '../audio/tones'

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

const DEFAULT_SOUNDS: Record<Platform, boolean> = {
  twitch: false, youtube: false, kick: false, tiktok: false, facebook: false
}

const DEFAULT_PATHS: Record<Platform, string | null> = {
  twitch: null, youtube: null, kick: null, tiktok: null, facebook: null
}

export function useChat(
  filters: ChatFilters,
  notificationSounds: Record<Platform, boolean> = DEFAULT_SOUNDS,
  notificationSoundPaths: Record<Platform, string | null> = DEFAULT_PATHS
): { messages: ChatMessage[] } {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const soundsRef = useRef(notificationSounds)
  soundsRef.current = notificationSounds
  const pathsRef = useRef(notificationSoundPaths)
  pathsRef.current = notificationSoundPaths

  useEffect(() => {
    window.electronAPI.getRecentMessages(MAX_FEED_MESSAGES).then(history => {
      setAllMessages(history)
    })
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.onMessage(msg => {
      setAllMessages(prev => {
        const next = [msg, ...prev]
        return next.length > MAX_FEED_MESSAGES ? next.slice(0, MAX_FEED_MESSAGES) : next
      })
      if (soundsRef.current[msg.platform]) {
        const customPath = pathsRef.current[msg.platform]
        if (customPath) {
          new Audio(`file://${customPath}`).play().catch(() => {})
        } else {
          playDefaultTone(msg.platform)
        }
      }
    })
    return unsub
  }, [])

  const messages = useMemo(
    () => allMessages.filter(msg => matchesFilters(msg, filtersRef.current)),
    [allMessages, filters]
  )

  return { messages }
}
```

- [ ] **Step 4: Update `src/renderer/components/ChatFeed.tsx`**

Update the Props interface:
```ts
import type { AppSettings } from '../../shared/types'

interface Props {
  filters: ChatFilters
  fontSize: 'sm' | 'md' | 'lg'
  notificationSounds: Record<Platform, boolean>
  notificationSoundPaths: Record<Platform, string | null>
}
```

Update the component signature:
```ts
export default function ChatFeed({ filters, fontSize, notificationSounds, notificationSoundPaths }: Props): React.JSX.Element {
  const { messages } = useChat(filters, notificationSounds, notificationSoundPaths)
```

Remove the `import type { AppSettings }` if you added it — `Record<Platform, string | null>` doesn't need it.

Full updated `src/renderer/components/ChatFeed.tsx`:
```tsx
import React, { useEffect, useRef } from 'react'
import MessageRow from './MessageRow'
import type { ChatFilters } from '../hooks/useChat'
import type { ChatMessage, Platform } from '../../shared/types'
import { useChat } from '../hooks/useChat'

interface Props {
  filters: ChatFilters
  fontSize: 'sm' | 'md' | 'lg'
  notificationSounds: Record<Platform, boolean>
  notificationSoundPaths: Record<Platform, string | null>
}

export default function ChatFeed({ filters, fontSize, notificationSounds, notificationSoundPaths }: Props): React.JSX.Element {
  const { messages } = useChat(filters, notificationSounds, notificationSoundPaths)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isAtBottom = container.scrollTop < 100
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
        <MessageRow key={msg.id} message={msg} onModerate={handleModerate} fontSize={fontSize} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Update `src/renderer/App.tsx`**

Add `notificationSoundPaths` state (after the `notificationSounds` state):
```ts
  const [notificationSoundPaths, setNotificationSoundPaths] = useState<Record<Platform, string | null>>({
    twitch: null, youtube: null, kick: null, tiktok: null, facebook: null
  })
```

In the `getSettings` effect, add after `setNotificationSounds(s.notificationSounds)`:
```ts
      if (s.notificationSoundPaths) setNotificationSoundPaths(s.notificationSoundPaths)
```

In `handleSettingsChange`, add:
```ts
    if (partial.notificationSoundPaths !== undefined) setNotificationSoundPaths(partial.notificationSoundPaths)
```

Update the `<ChatFeed>` usage:
```tsx
<ChatFeed
  filters={filters}
  fontSize={fontSize}
  notificationSounds={notificationSounds}
  notificationSoundPaths={notificationSoundPaths}
/>
```

- [ ] **Step 6: Run all renderer tests**

```bash
npx jest --runInBand tests/renderer/
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/renderer/hooks/useChat.ts src/renderer/components/ChatFeed.tsx src/renderer/App.tsx tests/renderer/hooks/useChat.test.ts
git commit -m "feat: useChat plays per-platform default tone or custom audio file"
```

---

### Task 4: Settings UI — Preview, Change, Reset

**Files:**
- Modify: `src/renderer/pages/Settings.tsx`
- Modify: `tests/renderer/pages/Settings.test.tsx`

**Interfaces:**
- Consumes:
  - `window.electronAPI.pickSoundFile(): Promise<string | null>` from Task 2
  - `window.electronAPI.setCustomSound(platform, path): Promise<string>` from Task 2
  - `window.electronAPI.clearCustomSound(platform): Promise<void>` from Task 2
  - `playDefaultTone(platform: Platform): void` from Task 1
  - `AppSettings.notificationSoundPaths` from Task 1

- [ ] **Step 1: Write failing tests**

Add to `tests/renderer/pages/Settings.test.tsx`:

```tsx
import { playDefaultTone } from '../../../src/renderer/audio/tones'

jest.mock('../../../src/renderer/audio/tones', () => ({
  playDefaultTone: jest.fn()
}))

describe('Settings — Notification Sounds expanded UI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT,
      notificationSoundPaths: {
        twitch: null, youtube: null, kick: null, tiktok: null, facebook: null
      }
    })
  })

  it('shows Default label when no custom sound set', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    const defaultLabels = await screen.findAllByText('Default')
    expect(defaultLabels.length).toBeGreaterThanOrEqual(5)
  })

  it('Preview button plays default tone for that platform', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findAllByRole('button', { name: /preview/i })
    const previews = screen.getAllByRole('button', { name: /preview/i })
    fireEvent.click(previews[0]) // Twitch is first
    expect(playDefaultTone).toHaveBeenCalledWith('twitch')
  })

  it('Change button calls pickSoundFile then setCustomSound', async () => {
    ;(window.electronAPI.pickSoundFile as jest.Mock).mockResolvedValue('/my/sound.mp3')
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findAllByRole('button', { name: /change/i })
    fireEvent.click(screen.getAllByRole('button', { name: /change/i })[0])
    await waitFor(() => expect(window.electronAPI.pickSoundFile).toHaveBeenCalled())
    await waitFor(() =>
      expect(window.electronAPI.setCustomSound).toHaveBeenCalledWith('twitch', '/my/sound.mp3')
    )
  })

  it('shows filename when custom sound is set', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT,
      notificationSoundPaths: {
        twitch: '/userData/sounds/twitch.mp3',
        youtube: null, kick: null, tiktok: null, facebook: null
      }
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    expect(await screen.findByText('twitch.mp3')).toBeInTheDocument()
  })

  it('Reset button calls clearCustomSound', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({
      ...DEFAULT,
      notificationSoundPaths: {
        twitch: '/userData/sounds/twitch.mp3',
        youtube: null, kick: null, tiktok: null, facebook: null
      }
    })
    render(<Settings onSettingsChange={jest.fn()} />)
    const resetBtn = await screen.findByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)
    await waitFor(() =>
      expect(window.electronAPI.clearCustomSound).toHaveBeenCalledWith('twitch')
    )
  })

  it('does not show Reset button when no custom sound', async () => {
    render(<Settings onSettingsChange={jest.fn()} />)
    await screen.findAllByText('Default')
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx jest --runInBand tests/renderer/pages/Settings.test.tsx
```
Expected: new tests FAIL, existing tests PASS

- [ ] **Step 3: Update `src/renderer/pages/Settings.tsx`**

Add import at top:
```tsx
import { playDefaultTone } from '../audio/tones'
import path from 'path-browserify'
```

Actually, `path` isn't available in the browser. Use a simple helper to get the filename instead:
```tsx
function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}
```

Add `notificationSoundPaths` state in the `Settings` component (after existing state):
```tsx
  const [soundPaths, setSoundPaths] = useState<Record<Platform, string | null>>({
    twitch: null, youtube: null, kick: null, tiktok: null, facebook: null
  })
  const [soundErrors, setSoundErrors] = useState<Partial<Record<Platform, string>>>({})
```

Update the initial `useEffect` to also load `notificationSoundPaths`:
```tsx
  useEffect(() => {
    window.electronAPI.getSettings().then(s => {
      setSettings(s)
      if (s.notificationSoundPaths) setSoundPaths(s.notificationSoundPaths)
    })
    // ... rest of the team mode effect
  }, [])
```

Add helper functions inside the component:
```tsx
  async function handlePreview(platform: Platform): Promise<void> {
    const customPath = soundPaths[platform]
    if (customPath) {
      new Audio(`file://${customPath}`).play().catch(() => {})
    } else {
      playDefaultTone(platform)
    }
  }

  async function handleChangeSoundFile(platform: Platform): Promise<void> {
    const filePath = await window.electronAPI.pickSoundFile()
    if (!filePath) return
    try {
      const dest = await window.electronAPI.setCustomSound(platform, filePath)
      const updated = { ...soundPaths, [platform]: dest }
      setSoundPaths(updated)
      save({ notificationSoundPaths: updated })
      setSoundErrors(prev => { const next = { ...prev }; delete next[platform]; return next })
    } catch (err) {
      setSoundErrors(prev => ({
        ...prev,
        [platform]: err instanceof Error ? err.message : 'Failed to set sound'
      }))
    }
  }

  async function handleResetSound(platform: Platform): Promise<void> {
    await window.electronAPI.clearCustomSound(platform)
    const updated = { ...soundPaths, [platform]: null }
    setSoundPaths(updated)
    save({ notificationSoundPaths: updated })
  }
```

Replace the existing Notification Sounds `<section>` with:
```tsx
        {/* Notification Sounds */}
        <section>
          <SectionHeading>Notification Sounds</SectionHeading>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:divide-gray-700">
            {PLATFORMS.map(({ id, label }) => (
              <div key={id} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
                  <Toggle
                    id={label.toLowerCase()}
                    checked={settings.notificationSounds[id]}
                    onChange={val =>
                      save({ notificationSounds: { ...settings.notificationSounds, [id]: val } })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pl-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
                    {soundPaths[id] ? basename(soundPaths[id]!) : 'Default'}
                  </span>
                  <button
                    onClick={() => void handlePreview(id)}
                    className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => void handleChangeSoundFile(id)}
                    className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Change
                  </button>
                  {soundPaths[id] && (
                    <button
                      onClick={() => void handleResetSound(id)}
                      className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {soundErrors[id] && (
                  <p className="text-xs text-red-500">{soundErrors[id]}</p>
                )}
              </div>
            ))}
          </div>
        </section>
```

Also add `basename` helper function (before the `Settings` component or inside it, before the return):
```tsx
function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}
```

- [ ] **Step 4: Run all renderer tests**

```bash
npx jest --runInBand tests/renderer/
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/Settings.tsx tests/renderer/pages/Settings.test.tsx
git commit -m "feat: Settings notification sounds UI — Preview, Change, Reset per platform"
```

---

### Task 5: Push to GitHub

- [ ] **Step 1: Run full test suite (new + renderer)**

```bash
npx jest --runInBand tests/renderer/audio/tones.test.ts && npx jest --runInBand tests/renderer/
```
Expected: all tests pass

- [ ] **Step 2: Push**

```bash
PATH="/opt/homebrew/bin:$PATH" git push origin main
```

Expected: "main -> main"
