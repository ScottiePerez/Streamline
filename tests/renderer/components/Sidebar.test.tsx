import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from '../../../src/renderer/components/Sidebar'

describe('Sidebar — settings nav', () => {
  it('renders Settings nav button', () => {
    render(<Sidebar activeView="chat" onViewChange={jest.fn()} />)
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onViewChange with "settings" when Settings is clicked', async () => {
    const onViewChange = jest.fn()
    render(<Sidebar activeView="chat" onViewChange={onViewChange} />)
    await userEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(onViewChange).toHaveBeenCalledWith('settings')
  })
})

describe('Sidebar', () => {
  it('renders navigation links', () => {
    render(<Sidebar activeView="chat" onViewChange={jest.fn()} />)
    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accounts/i })).toBeInTheDocument()
  })

  it('calls onViewChange when a nav item is clicked', async () => {
    const onViewChange = jest.fn()
    render(<Sidebar activeView="chat" onViewChange={onViewChange} />)
    await userEvent.click(screen.getByRole('button', { name: /accounts/i }))
    expect(onViewChange).toHaveBeenCalledWith('accounts')
  })

  it('highlights the active view', () => {
    render(<Sidebar activeView="accounts" onViewChange={jest.fn()} />)
    const accountsBtn = screen.getByRole('button', { name: /accounts/i })
    expect(accountsBtn.className).toContain('bg-')
  })
})
