import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageRow from '../../../src/renderer/components/MessageRow'
import type { ChatMessage } from '../../../src/shared/types'

const msg: ChatMessage = {
  id: 'msg1', platform: 'twitch', channelId: 'chan', userId: 'u1',
  username: 'viewer1', displayName: 'Viewer1', avatarUrl: '',
  text: 'hello chat', timestamp: 1700000000000, isDeleted: false, badges: []
}

describe('MessageRow', () => {
  it('renders the message text', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} />)
    expect(screen.getByText('hello chat')).toBeInTheDocument()
  })

  it('renders the display name', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} />)
    expect(screen.getByText('Viewer1')).toBeInTheDocument()
  })

  it('shows deleted style when isDeleted=true', () => {
    const deleted = { ...msg, isDeleted: true }
    render(<MessageRow message={deleted} onModerate={jest.fn()} />)
    const row = screen.getByTestId('message-row')
    expect(row.className).toContain('opacity')
  })
})
