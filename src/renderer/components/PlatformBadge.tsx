import React from 'react'
import type { Platform } from '../../shared/types'

const PLATFORM_COLORS: Record<Platform, string> = {
  twitch: 'bg-purple-600',
  youtube: 'bg-red-600',
  kick: 'bg-green-500',
  tiktok: 'bg-gray-600',
  facebook: 'bg-blue-600'
}

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: 'TW',
  youtube: 'YT',
  kick: 'KI',
  tiktok: 'TK',
  facebook: 'FB'
}

interface Props {
  platform: Platform
}

export default function PlatformBadge({ platform }: Props): React.JSX.Element {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-4 rounded text-[10px] font-bold text-white leading-none ${PLATFORM_COLORS[platform]}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  )
}
