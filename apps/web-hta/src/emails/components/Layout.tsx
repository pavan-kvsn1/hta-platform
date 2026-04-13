import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from '@react-email/components'
import * as React from 'react'

interface LayoutProps {
  preview: string
  children: React.ReactNode
}

// Brand colors
const colors = {
  primary: '#1e40af', // Blue
  primaryDark: '#1e3a8a',
  text: '#374151',
  textLight: '#6b7280',
  border: '#e5e7eb',
  background: '#f9fafb',
  white: '#ffffff',
}

export function Layout({ preview, children }: LayoutProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hta-calibration.com'

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with Logo */}
          <Section style={header}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="180"
              height="50"
              alt="HTA Instrumentation"
              style={logo}
            />
          </Section>

          {/* Main Content */}
          <Section style={content}>
            {children}
          </Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              HTA Instrumentation (P) Ltd.
            </Text>
            <Text style={footerAddress}>
              Calibration & Testing Services
            </Text>
            <Text style={footerLinks}>
              <Link href={`${baseUrl}`} style={footerLink}>
                Visit Portal
              </Link>
              {' | '}
              <Link href="mailto:support@htainstrumentation.com" style={footerLink}>
                Contact Support
              </Link>
            </Text>
            <Text style={copyright}>
              © {new Date().getFullYear()} HTA Instrumentation (P) Ltd. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main: React.CSSProperties = {
  backgroundColor: colors.background,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '600px',
}

const header: React.CSSProperties = {
  backgroundColor: colors.white,
  borderRadius: '8px 8px 0 0',
  borderBottom: `3px solid ${colors.primary}`,
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const logo: React.CSSProperties = {
  margin: '0 auto',
}

const content: React.CSSProperties = {
  backgroundColor: colors.white,
  padding: '32px',
}

const divider: React.CSSProperties = {
  borderColor: colors.border,
  margin: '0',
}

const footer: React.CSSProperties = {
  backgroundColor: colors.white,
  borderRadius: '0 0 8px 8px',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const footerText: React.CSSProperties = {
  color: colors.text,
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px',
}

const footerAddress: React.CSSProperties = {
  color: colors.textLight,
  fontSize: '13px',
  margin: '0 0 16px',
}

const footerLinks: React.CSSProperties = {
  color: colors.textLight,
  fontSize: '13px',
  margin: '0 0 16px',
}

const footerLink: React.CSSProperties = {
  color: colors.primary,
  textDecoration: 'none',
}

const copyright: React.CSSProperties = {
  color: colors.textLight,
  fontSize: '12px',
  margin: '0',
}

export default Layout
