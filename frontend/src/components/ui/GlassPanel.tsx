import { cn } from "@/lib/utils"

type GlassPanelProps = React.ComponentProps<"div">

/** A rounded translucent panel. Its look is controlled by the --g variable. */
export function GlassPanel({ className, ...props }: GlassPanelProps) {
  return <div className={cn("glass-panel", className)} {...props} />
}
