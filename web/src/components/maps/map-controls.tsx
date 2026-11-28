"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Pill-shaped segmented control used in the map toolbars (2D/3D, Dark/Satellite). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-zinc-800 bg-zinc-900/95 p-0.5 shadow-lg backdrop-blur">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ToolbarButton({
  active,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-colors",
        active
          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
          : "border-zinc-800 bg-zinc-900/95 text-zinc-300 hover:border-zinc-700 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Small dropdown panel anchored to a toolbar button; closes on outside click / Escape. */
export function ToolbarPopover({
  button,
  children,
  align = "right",
  width = "w-64",
}: {
  button: (open: boolean, toggle: () => void) => ReactNode
  children: ReactNode
  align?: "left" | "right"
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {button(open, () => setOpen((o) => !o))}
      {open && (
        <div className={cn("absolute top-full z-20 mt-1.5 rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur", width, align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  )
}

export function CheckRow({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/70">
      <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  )
}

export function StatCard({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn("mt-1 truncate text-2xl font-semibold tabular-nums", accent ? "text-emerald-400" : "text-zinc-100")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

/** Shown once per browser: how to tilt/rotate in 3D. */
export function CameraHint({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => { setDismissed(localStorage.getItem("sf-map-hint") === "1") }, [])
  if (!show || dismissed) return null
  return (
    <div className="pointer-events-auto absolute left-1/2 top-14 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900/95 px-4 py-1.5 text-xs text-zinc-300 shadow-xl">
      <span><b className="text-zinc-100">Right-drag</b> or <b className="text-zinc-100">Ctrl + drag</b> to tilt &amp; rotate</span>
      <button
        type="button"
        className="text-emerald-400 hover:underline"
        onClick={() => { localStorage.setItem("sf-map-hint", "1"); setDismissed(true) }}
      >
        Got it
      </button>
    </div>
  )
}
