'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { HeapBlock } from '@/hooks/useMemGuard'

const STATUS_COLOR: Record<string, number>   = { safe: 0x00ff99, breach: 0xff1a4e, leak: 0xffbb00, freed: 0x0d2040 }
const GRID = 100, GAP = 1.22, CELLS = GRID * GRID
const CENTER = ((GRID - 1) * GAP) / 2

let sharedGeom: THREE.BoxGeometry | null = null
const geom = () => { if (!sharedGeom) sharedGeom = new THREE.BoxGeometry(0.84, 1, 0.84); return sharedGeom }

function addrHash(addr: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < addr.length; i++) h = Math.imul(h ^ addr.charCodeAt(i), 0x01000193)
  return (h >>> 0) % CELLS
}

export default function HeapCanvas({ blocks }: { blocks: Map<string, HeapBlock> }) {
  const wrap = useRef<HTMLDivElement>(null)
  
  const renderer = useRef<THREE.WebGLRenderer | null>(null)
  const scene    = useRef<THREE.Scene | null>(null)
  const camera   = useRef<THREE.PerspectiveCamera | null>(null)
  const raf      = useRef(0)
  
  const drag     = useRef({ on: false, lx: 0, ly: 0 })
  const sph      = useRef({ theta: 0.55, phi: 0.88, r: 19 })
  const autoRot  = useRef(true)

  const instMesh = useRef<THREE.InstancedMesh | null>(null)
  const blockArray = useRef<HeapBlock[]>([])

  /* ── Initialize Three.js ── */
  useEffect(() => {
    const el = wrap.current; if (!el) return

    /* scene */
    const sc = new THREE.Scene()
    sc.background = new THREE.Color(0x050a14) // Darker cyber aesthetic
    sc.fog = new THREE.FogExp2(0x050a14, 0.038)
    scene.current = sc

    /* camera */
    const cam = new THREE.PerspectiveCamera(44, el.clientWidth / el.clientHeight, 0.1, 150)
    camera.current = cam

    /* renderer */
    const rend = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    rend.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rend.setSize(el.clientWidth || 800, el.clientHeight || 600)
    rend.shadowMap.enabled = true
    rend.shadowMap.type    = THREE.PCFSoftShadowMap
    el.appendChild(rend.domElement)
    renderer.current = rend

    /* lights */
    sc.add(new THREE.AmbientLight(0x1a3060, 2.0))
    const dir = new THREE.DirectionalLight(0xffffff, 1.4)
    dir.position.set(10, 18, 10); dir.castShadow = true
    dir.shadow.mapSize.width = dir.shadow.mapSize.height = 1024
    sc.add(dir)
    const ptGreen = new THREE.PointLight(0x00ff99, 2.5, 30)
    ptGreen.position.set(0, 12, 0); sc.add(ptGreen)
    const ptBlue  = new THREE.PointLight(0x0066ff, 1.5, 25)
    ptBlue.position.set(-8, 6, -8); sc.add(ptBlue)

    /* floor */
    const floorM = new THREE.MeshStandardMaterial({ color: 0x03060d, roughness: 1 })
    const floor  = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorM)
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor)

    /* grid lines */
    const grid = new THREE.GridHelper(100, 100, 0x0a2a50, 0x051325)
    grid.position.y = 0.01; sc.add(grid)

    /* Instanced Mesh setup - up to 100,000 blocks */
    const maxInstances = 100000
    const iMesh = new THREE.InstancedMesh(
      geom(), 
      new THREE.MeshStandardMaterial({
        roughness: 0.35, metalness: 0.4,
      }), 
      maxInstances
    )
    iMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    iMesh.castShadow = true
    iMesh.receiveShadow = true
    sc.add(iMesh)
    instMesh.current = iMesh

    /* orbit controls (manual) */
    const onDown = (e: MouseEvent) => { drag.current = { on: true, lx: e.clientX, ly: e.clientY }; autoRot.current = false }
    const onUp   = () => { drag.current.on = false }
    const onMove = (e: MouseEvent) => {
      if (!drag.current.on) return
      sph.current.theta -= (e.clientX - drag.current.lx) * 0.005
      sph.current.phi    = Math.max(0.12, Math.min(1.45, sph.current.phi + (e.clientY - drag.current.ly) * 0.005))
      drag.current.lx = e.clientX; drag.current.ly = e.clientY
    }
    const onWheel = (e: WheelEvent) => { sph.current.r = Math.max(5, Math.min(80, sph.current.r + e.deltaY * 0.05)) }
    rend.domElement.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    rend.domElement.addEventListener('wheel', onWheel, { passive: true })

    /* animation */
    const clock = new THREE.Clock()
    const dummy = new THREE.Object3D()
    const cObj = new THREE.Color()
    
    // Extracted array for block state tracking
    const heights = new Float32Array(maxInstances)
    
    const tick = () => {
      raf.current = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()
      if (autoRot.current) sph.current.theta += 0.003

      const { theta, phi, r } = sph.current
      cam.position.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta))
      cam.lookAt(0, 0, 0)

      if (instMesh.current && blockArray.current) {
         let count = 0
         for (let i = 0; i < blockArray.current.length; i++) {
           if (count >= maxInstances) break
           const b = blockArray.current[i]
           if (b.status === 'freed') continue // Or handle fading smoothly

           const s = b.status
           const colorHex = STATUS_COLOR[s] ?? 0xffffff
           const targetH = Math.max(0.18, Math.min(4.2, Math.log2(b.size + 1) * 0.42))
           
           heights[i] = THREE.MathUtils.lerp(heights[i] || 0.01, targetH, 0.1)

           const idx = addrHash(b.address)
           const x = (idx % GRID) * GAP - CENTER
           const z = Math.floor(idx / GRID) * GAP - CENTER

           dummy.position.set(x, heights[i] * 0.5, z)
           dummy.scale.set(1, heights[i], 1)
           
           // Pulse effect for breach/leak
           let scaleFix = 1
           if (s === 'breach') scaleFix = 1.0 + Math.sin(t * 10) * 0.15
           else if (s === 'leak') scaleFix = 1.0 + Math.sin(t * 3) * 0.05
           dummy.scale.multiplyScalar(scaleFix)
           
           dummy.updateMatrix()
           instMesh.current.setMatrixAt(count, dummy.matrix)
           
           cObj.setHex(colorHex)
           if (s === 'breach') cObj.lerp(new THREE.Color(0xffffff), Math.sin(t * 10) * 0.5 + 0.5)
           instMesh.current.setColorAt(count, cObj)
           
           count++
         }
         instMesh.current.count = count
         instMesh.current.instanceMatrix.needsUpdate = true
         if (instMesh.current.instanceColor) instMesh.current.instanceColor.needsUpdate = true
      }

      rend.render(sc, cam)
    }
    tick()

    /* resize */
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight
      cam.aspect = w / h; cam.updateProjectionMatrix(); rend.setSize(w, h)
    })
    ro.observe(el)
    ro.observe(document.body)

    return () => {
      cancelAnimationFrame(raf.current)
      rend.domElement.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp); window.removeEventListener('mousemove', onMove)
      rend.domElement.removeEventListener('wheel', onWheel)
      ro.disconnect(); rend.dispose()
      if (el.contains(rend.domElement)) el.removeChild(rend.domElement)
    }
  }, [])

  /* ── Sync blocks → array ── */
  useEffect(() => {
    // Convert Map to Array for fast iteration by InstancedMesh
    blockArray.current = Array.from(blocks.values())
  }, [blocks])

  return <div ref={wrap} style={{ position: 'absolute', inset: 0, cursor: 'grab' }} />
}
