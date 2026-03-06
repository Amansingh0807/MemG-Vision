'use client'
import { useRef, useEffect } from 'react'
import type { MemEvent } from '@/hooks/useMemGuard'

const ACTION_COLORS: Record<string, string> = {
  alloc:       '#00ff88',
  free:        '#5a7090',
  breach:      '#ff2255',
  leak_report: '#ffaa00',
  summary:     '#00aaff',
}

function EventRow({ ev }: { ev: MemEvent }) {
  const color = ACTION_COLORS[ev.action] || '#c8d8f0'
  const shortAddr = ev.address ? ev.address.slice(0, 10) : '—'
  const time = ev.timestamp ? ev.timestamp.split('T')[1] : ''

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 border-b border-white/5 hover:bg-white/5 transition-colors">
      <span className="font-mono text-xs w-16 shrink-0 mt-0.5" style={{ color }}>
        {ev.action}
      </span>
      <div className="min-w-0 flex-1">
        {ev.address && (
          <span className="font-mono text-xs text-mg-muted">{shortAddr}</span>
        )}
        {ev.size > 0 && (
          <span className="font-mono text-xs text-mg-text ml-2">{ev.size}B</span>
        )}
        {ev.breach_detail && (
          <p className="text-xs mt-0.5" style={{ color: '#ff2255' }}>{ev.breach_detail}</p>
        )}
        {ev.action === 'summary' && (
          <p className="text-xs text-mg-muted">
            {ev.total_allocs} allocs / {ev.total_frees} frees / {ev.leaks_found} leaks
          </p>
        )}
      </div>
      <span className="font-mono text-xs text-mg-muted shrink-0">{time}</span>
    </div>
  )
}

export default function EventLog({ events }: { events: MemEvent[] }) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [events.length])

  return (
    <div className="mg-panel flex flex-col w-72 shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-mg-green pulse-dot" />
        <span className="text-xs font-mono uppercase tracking-widest text-mg-muted">Event Stream</span>
        <span className="ml-auto font-mono text-xs text-mg-muted">{events.length}</span>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-center text-mg-muted text-xs py-8 font-mono">
            Waiting for C++ events...
          </p>
        ) : (
          events.map((ev, i) => <EventRow key={i} ev={ev} />)
        )}
      </div>
    </div>
  )
}
