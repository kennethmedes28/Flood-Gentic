"use client"

import { useEffect, useRef, useState } from "react"

import { useResizableFrame, type Corner } from "@/hooks/useResizableFrame"
import { cn } from "@/lib/utils"

/** Size of the area a finger or mouse can grab at each corner, in pixels. */
const HANDLE_SIZE = 44
/** Distance from the frame's corner to the handle, so the bracket sits 12px inside it (as the old HUD brackets did). */
const HANDLE_OFFSET = 8

/** For each corner: its look (the bracket's two sides), where it sits, and its mouse cursor. */
const CORNERS: { corner: Corner; label: string; bracket: string; place: string; cursor: string }[] = [
  {
    corner: "top-left",
    label: "top left",
    bracket: "rounded-tl-lg border-t-2 border-l-2 origin-top-left",
    place: "items-start justify-start",
    cursor: "cursor-nwse-resize",
  },
  {
    corner: "top-right",
    label: "top right",
    bracket: "rounded-tr-lg border-t-2 border-r-2 origin-top-right",
    place: "items-start justify-end",
    cursor: "cursor-nesw-resize",
  },
  {
    corner: "bottom-left",
    label: "bottom left",
    bracket: "rounded-bl-lg border-b-2 border-l-2 origin-bottom-left",
    place: "items-end justify-start",
    cursor: "cursor-nesw-resize",
  },
  {
    corner: "bottom-right",
    label: "bottom right",
    bracket: "rounded-br-lg border-r-2 border-b-2 origin-bottom-right",
    place: "items-end justify-end",
    cursor: "cursor-nwse-resize",
  },
]

type ResizableFrameProps = {
  /** Names where the size is saved, so each page remembers its own. */
  storageKey: string
  /** Classes for the box that holds the page content (padding, for example). */
  contentClassName?: string
  /** Make the content as tall as the frame (for pages like the chat, which fill the screen). */
  fillHeight?: boolean
  children: React.ReactNode
}

/**
 * The page content inside a frame whose four corner brackets can be dragged.
 *
 * At first the frame fills the window and the page looks as it always did. Dragging a corner toward the centre
 * (diagonally, or along one side) pulls that corner in; the opposite corner stays put, and the content shrinks to
 * fit the frame's width, like a window being made smaller. Dragging back out restores it. The size is remembered.
 *
 * With the keyboard: Tab to a corner, press the arrow keys to move it, and Enter (or Escape) to restore the full
 * size. Double-clicking a corner restores it too.
 *
 * The frame is fixed to the window and scrolls inside, so the page's own scrolling happens here instead.
 */
export function ResizableFrame({ storageKey, contentClassName, fillHeight = false, children }: ResizableFrameProps) {
  const { insets, viewport, width, height, scale, isFull, dragging, cornerProps } = useResizableFrame(storageKey)

  // A shrunk element still takes up its original size, so the frame would scroll through empty space. The content's
  // real height is watched, and a box of the shrunk size around it tells the frame how far there is to scroll.
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  useEffect(() => {
    const content = contentRef.current
    if (!content || isFull) return
    const observer = new ResizeObserver(() => setContentHeight(content.offsetHeight))
    observer.observe(content)
    return () => observer.disconnect()
  }, [isFull])

  // Full size: the content flows as before. Smaller: it is laid out at the window's width, then shrunk to fit.
  const shrunkBoxStyle = isFull ? undefined : { width, height: fillHeight ? height : contentHeight * scale }
  const contentStyle = isFull
    ? fillHeight
      ? { height: "100%" }
      : undefined
    : {
        position: "absolute" as const,
        left: 0,
        top: 0,
        width: viewport.width,
        height: fillHeight ? height / scale : undefined,
        transform: `scale(${scale})`,
        transformOrigin: "0 0",
      }

  return (
    <div className="glass-fade">
      <div
        className={cn("fixed z-10 overflow-x-hidden overflow-y-auto", isFull ? "inset-0" : "rounded-2xl [scrollbar-width:none]")}
        style={
          isFull
            ? undefined
            : {
                left: insets.left,
                top: insets.top,
                right: insets.right,
                bottom: insets.bottom,
                boxShadow: "0 0 0 1px color-mix(in srgb, var(--hud-corner) 45%, transparent)",
              }
        }
      >
        <div className={cn(!isFull && "relative", isFull && fillHeight && "h-full")} style={shrunkBoxStyle}>
          <div ref={contentRef} className={contentClassName} style={contentStyle}>
            {children}
          </div>
        </div>
      </div>

      {CORNERS.map(({ corner, label, bracket, place, cursor }) => {
        const atTop = corner.startsWith("top")
        const atLeft = corner.endsWith("left")
        return (
          <button
            key={corner}
            type="button"
            aria-label={`Resize the frame from the ${label} corner. Drag toward the centre to shrink it, use the arrow keys, or press Enter to restore it.`}
            title="Drag toward the centre to shrink · double-click to restore"
            className={cn("group fixed z-30 flex touch-none bg-transparent p-1 select-none focus-visible:outline-2 focus-visible:outline-[var(--hud-corner)]", place, cursor)}
            style={{
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              [atLeft ? "left" : "right"]: (atLeft ? insets.left : insets.right) + HANDLE_OFFSET,
              [atTop ? "top" : "bottom"]: (atTop ? insets.top : insets.bottom) + HANDLE_OFFSET,
            }}
            {...cornerProps(corner)}
          >
            <span
              className={cn(
                "h-8 w-8 border-[var(--hud-corner)] transition-transform duration-150 group-hover:scale-125 group-focus-visible:scale-125",
                "group-hover:drop-shadow-[0_0_6px_var(--hud-corner)] group-focus-visible:drop-shadow-[0_0_6px_var(--hud-corner)]",
                dragging === corner && "scale-125 drop-shadow-[0_0_8px_var(--hud-corner)]",
                bracket
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
