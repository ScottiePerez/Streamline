import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from '../../../src/renderer/components/FilterBar'
import type { ChatFilters } from '../../../src/renderer/hooks/useChat'

const ALL_PLATFORMS = ['twitch', 'youtube', 'kick', 'tiktok', 'facebook']

describe('FilterBar', () => {
  it('renders all platform toggle buttons', () => {
    render(<FilterBar filters={{}} onChange={jest.fn()} />)
    ALL_PLATFORMS.forEach(p => {
      expect(screen.getByRole('button', { name: new RegExp(p, 'i') })).toBeInTheDocument()
    })
  })

  it('calls onChange with platform filter when a platform is clicked', async () => {
    const onChange = jest.fn()
    render(<FilterBar filters={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /twitch/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ platforms: ['twitch'] }))
  })

  it('deselects a platform on second click', async () => {
    const onChange = jest.fn()
    const filters: ChatFilters = { platforms: ['twitch'] }
    render(<FilterBar filters={filters} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /twitch/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ platforms: [] }))
  })

  it('calls onChange with keyword when typing in search', async () => {
    const onChange = jest.fn()
    render(<FilterBar filters={{}} onChange={onChange} />)
    const input = screen.getByPlaceholderText(/search/i)
    await userEvent.type(input, 'hello')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'hello' }))
  })
})
