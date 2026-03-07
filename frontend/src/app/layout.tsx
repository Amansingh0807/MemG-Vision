import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title: 'MemGuard Vision – Live Heap Monitor',
  description: 'Real-time 3D memory visualization — allocations, leaks, buffer overflows.',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
