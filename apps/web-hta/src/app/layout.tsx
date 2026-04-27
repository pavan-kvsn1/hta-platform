import type { Metadata } from 'next'
import { DM_Sans, DM_Mono, Caveat } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/providers/session-provider'
import { CookieConsent } from '@/components/cookie-consent'
import { tenantConfig } from '@/config/tenant'

const dmSans = DM_Sans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const dmMono = DM_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

const caveat = Caveat({
  variable: '--font-caveat',
  subsets: ['latin'],
  weight: ['600'],
})

export const metadata: Metadata = {
  title: tenantConfig.metadata.title,
  description: tenantConfig.metadata.description,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${dmMono.variable} ${caveat.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
        <CookieConsent />
      </body>
    </html>
  )
}
