import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from '../shared/Skeleton'

describe('Skeleton', () => {
  it('renders with default class', () => {
    const { container } = render(<Skeleton />)
    const el = container.firstChild as HTMLElement
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass('animate-pulse')
  })

  it('renders with custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />)
    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('h-4')
    expect(el).toHaveClass('w-32')
  })

  it('applies custom style', () => {
    const { container } = render(<Skeleton style={{ width: '200px' }} />)
    const el = container.firstChild as HTMLElement
    expect(el).toHaveStyle({ width: '200px' })
  })
})
