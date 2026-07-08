# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings page with Appearance, Feed, Notification Sounds, and Team Mode sections, wiring up font size, theme toggle, and per-platform notification sounds.

**Architecture:** `Settings.tsx` is a new page that loads settings on mount and saves each change immediately via `setSettings`. `App.tsx` holds `fontSize` and `notificationSounds` in state, passes them down to `ChatFeed` → `MessageRow` (font size) and `useChat` (sound playback). Theme is applied by toggling `dark` class on `document.documentElement`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (`darkMode: 'class'`), Vite static asset import for notify.mp3, `@testing-library/react`, `jest-dom`.

## Global Constraints

- `contextIsolation: true, nodeIntegration: false` — renderer talks to main only via `window.electronAPI`
- IPC methods already available: `getSettings(): Promise<AppSettings>`, `setSettings(partial: Partial<AppSettings>): void`
- `AppSettings` is in `src/shared/types.ts` — do not redefine it
- `DEFAULT_SETTINGS` already covers all fields; `getSettings()` always returns a full `AppSettings` object
- `darkMode: 'class'` is already set in `tailwind.config.js` — no config change needed
- Font size values: `'sm' | 'md' | 'lg'` → Tailwind classes `text-sm` / `text-base` / `text-lg`
- Notification sound file: `src/renderer/assets/notify.mp3` — short royalty-free chime
- Sound playback: `new Audio(notifySound).play().catch(() => {})` — swallow autoplay errors silently
- No new IPC channels — work only with existing `getSettings` / `setSettings`
- Tests run with `--runInBand` (serial) to avoid MacBook memory pressure
- Test command: `npx jest --runInBand --testPathPattern="renderer"`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/renderer/assets/notify.mp3` | Create | Bundled chime for notification sounds |
| `src/renderer/pages/Settings.tsx` | Create | All four settings sections |
| `src/renderer/components/Sidebar.tsx` | Modify | Add `settings` nav item (⚙️) |
| `src/renderer/App.tsx` | Modify | Add `settings` view, `fontSize` + `notificationSounds` state |
| `src/renderer/components/ChatFeed.tsx` | Modify | Accept `fontSize: 'sm' | 'md' | 'lg'` prop |
| `src/renderer/components/MessageRow.tsx` | Modify | Accept `fontSize` prop, apply class to message text |
| `src/renderer/hooks/useChat.ts` | Modify | Accept `notificationSounds` prop, play chime on new messages |
| `tests/renderer/pages/Settings.test.tsx` | Create | All four section behaviors |

---

### Task 1: Sidebar + App.tsx navigation and state wiring

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Produces: `View = 'chat' | 'accounts' | 'settings'` exported type used by both files
- Produces: `App.tsx` exposes `fontSize: 'sm' | 'md' | 'lg'` and `notificationSounds: Record<Platform, boolean>` in state, loaded from `getSettings()` on mount
- Produces: `App.tsx` renders `<Settings onSettingsChange={handleSettingsChange} />` for `view === 'settings'`

- [ ] **Step 1: Write the failing test for Sidebar settings nav item**

File: `tests/renderer/components/Sidebar.test.tsx` (create if it doesn't exist, otherwise append)

```tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from '../../../src/renderer/components/Sidebar'

