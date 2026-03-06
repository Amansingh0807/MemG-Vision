'use client'
import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import StatsPanel from '@/components/StatsPanel'
import EventLog from '@/components/EventLog'
import { useMemGuard } from '@/hooks/useMemGuard'

// Three.js must be loaded client-side only (no SSR)
const HeapCanvas = dynamic(() => import('@/components/HeapCanvas'), { ssr: false })

export default function DashboardPage() {
  const { connected, events, blocks, stats, connect } = useMemGuard('ws://localhost:9001')

  useEffect(() => {
    const ws = connect()
    return () => ws?.close()
  }, [connect])

  return (
    <div className="h-screen w-screen flex flex-col bg-mg-bg overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-mg-border shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-mg-green font-mono font-bold text-lg tracking-tight">MEM</span>
          <span className="text-mg-text font-mono font-light text-lg tracking-tight">GUARD</span>
          <span className="text-mg-muted font-mono text-xs ml-1 self-end mb-0.5">VISION</span>
        </div>

        <div className="h-5 w-px bg-mg-border mx-2" />

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-mg-green pulse-dot' : 'bg-mg-muted'}`}
          />
          <span className="text-xs font-mono text-mg-muted">
            {connected ? 'Connected · ws://localhost:9001' : 'Waiting for C++ backend…'}
          </span>
        </div>

        {/* Quick stat badges */}
        <div className="ml-auto flex items-center gap-4">
          {[
            { label: 'ALLOCS', value: stats.totalAllocs, color: '#00ff88' },
            { label: 'FREES',  value: stats.totalFrees,  color: '#5a7090' },
            { label: 'LEAKS',  value: stats.leaksFound,  color: '#ffaa00' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-right">
              <p className="text-xs font-mono text-mg-muted">{label}</p>
              <p className="font-mono font-bold text-base leading-none" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="flex-1 flex gap-3 p-3 min-h-0">

        {/* Left: Stats */}
        <StatsPanel stats={stats} liveBlocks={blocks.size} />

        {/* Center: 3D Canvas */}
        <div className="flex-1 mg-panel overflow-hidden relative min-w-0">
          {/* Scanlines overlay */}
          <div className="absolute inset-0 scanlines z-10 pointer-events-none opacity-30" />

          {/* Status overlay when not connected */}
          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 gap-3">
              <div className="w-8 h-8 border-2 border-mg-green border-t-transparent rounded-full animate-spin" />
              <p className="text-mg-muted text-sm font-mono">
                Connecting to ws://localhost:9001
              </p>
              <p className="text-mg-muted text-xs font-mono opacity-60">
                Run: <span className="text-mg-green">.\memguard_demo_ws.exe</span>
              </p>
            </div>
          )}

          {/* Live block count badge */}
          <div className="absolute top-3 right-3 z-20 mg-panel px-3 py-1.5 text-xs font-mono text-mg-muted">
            <span className="text-mg-blue font-bold">{blocks.size}</span> live blocks
          </div>

          <HeapCanvas blocks={blocks} />
        </div>

        {/* Right: Event Log */}
        <EventLog events={events} />
      </main>

      {/* ── Footer ── */}
      <footer className="px-5 py-2 border-t border-mg-border text-xs font-mono text-mg-muted flex justify-between shrink-0">
        <span>MemGuard Vision · Phase 2 · Real-time Heap Monitor</span>
        <span>Drag to orbit · Scroll to zoom · events: {events.length}</span>
      </footer>
    </div>
  )
}
