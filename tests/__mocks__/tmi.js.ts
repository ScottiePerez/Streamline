type Handler = (...args: unknown[]) => void

class MockClient {
  private handlers: Record<string, Handler[]> = {}
  connect = jest.fn().mockResolvedValue(undefined)
  disconnect = jest.fn().mockResolvedValue(undefined)
  say = jest.fn().mockResolvedValue(undefined)
  ban = jest.fn().mockResolvedValue(undefined)
  timeout = jest.fn().mockResolvedValue(undefined)
  deletemessage = jest.fn().mockResolvedValue(undefined)

  on(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] || []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] || []).forEach(h => h(...args))
  }
}

export const Client = jest.fn(() => new MockClient())
