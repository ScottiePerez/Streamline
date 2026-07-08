import { createHash, randomBytes } from 'crypto'
import { createServer } from 'http'
import { shell } from 'electron'

export const TWITCH_CLIENT_ID = 'REPLACE_WITH_YOUR_CLIENT_ID'

const SCOPES = 'chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users'
const REDIRECT_PORTS = [7373, 7374, 7375, 7376, 7377]
const TIMEOUT_MS = 5 * 60 * 1000

export interface PkceParams {
  codeVerifier: string
  codeChallenge: string
}

export function generatePkce(): PkceParams {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }).toString()
  })
  if (!res.ok) throw new Error('Authorization failed — please try again')
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function fetchUsername(token: string): Promise<string> {
  const res = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': TWITCH_CLIENT_ID
    }
  })
  if (!res.ok) throw new Error('Authorization failed — please try again')
  const data = await res.json() as { data: Array<{ display_name: string }> }
  return data.data[0]?.display_name ?? ''
}

export async function startTwitchOAuth(): Promise<{ token: string; username: string }> {
  const { codeVerifier, codeChallenge } = generatePkce()

  let port: number | null = null
  for (const p of REDIRECT_PORTS) {
    if (await isPortAvailable(p)) { port = p; break }
  }
  if (port === null) {
    throw new Error('Could not start auth server — close other apps and try again')
  }

  const redirectUri = `http://localhost:${port}/callback`
  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize')
  authUrl.searchParams.set('client_id', TWITCH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  await shell.openExternal(authUrl.toString())

  const code = await waitForCode(port, TIMEOUT_MS)
  if (code === null) throw new Error('Authorization cancelled')

  const token = await exchangeCode(code, codeVerifier, redirectUri)
  const username = await fetchUsername(token)
  return { token, username }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const srv = createServer()
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)))
    srv.on('error', () => resolve(false))
  })
}

function waitForCode(port: number, timeoutMs: number): Promise<string | null> {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      const url = new URL(req.url ?? '', `http://localhost:${port}`)
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return }
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<p>Authorization successful, you can close this tab.</p>')
      srv.close()
      clearTimeout(timer)
      resolve(code)
    })
    srv.listen(port, '127.0.0.1')
    const timer = setTimeout(() => { srv.close(); resolve(null) }, timeoutMs)
  })
}
