"use client"

type ToggleGroupProps<T extends string> = {
  /** What the group is for, read out by screen readers (for example "Forecast range"). */
  label: string
  options: { value: T; text: string }[]
  value: T
  onChange: (value: T) => void
}

/** A row of pill buttons where exactly one is chosen, like the Street / Satellite switch on the map. */
export function ToggleGroup<T extends string>({ label, options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className="min-h-11 rounded-full px-4 text-sm font-medium aria-pressed:bg-[var(--glass-accent)] aria-pressed:text-white aria-pressed:[text-shadow:none]"
        >
          {option.text}
        </button>
      ))}
    </div>
  )
}
