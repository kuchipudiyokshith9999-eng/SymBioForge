"use client"

import { useFetch } from "@/lib/hooks"
import type { SymbiosisAnalysis } from "@/lib/symbiosis-analysis"
import { SymbiosisAnalysisMap } from "@/components/symbiosis/analysis-map"

export default function SymbiosisMapPage() {
  const { data, loading, error, refetch } = useFetch<SymbiosisAnalysis>("/api/symbiosis-analysis")

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="h-20 bg-zinc-900/50 rounded-lg animate-pulse" />
        <div className="h-[640px] bg-zinc-900/50 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <p className="text-zinc-300">Could not load symbiosis analysis{error ? ` (${error})` : ""}.</p>
        <button type="button" onClick={refetch} className="mt-3 text-sm font-medium text-emerald-400 hover:underline">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-500">
      <SymbiosisAnalysisMap data={data} />
    </div>
  )
}
