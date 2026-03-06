'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { HeapBlock } from '@/hooks/useMemGuard'

/* ── Constants ─────────────────────────────────────────────────────── */
const STATUS_HEX: Record<string, number> = {
  safe:   0x00ff88,
  breach: 0xff2255,
  leak:   0xffaa00,
  freed:  0x1a2840,
}
const EMISSIVE_HEX: Record<string, number> = {
  safe:   0x003322,
  breach: 0x440011,
  leak:   0x332200,
  freed:  0x000000,
}
const GRID_SIZE    = 10
const GRID_SPACING = 1.2
const TOTAL_CELLS  = GRID_SIZE * GRID_SIZE

function addrToIndex(address: string): number {
  let h = 0
  for (let i = 0; i < address.length; i++)
    h = (h * 31 + address.charCodeAt(i)) >>> 0
  return h % TOTAL_CELLS
}

/* ── Shared box geometry (one instance for all blocks) ─────────────── */
let sharedGeom: THREE.BoxGeometry | null = null
function getGeom() {
  if (!sharedGeom) sharedGeom = new THREE.BoxGeometry(0.85, 1, 0.85)
  return sharedGeom
}

/* ── Component ─────────────────────────────────────────────────────── */
export default function HeapCanvas({ blocks }: { blocks: Map<string, HeapBlock> }) {
  const containerRef = useRef<HTMLDivElement>(null)

  /* Scene refs that persist across block updates */
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef    = useRef<THREE.Scene | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const meshMapRef  = useRef<Map<string, THREE.Mesh>>(new Map())

  /* Spherical camera state */
  const spherical = useRef({ theta: 0.6, phi: 0.9, radius: 18 })
  const drag      = useRef({ active: false, lastX: 0, lastY: 0 })

  /* ── Initialize Three.js scene once ─────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    /* Scene */
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05050a)
    scene.fog = new THREE.FogExp2(0x05050a, 0.04)
    sceneRef.current = scene

    /* Camera */
    const W = container.clientWidth
    const H = container.clientHeight
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    cameraRef.current = camera

    /* Renderer */
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    /* Lights */
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(8, 14, 8); dir.castShadow = true
    scene.add(dir)
    const pt = new THREE.PointLight(0x00ff88, 1.2, 25)
    pt.position.set(0, 10, 0)
    scene.add(pt)

    /* Floor + grid */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: 0x060c18, roughness: 1 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    scene.add(new THREE.GridHelper(16, 22, 0x0a2040, 0x0a2040))

    /* ── Mouse orbit ─────────────────────────────────────────────── */
    const onDown = (e: MouseEvent) => {
      drag.current = { active: true, lastX: e.clientX, lastY: e.clientY }
    }
    const onUp   = () => { drag.current.active = false }
    const onMove = (e: MouseEvent) => {
      if (!drag.current.active) return
      const dx = e.clientX - drag.current.lastX
      const dy = e.clientY - drag.current.lastY
      spherical.current.theta -= dx * 0.005
      spherical.current.phi   = Math.max(0.1, Math.min(Math.PI / 2.1, spherical.current.phi + dy * 0.005))
      drag.current.lastX = e.clientX
      drag.current.lastY = e.clientY
    }
    const onWheel = (e: WheelEvent) => {
      spherical.current.radius = Math.max(5, Math.min(28, spherical.current.radius + e.deltaY * 0.02))
    }
    renderer.domElement.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('mousemove', onMove)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true })

    /* ── Animation loop ─────────────────────────────────────────── */
    const clock = new THREE.Clock()
    let frameId = 0
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const t  = clock.getElapsedTime()

      /* Update camera from spherical coords */
      const { theta, phi, radius } = spherical.current
      camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.cos(theta),
      )
      camera.lookAt(0, 0, 0)

      /* Animate each mesh */
      meshMapRef.current.forEach((mesh) => {
        const status  = mesh.userData.status as string
        const targetH = (mesh.userData.targetH as number) ?? 1
        const mat     = mesh.material as THREE.MeshStandardMaterial

        /* Smooth height interpolation */
        mesh.scale.y = THREE.MathUtils.lerp(mesh.scale.y, targetH, 0.09)
        mesh.position.y = mesh.scale.y * 0.5

        /* Breach: rapid red pulse */
        if (status === 'breach')
          mat.emissiveIntensity = (Math.sin(t * 9) * 0.5 + 0.5) * 2.2

        /* Leak: slow amber breathe */
        if (status === 'leak')
          mat.emissiveIntensity = 0.4 + Math.sin(t * 2.2) * 0.35
      })

      renderer.render(scene, camera)
    }
    animate()

    /* ── Resize handler ─────────────────────────────────────────── */
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    /* ── Cleanup ─────────────────────────────────────────────────── */
    return () => {
      cancelAnimationFrame(frameId)
      renderer.domElement.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('mousemove', onMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement)
      rendererRef.current = null
      sceneRef.current    = null
    }
  }, [])   // runs once

  /* ── Sync blocks → Three.js meshes (runs on every blocks update) ── */
  useEffect(() => {
    const scene   = sceneRef.current
    const meshMap = meshMapRef.current
    if (!scene) return

    const centerOffset = ((GRID_SIZE - 1) * GRID_SPACING) / 2

    /* Add / update */
    blocks.forEach((block, addr) => {
      const color    = STATUS_HEX[block.status]   ?? 0xffffff
      const emissive = EMISSIVE_HEX[block.status] ?? 0x000000
      const targetH  = Math.max(0.2, Math.min(3.6, Math.log2(block.size + 1) * 0.38))

      if (meshMap.has(addr)) {
        /* Update existing mesh */
        const mesh = meshMap.get(addr)!
        const mat  = mesh.material as THREE.MeshStandardMaterial
        mat.color.setHex(color)
        mat.emissive.setHex(emissive)
        mat.emissiveIntensity   = block.status === 'breach' ? 1.5 : block.status === 'leak' ? 0.6 : 0.25
        mat.transparent         = block.status === 'freed'
        mat.opacity             = block.status === 'freed' ? 0.35 : 1
        mesh.userData.status    = block.status
        mesh.userData.targetH   = targetH
      } else {
        /* Create new mesh */
        const idx = addrToIndex(addr)
        const col = idx % GRID_SIZE
        const row = Math.floor(idx / GRID_SIZE)
        const x   = col * GRID_SPACING - centerOffset
        const z   = row * GRID_SPACING - centerOffset

        const mat = new THREE.MeshStandardMaterial({
          color:            new THREE.Color(color),
          emissive:         new THREE.Color(emissive),
          emissiveIntensity: block.status === 'breach' ? 1.5 : 0.25,
          roughness:        0.4,
          metalness:        0.35,
          transparent:      block.status === 'freed',
          opacity:          block.status === 'freed' ? 0.35 : 1,
        })
        const mesh = new THREE.Mesh(getGeom(), mat)
        mesh.scale.y         = 0.01   // start flat, animates up
        mesh.position.set(x, 0.005, z)
        mesh.castShadow      = true
        mesh.userData.status = block.status
        mesh.userData.targetH = targetH
        scene.add(mesh)
        meshMap.set(addr, mesh)
      }
    })

    /* Remove blocks that are no longer in the map */
    meshMap.forEach((mesh, addr) => {
      if (!blocks.has(addr)) {
        scene.remove(mesh)
        ;(mesh.material as THREE.MeshStandardMaterial).dispose()
        meshMap.delete(addr)
      }
    })
  }, [blocks])

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    />
  )
}
