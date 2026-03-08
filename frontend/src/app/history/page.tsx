'use client'
import { useEffect, useState } from 'react'
import type { MemEvent } from '@/hooks/useMemGuard'
import Link from 'next/link'

export default function HistoryPage() {
  const [events, setEvents] = useState<MemEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => {
        setEvents(data.events || [])
        setLoading(false)
      })
      .catch(e => {
        console.error(e)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8d4f0', fontFamily: 'JetBrains Mono, monospace' }}>
        Loading history...
      </div>
    )
  }

  // Calculate some basic session stats
  const totalAllocs = events.filter(e => e.action === 'alloc').length
  const totalFrees = events.filter(e => e.action === 'free').length
  const totalBreaches = events.filter(e => e.action === 'breach').length

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', color: '#b8d4f0', padding: 24, paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>Session History</h1>
          <div style={{ fontSize: 12, color: '#3a5878', fontFamily: 'JetBrains Mono, monospace', marginTop: 8 }}>
            Replaying from memguard_history.jsonl
          </div>
        </div>

        <Link href="/" style={{ padding: '8px 16px', background: 'rgba(0,180,255,.1)', color: '#00d4ff', borderRadius: 6, textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600 }}>
          ← Back to Live Dashboard
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="panel" style={{ padding: 16, flex: 1 }}>
          <div style={{ fontSize: 10, color: '#3a5878', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Total Recorded Events</div>
          <div style={{ fontSize: 24, fontFamily: 'JetBrains Mono, monospace', color: '#b8d4f0', fontWeight: 600 }}>{events.length}</div>
        </div>
        <div className="panel" style={{ padding: 16, flex: 1 }}>
          <div style={{ fontSize: 10, color: '#3a5878', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Historical Allocs</div>
          <div style={{ fontSize: 24, fontFamily: 'JetBrains Mono, monospace', color: '#00ff99', fontWeight: 600 }}>{totalAllocs}</div>
        </div>
        <div className="panel" style={{ padding: 16, flex: 1 }}>
          <div style={{ fontSize: 10, color: '#3a5878', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Historical Frees</div>
          <div style={{ fontSize: 24, fontFamily: 'JetBrains Mono, monospace', color: '#3a5878', fontWeight: 600 }}>{totalFrees}</div>
        </div>
        <div className="panel" style={{ padding: 16, flex: 1 }}>
          <div style={{ fontSize: 10, color: '#3a5878', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Recorded Breaches</div>
          <div style={{ fontSize: 24, fontFamily: 'JetBrains Mono, monospace', color: totalBreaches > 0 ? '#ff1a4e' : '#3a5878', fontWeight: 600 }}>{totalBreaches}</div>
        </div>
      </div>

      <div className="panel" style={{ flex: 1, padding: 16, overflowY: 'auto', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 80px 100px 1fr auto', fontSize: 10, color: '#3a5878', textTransform: 'uppercase', letterSpacing: '0.12em', paddingBottom: 12, borderBottom: '1px solid rgba(0,180,255,.1)', marginBottom: 12 }}>
          <div>Timestamp</div>
          <div>Action</div>
          <div>Address</div>
          <div>Details</div>
          <div style={{ textAlign: 'right' }}>Size</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.filter(e => e.action !== 'sys_mem' && e.action !== 'summary').map((ev, i) => {
            const isAlloc = ev.action === 'alloc'
            const isFree = ev.action === 'free'
            const isBreach = ev.action === 'breach'
            const isLeak = ev.action === 'leak_report'
            
            const color = isBreach ? '#ff1a4e' : isLeak ? '#ffbb00' : isAlloc ? '#00ff99' : '#3a5878'
            
            return (
              <div key={i} className="log-row" style={{ display: 'grid', gridTemplateColumns: '160px 80px 100px 1fr auto', padding: '6px 8px', borderRadius: 4, alignItems: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                <div style={{ color: '#3a5878' }}>{ev.timestamp.replace('T', ' ')}</div>
                <div style={{ color }}>{ev.action}</div>
                <div style={{ color: '#b8d4f0' }}>{ev.address}</div>
                <div style={{ color: '#7a96b2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 16 }}>
                  {ev.file && ev.file !== '<unknown>' && (
                    <span style={{ color: '#00d4ff', marginRight: 8, background: 'rgba(0,212,255,.1)', padding: '2px 6px', borderRadius: 4 }}>{ev.file}:{ev.line}</span>
                  )}
                  {ev.breach_detail || (ev.age_seconds ? `Lived ${ev.age_seconds.toFixed(2)}s` : '')}
                </div>
                <div style={{ color, textAlign: 'right' }}>
                  {ev.size ? (ev.size < 1024 ? `${ev.size} B` : `${(ev.size/1024).toFixed(1)} KB`) : '-'}
                </div>
              </div>
            )
          })}
          
          {events.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#3a5878', fontFamily: 'JetBrains Mono, monospace' }}>
              No history found. Run the C++ tracker to generate events.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
