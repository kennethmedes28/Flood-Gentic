"use client"

import { useEffect, useRef } from "react"

import { useHand, type Hand } from "@/context/HandContext"

/*
 * 3D hand-with-laser cursor.
 *
 * A transparent canvas covers the screen. A hand model sits at the bottom
 * corner and aims its laser at the mouse position, so the red dot at the end
 * of the beam is the real cursor. Only one hand is shown: the one picked in
 * the floating menu (left or right).
 *
 * The models are in metres and point their laser along -Z.
 */

/** Overall size of the hand. Make this smaller or bigger to resize it. */
const HAND_SCALE = 1.3
/** Camera field of view in degrees. */
const FIELD_OF_VIEW = 45
/** How far in front of the camera the hand sits. */
const HAND_DEPTH = 1.0
/** How far in front of the camera the laser dot lands (the "screen" plane). */
const TARGET_DEPTH = 1.6
/**
 * Hand position: fraction of the half-width from the centre, and height below
 * the centre of the screen. A smaller bottom offset lifts the hand higher.
 */
const HAND_SIDE_OFFSET = 0.6
const HAND_BOTTOM_OFFSET = 0.2

/** In the model files, the laser beam is 2.18 m long and sits 0.03 m above the hand origin. */
const MODEL_BEAM_LENGTH = 2.18
const MODEL_BEAM_HEIGHT = 0.031

/** Alt + arrow keys nudge the hand by this much per press (world units). */
const KEY_NUDGE = 0.03
const OFFSET_STORAGE_KEY = "floodguard:hand-offset"

const CURSOR_CLASS = "hand-cursor"

