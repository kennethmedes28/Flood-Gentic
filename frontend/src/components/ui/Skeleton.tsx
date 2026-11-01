import { cn } from "@/lib/utils"

/**
 * A pulsing placeholder block shown while a component is still loading.
 * Size it with className, e.g. <Skeleton className="h-6 w-32" />.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-white/40 motion-reduce:animate-none", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

/** Visually hidden text so screen readers announce the loading state. */
export function LoadingLabel({ children = "Loading" }: { children?: string }) {
  return (
    <span role="status" className="sr-only">
      {children}
    </span>
  )
}
