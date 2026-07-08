import { generatePkce, exchangeCode, fetchUsername, TWITCH_CLIENT_ID } from '../../../src/main/auth/twitch-oauth'
import { createHash } from 'crypto'

global.fetch = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('generatePkce', () => {
  it('returns a codeVerifier of 43 base64url chars (32 bytes)', () => {
    const { codeVerifier } = generatePkce()
    expect(/^[A-Za-z0-9\-_]+$/.test(codeVerifier)).toBe(true)
    expect(codeVerifier.length).toBe(43)
  })

  it('codeChallenge is SHA-256 base64url of codeVerifier', () => {
    const { codeVerifier, codeChallenge } = generatePkce()
    const expected = createHash('sha256').update(codeVerifier).digest('base64url')
    expect(codeChallenge).toBe(expected)
  })

  it('generates unique values on each call', () => {
    const a = generatePkce()
    const b = generatePkce()
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
  })
})

describe('exchangeCode', () => {
  it('POSTs to Twitch token endpoint with all required fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123' })
    })
    const token = await exchangeCode('mycode', 'myverifier', 'http://localhost:7373/callback')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://id.twitch.tv/oauth2/token',
      expect.objectContaining({ method: 'POST' })
    )
    const body = new URLSearchParams(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string
    )
    expect(body.get('client_id')).toBe(TWITCH_CLIENT_ID)
    expect(body.get('code')).toBe('mycode')
    expect(body.get('code_verifier')).toBe('myverifier')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('redirect_uri')).toBe('http://localhost:7373/callback')
    expect(token).toBe('tok123')
  })

  it('throws "Authorization failed" when response is not ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
    await expect(
      exchangeCode('bad', 'v', 'http://localhost:7373/callback')
    ).rejects.toThrow('Authorization failed — please try again')
  })
})

describe('fetchUsername', () => {
  it('calls Helix users endpoint with correct Authorization and Client-Id headers', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ display_name: 'StreamerDude' }] })
    })
    const name = await fetchUsername('mytoken')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.twitch.tv/helix/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mytoken',
          'Client-Id': TWITCH_CLIENT_ID
        })
      })
    )
    expect(name).toBe('StreamerDude')
  })

  it('throws "Authorization failed" when response is not ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
    await expect(fetchUsername('badtoken')).rejects.toThrow(
      'Authorization failed — please try again'
    )
  })
})
