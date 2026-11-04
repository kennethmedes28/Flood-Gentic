"use client"

import { useEffect, useMemo, useState } from "react"

import { useT } from "@/context/LanguageContext"
import type { PhotoAnnotations, PhotoBox } from "@/lib/chat-api"

/** One colour per kind of object, in the order the kinds first appear (like the SAM playground). Bright on dark outlines. */
const BOX_COLOURS = ["#22d3ee", "#f472b6", "#facc15", "#4ade80", "#fb923c", "#a78bfa", "#f87171", "#2dd4bf"]
/** The water overlay: see-through blue, so the photo still shows through it. */
const WATER_RGBA: [number, number, number, number] = [37, 99, 235, 115]

/** "person 87%", or just "person" when SAM gave no confidence. */
export function boxLabel(box: PhotoBox): string {
  return box.confidence === null ? box.label : `${box.label} ${Math.round(box.confidence * 100)}%`
}

/**
 * The water grid as a picture (a data URL) the size of the grid, blue where there is water, clear elsewhere.
 * The cells come base64-encoded, one bit per cell, row by row, first cell in the highest bit (see backend video/annotations.py).
 */
function waterPicture(water: NonNullable<PhotoAnnotations["water"]>): string | null {
  const canvas = document.createElement("canvas")
  canvas.width = water.columns
  canvas.height = water.rows
  const context = canvas.getContext("2d")
  if (!context) return null

  const bytes = Uint8Array.from(atob(water.cells), (character) => character.charCodeAt(0))
  const pixels = context.createImageData(water.columns, water.rows)
  for (let cell = 0; cell < water.rows * water.columns; cell++) {
    const isWater = (bytes[cell >> 3] >> (7 - (cell & 7))) & 1
    if (isWater) pixels.data.set(WATER_RGBA, cell * 4)
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL()
}

/** The photo with the boxes and water drawn over it. The drawing uses the photo's own pixel grid, so it lines up at any size. */
function PhotoWithBoxes({ url, annotations, alt }: { url: string; annotations: PhotoAnnotations; alt: string }) {
  const { width, height, boxes, water } = annotations
  const waterUrl = useMemo(() => (water ? waterPicture(water) : null), [water])

  // Each kind of object keeps one colour.
  const colours = new Map<string, string>()
  boxes.forEach((box) => {
    if (!colours.has(box.label)) colours.set(box.label, BOX_COLOURS[colours.size % BOX_COLOURS.length])
  })
  const fontSize = Math.max(10, Math.round(width * 0.028))
  const pad = fontSize * 0.3

  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- the user's own photo, already in the browser */}
      <img src={url} alt={alt} className="block h-auto w-full rounded-xl" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {waterUrl && <image href={waterUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />}
        {boxes.map((box, index) => {
          const [left, top, right, bottom] = box.box
          const colour = colours.get(box.label) ?? BOX_COLOURS[0]
          const text = boxLabel(box)
          const tagWidth = text.length * fontSize * 0.6 + pad * 2
          const tagHeight = fontSize + pad * 2
          // The tag sits above the box, or inside its top edge when the box touches the top of the photo.
          const tagTop = top - tagHeight >= 0 ? top - tagHeight : top
          return (
            <g key={index}>
              <rect
                x={left}
                y={top}
                width={Math.max(right - left, 1)}
                height={Math.max(bottom - top, 1)}
                fill="none"
                stroke={colour}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
              <rect x={left} y={tagTop} width={tagWidth} height={tagHeight} fill={colour} rx={pad} />
              <text x={left + pad} y={tagTop + pad + fontSize * 0.85} fontSize={fontSize} fontWeight={700} fill="#0b1220">
                {text}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * The assistant's view of a checked photo: the user's photo with a box and confidence for every object SAM found and the flood
 * water tinted blue. Tapping it opens a larger view. The boxes are also listed as text for screen readers.
 */
export function AnnotatedPhoto({ url, annotations }: { url: string; annotations: PhotoAnnotations }) {
  const t = useT()
  const [enlarged, setEnlarged] = useState(false)
  const alt = t("assistant.annotated.alt")

  // Escape closes the large view.
  useEffect(() => {
    if (!enlarged) return
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setEnlarged(false)
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enlarged])

  return (
    <figure className="mb-2">
      <button type="button" onClick={() => setEnlarged(true)} className="block w-full max-w-sm cursor-zoom-in" aria-label={t("assistant.annotated.enlarge")}>
        <PhotoWithBoxes url={url} annotations={annotations} alt={alt} />
      </button>
      <figcaption className="mt-1 text-xs" style={{ color: "var(--glass-text-muted)" }}>
        {annotations.water ? t("assistant.annotated.captionWater") : t("assistant.annotated.caption")}
      </figcaption>
      {annotations.boxes.length > 0 && (
        <ul className="sr-only">
          {annotations.boxes.map((box, index) => (
            <li key={index}>{boxLabel(box)}</li>
          ))}
        </ul>
      )}

      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setEnlarged(false)}
        >
          <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <PhotoWithBoxes url={url} annotations={annotations} alt={alt} />
            <button type="button" autoFocus onClick={() => setEnlarged(false)} className="help-close mt-3 min-h-11 rounded-full px-5 text-sm font-semibold">
              {t("assistant.annotated.close")}
            </button>
          </div>
        </div>
      )}
    </figure>
  )
}
