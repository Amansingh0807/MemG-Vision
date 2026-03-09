'use client'
import type { Stats } from '@/hooks/useMemGuard'

type SysInfo = { totalMb: number; usedMb: number; pct: number } | null

function Bar({ pct }: { pct: number }) {
  const color = pct > 80 ? '#ff1a4e' : pct > 60 ? '#ffbb00' : '#00d4ff'
  return (
    <div className="ram-bar-bg" style={{ height: 5, background: 'rgba(0,180,255,.1)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .8s ease' }} />
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,180,255,.08)' }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#3a5878', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: color ?? '#b8d4f0', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

function fmt(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(2)} MB`
}

export default function StatsPanel({ stats, liveBlocks, sys }: { stats: Stats; liveBlocks: number; sys: SysInfo }) {
  return (
    <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* App memory */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(0,180,255,.08)', fontSize: 10, fontFamily: 'var(--font-mono)', color: '#3a5878', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          App Memory
        </div>
        <Metric label="Total Allocs"  value={stats.totalAllocs}         color="#00ff99" />
        <Metric label="Total Frees"   value={stats.totalFrees}          color="#3a5878" />
        <Metric label="Live Blocks"   value={liveBlocks}                color="#00d4ff" />
        <Metric label="Live Bytes"    value={fmt(stats.liveBytes)}      color="#00d4ff" />
        <Metric label="Leaks Found"   value={stats.leaksFound}          color={stats.leaksFound > 0 ? '#ffbb00' : '#3a5878'} />
        <Metric label="Leaked Bytes"  value={fmt(stats.leakedBytes)}    color={stats.leakedBytes > 0 ? '#ffbb00' : '#3a5878'} />
      </div>

      {/* System RAM */}
      {sys ? (
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#3a5878', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
            System RAM
          </div>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#00d4ff', marginBottom: 6 }}>
            {sys.pct}%
          </div>
          <Bar pct={sys.pct} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: '#3a5878' }}>
            <span>{sys.usedMb.toLocaleString()} MB used</span>
            <span>{sys.totalMb.toLocaleString()} MB total</span>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#3a5878', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            System RAM
          </div>
          <div style={{ fontSize: 11, color: '#2a4060', fontFamily: 'var(--font-mono)' }}>
            Run memguard_monitor.exe to see live system memory
          </div>
        </div>
      )}
    </div>
  )
}
