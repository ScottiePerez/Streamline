import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReplyBar from '../../../src/renderer/components/ReplyBar'

const mockSendMessage = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  window.electronAPI = {
    sendMessage: mockSendMessage,
    onMessage: jest.fn(() => jest.fn()),
    onModResult: jest.fn(() => jest.fn()),
    onPlatformStatus: jest.fn(() => jest.fn()),
    moderate: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({}),
    setSettings: jest.fn(),
    getToken: jest.fn(),
    setToken: jest.fn(),
    deleteToken: jest.fn(),
    getModerationActions: jest.fn(),
    exportModerationCsv: jest.fn()
  } as unknown as typeof window.electronAPI
  mockSendMessage.mockClear()
})

describe('ReplyBar', () => {
  it('renders text input and send button', () => {
    render(<ReplyBar channelId="testchannel" />)
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('sends message to selected platforms on submit', async () => {
    render(<ReplyBar channelId="testchannel" />)
    const input = screen.getByPlaceholderText(/message/i)
    await userEvent.type(input, 'hello chat')
    fireEvent.submit(input.closest('form')!)
    expect(mockSendMessage).toHaveBeenCalledWith('twitch', 'testchannel', 'hello chat')
  })

  it('clears input after send', async () => {
    render(<ReplyBar channelId="testchannel" />)
    const input = screen.getByPlaceholderText(/message/i) as HTMLInputElement
    await userEvent.type(input, 'hello')
    fireEvent.submit(input.closest('form')!)
    expect(input.value).toBe('')
  })

  it('does not send when input is empty', async () => {
    render(<ReplyBar channelId="testchannel" />)
    const form = screen.getByRole('button', { name: /send/i }).closest('form')!
    fireEvent.submit(form)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
