'use client'
import { useRef, useEffect } from 'react'
import type { MemEvent } from '@/hooks/useMemGuard'

const COLORS: Record<string, string> = {
  alloc:       '#00ff99',
  free:        '#2a4060',
  breach:      '#ff1a4e',
  leak_report: '#ffbb00',
  summary:     '#00d4ff',
  sys_mem:     '#4488ff',
}

function Row({ ev }: { ev: MemEvent }) {
  const c   = COLORS[ev.action] ?? '#b8d4f0'
  const ts  = ev.timestamp?.split('T')[1] ?? ''
  const addr = ev.address?.slice(0, 10) ?? '—'
  return (
    <div style={{ display:'flex', gap:8, padding:'7px 12px', borderBottom:'1px solid rgba(0,40,80,.5)', transition:'background .15s' }}
         onMouseEnter={e => (e.currentTarget.style.background='rgba(0,180,255,.05)')}
         onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color: c, width:72, flexShrink:0, paddingTop:1 }}>
        {ev.action}
      </span>
      <div style={{ flex:1, minWidth:0 }}>
        {ev.address && <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#2a4060' }}>{addr}</span>}
        {(ev.size ?? 0) > 0 && <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#b8d4f0', marginLeft:6 }}>{ev.size}B</span>}
        {ev.action === 'sys_mem' && (
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#4488ff', marginLeft:4 }}>
            {(ev as any).used_mb}MB / {(ev as any).total_mb}MB ({(ev as any).used_pct}%)
          </span>
        )}
        {ev.breach_detail && <p style={{ fontSize:10, color:'#ff1a4e', marginTop:2 }}>{ev.breach_detail}</p>}
        {ev.action === 'summary' && (
          <p style={{ fontSize:10, color:'#3a5878', marginTop:2 }}>
            {ev.total_allocs} allocs / {ev.total_frees} frees / {ev.leaks_found} leaks / {ev.leaked_bytes}B
          </p>
        )}
      </div>
      <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#2a4060', flexShrink:0 }}>{ts}</span>
    </div>
  )
}

export default function EventLog({ events }: { events: MemEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0 }, [events.length])

  return (
    <div className="panel" style={{ width:290, flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* header */}
      <div style={{ padding:'8px 12px', borderBottom:'1px solid rgba(0,180,255,.08)', display:'flex', alignItems:'center', gap:8 }}>
        <div className="dot-pulse" style={{ width:6, height:6, background:'#00ff99' }} />
        <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#3a5878', letterSpacing:'0.12em', textTransform:'uppercase' }}>
          Event Stream
        </span>
        <span style={{ marginLeft:'auto', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#2a4060' }}>
          {events.length}
        </span>
      </div>
      {/* list */}
      <div ref={ref} style={{ flex:1, overflowY:'auto' }}>
        {events.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:'#1a3050' }}>
            Waiting for C++ events…
          </div>
        ) : events.map((ev, i) => <Row key={i} ev={ev} />)}
      </div>
    </div>
  )
}