export function HandCursor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { hand } = useHand()

  // The drawing code lives inside the setup effect below, so the current
  // choice is passed in through refs.
  const handRef = useRef<Hand>(hand)
  const redrawRef = useRef<() => void>(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let cleanup = () => {}

    // Load three.js only in the browser, and only when this component mounts.
    async function setup() {
      const THREE = await import("three")
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
      if (disposed || !container) return

      // --- Scene basics ---
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.domElement.style.display = "none" // shown once the mouse moves
      container.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 10)
      scene.add(new THREE.AmbientLight(0xffffff, 1.6))
      const sun = new THREE.DirectionalLight(0xffffff, 2)
      sun.position.set(0.5, 1, 1)
      scene.add(sun)

      // --- Load both hands ---
      const loader = new GLTFLoader()
      let left, right
      try {
        ;[left, right] = await Promise.all([
          loader.loadAsync("/vr-hand-laser-left.glb"),
          loader.loadAsync("/vr-hand-laser-right.glb"),
        ])
      } catch {
        // Models failed to load: keep the normal mouse cursor.
        renderer.dispose()
        renderer.domElement.remove()
        return
      }
      if (disposed) return

      /** One hand: a group that we move and rotate, holding the loaded model. */
      function buildHand(root: import("three").Object3D) {
        const aim = new THREE.Group()
        root.scale.setScalar(HAND_SCALE)
        aim.add(root)
        aim.visible = false
        scene.add(aim)
        return {
          aim,
          beam: root.getObjectByName("LaserBeam"),
          dot: root.getObjectByName("LaserDot"),
        }
      }
      const hands = {
        left: buildHand(left.scene),
        right: buildHand(right.scene),
      }
      type Side = keyof typeof hands

      // --- Drawing ---
      const forward = new THREE.Vector3(0, 0, -1)
      let pointer: { x: number; y: number } | null = null // pixels

      // How far the user has nudged the hand away from its default spot.
      let handOffset = { x: 0, y: 0 }
      try {
        const saved = window.localStorage.getItem(OFFSET_STORAGE_KEY)
        if (saved) handOffset = JSON.parse(saved)
      } catch {
        // Ignore: the hand starts at its default spot.
      }

      /** Visible half-height at a depth, for the camera's field of view. */
      const halfHeightAt = (depth: number) => depth * Math.tan((FIELD_OF_VIEW * Math.PI) / 360)

      /** Keep the hand's origin on screen (95% of the visible area). */
      function clampHandPosition(position: import("three").Vector3) {
        const maxY = halfHeightAt(HAND_DEPTH) * 0.95
        const maxX = maxY * camera.aspect
        position.x = Math.min(Math.max(position.x, -maxX), maxX)
        position.y = Math.min(Math.max(position.y, -maxY), maxY)
      }

      /** Place the camera and aim the correct hand at the pointer. */
      function render() {
        if (!pointer) return
        const width = window.innerWidth
        const height = window.innerHeight
        const aspect = width / height

        // Pointer in -1..1 screen coordinates.
        const ndcX = (pointer.x / width) * 2 - 1
        const ndcY = 1 - (pointer.y / height) * 2

        // The point in space that appears exactly under the pointer.
        const target = new THREE.Vector3(
          ndcX * halfHeightAt(TARGET_DEPTH) * aspect,
          ndcY * halfHeightAt(TARGET_DEPTH),
          -TARGET_DEPTH
        )

        const side: Side = handRef.current
        const active = hands[side]
        hands.left.aim.visible = side === "left"
        hands.right.aim.visible = side === "right"

        // Where the hand sits: a fixed spot above the bottom corner on its side.
        const sideSign = side === "left" ? -1 : 1
        const handPosition = new THREE.Vector3(
          sideSign * HAND_SIDE_OFFSET * halfHeightAt(HAND_DEPTH) * aspect,
          -HAND_BOTTOM_OFFSET,
          -HAND_DEPTH
        )
        handPosition.x += handOffset.x
        handPosition.y += handOffset.y
        clampHandPosition(handPosition)
        active.aim.position.copy(handPosition)

        // The laser runs slightly above the hand's origin, and that offset
        // turns with the hand. Aim in a few rounds so the beam line (not the
        // origin) passes exactly through the target and the dot lands under
        // the real mouse position, which matters for clicking.
        const beamOffset = new THREE.Vector3(0, MODEL_BEAM_HEIGHT * HAND_SCALE, 0)
        const beamStart = handPosition.clone()
        for (let round = 0; round < 4; round++) {
          const direction = target.clone().sub(beamStart).normalize()
          active.aim.quaternion.setFromUnitVectors(forward, direction)
          beamStart.copy(handPosition).add(beamOffset.clone().applyQuaternion(active.aim.quaternion))
        }

        // Stretch the beam and move the dot so it ends exactly on the target.
        const beamLength = target.distanceTo(beamStart) / HAND_SCALE
        if (active.beam) active.beam.scale.z = beamLength / MODEL_BEAM_LENGTH
        if (active.dot) active.dot.position.z = MODEL_BEAM_LENGTH - beamLength

        renderer.render(scene, camera)
      }

      redrawRef.current = render

      function resize() {
        renderer.setSize(window.innerWidth, window.innerHeight)
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        render()
      }

      // --- Input ---
      function onPointerMove(event: PointerEvent) {
        // Touch has no hover, so the hand is only for mouse and pen.
        if (event.pointerType === "touch") {
          renderer.domElement.style.display = "none"
          return
        }
        pointer = { x: event.clientX, y: event.clientY }
        renderer.domElement.style.display = "block"
        render()
      }
      /** Alt + arrow keys move the hand. Plain arrow keys are left alone. */
      function onKeyDown(event: KeyboardEvent) {
        if (!event.altKey) return
        const nudges: Record<string, { x: number; y: number }> = {
          ArrowLeft: { x: -KEY_NUDGE, y: 0 },
          ArrowRight: { x: KEY_NUDGE, y: 0 },
          ArrowUp: { x: 0, y: KEY_NUDGE },
          ArrowDown: { x: 0, y: -KEY_NUDGE },
        }
        const nudge = nudges[event.key]
        if (!nudge) return
        event.preventDefault() // Alt+Left/Right would otherwise go back/forward

        // Work out where the hand would be, clamp it, and store the difference.
        const sideSign = handRef.current === "left" ? -1 : 1
        const base = new THREE.Vector3(
          sideSign * HAND_SIDE_OFFSET * halfHeightAt(HAND_DEPTH) * camera.aspect,
          -HAND_BOTTOM_OFFSET,
          -HAND_DEPTH
        )
        const moved = base.clone()
        moved.x += handOffset.x + nudge.x
        moved.y += handOffset.y + nudge.y
        clampHandPosition(moved)
        handOffset = { x: moved.x - base.x, y: moved.y - base.y }

        try {
          window.localStorage.setItem(OFFSET_STORAGE_KEY, JSON.stringify(handOffset))
        } catch {
          // Ignore: the position just won't persist.
        }
        render()
      }
      function onPointerLeave() {
        renderer.domElement.style.display = "none"
      }

      resize()
      window.addEventListener("resize", resize)
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("keydown", onKeyDown)
      document.documentElement.addEventListener("pointerleave", onPointerLeave)
      document.documentElement.classList.add(CURSOR_CLASS)

      cleanup = () => {
        window.removeEventListener("resize", resize)
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("keydown", onKeyDown)
        document.documentElement.removeEventListener("pointerleave", onPointerLeave)
        document.documentElement.classList.remove(CURSOR_CLASS)
        renderer.dispose()
        renderer.domElement.remove()
      }
    }

    setup()
    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  // When the user switches hands, redraw straight away.
  useEffect(() => {
    handRef.current = hand
    redrawRef.current()
  }, [hand])

  // Sits above everything but never blocks clicks.
  return <div ref={containerRef} className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true" />
}
