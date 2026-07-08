const KICK_API = 'https://kick.com/api/v2'

export interface KickChannelInfo {
  username: string
  displayName: string
}

export async function validateKickChannel(slug: string): Promise<KickChannelInfo> {
  const res = await fetch(`${KICK_API}/channels/${slug}`, {
    headers: { 'Accept': 'application/json' }
  })
  if (res.status === 404) throw new Error(`Kick channel '${slug}' not found`)
  if (!res.ok) throw new Error(`Kick: could not reach channel (${res.status})`)
  const data = await res.json() as { slug: string; user: { username: string } }
  return {
    username: data.user?.username ?? slug,
    displayName: data.user?.username ?? slug
  }
}
