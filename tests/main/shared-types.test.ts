import type {
  ChatMessage,
  ModerationAction,
  Platform,
  Credentials,
  ConnectionStatus,
  AppSettings,
  Badge
} from '../../src/shared/types'

describe('shared types', () => {
  it('ChatMessage shape is correct', () => {
    const msg: ChatMessage = {
      id: 'abc',
      platform: 'twitch',
      channelId: 'chan1',
      userId: 'u1',
      username: 'streamer',
      displayName: 'Streamer',
      avatarUrl: 'https://example.com/avatar.png',
      text: 'hello',
      timestamp: Date.now(),
      isDeleted: false,
      badges: []
    }
    expect(msg.platform).toBe('twitch')
  })

  it('ModerationAction shape is correct', () => {
    const action: ModerationAction = {
      id: 'mod1',
      platform: 'twitch',
      type: 'ban',
      targetUserId: 'u2',
      targetUsername: 'baduser',
      moderatorName: 'mod',
      timestamp: Date.now()
    }
    expect(action.type).toBe('ban')
  })
})
