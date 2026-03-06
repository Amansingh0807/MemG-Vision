'use client'
import type { Stats } from '@/hooks/useMemGuard'

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="mg-panel px-4 py-3 flex flex-col gap-1">
      <span className="text-xs font-mono uppercase tracking-widest text-mg-muted">{label}</span>
      <span className="text-2xl font-mono font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

export default function StatsPanel({ stats, liveBlocks }: { stats: Stats; liveBlocks: number }) {
  return (
    <div className="flex flex-col gap-3 w-52 shrink-0">
      <h2 className="text-xs font-mono uppercase tracking-widest text-mg-muted px-1">Memory Stats</h2>
      <StatCard label="Total Allocs"  value={stats.totalAllocs}          color="#00ff88" />
      <StatCard label="Total Frees"   value={stats.totalFrees}           color="#5a7090" />
      <StatCard label="Live Blocks"   value={liveBlocks}                 color="#00aaff" />
      <StatCard label="Live Bytes"    value={formatBytes(stats.liveBytes)} color="#00aaff" />
      <StatCard label="Leaks Found"   value={stats.leaksFound}           color="#ffaa00" />
      <StatCard label="Leaked Bytes"  value={formatBytes(stats.leakedBytes)} color="#ffaa00" />
    </div>
  )
}
