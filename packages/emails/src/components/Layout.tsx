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

interface TenantBranding {
  name: string
  logoUrl?: string
  primaryColor?: string
  supportEmail?: string
  websiteUrl?: string
}

interface LayoutProps {
  preview: string
  children: React.ReactNode
  tenant?: TenantBranding
}

const defaultBranding: TenantBranding = {
  name: 'HTA Instrumentation',
  primaryColor: '#1e40af',
  supportEmail: 'support@htainstrumentation.com',
  websiteUrl: process.env.FRONTEND_URL || 'https://hta-calibration.com',
}

export function Layout({ preview, children, tenant = defaultBranding }: LayoutProps) {
  const branding = { ...defaultBranding, ...tenant }
  const baseUrl = branding.websiteUrl || ''

  const colors = {
    primary: branding.primaryColor || '#1e40af',
    text: '#374151',
    textLight: '#6b7280',
    border: '#e5e7eb',
    background: '#f9fafb',
    white: '#ffffff',
  }

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{
        backgroundColor: colors.background,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}>
        <Container style={{
          margin: '0 auto',
          padding: '20px 0 48px',
          maxWidth: '600px',
        }}>
          {/* Header */}
          <Section style={{
            backgroundColor: colors.white,
            borderRadius: '8px 8px 0 0',
            borderBottom: `3px solid ${colors.primary}`,
            padding: '24px 32px',
            textAlign: 'center' as const,
          }}>
            {branding.logoUrl ? (
              <Img
                src={branding.logoUrl}
                width="180"
                height="50"
                alt={branding.name}
                style={{ margin: '0 auto' }}
              />
            ) : (
              <Text style={{
                fontSize: '24px',
                fontWeight: '700',
                color: colors.primary,
                margin: '0',
              }}>
                {branding.name}
              </Text>
            )}
          </Section>

          {/* Main Content */}
          <Section style={{
            backgroundColor: colors.white,
            padding: '32px',
          }}>
            {children}
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: colors.border, margin: '0' }} />
          <Section style={{
            backgroundColor: colors.white,
            borderRadius: '0 0 8px 8px',
            padding: '24px 32px',
            textAlign: 'center' as const,
          }}>
            <Text style={{
              color: colors.text,
              fontSize: '14px',
              fontWeight: '600',
              margin: '0 0 4px',
            }}>
              {branding.name}
            </Text>
            <Text style={{
              color: colors.textLight,
              fontSize: '13px',
              margin: '0 0 16px',
            }}>
              Calibration & Testing Services
            </Text>
            <Text style={{
              color: colors.textLight,
              fontSize: '13px',
              margin: '0 0 16px',
            }}>
              <Link href={baseUrl} style={{ color: colors.primary, textDecoration: 'none' }}>
                Visit Portal
              </Link>
              {branding.supportEmail && (
                <>
                  {' | '}
                  <Link href={`mailto:${branding.supportEmail}`} style={{ color: colors.primary, textDecoration: 'none' }}>
                    Contact Support
                  </Link>
                </>
              )}
            </Text>
            <Text style={{
              color: colors.textLight,
              fontSize: '12px',
              margin: '0',
            }}>
              © {new Date().getFullYear()} {branding.name}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default Layout
