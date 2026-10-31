/** Four corner brackets that frame the screen like a heads-up display. */
export function HudCorners() {
  const base = "pointer-events-none fixed z-30 h-8 w-8 border-white/80"
  return (
    <div aria-hidden="true">
      <span className={`${base} top-3 left-3 rounded-tl-lg border-t-2 border-l-2`} />
      <span className={`${base} top-3 right-3 rounded-tr-lg border-t-2 border-r-2`} />
      <span className={`${base} bottom-3 left-3 rounded-bl-lg border-b-2 border-l-2`} />
      <span className={`${base} right-3 bottom-3 rounded-br-lg border-r-2 border-b-2`} />
    </div>
  )
}
