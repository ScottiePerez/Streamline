# Moderation Log UI — Design Spec

**Date:** 2026-07-08

## Goal

Add a Moderation Log view to Streamline that lets the host review past moderation actions, filter by platform and username, and undo ban/timeout actions with a single button click.

---

## Navigation

- Sidebar gains a fourth nav item: 🛡️ "Mod Log" with `view = 'modlog'`
- `View` type extended in both `Sidebar.tsx` and `App.tsx`: `'chat' | 'accounts' | 'settings' | 'modlog'`

---

## Page Layout

Full-height scrollable page (no max-width cap). Structure:

```
┌─ Filter bar ──────────────────────────────┐
│ Platform: [All ▾]   Username: [________]  │
└────────────────────────────────────────────┘
┌─ Table / list ────────────────────────────┐
│ Platform  │ Action  │ User  │ Mod  │ Time │ Undo │
│ ...rows...                                │
└────────────────────────────────────────────┘
```

Filters are client-side (filter the fetched array in state — no re-fetch on filter change).

---

## Data Fetching

- On mount, call `window.electronAPI.getModerationActions()` (no filters — fetch all, filter client-side)
- Store raw list in state; derive filtered list from platform + username inputs
- No polling or real-time updates (the list is a history log)

---

## Row Layout

Each row (newest first):

| Column | Detail |
|---|---|
| Platform badge | Colored pill — Twitch=purple, YouTube=red, Kick=green, TikTok=gray, Facebook=blue |
| Action badge | Ban=red, Timeout=yellow, Delete=gray |
| Target username | Plain text |
| Moderator name | Muted text |
| Timestamp | `toLocaleString()` |
| Undo button | Enabled for ban/timeout; disabled + title="Cannot undo message delete" for delete |

---

## Undo

**ban/timeout:** Undo button calls a new `mod:unban` IPC handler which:
1. Calls `adapter.unbanUser(userId)` on the adapter for that platform
2. On success, deletes the `moderation_actions` row from the database
3. Returns `{ success: boolean; error?: string }`

On success in the renderer: remove the row from local state (no re-fetch needed).
On failure: show an inline error message below the row (e.g. "Failed to unban: &lt;reason&gt;").

**delete:** Undo button is disabled (`disabled` attribute, `cursor-not-allowed`, `title="Cannot undo message delete"`).

---

## New Backend pieces

### `PlatformAdapter` interface — new method
```ts
unbanUser(userId: string): Promise<void>
```
Added to `src/shared/types.ts`. All 5 adapters implement it (stub that logs a warning if the platform API doesn't support it — not every platform exposes unban; the stub resolves without throwing so the UI doesn't break).

### `deleteModerationAction(db, id)` — new store function
Added to `src/main/store/moderation.ts`:
```ts
export function deleteModerationAction(db: Db, id: string): void {
  db.prepare('DELETE FROM moderation_actions WHERE id = ?').run(id)
}
```

### `ChatBus.unban(platform, userId, actionId)` — new method
Calls `adapter.unbanUser(userId)`, then `deleteModerationAction(db, actionId)`. Returns `{ success, error? }`.

### IPC handler `mod:unban`
```ts
ipcMain.handle('mod:unban', async (_e, platform: Platform, userId: string, actionId: string) =>
  bus.unban(platform, userId, actionId)
)
```

### Preload exposure
```ts
unbanUser(platform: Platform, userId: string, actionId: string): Promise<{ success: boolean; error?: string }> {
  return ipcRenderer.invoke('mod:unban', platform, userId, actionId)
}
```

---

## Filter Behavior

- Platform dropdown: options "All", "Twitch", "YouTube", "Kick", "TikTok", "Facebook". Default "All".
- Username input: case-insensitive substring match on `targetUsername`. Empty = no filter.
- Both filters apply together (AND).

---

## Component File

`src/renderer/pages/ModLog.tsx` — self-contained page, no sub-components needed.

---

## Tests

File: `tests/renderer/pages/ModLog.test.tsx`

Key scenarios:
1. Renders "No moderation actions found." when list is empty
2. Renders rows with correct platform badge, action badge, username, moderator, timestamp
3. Platform dropdown filters rows — selecting "Twitch" hides YouTube rows
4. Username filter hides non-matching rows
5. Undo button is disabled for delete-type rows
6. Undo button for ban row calls `window.electronAPI.unbanUser` and removes the row on success
7. Undo button shows inline error message on failure

---

## Out of Scope

- CSV export (deferred)
- Pagination (list is bounded by `max_messages_per_platform` pruning upstream)
- Real-time updates while the log is open
