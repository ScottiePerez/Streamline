# Settings Page Design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Add a Settings page to the Streaming Chat Manager so users can configure appearance, feed behaviour, per-platform notification sounds, and team mode preferences — all from within the app rather than editing SQLite directly.

## Context

`AppSettings` is already fully defined in `src/shared/types.ts` and persisted via `better-sqlite3` in `src/main/store/settings.ts`. The IPC bridge already exposes `getSettings` and `setSettings` to the renderer. The six setting groups (theme, font size, max messages, notification sounds, team mode) have no UI yet.

The current navigation has two views: `chat` and `accounts`. This spec adds a third: `settings`.

---

## Architecture

A single new renderer page `src/renderer/pages/Settings.tsx` added as a third sidebar view. It loads settings on mount, saves each value immediately on change via `setSettings`, and applies side effects (theme class, font size prop) directly in the renderer — no new IPC channels needed.

Notification sound playback lives in `src/renderer/hooks/useChat.ts`, which already receives every incoming message. It loads `notificationSounds` from settings once on mount and plays a bundled chime when a message arrives on an enabled platform.

Font size is threaded from `App.tsx` state down to `ChatFeed` as a prop, applied as a Tailwind class on each `MessageRow`.

---

## Components and Files

| File | Action | Purpose |
|---|---|---|
| `src/renderer/pages/Settings.tsx` | Create | Settings page — all four groups |
| `src/renderer/assets/notify.mp3` | Create | Short chime (~0.5 s), royalty-free |
| `src/renderer/components/Sidebar.tsx` | Modify | Add `settings` nav item (⚙️) |
| `src/renderer/App.tsx` | Modify | Add `settings` view, thread `fontSize` to ChatFeed |
| `src/renderer/components/ChatFeed.tsx` | Modify | Accept `fontSize` prop, apply to MessageRow |
| `src/renderer/components/MessageRow.tsx` | Modify | Accept `fontSize` prop, apply `text-sm`/`text-base`/`text-lg` |
| `src/renderer/hooks/useChat.ts` | Modify | Load `notificationSounds`, play chime on new messages |
| `tests/renderer/pages/Settings.test.tsx` | Create | Settings page tests |

---

## Settings Page Layout

Four labeled sections, rendered top-to-bottom in a single scrollable column (max-width `xl`, matching AccountManager):

### Appearance
- **Theme** — two-button toggle: `Dark` / `Light`. Default: Dark. On change: call `setSettings({ theme })`, then toggle `dark` class on `document.documentElement`.
- **Font size** — three-button group: `Small` / `Medium` / `Large` (maps to `sm` / `md` / `lg`). On change: call `setSettings({ fontSize })`.

### Feed
- **Max messages per platform** — number input, min 100, max 50000, step 100. Label: "Max messages per platform". On blur: call `setSettings({ maxMessagesPerPlatform: value })`. Takes effect on next app launch (the ChatBus reads this value at startup).

### Notification Sounds
Five rows, one per platform (Twitch, YouTube, Kick, TikTok, Facebook). Each row: platform name on the left, toggle switch on the right. On change: call `setSettings({ notificationSounds: { ...current, [platform]: value } })`.

### Team Mode
- **Enable team mode** — toggle switch. Label: "Enable team mode". On change: call `setSettings({ teamModeEnabled })`.
- **Port** — number input, min 1024, max 65535. Label: "Port". Disabled and visually greyed when team mode is off. On blur: call `setSettings({ teamModePort: value })`.
- Informational note below the port: "Team mode is saved for a future release. Enabling it now has no effect."

---

## Theme Implementation Note

The app currently uses hardcoded Tailwind dark utility classes throughout (e.g. `bg-gray-900`, `text-gray-100`). This spec wires up the infrastructure — toggling the `dark` class on `document.documentElement` on theme change and on app load — but does **not** convert every component to use `dark:` variants. Light mode will appear unstyled until a future pass adds `dark:` prefixes. The preference is persisted correctly either way.

Tailwind must be configured with `darkMode: 'class'` in `tailwind.config.js` for this to work (verify on implementation; add if missing).

---

## Notification Sound

**File:** `src/renderer/assets/notify.mp3` — a short (~0.5 s) royalty-free chime. Imported via Vite's static asset handling:

```typescript
import notifySound from '../assets/notify.mp3'
```

Vite will hash and bundle it automatically; no extra config needed.

**Playback logic** in `useChat.ts`:
1. On mount, load `notificationSounds` from `getSettings()` alongside other settings.
2. Store in a `ref` (not state) so the message handler always sees the latest value without re-subscribing.
3. When a new message arrives: if `notificationSoundsRef.current[msg.platform]` is true, call `new Audio(notifySound).play().catch(() => {})`. The `.catch` swallows autoplay-blocked errors silently.

The ref must be updated when the user changes sound settings in the Settings page. Since settings are saved immediately via IPC, the simplest approach: `useChat` re-fetches settings whenever the component receives a new `notificationSounds` prop — or more simply, expose a `refreshSettings` call that `App.tsx` triggers after any settings save. **Chosen approach:** `App.tsx` holds `settings` in state, fetches on mount and after any `setSettings` call, and passes `notificationSounds` down to `useChat` as a prop. `useChat` stores the prop value in a ref.

---

## Font Size

`App.tsx` holds `fontSize` in state (loaded from `getSettings()` on mount, updated when Settings page saves a change). Passed as a prop to `ChatFeed`, which passes it to each `MessageRow`.

`MessageRow` applies it to the message text span:

| Setting | Tailwind class |
|---|---|
| `sm` | `text-sm` |
| `md` | `text-base` |
| `lg` | `text-lg` |

---

## Data Flow

```
Settings.tsx
  → window.electronAPI.setSettings(partial)
    → ipc-handlers.ts: setSettings(db, partial)
      → store/settings.ts: merges + saves to SQLite

App.tsx
  → getSettings() on mount
  → holds fontSize + notificationSounds in state
  → passes to ChatFeed (fontSize) and useChat (notificationSounds)

Settings.tsx theme change
  → document.documentElement.classList.toggle('dark')
  → immediate visual effect (partial — see Theme note)
```

---

## Testing

`tests/renderer/pages/Settings.test.tsx`:

- Renders all four sections and their controls
- Loads saved values from `getSettings()` mock on mount
- Calls `setSettings` with correct partial on each control change
- Theme toggle adds/removes `dark` class on `document.documentElement`
- Team mode port input is disabled when team mode toggle is off, enabled when on
- Notification sound toggle calls `setSettings` with updated `notificationSounds` map

`useChat` notification sound tests (added to existing `useChat.test.ts` or a new file):
- Does not play sound when platform sound is disabled
- Calls `Audio.play()` when platform sound is enabled and a message arrives

---

## Out of Scope

- Full light-mode styling of all components (future pass)
- Team mode WebSocket server (future spec)
- Sound volume control
- Per-platform sound files (one shared chime only)
- Settings import/export
