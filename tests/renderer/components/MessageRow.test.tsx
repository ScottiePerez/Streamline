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
    render(<MessageRow message={msg} onModerate={jest.fn()} fontSize="md" />)
    expect(screen.getByText('hello chat')).toBeInTheDocument()
  })

  it('renders the display name', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} fontSize="md" />)
    expect(screen.getByText('Viewer1')).toBeInTheDocument()
  })

  it('shows deleted style when isDeleted=true', () => {
    const deleted = { ...msg, isDeleted: true }
    render(<MessageRow message={deleted} onModerate={jest.fn()} fontSize="md" />)
    const row = screen.getByTestId('message-row')
    expect(row.className).toContain('opacity')
  })
})

describe('MessageRow — fontSize', () => {
  it('applies text-sm class when fontSize is sm', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} fontSize="sm" />)
    expect(screen.getByText('hello chat')).toHaveClass('text-sm')
  })

  it('applies text-base class when fontSize is md', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} fontSize="md" />)
    expect(screen.getByText('hello chat')).toHaveClass('text-base')
  })

  it('applies text-lg class when fontSize is lg', () => {
    render(<MessageRow message={msg} onModerate={jest.fn()} fontSize="lg" />)
    expect(screen.getByText('hello chat')).toHaveClass('text-lg')
  })
})
