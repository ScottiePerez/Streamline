import { playDefaultTone } from '../../../src/renderer/audio/tones'

describe('playDefaultTone', () => {
  let mockOscillator: {
    connect: jest.Mock
    frequency: { value: number }
    type: OscillatorType
    start: jest.Mock
    stop: jest.Mock
  }
  let mockGain: {
    connect: jest.Mock
    gain: {
      setValueAtTime: jest.Mock
      exponentialRampToValueAtTime: jest.Mock
    }
  }
  let mockCtx: {
    currentTime: number
    createOscillator: jest.Mock
    createGain: jest.Mock
    destination: object
  }

  beforeEach(() => {
    mockOscillator = {
      connect: jest.fn(),
      frequency: { value: 0 },
      type: 'sine' as OscillatorType,
      start: jest.fn(),
      stop: jest.fn(),
    }
    mockGain = {
      connect: jest.fn(),
      gain: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn()
      }
    }
    mockCtx = {
      currentTime: 0,
      createOscillator: jest.fn(() => mockOscillator),
      createGain: jest.fn(() => mockGain),
      destination: {}
    }
    ;(global as Record<string, unknown>).AudioContext = jest.fn(() => mockCtx)
  })

  afterEach(() => {
    delete (global as Record<string, unknown>).AudioContext
  })

  it('plays twitch tone without throwing', () => {
    expect(() => playDefaultTone('twitch')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('plays two notes for youtube', () => {
    expect(() => playDefaultTone('youtube')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('plays two notes for tiktok', () => {
    expect(() => playDefaultTone('tiktok')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('does not throw when AudioContext is unavailable', () => {
    delete (global as Record<string, unknown>).AudioContext
    expect(() => playDefaultTone('twitch')).not.toThrow()
  })

  it('plays kick tone without throwing', () => {
    expect(() => playDefaultTone('kick')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('plays facebook tone without throwing', () => {
    expect(() => playDefaultTone('facebook')).not.toThrow()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1)
  })
})
