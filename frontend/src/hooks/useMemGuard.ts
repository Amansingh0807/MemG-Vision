'use client'
import { useState, useCallback } from 'react'

export type MemEvent = {
  action: string; address: string; size: number; status: string; timestamp: string
  breach_detail?: string; file?: string; line?: number; age_seconds?: number
  total_allocs?: number; total_frees?: number; leaks_found?: number; leaked_bytes?: number
  // sys_mem fields
  total_mb?: number; available_mb?: number; used_mb?: number; used_pct?: number
}
export type HeapBlock = { address: string; size: number; status: 'safe'|'breach'|'leak'|'freed'; timestamp: string }
export type Stats = { totalAllocs:number; totalFrees:number; liveBlocks:number; liveBytes:number; leaksFound:number; leakedBytes:number }
export type SysInfo = { totalMb: number; usedMb: number; pct: number } | null

export function useMemGuard(wsUrl = 'ws://localhost:9001') {
  const [connected, setConnected] = useState(false)
  const [events,    setEvents]    = useState<MemEvent[]>([])
  const [blocks,    setBlocks]    = useState<Map<string, HeapBlock>>(new Map())
  const [stats,     setStats]     = useState<Stats>({ totalAllocs:0, totalFrees:0, liveBlocks:0, liveBytes:0, leaksFound:0, leakedBytes:0 })
  const [sys,       setSys]       = useState<SysInfo>(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(wsUrl)
    ws.onopen  = () => setConnected(true)
    ws.onclose = () => { setConnected(false); setTimeout(connect, 2500) }
    ws.onerror = () => ws.close()

    ws.onmessage = (e) => {
      let ev: MemEvent; try { ev = JSON.parse(e.data.trim()) } catch { return }
      setEvents(prev => [ev, ...prev].slice(0, 300))

      if (ev.action === 'sys_mem') {
        setSys({ totalMb: ev.total_mb ?? 0, usedMb: ev.used_mb ?? 0, pct: ev.used_pct ?? 0 })
        return
      }
      if (ev.action === 'alloc') {
        setBlocks(p => { const m = new Map(p); m.set(ev.address, { address:ev.address, size:ev.size, status:'safe', timestamp:ev.timestamp }); return m })
        setStats(s => ({ ...s, totalAllocs:s.totalAllocs+1, liveBlocks:s.liveBlocks+1, liveBytes:s.liveBytes+ev.size }))
      } else if (ev.action === 'free') {
        setBlocks(p => { const m = new Map(p); const b=m.get(ev.address); if(b) m.set(ev.address,{...b,status:'freed'}); setTimeout(()=>setBlocks(pp=>{const n=new Map(pp);n.delete(ev.address);return n}),1400); return m })
        setStats(s => ({ ...s, totalFrees:s.totalFrees+1, liveBlocks:Math.max(0,s.liveBlocks-1), liveBytes:Math.max(0,s.liveBytes-ev.size) }))
      } else if (ev.action === 'breach') {
        setBlocks(p => { const m=new Map(p); const b=m.get(ev.address); if(b) m.set(ev.address,{...b,status:'breach'}); return m })
      } else if (ev.action === 'leak_report') {
        setBlocks(p => { const m=new Map(p); const b=m.get(ev.address); if(b) m.set(ev.address,{...b,status:'leak'}); return m })
        setStats(s => ({ ...s, leaksFound:s.leaksFound+1, leakedBytes:s.leakedBytes+ev.size }))
      } else if (ev.action === 'summary') {
        if (ev.total_allocs != null) setStats(s => ({ ...s, totalAllocs:ev.total_allocs!, totalFrees:ev.total_frees! }))
      }
    }
    return ws
  }, [wsUrl])

  return { connected, events, blocks, stats, sys, connect }
}
