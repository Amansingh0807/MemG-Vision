import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MemGuard Vision – Live Heap Visualizer',
  description: 'Real-time 3D visualization of memory allocations, leaks, and buffer overflows.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-mg-bg antialiased">{children}</body>
    </html>
  )
}
