"use client"

import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useRef, useState } from "react"
import type * as Leaflet from "leaflet"
import {
  BarChart3, ChevronDown, ChevronRight, Download, Factory, Layers, List, Maximize2, Minimize2, PanelLeftClose,
  PanelLeftOpen, Search, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { MaterialCategory, AnalysisMaterial, SymbiosisAnalysis } from "@/lib/symbiosis-analysis"

const CATEGORY_ORDER: MaterialCategory[] = ["polymeric", "metallic", "organic", "cellulosic", "textile", "chemical"]
export const CATEGORY_COLORS: Record<MaterialCategory, string> = {
  polymeric: "#f43f5e",
  metallic: "#94a3b8",
  organic: "#22c55e",
  cellulosic: "#f97316",
  textile: "#e879f9",
  chemical: "#3b82f6",
}
const CONTAMINATION_LEVELS: AnalysisMaterial["contamination"][] = ["clean", "mild", "high", "hazardous"]

const fmtT = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t >= 100 ? Math.round(t).toString() : t.toFixed(1))
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

function toggleIn<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) {
  setter((prev) => {
    const n = new Set(prev)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  })
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100"
    >
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-emerald-500" : "bg-zinc-700")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </span>
      {label}
    </button>
  )
}

export function SymbiosisAnalysisMap({ data }: { data: SymbiosisAnalysis }) {
  const labels = data.categoryLabels

  // Filters
  const [query, setQuery] = useState("")
  const [searchByName, setSearchByName] = useState(true)
  const [searchByMaterial, setSearchByMaterial] = useState(true)
  const [selectedCats, setSelectedCats] = useState<Set<MaterialCategory>>(new Set())
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set())
  const [contamination, setContamination] = useState<Set<AnalysisMaterial["contamination"]>>(new Set())
  const [includeLow, setIncludeLow] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<MaterialCategory>>(new Set())
  const [showFilters, setShowFilters] = useState(true)

  // Layers
  const [layerHeat, setLayerHeat] = useState(true)
  const [layerQty, setLayerQty] = useState(true)
  const [layerProducers, setLayerProducers] = useState(true)
  const [layerFlows, setLayerFlows] = useState(false)
  const [takerCats, setTakerCats] = useState<Set<MaterialCategory>>(new Set())
  const [takerMenuOpen, setTakerMenuOpen] = useState(false)

  // Panels
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showList, setShowList] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // ---------------- Derived data ----------------
  const allMaterialsByCat = useMemo(() => {
    const m = new Map<MaterialCategory, Map<string, number>>()
    for (const p of data.producers) {
      for (const mat of p.materials) {
        if (!includeLow && mat.confidence === "low") continue
        if (!m.has(mat.category)) m.set(mat.category, new Map())
        const inner = m.get(mat.category)!
        inner.set(mat.name, (inner.get(mat.name) ?? 0) + mat.tonnesPerYear)
      }
    }
    return m
  }, [data, includeLow])

  const filteredProducers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.producers
      .map((p) => {
        const nameHit =
          q && searchByName &&
          (p.name.toLowerCase().includes(q) || p.industryType.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
        const mats = p.materials.filter((m) => {
          if (!includeLow && m.confidence === "low") return false
          if (selectedCats.size && !selectedCats.has(m.category)) return false
          if (selectedMaterials.size && !selectedMaterials.has(m.name)) {
            // A sub-material selection only narrows its own category
            const catHasSelection = Array.from(selectedMaterials).some((n) => allMaterialsByCat.get(m.category)?.has(n))
            if (catHasSelection) return false
          }
          if (contamination.size && !contamination.has(m.contamination)) return false
          if (q && !nameHit) {
            const matHit =
              searchByMaterial &&
              (m.name.toLowerCase().includes(q) || m.categoryLabel.toLowerCase().includes(q) || m.physicalForm.includes(q))
            if (!matHit) return false
          }
          return true
        })
        const tonnes = mats.reduce((s, m) => s + m.tonnesPerYear, 0)
        const byCat = new Map<MaterialCategory, number>()
        mats.forEach((m) => byCat.set(m.category, (byCat.get(m.category) ?? 0) + m.tonnesPerYear))
        const dominant = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
        return { ...p, materials: mats, tonnes, dominant }
      })
      .filter((p) => p.materials.length > 0)
  }, [data, query, searchByName, searchByMaterial, selectedCats, selectedMaterials, contamination, includeLow, allMaterialsByCat])

  const totalTonnes = filteredProducers.reduce((s, p) => s + p.tonnes, 0)

  const breakdown = useMemo(() => {
    const byCat = new Map<MaterialCategory, number>()
    const byMat = new Map<string, { t: number; cat: MaterialCategory }>()
    for (const p of filteredProducers) {
      for (const m of p.materials) {
        byCat.set(m.category, (byCat.get(m.category) ?? 0) + m.tonnesPerYear)
        const cur = byMat.get(m.name) ?? { t: 0, cat: m.category }
        cur.t += m.tonnesPerYear
        byMat.set(m.name, cur)
      }
    }
    return {
      cats: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]),
      mats: Array.from(byMat.entries()).sort((a, b) => b[1].t - a[1].t).slice(0, 8),
    }
  }, [filteredProducers])

  const visibleTakers = useMemo(
    () => data.takers.filter((t) => t.categories.some((c) => takerCats.has(c))),
    [data, takerCats],
  )

  const visibleFlows = useMemo(() => {
    const ids = new Set(filteredProducers.map((p) => p.id))
    return data.flows.filter(
      (f) => ids.has(f.source) && (!selectedCats.size || (f.category && selectedCats.has(f.category))),
    )
  }, [data, filteredProducers, selectedCats])

  // ---------------- Leaflet map ----------------
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const LRef = useRef<typeof Leaflet | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef = useRef<{ heat?: any; qty?: Leaflet.LayerGroup; producers?: Leaflet.LayerGroup; takers?: Leaflet.LayerGroup; flows?: Leaflet.LayerGroup }>({})
  const [mapReady, setMapReady] = useState(false)
  const [hasSize, setHasSize] = useState(false)
  const [zoom, setZoom] = useState(13)
  const fittedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null
    ;(async () => {
      const L = (await import("leaflet")).default
      ;(window as unknown as { L: typeof Leaflet }).L = L
      await import("leaflet.heat")
      if (cancelled || !mapEl.current || mapRef.current) return
      LRef.current = L
      const map = L.map(mapEl.current, { zoomControl: false, preferCanvas: true }).setView([11.02, 76.96], 13)
      L.control.zoom({ position: "bottomright" }).addTo(map)
      const base = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas"
      L.tileLayer(`${base}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16,
        attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
      }).addTo(map)
      L.tileLayer(`${base}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map)
      L.control.scale({ position: "bottomleft" }).addTo(map)
      map.on("zoomend", () => setZoom(map.getZoom()))
      // Keep Leaflet in sync with its container (filter panel toggle, expand, hidden tabs)
      ro = new ResizeObserver(() => {
        map.invalidateSize()
        setHasSize((mapEl.current?.clientWidth ?? 0) > 0 && (mapEl.current?.clientHeight ?? 0) > 0)
      })
      ro.observe(mapEl.current)
      mapRef.current = map
      setMapReady(true)
    })()
    return () => {
      cancelled = true
      ro?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Fit to data once
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !hasSize || !L || !map || fittedRef.current || !data.producers.length) return
    fittedRef.current = true
    map.fitBounds(L.latLngBounds(data.producers.map((p) => [p.lat, p.lng] as [number, number])).pad(0.25))
  }, [mapReady, hasSize, data])

  // Heatmap (leaflet.heat throws on a zero-sized canvas)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = LRef.current as any, map = mapRef.current
    if (!mapReady || !L || !map) return
    layersRef.current.heat?.remove()
    layersRef.current.heat = undefined
    if (!layerHeat || !hasSize || !filteredProducers.length) return
    const max = Math.max(...filteredProducers.map((p) => p.tonnes), 1)
    layersRef.current.heat = L.heatLayer(
      filteredProducers.map((p) => [p.lat, p.lng, Math.max(0.15, p.tonnes / max)]),
      {
        radius: 40, blur: 28, maxZoom: 14, minOpacity: 0.35,
        gradient: { 0.2: "#6366f1", 0.45: "#22d3ee", 0.65: "#4ade80", 0.85: "#facc15", 1.0: "#ef4444" },
      },
    ).addTo(map)
  }, [mapReady, hasSize, layerHeat, filteredProducers])

  // Quantity bubbles — clustered in screen space, recomputed on zoom
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !L || !map) return
    layersRef.current.qty?.remove()
    if (!layerQty) return
    const group = L.layerGroup()
    const cell = 70
    const buckets = new Map<string, { t: number; lat: number; lng: number; n: number }>()
    for (const p of filteredProducers) {
      const pt = map.project([p.lat, p.lng], zoom)
      const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`
      const b = buckets.get(key) ?? { t: 0, lat: 0, lng: 0, n: 0 }
      b.t += p.tonnes; b.lat += p.lat * p.tonnes; b.lng += p.lng * p.tonnes; b.n += 1
      buckets.set(key, b)
    }
    buckets.forEach((b) => {
      const size = Math.round(Math.min(56, 26 + Math.sqrt(b.t) * 0.9))
      const center: [number, number] = [b.lat / b.t, b.lng / b.t]
      L.marker(center, {
        icon: L.divIcon({ className: "", iconSize: [size, size], html: `<div class="sf-qty" style="width:${size}px;height:${size}px">${fmtT(b.t)}</div>` }),
        zIndexOffset: -100,
      })
        .bindTooltip(`${b.n} producer${b.n > 1 ? "s" : ""} · ${b.t.toFixed(1)} t/yr`, { direction: "top" })
        .on("click", () => map.setView(center, Math.min(zoom + 2, 16)))
        .addTo(group)
    })
    group.addTo(map)
    layersRef.current.qty = group
  }, [mapReady, layerQty, filteredProducers, zoom])

  // Producer pins
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !L || !map) return
    layersRef.current.producers?.remove()
    if (!layerProducers) return
    const group = L.layerGroup()
    for (const p of filteredProducers) {
      const color = p.dominant ? CATEGORY_COLORS[p.dominant] : "#f43f5e"
      const rows = [...p.materials]
        .sort((a, b) => b.tonnesPerYear - a.tonnesPerYear)
        .map((m) => `<tr><td><i style="background:${CATEGORY_COLORS[m.category]}"></i>${escapeHtml(m.name)}${m.confidence === "low" ? " <em>predicted</em>" : ""}</td><td>${m.tonnesPerYear.toFixed(1)} t</td></tr>`)
        .join("")
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -28], html: `<div class="sf-pin" style="--c:${color}"><span></span></div>` }),
      })
        .bindPopup(
          `<div class="sf-pop"><b>${escapeHtml(p.name)}</b><div class="sf-sub">${escapeHtml(p.industryType)} · ${escapeHtml(p.address)}</div>` +
            `<table>${rows}</table><div class="sf-tot">Total residuals: <b>${p.tonnes.toFixed(1)} t/yr</b></div></div>`,
          { maxWidth: 300 },
        )
        .addTo(group)
    }
    group.addTo(map)
    layersRef.current.producers = group
  }, [mapReady, layerProducers, filteredProducers])

  // Takers
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !L || !map) return
    layersRef.current.takers?.remove()
    if (!visibleTakers.length) return
    const group = L.layerGroup()
    for (const t of visibleTakers) {
      const color = CATEGORY_COLORS[t.categories.find((c) => takerCats.has(c)) ?? t.categories[0]]
      L.marker([t.lat, t.lng], {
        icon: L.divIcon({ className: "", iconSize: [20, 20], html: `<div class="sf-taker" style="background:${color}">T</div>` }),
        zIndexOffset: 200,
      })
        .bindPopup(
          `<div class="sf-pop"><b>${escapeHtml(t.name)}</b><div class="sf-sub">Taker · ${escapeHtml(t.industryType)}</div>` +
            `<div>Accepts: ${t.categories.map((c) => escapeHtml(labels[c])).join(", ")}</div>` +
            `<div class="sf-tot">Inbound via matches: <b>${t.inboundTonnes} t/yr</b></div></div>`,
        )
        .addTo(group)
    }
    group.addTo(map)
    layersRef.current.takers = group
  }, [mapReady, visibleTakers, takerCats, labels])

  // Symbiotic flows
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!mapReady || !L || !map) return
    layersRef.current.flows?.remove()
    if (!layerFlows) return
    const byId = new Map<string, { lat: number; lng: number; name: string }>()
    data.producers.forEach((p) => byId.set(p.id, p))
    data.takers.forEach((t) => byId.set(t.id, t))
    const group = L.layerGroup()
    for (const f of visibleFlows) {
      const a = byId.get(f.source), b = byId.get(f.target)
      if (!a || !b) continue
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: f.category ? CATEGORY_COLORS[f.category] : "#10b981",
        weight: Math.min(6, 1.5 + f.tonnesPerYear / 40),
        opacity: 0.8,
        dashArray: f.status === "Active" ? undefined : "6 6",
      })
        .bindTooltip(
          `${escapeHtml(f.material)}: ${escapeHtml(a.name)} → ${escapeHtml(b.name)}<br>${f.tonnesPerYear} t/yr · ${f.distanceKm} km · ${f.compatibilityScore}% match`,
          { sticky: true },
        )
        .addTo(group)
    }
    group.addTo(map)
    layersRef.current.flows = group
  }, [mapReady, layerFlows, visibleFlows, data])

  // ---------------- Actions ----------------
  const clearAll = () => {
    setQuery(""); setSelectedCats(new Set()); setSelectedMaterials(new Set()); setContamination(new Set())
  }

  const exportCsv = () => {
    const header = ["Producer", "Industry", "Address", "Lat", "Lng", "Material", "Category", "Form", "Contamination", "Confidence", "Tonnes/yr"]
    const lines = [header.join(",")]
    for (const p of filteredProducers)
      for (const m of p.materials)
        lines.push(
          [p.name, p.industryType, p.address, p.lat, p.lng, m.name, m.categoryLabel, m.physicalForm, m.contamination, m.confidence, m.tonnesPerYear]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        )
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
    a.download = "symbiosis-residual-materials.csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...(query ? [{ key: "q", label: `“${query}”`, onRemove: () => setQuery("") }] : []),
    ...Array.from(selectedCats).map((c) => ({ key: `c-${c}`, label: labels[c], onRemove: () => toggleIn(setSelectedCats, c) })),
    ...Array.from(selectedMaterials).map((m) => ({ key: `m-${m}`, label: m, onRemove: () => toggleIn(setSelectedMaterials, m) })),
    ...Array.from(contamination).map((c) => ({ key: `x-${c}`, label: `Contamination: ${c}`, onRemove: () => toggleIn(setContamination, c) })),
  ]

  const catsWithData = CATEGORY_ORDER.filter((c) => allMaterialsByCat.has(c))
  const maxCatT = Math.max(...breakdown.cats.map((c) => c[1]), 1)
  const maxMatT = Math.max(...breakdown.mats.map((m) => m[1].t), 1)

  const layerToggles: [string, boolean, (v: boolean) => void][] = [
    ["Heatmap", layerHeat, setLayerHeat],
    ["Quantity (t)", layerQty, setLayerQty],
    ["Producers", layerProducers, setLayerProducers],
    ["Flows", layerFlows, setLayerFlows],
  ]

  return (
    <div className={cn("space-y-4", expanded && "fixed inset-0 z-50 overflow-auto bg-zinc-950 p-6")}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Symbiosis Data Analysis</h1>
          <p className="mt-1 text-zinc-400">Where residual materials are produced across the {data.region}, and who can take them.</p>
        </div>
        <div className="flex gap-6 text-sm text-zinc-400">
          <div><span className="text-2xl font-semibold text-zinc-100">{filteredProducers.length.toLocaleString()}</span> producers</div>
          <div><span className="text-2xl font-semibold text-emerald-400">{Math.round(totalTonnes).toLocaleString()}t</span>/yr residual materials</div>
        </div>
      </div>

      <div className="flex min-h-[28px] flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {chips.length > 0 && (
            <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline">
              <X className="h-3 w-3" /> Clear all filters
            </button>
          )}
        </div>
        <Switch checked={includeLow} onChange={setIncludeLow} label="Include low confidence predictions" />
      </div>

      <div className={cn("grid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950", showFilters ? "grid-cols-[280px_1fr]" : "grid-cols-1")}
        style={{ height: expanded ? "calc(100vh - 230px)" : 640 }}>
        {/* Filters */}
        {showFilters && (
          <aside className="overflow-y-auto border-r border-zinc-800 bg-zinc-900/40 p-4 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold text-emerald-400">Producer filters</span>
              <button type="button" onClick={() => setShowFilters(false)} className="text-zinc-500 hover:text-zinc-200" aria-label="Hide filters">
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Material, factory, industry…"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <Switch checked={searchByName} onChange={setSearchByName} label="Search by business name" />
              <Switch checked={searchByMaterial} onChange={setSearchByMaterial} label="Search by material type" />
            </div>

            <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Residual material type</h4>
            {catsWithData.map((c) => {
              const mats = Array.from((allMaterialsByCat.get(c)?.entries() ?? [])).sort((a, b) => b[1] - a[1])
              const open = expandedCats.has(c)
              return (
                <div key={c}>
                  <div className="flex items-center gap-1 py-1">
                    <button type="button" onClick={() => toggleIn(setExpandedCats, c)} className="text-zinc-500 hover:text-zinc-200" aria-label={`Expand ${labels[c]}`}>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-zinc-200">
                      <input type="checkbox" className="accent-emerald-500" checked={selectedCats.has(c)} onChange={() => toggleIn(setSelectedCats, c)} />
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
                      {labels[c]}
                    </label>
                  </div>
                  {open && mats.map(([name, t]) => (
                    <label key={name} className="flex cursor-pointer items-center gap-2 py-0.5 pl-9 text-xs text-zinc-400 hover:text-zinc-200">
                      <input type="checkbox" className="accent-emerald-500" checked={selectedMaterials.has(name)} onChange={() => toggleIn(setSelectedMaterials, name)} />
                      <span className="flex-1">{name}</span>
                      <span className="text-zinc-600">{fmtT(t)} t</span>
                    </label>
                  ))}
                </div>
              )
            })}

            <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Contamination level</h4>
            {CONTAMINATION_LEVELS.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 py-1 capitalize text-zinc-200">
                <input type="checkbox" className="accent-emerald-500" checked={contamination.has(c)} onChange={() => toggleIn(setContamination, c)} />
                {c}
              </label>
            ))}
          </aside>
        )}

        {/* Map */}
        <div className="relative min-w-0">
          <div ref={mapEl} className="sf-map absolute inset-0" />

          <div className="absolute left-3 top-3 z-[500] flex gap-2">
            {!showFilters && (
              <button type="button" onClick={() => setShowFilters(true)} className="sf-ctl" aria-label="Show filters">
                <PanelLeftOpen className="h-4 w-4" /> Filters
              </button>
            )}
            <button type="button" onClick={() => setExpanded(!expanded)} className="sf-ctl" aria-label={expanded ? "Exit full screen" : "Full screen"}>
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <div className="relative">
              <button type="button" onClick={() => setTakerMenuOpen(!takerMenuOpen)} className={cn("sf-ctl", takerCats.size > 0 && "sf-ctl-on")}>
                <Factory className="h-4 w-4" /> Takers{takerCats.size ? ` (${takerCats.size})` : ""} <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {takerMenuOpen && (
                <div className="absolute left-0 mt-1 w-60 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                  {CATEGORY_ORDER.filter((c) => data.takers.some((t) => t.categories.includes(c))).map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => toggleIn(setTakerCats, c)}
                      className={cn(
                        "flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left text-xs",
                        takerCats.has(c) ? "border-emerald-500 bg-emerald-500/10 text-zinc-100" : "border-transparent text-zinc-500 hover:bg-zinc-800",
                      )}
                    >
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
                      <span className="flex-1">{labels[c]}</span>
                      <span className="text-zinc-600">{data.takers.filter((t) => t.categories.includes(c)).length}</span>
                    </button>
                  ))}
                  {data.takers.length === 0 && <div className="px-3 py-1.5 text-xs text-zinc-500">No takers matched yet</div>}
                </div>
              )}
            </div>
          </div>

          <div className="absolute right-3 top-3 z-[500] flex flex-wrap justify-end gap-2">
            {layerToggles.map(([label, on, set]) => (
              <button type="button" key={label} onClick={() => set(!on)} className={cn("sf-ctl", on && "sf-ctl-on")} aria-pressed={on}>
                {label} <span className="w-3 text-center">{on ? "✓" : ""}</span>
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="absolute bottom-6 right-14 z-[500] w-64 rounded-lg border border-zinc-800 bg-zinc-900/95 p-3 text-xs shadow-xl">
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-zinc-200"><Layers className="h-3.5 w-3.5" /> Residual materials</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {CATEGORY_ORDER.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />{labels[c]}
                </span>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-zinc-800 pt-2 text-zinc-400">
              <span className="flex items-center gap-1"><span className="sf-pin mini" style={{ ["--c" as string]: "#f43f5e" }}><span /></span> Producer</span>
              <span className="flex items-center gap-1"><span className="sf-taker mini" style={{ background: "#64748b" }}>T</span> Taker</span>
              <span className="flex items-center gap-1"><span className="sf-qty mini">t</span> Tonnes/yr</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="absolute bottom-10 left-3 z-[500] w-[min(560px,calc(100%-310px))] rounded-lg border border-zinc-800 bg-zinc-900/95 text-xs shadow-xl">
            <button type="button" onClick={() => setShowBreakdown(!showBreakdown)} className="flex w-full items-center justify-between px-3 py-2.5 font-semibold text-zinc-200">
              <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-emerald-400" /> Residual materials breakdown</span>
              <span className="text-emerald-400">{showBreakdown ? "Hide" : "Show"}</span>
            </button>
            {showBreakdown && (
              <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 px-3 pb-3">
                {[
                  { title: "By category", rows: breakdown.cats.map(([c, t]) => ({ key: c, label: labels[c], t, color: CATEGORY_COLORS[c], max: maxCatT })) },
                  { title: "Top materials", rows: breakdown.mats.map(([n, { t, cat }]) => ({ key: n, label: n, t, color: CATEGORY_COLORS[cat], max: maxMatT })) },
                ].map((col) => (
                  <div key={col.title}>
                    <h5 className="mb-1.5 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{col.title}</h5>
                    {col.rows.map((r) => (
                      <div key={r.key} className="my-1 grid grid-cols-[96px_1fr_44px] items-center gap-1.5">
                        <span className="truncate text-zinc-400">{r.label}</span>
                        <span className="h-2 overflow-hidden rounded bg-zinc-800">
                          <span className="block h-full rounded" style={{ width: `${(r.t / r.max) * 100}%`, background: r.color }} />
                        </span>
                        <span className="text-right font-medium text-zinc-200">{fmtT(r.t)} t</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pr-20">
        <button type="button" onClick={() => setShowList(!showList)} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:underline">
          <List className="h-4 w-4" /> {showList ? "Hide" : "Show"} list of producers for active filters
        </button>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:underline">
          <Download className="h-4 w-4" /> Export data
        </button>
      </div>

      {showList && (
        <div className="max-h-80 overflow-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">Producer</th><th className="px-3 py-2">Industry</th><th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Residual materials</th><th className="px-3 py-2 text-right">t/yr</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredProducers].sort((a, b) => b.tonnes - a.tonnes).map((p) => (
                <tr key={p.id} onClick={() => mapRef.current?.setView([p.lat, p.lng], 15)} className="cursor-pointer border-t border-zinc-800/70 hover:bg-emerald-500/5">
                  <td className="px-3 py-2 font-medium text-zinc-100">{p.name}</td>
                  <td className="px-3 py-2 text-zinc-400">{p.industryType}</td>
                  <td className="px-3 py-2 text-zinc-400">{p.address}</td>
                  <td className="px-3 py-2">
                    {p.materials.map((m) => (
                      <span key={m.id} className="mb-0.5 mr-1 inline-block rounded border px-1.5 text-[11px]" style={{ borderColor: CATEGORY_COLORS[m.category], color: CATEGORY_COLORS[m.category] }}>
                        {m.name}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-zinc-100">{p.tonnes.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
