import { Button as ReactEmailButton } from '@react-email/components'
import * as React from 'react'

interface ButtonProps {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  color?: string
}

export function Button({ href, children, variant = 'primary', color = '#1e40af' }: ButtonProps) {
  const primaryButton: React.CSSProperties = {
    backgroundColor: color,
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 24px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
  }

  const secondaryButton: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    color: '#374151',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 24px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
  }

  const style = variant === 'primary' ? primaryButton : secondaryButton

  return (
    <ReactEmailButton href={href} style={style}>
      {children}
    </ReactEmailButton>
  )
}

export default Button
