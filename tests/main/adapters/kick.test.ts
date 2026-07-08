import { KickAdapter } from '../../../src/main/adapters/kick'
import { _getLastInstance } from '../../__mocks__/pusher-js'

// native fetch is mocked per-test via jest.spyOn

describe('KickAdapter', () => {
  let adapter: KickAdapter
  let fetchSpy: jest.SpyInstance

  const CHANNEL_SLUG = 'testchannel'
  const CHATROOM_ID = 123456
  const TOKEN = 'kick-token-abc'

  function mockFetch(handler: (url: string) => { ok: boolean; json?: () => Promise<unknown> }): void {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = input.toString()
      const result = handler(url)
      return {
        ok: result.ok,
        json: result.json ?? (async () => ({})),
        status: result.ok ? 200 : 400,
        text: async () => ''
      } as Response
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new KickAdapter()
    mockFetch(url => {
      if (url.includes(`/api/v2/channels/${CHANNEL_SLUG}`)) {
        return { ok: true, json: async () => ({ chatroom: { id: CHATROOM_ID } }) }
      }
      return { ok: true }
    })
  })

  afterEach(async () => {
    await adapter.disconnect()
    fetchSpy?.mockRestore()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('resolves chatroom ID and subscribes to Pusher channel', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    const pusher = _getLastInstance()!
    expect(pusher).toBeTruthy()
    const channel = pusher._getChannel(`chatrooms.${CHATROOM_ID}.v2`)
    expect(channel).toBeTruthy()
    expect(adapter.getStatus()).toBe('connected')
  })

  it('emits messages from Pusher chat event', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })

    const pusher = _getLastInstance()!
    const channel = pusher._getChannel(`chatrooms.${CHATROOM_ID}.v2`)
    channel._emit('App\\Events\\ChatMessageEvent', {
      id: 'msg-uuid-1',
      chatroom_id: CHATROOM_ID,
      content: 'Hello Kick!',
      type: 'message',
      created_at: '2024-01-01T12:00:00.000000Z',
      sender: {
        id: 42,
        username: 'KickUser',
        slug: 'kickuser',
        identity: { color: '#FF0000', badges: [{ type: 'subscriber', text: 'Sub' }] }
      }
    })

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello Kick!')
    expect(messages[0].platform).toBe('kick')
    expect(messages[0].username).toBe('kickuser')
    expect(messages[0].displayName).toBe('KickUser')
    expect(messages[0].userId).toBe('42')
    expect(messages[0].badges).toEqual([{ id: 'subscriber', label: 'Sub' }])
  })

  it('sends a message', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.sendMessage(CHANNEL_SLUG, 'test message')
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/messages/send/${CHATROOM_ID}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        body: JSON.stringify({ content: 'test message', type: 'message' })
      })
    )
  })

  it('deletes a message', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.deleteMessage('msg-id-99')
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/channels/${CHATROOM_ID}/messages/msg-id-99`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('times out a user', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.timeoutUser('baduser', 600)
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/channels/${CHATROOM_ID}/bans`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ banned_username: 'baduser', duration: 600, permanent: false })
      })
    )
  })

  it('bans a user permanently', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.banUser('baduser')
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://kick.com/api/v2/channels/${CHATROOM_ID}/bans`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ banned_username: 'baduser', permanent: true })
      })
    )
  })

  it('throws on API error during connect', async () => {
    mockFetch(() => ({ ok: false }))
    await expect(
      adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    ).rejects.toThrow('Kick: failed to resolve channel')
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'kick', token: TOKEN, channelId: CHANNEL_SLUG })
    await adapter.disconnect()
    const pusher = _getLastInstance()!
    expect(pusher.disconnect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('throws on send when disconnected', async () => {
    await expect(adapter.sendMessage(CHANNEL_SLUG, 'hi')).rejects.toThrow('Kick not connected')
  })
})
