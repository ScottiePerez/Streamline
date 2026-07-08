jest.mock('keytar')

import { getToken, setToken, deleteToken } from '../../../src/main/auth/keychain'
import keytar from 'keytar'

const mockKeytar = keytar as any

beforeEach(() => { mockKeytar._reset() })

describe('keychain', () => {
  it('returns null when no token stored', async () => {
    const token = await getToken('twitch')
    expect(token).toBeNull()
  })

  it('stores and retrieves a token', async () => {
    await setToken('twitch', 'oauth:abc123')
    const token = await getToken('twitch')
    expect(token).toBe('oauth:abc123')
  })

  it('deletes a token', async () => {
    await setToken('youtube', 'token-xyz')
    await deleteToken('youtube')
    const token = await getToken('youtube')
    expect(token).toBeNull()
  })

  it('stores tokens per platform independently', async () => {
    await setToken('twitch', 'twitch-token')
    await setToken('youtube', 'youtube-token')
    expect(await getToken('twitch')).toBe('twitch-token')
    expect(await getToken('youtube')).toBe('youtube-token')
  })
})
