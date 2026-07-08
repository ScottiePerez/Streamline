import { FacebookAdapter } from '../../../src/main/adapters/facebook'

describe('FacebookAdapter', () => {
  let adapter: FacebookAdapter
  let fetchSpy: jest.SpyInstance

  const VIDEO_ID = '987654321'
  const PAGE_ID = '111222333'
  const TOKEN = 'fb-page-token'
  const BASE = 'https://graph.facebook.com/v19.0'

  function makeFetchMock(
    handler: (url: string, init?: RequestInit) => { ok: boolean; json?: unknown }
  ): void {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const { ok, json } = handler(input.toString(), init as RequestInit)
      return {
        ok,
        status: ok ? 200 : 400,
        json: async () => json ?? {},
        text: async () => ''
      } as Response
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    adapter = new FacebookAdapter()
    makeFetchMock(url => {
      if (url.includes(`/${VIDEO_ID}?fields=id,title`)) return { ok: true, json: { id: VIDEO_ID } }
      if (url.includes('/live_comments')) return { ok: true, json: { data: [] } }
      return { ok: true, json: {} }
    })
  })

  afterEach(async () => {
    await adapter.disconnect()
    jest.useRealTimers()
    fetchSpy?.mockRestore()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('emits connecting then connected', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    expect(statuses).toEqual(['connecting', 'connected'])
  })

  it('throws on bad token during connect', async () => {
    makeFetchMock(() => ({ ok: false }))
    await expect(
      adapter.connect({ platform: 'facebook', token: 'bad', channelId: VIDEO_ID })
    ).rejects.toThrow('Facebook auth failed')
  })

  it('polls live_comments and emits messages', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))

    makeFetchMock(url => {
      if (url.includes(`/${VIDEO_ID}?fields=id,title`)) return { ok: true, json: { id: VIDEO_ID } }
      if (url.includes('/live_comments')) {
        return {
          ok: true,
          json: {
            data: [{
              id: 'comment1',
              from: { id: 'user1', name: 'Fan One' },
              message: 'Love this stream!',
              created_time: '2024-01-01T12:00:00+0000'
            }]
          }
        }
      }
      return { ok: true, json: {} }
    })

    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await jest.runOnlyPendingTimersAsync()

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Love this stream!')
    expect(messages[0].platform).toBe('facebook')
    expect(messages[0].userId).toBe('user1')
    expect(messages[0].username).toBe('Fan One')
    expect(messages[0].id).toBe('comment1')
  })

  it('deduplicates comments across polls', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))

    const comment = {
      id: 'comment1',
      from: { id: 'u1', name: 'Fan' },
      message: 'hi',
      created_time: '2024-01-01T12:00:00+0000'
    }

    makeFetchMock(url => {
      if (url.includes(`/${VIDEO_ID}?fields=id,title`)) return { ok: true, json: { id: VIDEO_ID } }
      if (url.includes('/live_comments')) return { ok: true, json: { data: [comment] } }
      return { ok: true, json: {} }
    })

    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    // Two poll cycles
    await jest.runOnlyPendingTimersAsync()
    await jest.runOnlyPendingTimersAsync()

    expect(messages).toHaveLength(1) // not duplicated
  })

  it('sends a comment', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await adapter.sendMessage(VIDEO_ID, 'Hello Facebook!')
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/${VIDEO_ID}/comments?access_token=${TOKEN}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'Hello Facebook!' })
      })
    )
  })

  it('deletes a comment', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await adapter.deleteMessage('comment42')
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/comment42?access_token=${TOKEN}`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('bans a user via page blocked endpoint', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID, userId: PAGE_ID })
    await adapter.banUser('userToBlock')
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/${PAGE_ID}/blocked?access_token=${TOKEN}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user: 'userToBlock' })
      })
    )
  })

  it('throws on banUser when pageId missing', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await expect(adapter.banUser('user1')).rejects.toThrow(
      'Facebook: pageId required in credentials.userId for ban'
    )
  })

  it('throws on timeoutUser', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await expect(adapter.timeoutUser('uid', 60)).rejects.toThrow(
      'Facebook: timeout is not supported via Graph API'
    )
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'facebook', token: TOKEN, channelId: VIDEO_ID })
    await adapter.disconnect()
    expect(adapter.getStatus()).toBe('disconnected')
  })
})
