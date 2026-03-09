import type { Metadata } from 'next'
import { Orbitron, VT323 } from 'next/font/google'
import './globals.css'

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['400', '500', '700', '900']
})

const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
})

export const metadata: Metadata = {
  title: 'MEMGUARD VISION [SYSTEM.ONLINE]',
  description: 'Cyberpunk 3D Memory Profiler',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${vt323.variable}`}>
      <body>{children}</body>
    </html>
  )
}
