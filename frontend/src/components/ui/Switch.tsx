"use client"

type SwitchProps = {
  checked: boolean
  /** True while the change is being made (for example the browser is finding the position). */
  busy?: boolean
  onChange: (next: boolean) => void
  label: string
  busyLabel?: string
}

/**
 * An on/off switch. The state is also written as "On" or "Off", so it never depends on colour alone.
 * It stays focusable while busy (a disabled button would lose keyboard focus) and ignores clicks until done.
 */
export function Switch({ checked, busy = false, onChange, label, busyLabel }: SwitchProps) {
  const on = checked || busy // while busy, the switch already shows the state being asked for

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-busy={busy}
      onClick={() => !busy && onChange(!checked)}
      className="flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-medium aria-busy:opacity-70"
    >
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors motion-reduce:transition-none ${
          on ? "border-transparent bg-[var(--glass-accent)]" : "border-current bg-black/10"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
      <span>{busy && busyLabel ? busyLabel : label}</span>
      <span aria-hidden="true" className="w-7 text-xs font-semibold">
        {on ? "On" : "Off"}
      </span>
    </button>
  )
}
