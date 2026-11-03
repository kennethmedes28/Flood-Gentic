import { useLanguage } from "@/context/LanguageContext"
import { LEVEL_STYLE, type FloodLevel } from "@/lib/flood-levels"

/** A pill showing a flood level as a symbol and a word on its colour (never colour alone). */
export function LevelChip({ level, className = "" }: { level: FloodLevel; className?: string }) {
  const { t } = useLanguage()
  const style = LEVEL_STYLE[level]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-white [text-shadow:none] ${className}`}
      style={{ background: style.color }}
    >
      <span aria-hidden="true">{style.symbol}</span>
      {t(style.label)}
    </span>
  )
}
