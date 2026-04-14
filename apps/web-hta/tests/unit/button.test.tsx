/**
 * Button Component Tests
 *
 * Tests for UI Button component behavior.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/button'

describe('Button Component', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeDefined()
  })

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    fireEvent.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        Click me
      </Button>
    )

    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toHaveProperty('disabled', true)

    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('renders different variants', () => {
    const { rerender } = render(<Button variant="default">Default</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="destructive">Destructive</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('renders different sizes', () => {
    const { rerender } = render(<Button size="default">Default</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('renders as child when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    )

    const link = screen.getByRole('link', { name: /link button/i })
    expect(link).toBeDefined()
    expect(link).toHaveProperty('href')
  })
})

describe('Button Accessibility', () => {
  it('has correct role', () => {
    render(<Button>Accessible Button</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDefined()
  })

  it('can be focused', () => {
    render(<Button>Focusable</Button>)

    const button = screen.getByRole('button')
    button.focus()

    expect(document.activeElement).toBe(button)
  })

  it('responds to keyboard events', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Keyboard</Button>)

    const button = screen.getByRole('button')
    button.focus()
    await user.keyboard('{Enter}')

    // Enter key on focused button should trigger click
    expect(handleClick).toHaveBeenCalled()
  })
})
