import { TikTokAdapter } from '../../../src/main/adapters/tiktok'
import { _getLastInstance, TikTokLiveConnection } from '../../__mocks__/tiktok-live-connector'

describe('TikTokAdapter', () => {
  let adapter: TikTokAdapter

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new TikTokAdapter()
  })

  afterEach(async () => {
    await adapter.disconnect()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('emits connecting then connected on connect()', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })
    expect(statuses).toEqual(['connecting', 'connected'])
    expect(adapter.getStatus()).toBe('connected')
  })

  it('passes the username to TikTokLiveConnection', async () => {
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'xqcow' })
    expect(TikTokLiveConnection).toHaveBeenCalledWith('xqcow')
  })

  it('emits messages from chat event', async () => {
    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })

    const conn = _getLastInstance()!
    conn._emit('chat', {
      userId: 'uid123',
      uniqueId: 'tiktokstar',
      nickname: 'TikTok Star',
      profilePictureUrl: 'https://example.com/pic.jpg',
      comment: 'Great stream!'
    })

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Great stream!')
    expect(messages[0].platform).toBe('tiktok')
    expect(messages[0].userId).toBe('uid123')
    expect(messages[0].username).toBe('tiktokstar')
    expect(messages[0].displayName).toBe('TikTok Star')
    expect(messages[0].avatarUrl).toBe('https://example.com/pic.jpg')
    expect(messages[0].badges).toEqual([])
    expect(messages[0].isDeleted).toBe(false)
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })
    await adapter.disconnect()
    const conn = _getLastInstance()!
    expect(conn.disconnect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('throws on sendMessage', async () => {
    await expect(adapter.sendMessage('ch', 'hi')).rejects.toThrow(
      'TikTok: sending messages is not supported via unofficial API'
    )
  })

  it('throws on deleteMessage', async () => {
    await expect(adapter.deleteMessage('id')).rejects.toThrow(
      'TikTok: deleting messages is not supported via unofficial API'
    )
  })

  it('throws on timeoutUser', async () => {
    await expect(adapter.timeoutUser('uid', 60)).rejects.toThrow(
      'TikTok: timeout is not supported via unofficial API'
    )
  })

  it('throws on banUser', async () => {
    await expect(adapter.banUser('uid')).rejects.toThrow(
      'TikTok: ban is not supported via unofficial API'
    )
  })

  it('triggers reconnect on disconnected event', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'tiktok', token: '', channelId: 'testuser' })

    const conn = _getLastInstance()!
    conn._emit('disconnected')

    expect(statuses).toContain('reconnecting')
  })
})
