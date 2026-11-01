/** Questions people commonly ask, shown as one-tap buttons. */
const PROMPTS = [
  "Is my area at risk of flooding today?",
  "Where is the nearest evacuation center?",
  "What should I pack in a go-bag?",
  "Emergency hotlines in Quezon City",
  "Is it safe to travel now?",
]

type QuickPromptsProps = {
  onPick: (prompt: string) => void
  disabled?: boolean
}

/** A wrapping row of suggestion buttons. */
export function QuickPrompts({ onPick, disabled = false }: QuickPromptsProps) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
      {PROMPTS.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="glass-panel min-h-11 rounded-full px-4 text-left text-sm font-medium disabled:opacity-50"
            style={{ borderRadius: "999px" }}
          >
            {prompt}
          </button>
        </li>
      ))}
    </ul>
  )
}
