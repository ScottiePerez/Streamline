import React from 'react'
import type { Platform } from '../../shared/types'

const PLATFORM_STYLES: Record<Platform, { bg: string; label: string }> = {
  twitch:   { bg: 'bg-purple-500/20 text-purple-300', label: 'TW' },
  youtube:  { bg: 'bg-red-500/20 text-red-300',       label: 'YT' },
  kick:     { bg: 'bg-green-500/20 text-green-300',   label: 'KI' },
  tiktok:   { bg: 'bg-gray-500/20 text-gray-300',     label: 'TK' },
  facebook: { bg: 'bg-blue-500/20 text-blue-300',     label: 'FB' }
}

interface Props {
  platform: Platform
}

export default function PlatformBadge({ platform }: Props): React.JSX.Element {
  const { bg, label } = PLATFORM_STYLES[platform]
  return (
    <span className={`inline-flex items-center justify-center px-1.5 h-[14px] rounded text-[9px] font-bold leading-none ${bg}`}>
      {label}
    </span>
  )
}
