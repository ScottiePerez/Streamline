import { createHash, randomBytes } from 'crypto'
import { shell } from 'electron'

export const TWITCH_CLIENT_ID = 'REPLACE_WITH_YOUR_CLIENT_ID'

const SCOPES = 'chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users'
const REDIRECT_URI = 'https://scottieperez.github.io/Streamline/callback'
const TIMEOUT_MS = 5 * 60 * 1000

let pendingOAuthResolve: ((url: string) => void) | null = null

export function handleOAuthCallback(url: string): void {
  pendingOAuthResolve?.(url)
  pendingOAuthResolve = null
}

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

  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize')
  authUrl.searchParams.set('client_id', TWITCH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  const callbackUrl = await new Promise<string>((resolve, reject) => {
    pendingOAuthResolve = resolve
    const timer = setTimeout(() => {
      pendingOAuthResolve = null
      reject(new Error('Authorization cancelled'))
    }, TIMEOUT_MS)
    shell.openExternal(authUrl.toString()).catch(err => {
      clearTimeout(timer)
      pendingOAuthResolve = null
      reject(err)
    })
    // clear timer once resolved via handleOAuthCallback
    const original = pendingOAuthResolve
    pendingOAuthResolve = (url: string) => { clearTimeout(timer); original(url) }
  })

  const parsed = new URL(callbackUrl)
  const code = parsed.searchParams.get('code')
  if (!code) throw new Error('Authorization failed — please try again')

  const token = await exchangeCode(code, codeVerifier, REDIRECT_URI)
  const username = await fetchUsername(token)
  return { token, username }
}
