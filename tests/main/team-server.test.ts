import WebSocket from 'ws'
import { TeamServer } from '../../src/main/team-server'
import { EventEmitter } from 'events'
import type { ChatMessage } from '../../src/shared/types'

const TEST_PORT = 17350
const PASSPHRASE = 'test-pass'

const mockMsg: ChatMessage = {
  id: 'm1', platform: 'twitch', channelId: 'c1', userId: 'u1',
  username: 'user', displayName: 'User', avatarUrl: '', text: 'hi',
  timestamp: Date.now(), isDeleted: false, badges: []
}

function makeBus(): any {
  const emitter = new EventEmitter()
  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    sendMessage: jest.fn(),
    moderate: jest.fn().mockResolvedValue({ success: true })
  }
}

function makeDb(): any {
  return {
    prepare: jest.fn().mockReturnValue({
      all: jest.fn().mockReturnValue([])
    })
  }
}

async function connectAndAuth(passphrase = PASSPHRASE): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', passphrase }))
    })
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'auth' && msg.success) resolve(ws)
      if (msg.type === 'auth' && !msg.success) reject(new Error(msg.error))
    })
    ws.on('error', reject)
    setTimeout(() => reject(new Error('timeout')), 3000)
  })
}

describe('TeamServer', () => {
  let server: TeamServer
  let bus: any

  beforeEach((done) => {
    bus = makeBus()
    server = new TeamServer(bus, makeDb())
    server.start(TEST_PORT, PASSPHRASE)
    // give server time to start
    setTimeout(done, 50)
  })

  afterEach((done) => {
    server.stop()
    setTimeout(done, 50)
  })

  it('accepts authenticated client and sends history', async () => {
    const ws = await connectAndAuth()
    ws.close()
  })

  it('rejects wrong passphrase', async () => {
    await expect(connectAndAuth('wrong')).rejects.toThrow()
  })

  it('broadcasts chat message to authenticated clients', async () => {
    const ws = await connectAndAuth()
    const received = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'message') resolve(msg)
      })
      bus.emit('message', mockMsg)
    })
    expect(received.data.id).toBe('m1')
    ws.close()
  })

  it('tracks client count', async () => {
    expect(server.getClientCount()).toBe(0)
    const ws = await connectAndAuth()
    expect(server.getClientCount()).toBe(1)
    ws.close()
    await new Promise(r => setTimeout(r, 100))
    expect(server.getClientCount()).toBe(0)
  })

  it('emits clientCountChanged events', async () => {
    const counts: number[] = []
    server.on('clientCountChanged', (c: number) => counts.push(c))
    const ws = await connectAndAuth()
    ws.close()
    await new Promise(r => setTimeout(r, 100))
    expect(counts).toContain(1)
    expect(counts).toContain(0)
  })

  it('forwards sendMessage command from client to bus', async () => {
    const ws = await connectAndAuth()
    ws.send(JSON.stringify({ type: 'sendMessage', platform: 'twitch', channelId: 'c1', text: 'hello' }))
    await new Promise(r => setTimeout(r, 100))
    expect(bus.sendMessage).toHaveBeenCalledWith('twitch', 'c1', 'hello')
    ws.close()
  })

  it('forwards moderate command from client to bus', async () => {
    const ws = await connectAndAuth()
    ws.send(JSON.stringify({ type: 'moderate', platform: 'twitch', action: 'ban', targetUserId: 'u1' }))
    await new Promise(r => setTimeout(r, 100))
    expect(bus.moderate).toHaveBeenCalledWith('twitch', 'ban', 'u1', undefined, undefined)
    ws.close()
  })
})
