/**
 * The plain gradient behind the whole app, with a light haze so text stays readable.
 * There is no background video: it was removed so pages load faster and use less data, especially on phones.
 */
export function SceneBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-sky-200 via-sky-300 to-slate-500"
      aria-hidden="true"
    >
      {/* Light haze so text stays readable. Kept subtle on purpose. */}
      <div className="scene-haze absolute inset-0" />
    </div>
  )
}
