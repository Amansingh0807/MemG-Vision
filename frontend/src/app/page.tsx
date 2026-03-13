'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import StatsPanel from '@/components/StatsPanel'
import EventLog from '@/components/EventLog'
import { useMemGuard } from '@/hooks/useMemGuard'

const HeapCanvas = dynamic(() => import('@/components/HeapCanvas'), { ssr: false })

const S = {
  root: { width:'100vw', height:'100vh', background:'#030508', display:'flex', flexDirection:'column' as const, fontFamily:"var(--font-sans)", color:'#c8e4ff', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', gap:16, padding:'0 18px', height:52, borderBottom:'1px solid rgba(0,212,255,.15)', flexShrink:0, background:'rgba(3,6,12,.95)', backdropFilter:'blur(8px)' },
  logo: { display:'flex', alignItems:'baseline', gap:4 },
  main: { flex:1, display:'flex', gap:12, padding:12, minHeight:0 },
  canvas: { flex:1, position:'relative' as const, borderRadius:12, overflow:'hidden', border:'1px solid rgba(0,212,255,.15)', background:'#050a14', boxShadow:'inset 0 0 40px rgba(0,0,0,0.8)' },
  footer: { height:30, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', borderTop:'1px solid rgba(0,212,255,.1)', flexShrink:0, fontSize:10, fontFamily:"var(--font-mono)", color:'#3a5878', background:'rgba(3,6,12,.9)' },
}

function Badge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign:'right' }}>
      <div style={{ fontSize:9, fontFamily:"var(--font-mono)", color:'#3a5878', letterSpacing:'0.1em', textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontSize:17, fontFamily:"var(--font-mono)", fontWeight:700, color, lineHeight:1 }}>{value}</div>
    </div>
  )
}

export default function DashboardPage() {
  const { connected, events, blocks, stats, sys, connect } = useMemGuard('ws://localhost:9001')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const ws = connect()
    return () => ws?.close()
  }, [connect])

  // re-render every 500ms for smooth stats
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 500); return () => clearInterval(id) }, [])

  const [timeStr, setTimeStr] = useState('')
  useEffect(() => { setTimeStr(new Date().toLocaleTimeString()) }, [tick])

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <header style={S.header}>
        {/* Logo */}
        <div style={S.logo}>
          <span style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:15, color:'#00d4ff', letterSpacing:'0.08em' }}>MEM</span>
          <span style={{ fontFamily:"var(--font-mono)", fontWeight:300, fontSize:15, color:'#b8d4f0', letterSpacing:'0.08em' }}>GUARD</span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:'#3a5878', marginLeft:4, letterSpacing:'0.15em' }}>VISION</span>
        </div>

        <div style={{ width:1, height:22, background:'rgba(0,180,255,.15)' }} />

        {/* Connection status */}
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div className="dot-pulse" style={{ width:7, height:7, background: connected ? '#00ff99' : '#3a5878' }} />
          <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color: connected ? '#00ff99' : '#3a5878' }}>
            {connected ? 'CONNECTED · ws://localhost:9001' : 'WAITING FOR BACKEND…'}
          </span>
        </div>

        {/* Quick badges */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:20 }}>
          <Badge label="Allocs"  value={stats.totalAllocs} color="#00ff99" />
          <Badge label="Frees"   value={stats.totalFrees}  color="#3a5878" />
          <Badge label="Blocks"  value={blocks.size}       color="#00d4ff" />
          <Badge label="Leaks"   value={stats.leaksFound}  color={stats.leaksFound > 0 ? '#ffbb00' : '#3a5878'} />
        </div>
      </header>

      {/* ── Main ── */}
      <main style={S.main}>
        <StatsPanel stats={stats} liveBlocks={blocks.size} sys={sys} />

        {/* Three.js canvas */}
        <div style={S.canvas}>
          {/* scan-line overlay */}
          <div className="scanlines" style={{ position:'absolute', inset:0, zIndex:2, opacity:.25 }} />

          {/* Not connected overlay */}
          {!connected && (
            <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
              <div style={{ width:36, height:36, border:'2px solid #00d4ff', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
              <p style={{ fontFamily:"var(--font-mono)", fontSize:12, color:'#3a5878' }}>Connecting to ws://localhost:9001</p>
              <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:'#1a3050' }}>
                Run: <span style={{ color:'#00d4ff' }}>.\memguard_demo_ws.exe</span>
              </p>
            </div>
          )}

          {/* Block count badge */}
          <div className="panel" style={{ position:'absolute', top:12, right:12, zIndex:5, padding:'4px 10px', fontSize:11, fontFamily:"var(--font-mono)", color:'#3a5878' }}>
            <span style={{ color:'#00d4ff', fontWeight:600 }}>{blocks.size}</span> live blocks
          </div>

          {/* Canvas hint */}
          <div style={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)', zIndex:5, fontFamily:"var(--font-mono)", fontSize:10, color:'#1a3050' }}>
            drag to orbit · scroll to zoom
          </div>

          <HeapCanvas blocks={blocks} />
        </div>

        <EventLog events={events} />
      </main>

      {/* ── Footer ── */}
      <footer style={S.footer}>
        <span />
        <span>events: {events.length} · {timeStr}</span>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
