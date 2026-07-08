import { YouTubeAdapter } from '../../../src/main/adapters/youtube'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { google, _mocks } = require('googleapis') as typeof import('../../__mocks__/googleapis')

jest.useFakeTimers()

describe('YouTubeAdapter', () => {
  let adapter: YouTubeAdapter

  const ACTIVE_BROADCAST_RESPONSE = {
    data: {
      items: [{
        id: 'broadcast1',
        status: { lifeCycleStatus: 'live' },
        snippet: { liveChatId: 'chatId123' }
      }]
    }
  }

  const EMPTY_POLL_RESPONSE = {
    data: { items: [], nextPageToken: null, pollingIntervalMillis: 60000 }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    adapter = new YouTubeAdapter()
    _mocks.liveBroadcastsList.mockResolvedValue(ACTIVE_BROADCAST_RESPONSE)
    _mocks.liveChatMessagesList.mockResolvedValue(EMPTY_POLL_RESPONSE)
  })

  afterEach(async () => {
    await adapter.disconnect()
    jest.clearAllTimers()
  })

  it('starts disconnected', () => {
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('emits connecting then connected', async () => {
    const statuses: string[] = []
    adapter.on('status', s => statuses.push(s))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    expect(statuses).toEqual(['connecting', 'connected'])
    expect(adapter.getStatus()).toBe('connected')
  })

  it('throws when no active broadcast', async () => {
    _mocks.liveBroadcastsList.mockResolvedValue({ data: { items: [] } })
    await expect(
      adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    ).rejects.toThrow('No active YouTube live broadcast found')
  })

  it('emits chat messages from poll', async () => {
    _mocks.liveChatMessagesList
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: 'msg1',
            snippet: {
              type: 'textMessageEvent',
              publishedAt: '2024-01-01T00:00:00.000Z',
              textMessageDetails: { messageText: 'hello world' }
            },
            authorDetails: {
              channelId: 'userId1',
              displayName: 'TestUser',
              profileImageUrl: 'https://example.com/avatar.jpg',
              isChatModerator: false,
              isChatOwner: false,
              isChatSponsor: false
            }
          }],
          nextPageToken: 'page2',
          pollingIntervalMillis: 60000
        }
      })
      .mockResolvedValue(EMPTY_POLL_RESPONSE)

    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    // Let the scheduled poll execute
    await jest.runOnlyPendingTimersAsync()

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('hello world')
    expect(messages[0].platform).toBe('youtube')
    expect(messages[0].username).toBe('TestUser')
    expect(messages[0].avatarUrl).toBe('https://example.com/avatar.jpg')
    expect(messages[0].isDeleted).toBe(false)
  })

  it('filters non-text-message events from poll', async () => {
    _mocks.liveChatMessagesList.mockResolvedValueOnce({
      data: {
        items: [{
          id: 'sc1',
          snippet: { type: 'superChatEvent', publishedAt: '2024-01-01T00:00:00.000Z' },
          authorDetails: { channelId: 'u1', displayName: 'Donor' }
        }],
        pollingIntervalMillis: 60000
      }
    }).mockResolvedValue(EMPTY_POLL_RESPONSE)

    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await jest.runOnlyPendingTimersAsync()
    expect(messages).toHaveLength(0)
  })

  it('attaches moderator badge', async () => {
    _mocks.liveChatMessagesList.mockResolvedValueOnce({
      data: {
        items: [{
          id: 'msg2',
          snippet: { type: 'textMessageEvent', publishedAt: '2024-01-01T00:00:00.000Z', textMessageDetails: { messageText: 'hi' } },
          authorDetails: { channelId: 'u2', displayName: 'Mod', isChatModerator: true, isChatOwner: false, isChatSponsor: false }
        }],
        pollingIntervalMillis: 60000
      }
    }).mockResolvedValue(EMPTY_POLL_RESPONSE)

    const messages: any[] = []
    adapter.on('message', msg => messages.push(msg))
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await jest.runOnlyPendingTimersAsync()
    expect(messages[0].badges).toEqual([{ id: 'moderator', label: 'Moderator' }])
  })

  it('sends a message', async () => {
    _mocks.liveChatMessagesInsert.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.sendMessage('UCxxx', 'hello chat')
    expect(_mocks.liveChatMessagesInsert).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: 'chatId123',
          type: 'textMessageEvent',
          textMessageDetails: { messageText: 'hello chat' }
        }
      }
    })
  })

  it('deletes a message', async () => {
    _mocks.liveChatMessagesDelete.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.deleteMessage('msgId42')
    expect(_mocks.liveChatMessagesDelete).toHaveBeenCalledWith({ id: 'msgId42' })
  })

  it('times out a user', async () => {
    _mocks.liveChatBansInsert.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.timeoutUser('userId99', 600)
    expect(_mocks.liveChatBansInsert).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: 'chatId123',
          type: 'temporary',
          banDurationSeconds: '600',
          bannedUserDetails: { channelId: 'userId99' }
        }
      }
    })
  })

  it('bans a user permanently', async () => {
    _mocks.liveChatBansInsert.mockResolvedValue({})
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.banUser('userId99')
    expect(_mocks.liveChatBansInsert).toHaveBeenCalledWith({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: 'chatId123',
          type: 'permanent',
          bannedUserDetails: { channelId: 'userId99' }
        }
      }
    })
  })

  it('disconnects cleanly', async () => {
    await adapter.connect({ platform: 'youtube', token: 'tok', channelId: 'UCxxx' })
    await adapter.disconnect()
    expect(adapter.getStatus()).toBe('disconnected')
  })

  it('throws on send when disconnected', async () => {
    await expect(adapter.sendMessage('ch', 'hi')).rejects.toThrow('YouTube not connected')
  })
})
