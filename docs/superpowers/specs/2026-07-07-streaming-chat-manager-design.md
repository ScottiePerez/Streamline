# Streaming Chat Manager — Design Spec

**Date:** 2026-07-07  
**Status:** Approved

---

## Overview

A desktop application that aggregates live chat from Twitch, YouTube, Kick, TikTok, and Facebook into a single unified interface. Supports full two-way interaction: reading, replying, and moderating (timeout, ban, delete) across all platforms from one place. Built for solo streamers, moderation teams, and distribution to other streamers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript |
| Styling | Tailwind CSS |
| Local DB | SQLite via `better-sqlite3` |
| Auth tokens | OS keychain via `keytar` |
| IPC | Electron `contextBridge` |
| Team mode | Local WebSocket server (`ws`) |
| Twitch | `tmi.js` (IRC/WebSocket) |
| YouTube | YouTube Live Chat API (polling) |
| Kick | Unofficial WebSocket (Pusher-based) |
| TikTok | Unofficial WebSocket library |
| Facebook | Facebook Graph API (polling) |

---

## Architecture

The app is divided into three layers:

### 1. Main Process (Node.js)

Owns all platform connections and local data. Never exposed directly to the renderer.

- **Platform Adapters** — one per platform, each implementing a common `PlatformAdapter` interface:
  ```ts
  interface PlatformAdapter {
    connect(credentials: Credentials): Promise<void>
    disconnect(): Promise<void>
    sendMessage(channelId: string, text: string): Promise<void>
    deleteMessage(messageId: string): Promise<void>
    timeoutUser(userId: string, duration: number): Promise<void>
    banUser(userId: string): Promise<void>
    on(event: 'message' | 'error' | 'status', handler: Function): void
  }
  ```
- **ChatBus** — central message broker. Receives normalized `ChatMessage` objects from all adapters, writes to SQLite, broadcasts to renderer via IPC, and routes outbound commands to the correct adapter.
- **SQLite Store** — persists messages, moderation log, user profiles, and settings.
- **Team Server** — optional local WebSocket server for mod clients on the LAN.

### 2. Preload Bridge

Thin IPC layer using Electron's `contextBridge`. Exposes a safe, typed API to the renderer — no direct Node.js access from UI code.

### 3. Renderer Process (React/TypeScript)

Receives chat events via IPC, renders the UI, sends commands back through IPC. No platform API calls happen here.

---

## Data Models

### ChatMessage (normalized across all platforms)

```ts
interface ChatMessage {
  id: string
  platform: 'twitch' | 'youtube' | 'kick' | 'tiktok' | 'facebook'
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
```

### ModerationAction

```ts
interface ModerationAction {
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
```

---

## Data Flow

### Inbound (platform → UI)

```
Platform API → Adapter → ChatBus → SQLite (write) + IPC broadcast → React UI
```

### Outbound (UI → platform)

```
React UI → IPC → ChatBus → Platform Adapter → Platform API
Result (success/failure) → IPC → UI (inline toast on message row)
```

---

## Core Features

### Unified Chat Feed

- Single scrollable feed aggregating all platform messages
- Each message shows: platform badge (color-coded), avatar, username, text, timestamp
- Filter bar: filter by platform, keyword, or username
- On app launch, last N messages per platform loaded from SQLite (feed is never blank)

### Per-Platform Panels

- Optional side-by-side view, one column per platform
- Toggle individual platforms on/off
- Useful for mods focusing on one platform at a time

### Reply & Moderation

- Single input bar at the bottom
- Platform selector: choose one or multiple platforms to reply to simultaneously
- Right-click any message for context menu: Reply, Delete, Timeout, Ban
- Failed actions surface as inline toast: "Ban failed — insufficient permissions"
- Platform auth errors auto-open Account Manager

### Account Manager

- OAuth flow per platform, launched in a separate Electron window (or system browser)
- Tokens stored encrypted via OS keychain (`keytar`)
- Per-platform connection status: Connected / Reconnecting / Error
- Reconnection uses exponential backoff; outbound commands queue during reconnect and replay on restore

### User Profiles

- Click any username to open a sidebar
- Shows all messages from that user across all platforms in the current session
- Shows moderation history for that user

### Moderation Log

- Persistent log of all moderation actions: timestamp, platform, action, target, moderator, reason
- Filterable and exportable as CSV

### Settings

- Theme (dark/light)
- Feed font size
- Notification sounds per platform
- Max messages stored in SQLite (default: 10,000 per platform)
- Team mode toggle + PIN/join code display

---

## Team Mode

### Host

- Runs the full app with all platform OAuth connections
- Spins up a local WebSocket server on a configurable LAN port
- Displays a PIN or auto-generated join code for mods to enter
- Can see which mods are connected and disconnect them

### Moderator (mod client)

- Connects to host via LAN IP + join code
- Gets full read access to unified feed
- Can reply and moderate, but cannot change platform connections or settings
- Never receives or stores OAuth tokens

### Permissions

| Role | Read | Reply | Moderate | Settings | Disconnect Platforms |
|---|---|---|---|---|---|
| Host | ✓ | ✓ | ✓ | ✓ | ✓ |
| Moderator | ✓ | ✓ | ✓ | ✗ | ✗ |

Moderation log records the moderator's name for every action.

---

## Persistence

| Data | Storage | Notes |
|---|---|---|
| Chat messages | SQLite | Capped per platform (configurable) |
| Moderation log | SQLite | Permanent, exportable |
| User profiles | SQLite | Built from message history |
| OAuth tokens | OS keychain (`keytar`) | Never written to SQLite |
| App settings | SQLite | Single settings row |

---

## Platform API Notes

| Platform | Protocol | Official API | Two-Way Support |
|---|---|---|---|
| Twitch | WebSocket / IRC | Yes (Twitch API) | Full |
| YouTube | HTTP polling | Yes (YouTube Data API v3) | Full |
| Kick | WebSocket (Pusher) | Unofficial | Full (subject to breakage) |
| TikTok | WebSocket | Unofficial / Partner program | Full (subject to breakage) |
| Facebook | HTTP polling | Yes (Graph API) | Full |

Platform adapters are isolated modules behind a common interface. When official APIs become available for Kick/TikTok, only the adapter needs to change — no other code is affected.

---

## Error Handling

- **Platform disconnects:** exponential backoff reconnect, outbound commands queued
- **Auth errors:** auto-open Account Manager with the affected platform highlighted
- **Failed moderation actions:** inline toast on the message row
- **SQLite errors:** logged to file, non-fatal — app continues without persistence
- **Team mode client disconnect:** host notified, mod can reconnect without restart

---

## Out of Scope (v1)

- Cloud sync or remote access outside LAN
- Automated moderation / bots
- Stream scheduling or analytics
- Clip creation or VOD management
- Mobile app
