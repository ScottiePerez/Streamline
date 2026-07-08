import { createHash, randomBytes } from 'crypto'
import { shell } from 'electron'

const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl'
const REDIRECT_URI = 'https://scottieperez.github.io/Streamline/callback'
const TIMEOUT_MS = 5 * 60 * 1000

let pendingOAuthResolve: ((url: string) => void) | null = null

export function handleYouTubeOAuthCallback(url: string): void {
  pendingOAuthResolve?.(url)
  pendingOAuthResolve = null
}

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

export async function startYouTubeOAuth(clientId: string): Promise<{ token: string; channelId: string; displayName: string }> {
  const { codeVerifier, codeChallenge } = generatePkce()

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('access_type', 'offline')

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
    const original = pendingOAuthResolve
    pendingOAuthResolve = (url: string) => { clearTimeout(timer); original(url) }
  })

  const parsed = new URL(callbackUrl)
  const code = parsed.searchParams.get('code')
  if (!code) throw new Error('Authorization failed — please try again')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    }).toString()
  })
  if (!tokenRes.ok) {
    const err = await tokenRes.json() as { error_description?: string }
    throw new Error(err.error_description ?? 'Authorization failed — please try again')
  }
  const tokenData = await tokenRes.json() as { access_token: string }
  const token = tokenData.access_token

  // Fetch the user's YouTube channel info
  const channelRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!channelRes.ok) throw new Error('Failed to fetch YouTube channel info')
  const channelData = await channelRes.json() as { items?: Array<{ id: string; snippet: { title: string } }> }
  const channel = channelData.items?.[0]
  if (!channel) throw new Error('No YouTube channel found on this account')

  return {
    token,
    channelId: channel.id,
    displayName: channel.snippet.title
  }
}
