import { WebSocketServer, WebSocket } from 'ws'
import { TeamClient } from '../../src/main/team-client'
import { generateInviteCode } from '../../src/main/invite-code'
import type { ChatMessage } from '../../src/shared/types'

const TEST_PORT = 17351
const PASSPHRASE = 'test-pass'
const SALT = 'aabbccdd00112233aabbccdd00112233'

const mockMsg: ChatMessage = {
  id: 'm1', platform: 'twitch', channelId: 'c1', userId: 'u1',
  username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: []
}

function makeFakeServer(port: number, passphrase: string): WebSocketServer {
  const wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'auth' && msg.passphrase === passphrase) {
        ws.send(JSON.stringify({ type: 'auth', success: true }))
        ws.send(JSON.stringify({ type: 'history', messages: [] }))
      } else if (msg.type === 'auth') {
        ws.send(JSON.stringify({ type: 'auth', success: false, error: 'Invalid passphrase' }))
        ws.close()
      }
    })
  })
  return wss
}

describe('TeamClient', () => {
  let fakeServer: WebSocketServer
  let client: TeamClient
  let inviteCode: string

  beforeEach((done) => {
    fakeServer = makeFakeServer(TEST_PORT, PASSPHRASE)
    client = new TeamClient()
    inviteCode = generateInviteCode('127.0.0.1', TEST_PORT, PASSPHRASE, SALT)
    fakeServer.on('listening', done)
  })

  afterEach((done) => {
    client.disconnect()
    fakeServer.close(done)
  })

  it('connects and reaches connected status', async () => {
    await client.connect(inviteCode, PASSPHRASE, SALT)
    expect(client.getStatus()).toBe('connected')
  })

  it('rejects on wrong passphrase', async () => {
    const badCode = generateInviteCode('127.0.0.1', TEST_PORT, 'wrong', SALT)
    await expect(client.connect(badCode, 'wrong', SALT)).rejects.toThrow()
  })

  it('emits message events from server', async () => {
    await client.connect(inviteCode, PASSPHRASE, SALT)
    const received = await new Promise<ChatMessage>((resolve) => {
      client.on('message', resolve)
      const serverWs = [...fakeServer.clients][0] as WebSocket
      serverWs.send(JSON.stringify({ type: 'message', data: mockMsg }))
    })
    expect(received.id).toBe('m1')
  })

  it('emits status changes', async () => {
    const statuses: string[] = []
    client.on('status', (s: string) => statuses.push(s))
    await client.connect(inviteCode, PASSPHRASE, SALT)
    expect(statuses).toContain('connecting')
    expect(statuses).toContain('connected')
  })

  it('starts disconnected', () => {
    expect(client.getStatus()).toBe('disconnected')
  })
})
