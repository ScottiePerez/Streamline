// Jest module mock for tiktok-live-connector — provides a controllable
// WebcastPushConnection with a _emit() helper for test events.

type Handler = (...args: unknown[]) => void

export class MockWebcastPushConnection {
  private handlers: Record<string, Handler[]> = {}
  readonly connect = jest.fn().mockResolvedValue(undefined)
  readonly disconnect = jest.fn()

  on(event: string, handler: Handler): void {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
  }

  _emit(event: string, ...args: unknown[]): void {
    ;(this.handlers[event] ?? []).forEach(h => h(...args))
  }
}

let lastInstance: MockWebcastPushConnection | null = null

export const TikTokLiveConnection = jest.fn().mockImplementation(() => {
  lastInstance = new MockWebcastPushConnection()
  return lastInstance
})

// Alias kept for backwards-compatible test imports
export const WebcastPushConnection = TikTokLiveConnection

export function _getLastInstance(): MockWebcastPushConnection | null {
  return lastInstance
}
