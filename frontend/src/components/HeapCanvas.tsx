'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { HeapBlock } from '@/hooks/useMemGuard'

const STATUS_COLOR: Record<string, number>   = { safe: 0x00ff99, breach: 0xff1a4e, leak: 0xffbb00, freed: 0x0d2040 }
const STATUS_EMISS: Record<string, number>   = { safe: 0x003322, breach: 0x500010, leak: 0x3d2d00, freed: 0x000000 }
const GRID = 10, GAP = 1.22, CELLS = GRID * GRID
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
  const meshMap  = useRef<Map<string, THREE.Mesh>>(new Map())
  const renderer = useRef<THREE.WebGLRenderer | null>(null)
  const scene    = useRef<THREE.Scene | null>(null)
  const camera   = useRef<THREE.PerspectiveCamera | null>(null)
  const raf      = useRef(0)
  const drag     = useRef({ on: false, lx: 0, ly: 0 })
  const sph      = useRef({ theta: 0.55, phi: 0.88, r: 19 })
  const autoRot  = useRef(true)

  /* ── Initialize Three.js ── */
  useEffect(() => {
    const el = wrap.current; if (!el) return

    /* scene */
    const sc = new THREE.Scene()
    sc.background = new THREE.Color(0x070d1a)
    sc.fog = new THREE.FogExp2(0x070d1a, 0.038)
    scene.current = sc

    /* camera */
    const cam = new THREE.PerspectiveCamera(44, el.clientWidth / el.clientHeight, 0.1, 80)
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
    sc.add(new THREE.AmbientLight(0x1a3060, 1.8))
    const dir = new THREE.DirectionalLight(0xffffff, 1.4)
    dir.position.set(10, 18, 10); dir.castShadow = true
    dir.shadow.mapSize.width = dir.shadow.mapSize.height = 1024
    sc.add(dir)
    const ptGreen = new THREE.PointLight(0x00ff99, 1.8, 20)
    ptGreen.position.set(0, 12, 0); sc.add(ptGreen)
    const ptBlue  = new THREE.PointLight(0x0066ff, 1.0, 18)
    ptBlue.position.set(-8, 6, -8); sc.add(ptBlue)

    /* floor */
    const floorM = new THREE.MeshStandardMaterial({ color: 0x050b18, roughness: 1 })
    const floor  = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), floorM)
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor)

    /* grid lines */
    const grid = new THREE.GridHelper(18, 24, 0x0a2a50, 0x071830)
    grid.position.y = 0.01; sc.add(grid)

    /* orbit controls (manual) */
    const onDown = (e: MouseEvent) => { drag.current = { on: true, lx: e.clientX, ly: e.clientY }; autoRot.current = false }
    const onUp   = () => { drag.current.on = false }
    const onMove = (e: MouseEvent) => {
      if (!drag.current.on) return
      sph.current.theta -= (e.clientX - drag.current.lx) * 0.005
      sph.current.phi    = Math.max(0.12, Math.min(1.45, sph.current.phi + (e.clientY - drag.current.ly) * 0.005))
      drag.current.lx = e.clientX; drag.current.ly = e.clientY
    }
    const onWheel = (e: WheelEvent) => { sph.current.r = Math.max(5, Math.min(30, sph.current.r + e.deltaY * 0.025)) }
    rend.domElement.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    rend.domElement.addEventListener('wheel', onWheel, { passive: true })

    /* animation */
    const clock = new THREE.Clock()
    const tick = () => {
      raf.current = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()
      if (autoRot.current) sph.current.theta += 0.003

      const { theta, phi, r } = sph.current
      cam.position.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta))
      cam.lookAt(0, 0, 0)

      meshMap.current.forEach(mesh => {
        const s   = mesh.userData.status as string
        const tH  = (mesh.userData.targetH as number) ?? 1
        const mat = mesh.material as THREE.MeshStandardMaterial
        mesh.scale.y   = THREE.MathUtils.lerp(mesh.scale.y, tH, 0.1)
        mesh.position.y = mesh.scale.y * 0.5
        if (s === 'breach') mat.emissiveIntensity = 1.2 + Math.sin(t * 10) * 1.1
        else if (s === 'leak') mat.emissiveIntensity = 0.5 + Math.sin(t * 2.5) * 0.35
        if (s === 'freed') mat.opacity = Math.max(0, mat.opacity - 0.025)
      })
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

  /* ── Sync blocks → meshes ── */
  useEffect(() => {
    const sc = scene.current; if (!sc) return
    blocks.forEach((b, addr) => {
      const color   = STATUS_COLOR[b.status] ?? 0xffffff
      const emiss   = STATUS_EMISS[b.status] ?? 0
      const targetH = Math.max(0.18, Math.min(4.2, Math.log2(b.size + 1) * 0.42))
      if (meshMap.current.has(addr)) {
        const m = meshMap.current.get(addr)!
        const mat = m.material as THREE.MeshStandardMaterial
        mat.color.setHex(color); mat.emissive.setHex(emiss)
        mat.emissiveIntensity = b.status === 'breach' ? 1.8 : b.status === 'leak' ? 0.7 : 0.28
        mat.transparent = b.status === 'freed'; mat.opacity = b.status === 'freed' ? 0.8 : 1
        m.userData.status = b.status; m.userData.targetH = targetH
      } else {
        const idx = addrHash(addr)
        const x = (idx % GRID) * GAP - CENTER, z = Math.floor(idx / GRID) * GAP - CENTER
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(emiss),
          emissiveIntensity: b.status === 'breach' ? 1.8 : 0.28,
          roughness: 0.35, metalness: 0.4,
          transparent: b.status === 'freed', opacity: b.status === 'freed' ? 0.6 : 1,
        })
        const mesh = new THREE.Mesh(geom(), mat)
        mesh.scale.y = 0.01; mesh.position.set(x, 0.005, z)
        mesh.castShadow = true
        mesh.userData = { status: b.status, targetH }
        sc.add(mesh); meshMap.current.set(addr, mesh)
      }
    })
    meshMap.current.forEach((mesh, addr) => {
      if (!blocks.has(addr)) {
        scene.current?.remove(mesh)
        ;(mesh.material as THREE.MeshStandardMaterial).dispose()
        meshMap.current.delete(addr)
      }
    })
  }, [blocks])

  return <div ref={wrap} style={{ position: 'absolute', inset: 0, cursor: 'grab' }} />
}
