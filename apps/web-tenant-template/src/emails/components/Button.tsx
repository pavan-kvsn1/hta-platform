import { Button as ReactEmailButton } from '@react-email/components'
import * as React from 'react'

interface ButtonProps {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
}

export function Button({ href, children, variant = 'primary' }: ButtonProps) {
  const style = variant === 'primary' ? primaryButton : secondaryButton

  return (
    <ReactEmailButton href={href} style={style}>
      {children}
    </ReactEmailButton>
  )
}

const primaryButton: React.CSSProperties = {
  backgroundColor: '#1e40af',
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

export default Button
