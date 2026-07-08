// Jest module mock for pusher-js — provides a controllable Pusher client
// with a _getChannel() helper for emitting test events.

type Handler = (...args: unknown[]) => void

export class MockChannel {
  private handlers: Record<string, Handler[]> = {}

  bind(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] ?? []).forEach(h => h(...args))
  }
}

export class MockConnection {
  private handlers: Record<string, Handler[]> = {}

  bind(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] ?? []).forEach(h => h(...args))
  }
}

export class MockPusher {
  readonly connection = new MockConnection()
  private channels: Record<string, MockChannel> = {}
  readonly disconnect = jest.fn()

  subscribe(channelName: string): MockChannel {
    this.channels[channelName] = this.channels[channelName] ?? new MockChannel()
    return this.channels[channelName]
  }

  _getChannel(channelName: string): MockChannel {
    return this.channels[channelName]
  }
}

let lastInstance: MockPusher | null = null

const MockPusherConstructor = jest.fn().mockImplementation(() => {
  lastInstance = new MockPusher()
  return lastInstance
})

export function _getLastInstance(): MockPusher | null {
  return lastInstance
}

export default MockPusherConstructor
