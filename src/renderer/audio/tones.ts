import type { Platform } from '../../shared/types'

type ToneConfig = {
  frequencies: number[]
  duration: number
  gap?: number
}

const TONES: Record<Platform, ToneConfig> = {
  twitch:   { frequencies: [440],      duration: 0.15 },
  youtube:  { frequencies: [520, 660], duration: 0.08 },
  kick:     { frequencies: [550],      duration: 0.10 },
  tiktok:   { frequencies: [880, 880], duration: 0.06, gap: 0.08 },
}

export function playDefaultTone(platform: Platform): void {
  const AC = (typeof AudioContext !== 'undefined'
    ? AudioContext
    : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined
  if (!AC) return
  const ctx = new AC()
  const config = TONES[platform]
  let startTime = ctx.currentTime

  for (const freq of config.frequencies) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, startTime)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + config.duration)
    osc.start(startTime)
    osc.stop(startTime + config.duration)
    startTime += config.duration + (config.gap ?? 0)
  }
}
