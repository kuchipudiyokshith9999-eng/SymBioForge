"use client"

import { useFetch } from "@/lib/hooks"
import { Ecosystem3D, type EcosystemData } from "@/components/ecosystem/ecosystem-3d"

export default function EcosystemPage() {
  const { data, loading, error, refetch } = useFetch<EcosystemData>("/api/ecosystem")

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="h-20 bg-zinc-900/50 rounded-lg animate-pulse" />
        <div className="h-[660px] bg-zinc-900/50 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <p className="text-zinc-300">Could not load the ecosystem map{error ? ` (${error})` : ""}.</p>
        <button type="button" onClick={refetch} className="mt-3 text-sm font-medium text-emerald-400 hover:underline">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-500">
      <Ecosystem3D data={data} />
    </div>
  )
}