describe('Sidebar — settings nav', () => {
  it('renders Settings nav button', () => {
    render(<Sidebar activeView="chat" onViewChange={() => {}} />)
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onViewChange with "settings" when Settings is clicked', () => {
    const onChange = jest.fn()
    render(<Sidebar activeView="chat" onViewChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(onChange).toHaveBeenCalledWith('settings')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest --runInBand --testPathPattern="Sidebar"
```

Expected: FAIL — `View` type does not include `'settings'`, `Settings` button not found.

- [ ] **Step 3: Update Sidebar.tsx**

```tsx
import React from 'react'

type View = 'chat' | 'accounts' | 'settings'

interface Props {
  activeView: View
  onViewChange: (view: View) => void
}

const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'chat', label: 'Chat', icon: '💬' },
  { view: 'accounts', label: 'Accounts', icon: '🔑' },
  { view: 'settings', label: 'Settings', icon: '⚙️' }
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

- [ ] **Step 4: Update App.tsx**

Replace the entire file:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountManager from './pages/AccountManager'
import Settings from './pages/Settings'
import ChatFeed from './components/ChatFeed'
import FilterBar from './components/FilterBar'
import ReplyBar from './components/ReplyBar'
import type { ChatFilters } from './hooks/useChat'
import type { AppSettings, Platform } from '../shared/types'

type View = 'chat' | 'accounts' | 'settings'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('chat')
  const [filters, setFilters] = useState<ChatFilters>({})
  const [channelId, setChannelId] = useState('')
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [notificationSounds, setNotificationSounds] = useState<Record<Platform, boolean>>({
    twitch: false,
    youtube: false,
    kick: false,
    tiktok: false,
    facebook: false
  })

  useEffect(() => {
    window.electronAPI.getSettings().then((s: AppSettings) => {
      setChannelId(s.twitchChannelId ?? '')
      setFontSize(s.fontSize)
      setNotificationSounds(s.notificationSounds)
      if (s.theme === 'light') {
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
      }
    })
  }, [])

  function handleSettingsChange(partial: Partial<AppSettings>): void {
    if (partial.fontSize !== undefined) setFontSize(partial.fontSize)
    if (partial.notificationSounds !== undefined) setNotificationSounds(partial.notificationSounds)
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && (
          <>
            <FilterBar filters={filters} onChange={setFilters} />
            <ChatFeed filters={filters} fontSize={fontSize} notificationSounds={notificationSounds} />
            {channelId ? (
              <ReplyBar channelId={channelId} />
            ) : (
              <div className="p-2 text-center text-xs text-gray-500">
                No Twitch channel configured — add your channel in Account settings to enable replies.
              </div>
            )}
          </>
        )}
        {view === 'accounts' && <AccountManager />}
        {view === 'settings' && <Settings onSettingsChange={handleSettingsChange} />}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run Sidebar test to verify it passes**

```bash
npx jest --runInBand --testPathPattern="Sidebar"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Sidebar.tsx src/renderer/App.tsx tests/renderer/components/Sidebar.test.tsx
git commit -m "feat: add Settings nav to Sidebar, wire fontSize+notificationSounds in App"
```

---

### Task 2: fontSize prop threading — ChatFeed + MessageRow

**Files:**
- Modify: `src/renderer/components/ChatFeed.tsx`
- Modify: `src/renderer/components/MessageRow.tsx`

**Interfaces:**
- Consumes: `fontSize: 'sm' | 'md' | 'lg'` passed from `App.tsx` to `ChatFeed`
- Consumes: `notificationSounds: Record<Platform, boolean>` passed from `App.tsx` to `ChatFeed` (forwarded to `useChat`)
- Produces: `MessageRow` applies `text-sm` / `text-base` / `text-lg` to message text span

- [ ] **Step 1: Write the failing test for MessageRow fontSize**

Append to `tests/renderer/components/MessageRow.test.tsx` (check if it exists first; if not, create):

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import MessageRow from '../../../src/renderer/components/MessageRow'
import type { ChatMessage } from '../../../src/shared/types'

const BASE_MSG: ChatMessage = {
  id: '1', platform: 'twitch', channelId: 'ch', userId: 'u1',
  username: 'user1', displayName: 'User One', avatarUrl: '', text: 'hello',
  timestamp: Date.now(), isDeleted: false, badges: []
}

describe('MessageRow — fontSize', () => {
  it('applies text-sm class when fontSize is sm', () => {
    render(<MessageRow message={BASE_MSG} onModerate={() => {}} fontSize="sm" />)
    const span = screen.getByText('hello')
    expect(span).toHaveClass('text-sm')
  })

  it('applies text-base class when fontSize is md', () => {
    render(<MessageRow message={BASE_MSG} onModerate={() => {}} fontSize="md" />)
    const span = screen.getByText('hello')
    expect(span).toHaveClass('text-base')
  })

  it('applies text-lg class when fontSize is lg', () => {
    render(<MessageRow message={BASE_MSG} onModerate={() => {}} fontSize="lg" />)
    const span = screen.getByText('hello')
    expect(span).toHaveClass('text-lg')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest --runInBand --testPathPattern="MessageRow"
```

Expected: FAIL — `fontSize` prop not accepted.

- [ ] **Step 3: Update MessageRow.tsx**

Add `fontSize` to Props and apply to the message text span:

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
  fontSize: 'sm' | 'md' | 'lg'
}

const FONT_SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageRow({ message, onModerate, fontSize }: Props): React.JSX.Element {
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
      <span className={`${FONT_SIZE_CLASS[fontSize]} text-gray-300 break-words min-w-0`}>{message.text}</span>
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

- [ ] **Step 4: Update ChatFeed.tsx**

Add `fontSize` and `notificationSounds` props, pass them to `useChat` and `MessageRow`:

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
}

export default function ChatFeed({ filters, fontSize, notificationSounds }: Props): React.JSX.Element {
  const { messages } = useChat(filters, notificationSounds)
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

- [ ] **Step 5: Run tests to verify passing**

```bash
npx jest --runInBand --testPathPattern="MessageRow|ChatFeed"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ChatFeed.tsx src/renderer/components/MessageRow.tsx tests/renderer/components/MessageRow.test.tsx
git commit -m "feat: thread fontSize prop through ChatFeed to MessageRow"
```

---

### Task 3: Notification sound in useChat

**Files:**
- Create: `src/renderer/assets/notify.mp3`
- Modify: `src/renderer/hooks/useChat.ts`

**Interfaces:**
- Consumes: `notificationSounds: Record<Platform, boolean>` — second argument to `useChat(filters, notificationSounds)`
- Produces: `useChat` plays `new Audio(notifySound).play().catch(() => {})` when `notificationSounds[msg.platform]` is true and a new message arrives

**Note on the MP3 file:** You need a real (even tiny) MP3 binary to satisfy Vite's import. The easiest approach for development is to download a free chime from a royalty-free source and place it at `src/renderer/assets/notify.mp3`. A 1-second 44.1kHz mono MP3 at 128kbps is ~16 KB. Alternatively, generate one with `ffmpeg`:

```bash
ffmpeg -f lavfi -i "sine=frequency=880:duration=0.5" -codec:a libmp3lame -b:a 128k src/renderer/assets/notify.mp3
```

If `ffmpeg` is not available, place any valid `.mp3` file at that path. The tests mock the `Audio` constructor so the actual audio content doesn't matter for tests.

- [ ] **Step 1: Create notify.mp3**

```bash
ffmpeg -f lavfi -i "sine=frequency=880:duration=0.5" -codec:a libmp3lame -b:a 128k \
  src/renderer/assets/notify.mp3
```

If ffmpeg is unavailable, copy any `.mp3` file to `src/renderer/assets/notify.mp3`.

- [ ] **Step 2: Write failing tests for useChat notification sounds**

Create `tests/renderer/hooks/useChat.test.ts`:

```tsx
import { renderHook, act } from '@testing-library/react'
import { useChat } from '../../../src/renderer/hooks/useChat'
import type { Platform } from '../../../src/shared/types'

// Mock the audio asset import
jest.mock('../../../src/renderer/assets/notify.mp3', () => 'notify.mp3', { virtual: true })

const ALL_SOUNDS_OFF: Record<Platform, boolean> = {
  twitch: false, youtube: false, kick: false, tiktok: false, facebook: false
}
const TWITCH_SOUND_ON: Record<Platform, boolean> = {
  ...ALL_SOUNDS_OFF, twitch: true
}

let messageHandler: ((msg: any) => void) | null = null

beforeEach(() => {
  messageHandler = null
  window.electronAPI = {
    getRecentMessages: jest.fn().mockResolvedValue([]),
    onMessage: jest.fn((handler) => {
      messageHandler = handler
      return () => { messageHandler = null }
    }),
    onPlatformStatus: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn().mockResolvedValue(null),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
})

const TWITCH_MSG = {
  id: 'm1', platform: 'twitch' as Platform, channelId: 'ch', userId: 'u1',
  username: 'user1', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: []
}

describe('useChat — notification sounds', () => {
  it('does not play sound when platform sound is disabled', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    const MockAudio = jest.fn().mockImplementation(() => ({ play: mockPlay }))
    ;(global as any).Audio = MockAudio

    renderHook(() => useChat({}, ALL_SOUNDS_OFF))
    await act(async () => {
      messageHandler?.(TWITCH_MSG)
    })
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('plays sound when platform sound is enabled and message arrives', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    const MockAudio = jest.fn().mockImplementation(() => ({ play: mockPlay }))
    ;(global as any).Audio = MockAudio

    renderHook(() => useChat({}, TWITCH_SOUND_ON))
    await act(async () => {
      messageHandler?.(TWITCH_MSG)
    })
    expect(MockAudio).toHaveBeenCalledWith('notify.mp3')
    expect(mockPlay).toHaveBeenCalled()
  })

  it('does not play sound for a platform not in notificationSounds', async () => {
    const mockPlay = jest.fn().mockResolvedValue(undefined)
    const MockAudio = jest.fn().mockImplementation(() => ({ play: mockPlay }))
    ;(global as any).Audio = MockAudio

    renderHook(() => useChat({}, ALL_SOUNDS_OFF))
    await act(async () => {
      messageHandler?.({ ...TWITCH_MSG, platform: 'youtube' as Platform })
    })
    expect(mockPlay).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx jest --runInBand --testPathPattern="useChat"
```

Expected: FAIL — `useChat` does not accept a second argument.

- [ ] **Step 4: Update useChat.ts**

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, Platform } from '../../shared/types'
import notifySound from '../assets/notify.mp3'

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

export function useChat(
  filters: ChatFilters,
  notificationSounds: Record<Platform, boolean> = {
    twitch: false, youtube: false, kick: false, tiktok: false, facebook: false
  }
): { messages: ChatMessage[] } {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const soundsRef = useRef(notificationSounds)
  soundsRef.current = notificationSounds

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
        new Audio(notifySound).play().catch(() => {})
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

- [ ] **Step 5: Run tests to verify passing**

```bash
npx jest --runInBand --testPathPattern="useChat"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/assets/notify.mp3 src/renderer/hooks/useChat.ts tests/renderer/hooks/useChat.test.ts
git commit -m "feat: notification sounds in useChat, bundled notify.mp3"
```

---

### Task 4: Settings.tsx page + tests

**Files:**
- Create: `src/renderer/pages/Settings.tsx`
- Create: `tests/renderer/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.getSettings(): Promise<AppSettings>`
- Consumes: `window.electronAPI.setSettings(partial: Partial<AppSettings>): void`
- Consumes: `document.documentElement.classList` — toggled on theme change
- Produces: `onSettingsChange(partial: Partial<AppSettings>): void` — called so `App.tsx` can sync its state

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/pages/Settings.test.tsx`:

```tsx
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Settings from '../../../src/renderer/pages/Settings'
import type { AppSettings } from '../../../src/shared/types'

const DEFAULT: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  maxMessagesPerPlatform: 10000,
  notificationSounds: { twitch: false, youtube: false, kick: false, tiktok: false, facebook: false },
  teamModeEnabled: false,
  teamModePort: 7350
}

beforeEach(() => {
  document.documentElement.className = 'dark'
  window.electronAPI = {
    getSettings: jest.fn().mockResolvedValue({ ...DEFAULT }),
    setSettings: jest.fn(),
    getToken: jest.fn().mockResolvedValue(null),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    onPlatformStatus: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    sendMessage: jest.fn(),
    moderate: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
})

describe('Settings — renders all sections', () => {
  it('renders Appearance, Feed, Notification Sounds, Team Mode headings', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      expect(screen.getByText('Feed')).toBeInTheDocument()
      expect(screen.getByText('Notification Sounds')).toBeInTheDocument()
      expect(screen.getByText('Team Mode')).toBeInTheDocument()
    })
  })

  it('renders all five platform rows in Notification Sounds', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Twitch')).toBeInTheDocument()
      expect(screen.getByText('YouTube')).toBeInTheDocument()
      expect(screen.getByText('Kick')).toBeInTheDocument()
      expect(screen.getByText('TikTok')).toBeInTheDocument()
      expect(screen.getByText('Facebook')).toBeInTheDocument()
    })
  })
})

describe('Settings — Appearance', () => {
  it('loads saved fontSize selection', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT, fontSize: 'lg' })
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /large/i })).toHaveClass('bg-indigo-600')
    })
  })

  it('calls setSettings with new fontSize when font size button clicked', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /small/i }))
    fireEvent.click(screen.getByRole('button', { name: /small/i }))
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ fontSize: 'sm' })
  })

  it('adds dark class on documentElement when Dark theme selected', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT, theme: 'light' })
    document.documentElement.classList.remove('dark')
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /dark/i }))
    fireEvent.click(screen.getByRole('button', { name: /dark/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('removes dark class on documentElement when Light theme selected', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /light/i }))
    fireEvent.click(screen.getByRole('button', { name: /light/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ theme: 'light' })
  })
})

describe('Settings — Feed', () => {
  it('calls setSettings with maxMessagesPerPlatform on blur', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/max messages/i))
    const input = screen.getByLabelText(/max messages/i)
    fireEvent.change(input, { target: { value: '5000' } })
    fireEvent.blur(input)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ maxMessagesPerPlatform: 5000 })
  })
})

describe('Settings — Notification Sounds', () => {
  it('calls setSettings with updated notificationSounds when Twitch toggle changes', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/twitch/i))
    fireEvent.click(screen.getByLabelText(/twitch/i))
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({
      notificationSounds: { twitch: true, youtube: false, kick: false, tiktok: false, facebook: false }
    })
  })
})

describe('Settings — Team Mode', () => {
  it('port input is disabled when team mode is off', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/port/i))
    expect(screen.getByLabelText(/port/i)).toBeDisabled()
  })

  it('port input is enabled after enabling team mode', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/enable team mode/i))
    fireEvent.click(screen.getByLabelText(/enable team mode/i))
    expect(screen.getByLabelText(/port/i)).not.toBeDisabled()
  })

  it('calls setSettings with teamModeEnabled true when toggled on', async () => {
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/enable team mode/i))
    fireEvent.click(screen.getByLabelText(/enable team mode/i))
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ teamModeEnabled: true })
  })

  it('calls setSettings with teamModePort on blur', async () => {
    ;(window.electronAPI.getSettings as jest.Mock).mockResolvedValue({ ...DEFAULT, teamModeEnabled: true })
    render(<Settings onSettingsChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/port/i))
    const portInput = screen.getByLabelText(/port/i)
    fireEvent.change(portInput, { target: { value: '8080' } })
    fireEvent.blur(portInput)
    expect(window.electronAPI.setSettings).toHaveBeenCalledWith({ teamModePort: 8080 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest --runInBand --testPathPattern="pages/Settings"
```

Expected: FAIL — `Settings` module not found.

- [ ] **Step 3: Create Settings.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import type { AppSettings, Platform } from '../../shared/types'

interface Props {
  onSettingsChange: (partial: Partial<AppSettings>) => void
}

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'kick', label: 'Kick' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' }
]

function SectionHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{children}</h2>
}

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }): React.JSX.Element {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      id={id}
      aria-label={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function Settings({ onSettingsChange }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.electronAPI.getSettings().then(s => setSettings(s))
  }, [])

  function save(partial: Partial<AppSettings>): void {
    window.electronAPI.setSettings(partial)
    setSettings(prev => prev ? { ...prev, ...partial } : prev)
    onSettingsChange(partial)
  }

  if (!settings) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading…</div>
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-100 mb-6">Settings</h1>
      <div className="flex flex-col gap-8 max-w-xl">

        {/* Appearance */}
        <section>
          <SectionHeading>Appearance</SectionHeading>
          <div className="bg-gray-800 rounded-lg px-4 py-4 border border-gray-700 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200">Theme</span>
              <div className="flex rounded overflow-hidden border border-gray-600">
                {(['dark', 'light'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      if (t === 'dark') document.documentElement.classList.add('dark')
                      else document.documentElement.classList.remove('dark')
                      save({ theme: t })
                    }}
                    className={`px-3 py-1 text-sm capitalize ${
                      settings.theme === t
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {t === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200">Font size</span>
              <div className="flex rounded overflow-hidden border border-gray-600">
                {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => save({ fontSize: val })}
                    className={`px-3 py-1 text-sm ${
                      settings.fontSize === val
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Feed */}
        <section>
          <SectionHeading>Feed</SectionHeading>
          <div className="bg-gray-800 rounded-lg px-4 py-4 border border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="max-messages" className="text-sm text-gray-200">
                Max messages per platform
              </label>
              <input
                id="max-messages"
                aria-label="Max messages per platform"
                type="number"
                min={100}
                max={50000}
                step={100}
                defaultValue={settings.maxMessagesPerPlatform}
                onBlur={e => save({ maxMessagesPerPlatform: Number(e.currentTarget.value) })}
                className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Takes effect on next app launch.</p>
          </div>
        </section>

        {/* Notification Sounds */}
        <section>
          <SectionHeading>Notification Sounds</SectionHeading>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
            {PLATFORMS.map(({ id, label }) => (
              <div key={id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-200">{label}</span>
                <Toggle
                  id={label.toLowerCase()}
                  checked={settings.notificationSounds[id]}
                  onChange={val => save({
                    notificationSounds: { ...settings.notificationSounds, [id]: val }
                  })}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Team Mode */}
        <section>
          <SectionHeading>Team Mode</SectionHeading>
          <div className="bg-gray-800 rounded-lg px-4 py-4 border border-gray-700 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label htmlFor="team-mode-enabled" className="text-sm text-gray-200">Enable team mode</label>
              <Toggle
                id="team-mode-enabled"
                checked={settings.teamModeEnabled}
                onChange={val => save({ teamModeEnabled: val })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="team-mode-port"
                className={`text-sm ${settings.teamModeEnabled ? 'text-gray-200' : 'text-gray-500'}`}
              >
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
                className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-gray-500">
              Team mode is saved for a future release. Enabling it now has no effect.
            </p>
          </div>
        </section>

      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
npx jest --runInBand --testPathPattern="pages/Settings"
```

Expected: PASS all tests.

- [ ] **Step 5: Run the full renderer suite to check for regressions**

```bash
npx jest --runInBand --testPathPattern="renderer"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/Settings.tsx tests/renderer/pages/Settings.test.tsx
git commit -m "feat: Settings page — Appearance, Feed, Notification Sounds, Team Mode"
```

---

## Self-Review

**Spec coverage:**
- ✅ Appearance: theme toggle (dark class on documentElement) + font size 3-button group
- ✅ Feed: max messages input with blur save + "takes effect on next launch" note
- ✅ Notification Sounds: 5 platform rows with toggles
- ✅ Team Mode: toggle + port input (disabled when off) + informational note
- ✅ Settings nav item (⚙️) in Sidebar
- ✅ fontSize threaded App → ChatFeed → MessageRow
- ✅ notificationSounds threaded App → ChatFeed → useChat
- ✅ notify.mp3 bundled + played via `new Audio(notifySound).play().catch(() => {})`
- ✅ Theme class applied on load (App.tsx useEffect) and on Settings change
- ✅ `onSettingsChange` callback from Settings → App.tsx to sync state
- ✅ Tests for all behaviors listed in spec

**Placeholder scan:** None — all steps contain complete code.

**Type consistency:**
- `fontSize: 'sm' | 'md' | 'lg'` — consistent across App, ChatFeed, MessageRow, Settings, useChat
- `notificationSounds: Record<Platform, boolean>` — consistent across App, ChatFeed, useChat, Settings
- `onSettingsChange(partial: Partial<AppSettings>): void` — consistent between App.tsx and Settings.tsx
- `useChat(filters, notificationSounds)` — updated signature used in ChatFeed.tsx
