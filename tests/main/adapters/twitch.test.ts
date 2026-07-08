import { TwitchAdapter } from '../../../src/main/adapters/twitch'
import type { Credentials, ChatMessage } from '../../../src/shared/types'

jest.mock('tmi.js', () => jest.requireActual('../../__mocks__/tmi.js'))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('tmi.js') as typeof import('../../__mocks__/tmi.js')

const credentials: Credentials = {
  platform: 'twitch',
  token: 'oauth:testtoken',
  channelId: 'testchannel',
  username: 'testbot'
}

describe('TwitchAdapter', () => {
  let adapter: TwitchAdapter
  let mockClient: InstanceType<typeof Client>

  beforeEach(async () => {
    Client.mockClear()
    adapter = new TwitchAdapter()
    await adapter.connect(credentials)
    mockClient = Client.mock.results[0]?.value
  })

  it('connects and creates a tmi.js client', () => {
    expect(mockClient.connect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('connected')
  })

  it('emits normalized ChatMessage on tmi.js chat event', () => {
    const received: ChatMessage[] = []
    adapter.on('message', msg => received.push(msg))

    mockClient._emit('chat', '#testchannel', { username: 'viewer1', 'display-name': 'Viewer1', badges: {} }, 'hello', false)

    expect(received).toHaveLength(1)
    expect(received[0].platform).toBe('twitch')
    expect(received[0].text).toBe('hello')
    expect(received[0].username).toBe('viewer1')
    expect(received[0].channelId).toBe('testchannel')
  })

  it('sends a message via client.say', async () => {
    await adapter.sendMessage('testchannel', 'hello from bot')
    expect(mockClient.say).toHaveBeenCalledWith('#testchannel', 'hello from bot')
  })

  it('bans a user', async () => {
    await adapter.banUser('baduser')
    expect(mockClient.ban).toHaveBeenCalledWith('testchannel', 'baduser')
  })

  it('times out a user', async () => {
    await adapter.timeoutUser('baduser', 300)
    expect(mockClient.timeout).toHaveBeenCalledWith('testchannel', 'baduser', 300)
  })

  it('deletes a message', async () => {
    await adapter.deleteMessage('msg-uuid-123')
    expect(mockClient.deletemessage).toHaveBeenCalledWith('testchannel', 'msg-uuid-123')
  })

  it('disconnects', async () => {
    await adapter.disconnect()
    expect(mockClient.disconnect).toHaveBeenCalled()
    expect(adapter.getStatus()).toBe('disconnected')
  })
})
