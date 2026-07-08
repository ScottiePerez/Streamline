# Notification Sounds — Design Spec

**Date:** 2026-07-08

## Goal

Give each platform a distinct default alert sound, and let streamers replace any platform's sound with a custom audio file. A preview button lets them test sounds before going live.

---

## AppSettings Changes

Add to `src/shared/types.ts`:

```ts
notificationSoundPaths: Record<Platform, string | null>
```

`null` means use the generated default tone. A string value is the absolute path to a file inside `userData/sounds/`.

Add to `DEFAULT_SETTINGS`:
```ts
notificationSoundPaths: {
  twitch: null,
  youtube: null,
  kick: null,
  tiktok: null,
  facebook: null
}
```

---

## Default Tones

Default sounds are generated at runtime via the Web Audio API — no binary assets. Each platform has a distinct frequency and envelope so streamers can tell them apart by ear.

| Platform | Frequency | Shape |
|---|---|---|
| Twitch | 440 Hz | Single soft ping, 150ms fade |
| YouTube | 520 Hz → 660 Hz | Rising two-note, 80ms each |
| Kick | 550 Hz | Short blip, 100ms |
| TikTok | 880 Hz | Double tick, 60ms × 2, 80ms apart |
| Facebook | 330 Hz | Low chime, 200ms fade |

Implementation: `src/renderer/audio/tones.ts` exports `playDefaultTone(platform: Platform): void` using `AudioContext`.

---

## Custom Sound Files

### File Picker Flow

1. User clicks **Change** in Settings → Electron `dialog.showOpenDialog` filters to `['mp3', 'wav', 'ogg']`
2. Main process copies the file to `userData/sounds/<platform>.<ext>` (overwriting any previous custom sound for that platform)
3. Returns the destination path
4. Renderer saves the path via `settings:set` → `notificationSoundPaths[platform] = destPath`

If the user picks the same platform twice, the old file is deleted before copying the new one.

### Playback

`useChat.ts` updated:

```ts
if (soundsRef.current[msg.platform]) {
  const customPath = soundPathsRef.current[msg.platform]
  if (customPath) {
    new Audio(`file://${customPath}`).play().catch(() => {})
  } else {
    playDefaultTone(msg.platform)
  }
}
```

### Reset

Clicking **Reset** on a platform:
1. Calls `sounds:clearCustom(platform)` IPC handler
2. Main process deletes `userData/sounds/<platform>.*`
3. Clears `notificationSoundPaths[platform]` back to `null` in settings

---

## IPC Changes

### New channels

| Channel | Direction | Purpose |
|---|---|---|
| `sounds:setCustom` | renderer → main | Copy file to userData, return dest path |
| `sounds:clearCustom` | renderer → main | Delete file, return void |

### `sounds:setCustom` handler

```ts
ipcMain.handle('sounds:setCustom', async (_e, platform: Platform, sourcePath: string) => {
  const ext = path.extname(sourcePath)
  const dest = path.join(app.getPath('userData'), 'sounds', `${platform}${ext}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  // delete any existing custom sound for this platform before copying
  const soundsDir = path.join(app.getPath('userData'), 'sounds')
  for (const ext of ['.mp3', '.wav', '.ogg']) {
    const existing = path.join(soundsDir, `${platform}${ext}`)
    await fs.unlink(existing).catch(() => {})
  }
  await fs.copyFile(sourcePath, dest)
  return dest
})
```

### `sounds:clearCustom` handler

```ts
ipcMain.handle('sounds:clearCustom', async (_e, platform: Platform) => {
  const soundsDir = path.join(app.getPath('userData'), 'sounds')
  for (const ext of ['.mp3', '.wav', '.ogg']) {
    await fs.unlink(path.join(soundsDir, `${platform}${ext}`)).catch(() => {})
  }
})
```

### Preload additions

```ts
setCustomSound(platform: Platform, sourcePath: string): Promise<string>
clearCustomSound(platform: Platform): Promise<void>
```

---

## Settings UI

The Notification Sounds section expands each platform row:

```
┌─ Notification Sounds ──────────────────────────────────┐
│ Twitch    [toggle]  Default        [▶ Preview] [Change] │
│ YouTube   [toggle]  Default        [▶ Preview] [Change] │
│ Kick      [toggle]  kick-alert.mp3 [▶ Preview] [Change] [Reset] │
│ TikTok    [toggle]  Default        [▶ Preview] [Change] │
│ Facebook  [toggle]  Default        [▶ Preview] [Change] │
└────────────────────────────────────────────────────────┘
```

- **Preview** — plays the current sound for that platform immediately (regardless of toggle state)
- **Change** — opens `dialog.showOpenDialog` via a new IPC call `sounds:pick`, returns selected path, then calls `sounds:setCustom`
- **Reset** — only shown when `notificationSoundPaths[platform] !== null`; calls `sounds:clearCustom`

### `sounds:pick` IPC

Opens `dialog.showOpenDialog` from main process (required — renderer cannot access native dialog directly in contextIsolation mode). Returns the selected file path or `null` if cancelled.

```ts
ipcMain.handle('sounds:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose alert sound',
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
    properties: ['openFile']
  })
  return result.canceled ? null : result.filePaths[0]
})
```

Preload: `pickSoundFile(): Promise<string | null>`

---

## New Files

- `src/renderer/audio/tones.ts` — `playDefaultTone(platform: Platform): void`

## Modified Files

- `src/shared/types.ts` — add `notificationSoundPaths` to `AppSettings` and `DEFAULT_SETTINGS`
- `src/main/ipc-handlers.ts` — add `sounds:setCustom`, `sounds:clearCustom`, `sounds:pick`
- `src/preload/index.ts` — expose `setCustomSound`, `clearCustomSound`, `pickSoundFile`
- `src/renderer/hooks/useChat.ts` — use `notificationSoundPaths` for playback
- `src/renderer/components/ChatFeed.tsx` — pass `notificationSoundPaths` to `useChat`
- `src/renderer/App.tsx` — load and track `notificationSoundPaths` from settings
- `src/renderer/pages/Settings.tsx` — expand notification sounds UI

## Test Files

- `tests/renderer/audio/tones.test.ts` — tone generator produces sound without throwing
- `tests/renderer/hooks/useChat.test.ts` — plays custom path when set, plays default tone when null, respects toggle
- `tests/renderer/pages/Settings.test.tsx` — preview, change, reset button behavior

---

## Error Handling

- If a custom sound file fails to play (e.g. corrupted), log the error and fall back to the default tone silently
- If `sounds:setCustom` fails (disk full, permission error), return the error to the renderer — Settings shows a brief inline error
- If `sounds:pick` is cancelled, nothing changes
