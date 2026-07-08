# Twitch OAuth Design

**Date:** 2026-07-08  
**Status:** Approved

## Goal

Replace the `window.prompt()` paste-token flow for Twitch with a proper Authorization Code + PKCE OAuth flow. The user clicks Connect, approves in their browser, and the token is stored automatically — no copying or pasting required.

## Scope

Twitch only. Other platforms (YouTube, Kick, TikTok, Facebook) continue to use their existing flows and are out of scope.

## Architecture

Five files are touched:

| File | Change |
|------|--------|
| `src/main/auth/twitch-oauth.ts` | **New.** Owns the entire OAuth flow: PKCE generation, localhost HTTP server, browser open, code exchange, username fetch |
| `src/main/ipc-handlers.ts` | Add one handler: `twitch:startOAuth` |
| `src/preload/index.ts` | Expose `startTwitchOAuth(): Promise<string>` (returns Twitch username) |
| `src/renderer/pages/AccountManager.tsx` | Twitch "Connect" button calls `startTwitchOAuth()` instead of `window.prompt()`; shows username and inline errors |
| `src/shared/types.ts` | Add `twitchUsername?: string` to `AppSettings` |

## OAuth Flow (step by step)

1. Renderer calls `window.electronAPI.startTwitchOAuth()`
2. Main process generates PKCE pair:
   - `code_verifier`: 32 random bytes, base64url-encoded
   - `code_challenge`: SHA-256 of `code_verifier`, base64url-encoded
3. Main process starts an HTTP server on `localhost:7373` (tries ports 7373–7377 if busy)
4. Main process calls `shell.openExternal()` with the Twitch authorization URL:
   ```
   https://id.twitch.tv/oauth2/authorize
     ?client_id=<TWITCH_CLIENT_ID>
     &redirect_uri=http://localhost:<port>/callback
     &response_type=code
     &scope=chat:read+chat:edit+moderator:manage:chat_messages+moderator:manage:banned_users
     &code_challenge=<code_challenge>
     &code_challenge_method=S256
   ```
5. User logs in to Twitch (or is already logged in) and clicks Authorize
6. Twitch redirects to `http://localhost:<port>/callback?code=<auth_code>`
7. HTTP server captures the `code`, responds with a plain "Authorization successful, you can close this tab." page, then shuts down
8. Main process POSTs to `https://id.twitch.tv/oauth2/token` with `code`, `code_verifier`, `client_id`, `redirect_uri`, `grant_type=authorization_code`
9. Main process fetches username from `https://api.twitch.tv/helix/users` using the new token
10. Token stored via `keytar.setPassword('streamchat-app', 'twitch', token)`
11. Username stored via `setSettings(db, { twitchUsername: username })`
12. IPC resolves with the username string
13. AccountManager shows "Connected as \<username\>"

## Configuration

`TWITCH_CLIENT_ID` is the only value bundled in the app. It is not a secret and is safe to ship in the Electron binary.

The developer must:
1. Register an app at dev.twitch.tv/console
2. Set the OAuth redirect URL to `http://localhost:7373` (and 7374–7377 as extras)
3. Copy the Client ID into the app

The Client ID is stored as a constant in `src/main/auth/twitch-oauth.ts`. It is **not** stored in the database or keychain.

## Scopes

| Scope | Purpose |
|-------|---------|
| `chat:read` | Receive chat messages |
| `chat:edit` | Send messages via ReplyBar |
| `moderator:manage:chat_messages` | Delete messages |
| `moderator:manage:banned_users` | Timeout and ban users |

## Error Handling

All errors are surfaced inline in the AccountManager Twitch row — no modals or alerts.

| Condition | UI message |
|-----------|-----------|
| User closes browser / no callback after 5 minutes | "Authorization cancelled" |
| Ports 7373–7377 all in use | "Could not start auth server — close other apps and try again" |
| Token exchange fails (network error, bad code) | "Authorization failed — please try again" |

The IPC handler rejects with an `Error` whose `message` is one of the strings above. AccountManager catches it and renders the message in a `<p className="text-red-400 text-xs">` below the Twitch row.

## AccountManager UI changes

- Twitch row: `handleConnect('twitch')` calls `startTwitchOAuth()` instead of `window.prompt()`
- On success: display "Connected as \<username\>" under the Twitch platform label
- On error: display the error message string in red below the row
- `twitchUsername` is loaded from settings on mount alongside the token check

No changes to Disconnect — it continues to call `deleteToken('twitch')` and also clears `twitchUsername` via `setSettings({ twitchUsername: undefined })`.

## Testing

**Unit tests (`tests/main/auth/twitch-oauth.test.ts`):**
- `generatePkce()` returns a verifier of correct length and a challenge that is the SHA-256 base64url of the verifier
- `exchangeCode()` POSTs to the correct Twitch endpoint with all required fields (mocked `fetch`)
- `fetchUsername()` calls the Helix users endpoint with the correct `Authorization` and `Client-Id` headers (mocked `fetch`)

**Renderer tests (`tests/renderer/pages/AccountManager.test.tsx`):**
- Twitch Connect button calls `startTwitchOAuth` (not `window.prompt`)
- On success: displays "Connected as testuser"
- On failure: displays the error message inline

**Manual QA:**
- Full end-to-end flow with a real Twitch Developer app and account
- Verify token is stored in macOS Keychain
- Verify chat connects automatically after OAuth completes
- Verify Disconnect clears the token and username

## Security Notes

- PKCE (`code_challenge_method=S256`) ensures that even if another process on the machine captures the auth code from the localhost redirect, it cannot exchange it for a token without the `code_verifier` that only the app holds
- The Client ID is public and non-sensitive
- No client secret is used (not required for Authorization Code + PKCE without a backend)
- Token never touches clipboard, a third-party site, or any server outside Twitch and the user's own machine
