import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const enableAnalytics = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === 'true'

export const metadata: Metadata = {
  title: 'TrustPause — The Ambient Human Firewall',
  description: 'A calm, privacy-first safety layer that pauses risky digital decisions before they matter.',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#111514',
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="bg-background"><body className="antialiased">{children}{enableAnalytics && <Analytics />}</body></html>
}
