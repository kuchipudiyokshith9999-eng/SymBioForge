"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GeoJSONSource, Map as MLMap, Marker, Popup } from "maplibre-gl"
import {
  ArrowRight, BarChart3, Box, ChevronDown, ChevronRight, Download, Layers, List, Map as MapIcon,
  Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, RotateCcw, Satellite, Search, SlidersHorizontal, Square, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { boundsOf, columnHeight, hexagon } from "@/lib/geo"
import {
  Map3D, addSquareIcon, flyToPoint, resetCamera, useFlowAnimation, LABELS_LAYER, type Basemap, type MapLibre, type ViewMode,
} from "@/components/maps/map-3d"
import { CameraHint, CheckRow, Segmented, StatCard, ToolbarButton, ToolbarPopover } from "@/components/maps/map-controls"
import type { AnalysisMaterial, MaterialCategory, SymbiosisAnalysis } from "@/lib/symbiosis-analysis"

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
const CONTAMINATION_TONE: Record<AnalysisMaterial["contamination"], string> = {
  clean: "text-emerald-400", mild: "text-lime-300", high: "text-amber-400", hazardous: "text-rose-400",
}

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

type Selection = { kind: "producer" | "taker"; id: string } | null
const PRODUCER_LAYERS = ["producers", "columns"]

export function SymbiosisAnalysisMap({ data }: { data: SymbiosisAnalysis }) {
  const labels = data.categoryLabels

  // ---------------- Filters ----------------
  const [query, setQuery] = useState("")
  const [searchByName, setSearchByName] = useState(true)
  const [searchByMaterial, setSearchByMaterial] = useState(true)
  const [selectedCats, setSelectedCats] = useState<Set<MaterialCategory>>(new Set())
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set())
  const [contamination, setContamination] = useState<Set<AnalysisMaterial["contamination"]>>(new Set())
  const [includeLow, setIncludeLow] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<MaterialCategory>>(new Set())
  const [showFilters, setShowFilters] = useState(true)

  // ---------------- View & layers ----------------
  const [mode, setMode] = useState<ViewMode>("3d")
  const [basemap, setBasemap] = useState<Basemap>("dark")
  const [layerHeat, setLayerHeat] = useState(true)
  const [layerTonnage, setLayerTonnage] = useState(true)
  const [layerProducers, setLayerProducers] = useState(true)
  const [layerFlows, setLayerFlows] = useState(false)
  const [takerCats, setTakerCats] = useState<Set<MaterialCategory>>(new Set())
  const [selection, setSelection] = useState<Selection>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [showList, setShowList] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Narrow screens: start with filters collapsed so the map gets the space
  useEffect(() => {
    if (window.innerWidth < 1100) setShowFilters(false)
  }, [])

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

  const placeById = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number; name: string; industryType: string }>()
    data.producers.forEach((p) => m.set(p.id, p))
    data.takers.forEach((t) => m.set(t.id, t))
    return m
  }, [data])

  const selectedProducer = selection?.kind === "producer" ? data.producers.find((p) => p.id === selection.id) : undefined
  const selectedTaker = selection?.kind === "taker" ? data.takers.find((t) => t.id === selection.id) : undefined
  const selectedFlows = useMemo(
    () => (selection ? data.flows.filter((f) => f.source === selection.id || f.target === selection.id) : []),
    [data, selection],
  )

  const initialBounds = useMemo(() => boundsOf(data.producers), [data])

  // ---------------- Map wiring ----------------
  const mapRef = useRef<MLMap | null>(null)
  const mlRef = useRef<MapLibre | null>(null)
  const [ready, setReady] = useState(false)
  const bubbleMarkers = useRef<Marker[]>([])
  const hoverPopup = useRef<Popup | null>(null)
  const prevSelected = useRef<Selection>(null)
  const [zoomTick, setZoomTick] = useState(0)

  const handleReady = useCallback((map: MLMap, ml: MapLibre) => {
    mapRef.current = map
    mlRef.current = ml
    const empty = { type: "FeatureCollection" as const, features: [] }
    map.addSource("producers", { type: "geojson", data: empty, promoteId: "id" })
    map.addSource("columns", { type: "geojson", data: empty, promoteId: "id" })
    map.addSource("takers", { type: "geojson", data: empty, promoteId: "id" })
    map.addSource("flows", { type: "geojson", data: empty })
    map.addSource("flows-selected", { type: "geojson", data: empty })
    CATEGORY_ORDER.forEach((c) => addSquareIcon(map, `taker-${c}`, CATEGORY_COLORS[c], "T"))

    map.addLayer({
      id: "heat",
      type: "heatmap",
      source: "producers",
      paint: {
        "heatmap-weight": ["get", "w"],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 15, 2],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 13, 45, 16, 90],
        "heatmap-opacity": 0.7,
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)", 0.15, "#312e81", 0.35, "#0891b2", 0.55, "#10b981", 0.75, "#facc15", 1, "#ef4444",
        ],
      },
    }, LABELS_LAYER)
    map.addLayer({
      id: "flows",
      type: "line",
      source: "flows",
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.8, "line-dasharray": [0, 4, 3] },
    })
    map.addLayer({
      id: "flows-selected-glow",
      type: "line",
      source: "flows-selected",
      paint: { "line-color": ["get", "color"], "line-width": ["+", ["get", "width"], 8], "line-opacity": 0.25, "line-blur": 6 },
    })
    map.addLayer({
      id: "flows-selected",
      type: "line",
      source: "flows-selected",
      paint: { "line-color": ["get", "color"], "line-width": ["+", ["get", "width"], 1.5], "line-dasharray": [0, 4, 3] },
    })
    map.addLayer({
      id: "columns",
      type: "fill-extrusion",
      source: "columns",
      paint: {
        "fill-extrusion-color": ["case", ["boolean", ["feature-state", "selected"], false], "#fafafa", ["get", "color"]],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.9,
        "fill-extrusion-vertical-gradient": true,
      },
    })
    map.addLayer({
      id: "producers",
      type: "circle",
      source: "producers",
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 17, 11],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 1.5],
        "circle-pitch-alignment": "map",
      },
    })
    map.addLayer({
      id: "takers",
      type: "symbol",
      source: "takers",
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.75, 15, 1.15],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    })

    // Hover tooltip + click-to-select (one click handler so empty-map clicks clear selection)
    hoverPopup.current = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "sf-hover" })
    const interactive = [...PRODUCER_LAYERS, "takers"]
    interactive.forEach((layer) => {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer" })
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; hoverPopup.current?.remove() })
      map.on("mousemove", layer, (e) => {
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as { name: string; sub: string }
        hoverPopup.current!.setLngLat(e.lngLat).setHTML(`<b>${escapeHtml(p.name)}</b><div>${escapeHtml(p.sub)}</div>`).addTo(map)
      })
    })
    map.on("click", (e) => {
      const layers = interactive.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none")
      const f = map.queryRenderedFeatures(e.point, { layers })[0]
      if (!f) return setSelection(null)
      setSelection({ kind: f.layer.id === "takers" ? "taker" : "producer", id: String(f.properties.id) })
    })
    map.on("zoomend", () => setZoomTick((t) => t + 1))
    setReady(true)
  }, [])

  // Producer points + 3D columns
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const max = Math.max(...filteredProducers.map((p) => p.tonnes), 1)
    const points = filteredProducers.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id, name: p.name, sub: `${p.tonnes.toFixed(1)} t/yr · ${p.industryType}`,
        color: p.dominant ? CATEGORY_COLORS[p.dominant] : "#f43f5e", w: Math.max(0.15, p.tonnes / max),
      },
    }))
    const cols = filteredProducers.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: hexagon(p.lng, p.lat, 110) },
      properties: {
        id: p.id, name: p.name, sub: `${p.tonnes.toFixed(1)} t/yr · ${p.industryType}`,
        color: p.dominant ? CATEGORY_COLORS[p.dominant] : "#f43f5e", height: columnHeight(p.tonnes),
      },
    }))
    ;(map.getSource("producers") as GeoJSONSource).setData({ type: "FeatureCollection", features: points })
    ;(map.getSource("columns") as GeoJSONSource).setData({ type: "FeatureCollection", features: cols })
  }, [ready, filteredProducers])

  // Takers
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource("takers") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: visibleTakers.map((t) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] },
        properties: {
          id: t.id, name: t.name, sub: `Taker · accepts ${t.categories.map((c) => labels[c]).join(", ")}`,
          icon: `taker-${t.categories.find((c) => takerCats.has(c)) ?? t.categories[0]}`,
        },
      })),
    })
  }, [ready, visibleTakers, takerCats, labels])

  // Flows (all, when toggled) and flows of the selected place (always)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const toFeatures = (flows: typeof data.flows) =>
      flows.flatMap((f) => {
        const a = placeById.get(f.source), b = placeById.get(f.target)
        if (!a || !b) return []
        return [{
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
          properties: { color: f.category ? CATEGORY_COLORS[f.category] : "#10b981", width: Math.min(6, 1.5 + f.tonnesPerYear / 40) },
        }]
      })
    ;(map.getSource("flows") as GeoJSONSource).setData({ type: "FeatureCollection", features: toFeatures(visibleFlows) })
    ;(map.getSource("flows-selected") as GeoJSONSource).setData({ type: "FeatureCollection", features: toFeatures(selectedFlows) })
  }, [ready, visibleFlows, selectedFlows, placeById, data])

  // Layer visibility (tonnage = 3D columns in 3D view, bubbles in 2D)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const vis = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    vis("heat", layerHeat)
    vis("columns", layerTonnage && mode === "3d")
    vis("producers", layerProducers)
    vis("flows", layerFlows)
  }, [ready, layerHeat, layerTonnage, layerProducers, layerFlows, mode])

  // 2D tonnage bubbles: clustered in screen space and recomputed on zoom
  useEffect(() => {
    const map = mapRef.current, ml = mlRef.current
    bubbleMarkers.current.forEach((m) => m.remove())
    bubbleMarkers.current = []
    if (!ready || !map || !ml || !layerTonnage || mode !== "2d") return
    const cell = 72
    const buckets = new Map<string, { t: number; lat: number; lng: number; n: number }>()
    for (const p of filteredProducers) {
      const pt = map.project([p.lng, p.lat])
      const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`
      const b = buckets.get(key) ?? { t: 0, lat: 0, lng: 0, n: 0 }
      b.t += p.tonnes; b.lat += p.lat * p.tonnes; b.lng += p.lng * p.tonnes; b.n += 1
      buckets.set(key, b)
    }
    buckets.forEach((b) => {
      const size = Math.round(Math.min(58, 28 + Math.sqrt(b.t) * 0.9))
      const el = document.createElement("button")
      el.type = "button"
      el.className = "sf-qty"
      el.style.width = el.style.height = `${size}px`
      el.textContent = fmtT(b.t)
      el.title = `${b.n} producer${b.n > 1 ? "s" : ""} · ${b.t.toFixed(1)} t/yr — click to zoom in`
      const center: [number, number] = [b.lng / b.t, b.lat / b.t]
      el.addEventListener("click", (ev) => { ev.stopPropagation(); map.easeTo({ center, zoom: map.getZoom() + 2 }) })
      bubbleMarkers.current.push(new ml.Marker({ element: el }).setLngLat(center).addTo(map))
    })
  }, [ready, layerTonnage, mode, filteredProducers, zoomTick])

  // Selection highlight (feature-state) + camera
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const setSel = (s: Selection, v: boolean) => {
      if (!s) return
      const sources = s.kind === "producer" ? ["producers", "columns"] : ["takers"]
      sources.forEach((source) => map.setFeatureState({ source, id: s.id }, { selected: v }))
    }
    setSel(prevSelected.current, false)
    setSel(selection, true)
    prevSelected.current = selection
    const place = selection && placeById.get(selection.id)
    if (place) flyToPoint(map, place.lng, place.lat, 13.5)
  }, [ready, selection, placeById])

  // Animate flow dashes (direction = producer → taker)
  useFlowAnimation(mapRef.current, ready, ["flows", "flows-selected"])

  // Escape closes the detail panel / full screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (selection) setSelection(null)
      else if (expanded) setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selection, expanded])

  // ---------------- Actions ----------------
  const clearAll = () => {
    setQuery(""); setSelectedCats(new Set()); setSelectedMaterials(new Set()); setContamination(new Set())
  }
  const select = (kind: "producer" | "taker", id: string) => setSelection({ kind, id })

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
  const activeFilterCount = chips.length

  const catsWithData = CATEGORY_ORDER.filter((c) => allMaterialsByCat.has(c))
  const takerCatsAvailable = CATEGORY_ORDER.filter((c) => data.takers.some((t) => t.categories.includes(c)))
  const maxCatT = Math.max(...breakdown.cats.map((c) => c[1]), 1)
  const maxMatT = Math.max(...breakdown.mats.map((m) => m[1].t), 1)
  const topMaterial = breakdown.mats[0]

  // ---------------- Render ----------------
  return (
    <div className={cn("space-y-4", expanded && "fixed inset-0 z-50 overflow-auto bg-zinc-950 p-4 md:p-6")}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Symbiosis Map</h1>
          <p className="mt-1 text-zinc-400">
            Where residual materials are produced across the {data.region} — and which factories can take them.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={includeLow}
          onClick={() => setIncludeLow(!includeLow)}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100"
          title="Also show waste streams the Profiler inferred from industry type (not declared by the factory)"
        >
          <span className={cn("relative h-4 w-7 rounded-full transition-colors", includeLow ? "bg-emerald-500" : "bg-zinc-700")}>
            <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", includeLow ? "left-3.5" : "left-0.5")} />
          </span>
          Include predicted (low-confidence) streams
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Producers" value={filteredProducers.length} sub={`of ${data.producers.length} in the cluster`} />
        <StatCard label="Residual materials" value={`${Math.round(totalTonnes).toLocaleString()} t`} sub="per year" accent />
        <StatCard label="Material types" value={breakdown.mats.length ? new Set(filteredProducers.flatMap((p) => p.materials.map((m) => m.name))).size : 0} sub={`${breakdown.cats.length} categories`} />
        <StatCard label="Symbiotic flows" value={visibleFlows.length} sub={`${data.takers.length} takers matched`} />
        <StatCard label="Largest stream" value={topMaterial ? topMaterial[0] : "—"} sub={topMaterial ? `${fmtT(topMaterial[1].t)} t/yr` : undefined} />
      </div>

      {/* Active filters */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Filtered by</span>
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-emerald-300">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`} className="rounded-full p-0.5 hover:bg-emerald-500/20">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:underline">
            Clear all
          </button>
        </div>
      )}

      <div
        className={cn("grid overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950", showFilters ? "grid-cols-1 lg:grid-cols-[290px_1fr]" : "grid-cols-1")}
        style={{ height: expanded ? "calc(100vh - 250px)" : 680 }}
      >
        {/* Filter panel */}
        {showFilters && (
          <aside className="hidden overflow-y-auto border-r border-zinc-800 bg-zinc-900/40 p-4 text-sm lg:block">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-zinc-100">
                <SlidersHorizontal className="h-4 w-4 text-emerald-400" /> Filters
                {activeFilterCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-zinc-950">{activeFilterCount}</span>}
              </span>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearAll} className="text-xs text-zinc-400 hover:text-zinc-100">Reset</button>
                )}
                <button type="button" onClick={() => setShowFilters(false)} className="text-zinc-500 hover:text-zinc-200" aria-label="Hide filters" title="Hide filters">
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search factory, material, industry…"
                aria-label="Search producers"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-8 pr-8 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 flex gap-1.5 text-[11px]">
              <span className="py-0.5 text-zinc-500">Match:</span>
              {([["Business name", searchByName, setSearchByName], ["Material", searchByMaterial, setSearchByMaterial]] as const).map(([l, on, set]) => (
                <button key={l} type="button" aria-pressed={on} onClick={() => set(!on)}
                  className={cn("rounded-full border px-2 py-0.5", on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-500")}>
                  {l}
                </button>
              ))}
            </div>

            <h4 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Material type</h4>
            {catsWithData.map((c) => {
              const mats = Array.from(allMaterialsByCat.get(c)?.entries() ?? []).sort((a, b) => b[1] - a[1])
              const catT = mats.reduce((s, [, t]) => s + t, 0)
              const open = expandedCats.has(c)
              return (
                <div key={c} className="rounded-lg hover:bg-zinc-800/40">
                  <div className="flex items-center gap-1 px-1 py-1">
                    <button type="button" onClick={() => toggleIn(setExpandedCats, c)} className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                      aria-label={`${open ? "Collapse" : "Expand"} ${labels[c]}`} aria-expanded={open}>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-zinc-200">
                      <input type="checkbox" className="accent-emerald-500" checked={selectedCats.has(c)} onChange={() => toggleIn(setSelectedCats, c)} />
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />
                      <span className="flex-1">{labels[c]}</span>
                      <span className="text-[11px] tabular-nums text-zinc-500">{fmtT(catT)} t</span>
                    </label>
                  </div>
                  {open && (
                    <div className="pb-1">
                      {mats.map(([name, t]) => (
                        <label key={name} className="flex cursor-pointer items-center gap-2 py-0.5 pl-10 pr-1 text-xs text-zinc-400 hover:text-zinc-200">
                          <input type="checkbox" className="accent-emerald-500" checked={selectedMaterials.has(name)} onChange={() => toggleIn(setSelectedMaterials, name)} />
                          <span className="flex-1">{name}</span>
                          <span className="tabular-nums text-zinc-600">{fmtT(t)} t</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <h4 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Contamination</h4>
            <div className="flex flex-wrap gap-1.5">
              {CONTAMINATION_LEVELS.map((c) => (
                <button key={c} type="button" aria-pressed={contamination.has(c)} onClick={() => toggleIn(setContamination, c)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs capitalize",
                    contamination.has(c) ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" : "border-zinc-800 text-zinc-400 hover:text-zinc-200")}>
                  <span className={CONTAMINATION_TONE[c]}>●</span> {c}
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Map */}
        <Map3D bounds={initialBounds} mode={mode} basemap={basemap} onReady={handleReady} className="min-h-0 min-w-0">
          {/* Toolbar: left */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!showFilters && (
              <ToolbarButton onClick={() => setShowFilters(true)} aria-label="Show filters" className="hidden lg:inline-flex">
                <PanelLeftOpen className="h-3.5 w-3.5" /> Filters
                {activeFilterCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-zinc-950">{activeFilterCount}</span>}
              </ToolbarButton>
            )}
            <Segmented label="View" value={mode} onChange={setMode} options={[
              { value: "2d", label: <><Square className="h-3.5 w-3.5" /> 2D</>, title: "Flat map" },
              { value: "3d", label: <><Box className="h-3.5 w-3.5" /> 3D</>, title: "Tilted map with terrain and tonnage columns" },
            ]} />
            <Segmented label="Basemap" value={basemap} onChange={setBasemap} options={[
              { value: "dark", label: <><MapIcon className="h-3.5 w-3.5" /> Map</> },
              { value: "satellite", label: <><Satellite className="h-3.5 w-3.5" /> Satellite</> },
            ]} />
            <ToolbarButton onClick={() => mapRef.current && resetCamera(mapRef.current, initialBounds, mode)} title="Reset view" aria-label="Reset view">
              <RotateCcw className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>

          {/* Toolbar: right */}
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            <ToolbarPopover
              width="w-72"
              button={(open, toggle) => (
                <ToolbarButton active={open} onClick={toggle} aria-expanded={open}>
                  <Layers className="h-3.5 w-3.5" /> Layers <ChevronDown className="h-3 w-3" />
                </ToolbarButton>
              )}
            >
              <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Show on map</div>
              <CheckRow checked={layerHeat} onChange={setLayerHeat}>
                <span className="h-2.5 w-5 rounded-full bg-gradient-to-r from-indigo-700 via-emerald-500 to-red-500" /> Heatmap
              </CheckRow>
              <CheckRow checked={layerTonnage} onChange={setLayerTonnage} hint={mode === "3d" ? "3D columns" : "bubbles"}>
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" /> Tonnage
              </CheckRow>
              <CheckRow checked={layerProducers} onChange={setLayerProducers}>
                <span className="h-2.5 w-2.5 rounded-full border border-white bg-rose-500" /> Producers
              </CheckRow>
              <CheckRow checked={layerFlows} onChange={setLayerFlows} hint={`${visibleFlows.length}`}>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-400" /> Symbiotic flows
              </CheckRow>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800 px-2 pb-1 pt-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Takers that accept</span>
                <button type="button" className="text-[11px] text-emerald-400 hover:underline"
                  onClick={() => setTakerCats(takerCats.size === takerCatsAvailable.length ? new Set() : new Set(takerCatsAvailable))}>
                  {takerCats.size === takerCatsAvailable.length ? "None" : "All"}
                </button>
              </div>
              {takerCatsAvailable.map((c) => (
                <CheckRow key={c} checked={takerCats.has(c)} onChange={() => toggleIn(setTakerCats, c)} hint={data.takers.filter((t) => t.categories.includes(c)).length}>
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CATEGORY_COLORS[c] }} /> {labels[c]}
                </CheckRow>
              ))}
              {takerCatsAvailable.length === 0 && <div className="px-2 py-1.5 text-xs text-zinc-500">No takers matched yet</div>}
            </ToolbarPopover>
            <ToolbarButton onClick={() => setExpanded(!expanded)} title={expanded ? "Exit full screen (Esc)" : "Full screen"} aria-label={expanded ? "Exit full screen" : "Full screen"}>
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </ToolbarButton>
          </div>
          </div>

          {/* Empty state */}
          {filteredProducers.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[1px]">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/95 px-6 py-5 text-center shadow-2xl">
                <p className="font-medium text-zinc-100">No producers match these filters</p>
                <p className="mt-1 text-sm text-zinc-400">Try removing a filter or searching for something else.</p>
                <button type="button" onClick={clearAll} className="mt-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400">
                  Clear all filters
                </button>
              </div>
            </div>
          )}

          {/* Detail panel */}
          {(selectedProducer || selectedTaker) && (
            <div className="absolute bottom-3 right-3 top-24 z-20 flex w-80 xl:top-14 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-2 border-b border-zinc-800 p-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">{selectedProducer ? "Producer" : "Taker"}</div>
                  <h3 className="mt-0.5 font-semibold leading-snug text-zinc-100">{(selectedProducer ?? selectedTaker)!.name}</h3>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {(selectedProducer ?? selectedTaker)!.industryType}
                    {selectedProducer && <> · {selectedProducer.address}</>}
                  </p>
                </div>
                <button type="button" onClick={() => setSelection(null)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close details (Esc)">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
                {selectedProducer && (() => {
                  const mats = [...selectedProducer.materials].sort((a, b) => b.tonnesPerYear - a.tonnesPerYear)
                  const total = mats.reduce((s, m) => s + m.tonnesPerYear, 0)
                  const max = Math.max(...mats.map((m) => m.tonnesPerYear), 1)
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-zinc-950/60 p-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Residuals</div>
                          <div className="text-lg font-semibold text-emerald-400">{fmtT(total)} t<span className="text-xs text-zinc-500">/yr</span></div>
                        </div>
                        <div className="rounded-lg bg-zinc-950/60 p-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Compliance</div>
                          <div className={cn("text-lg font-semibold capitalize", selectedProducer.complianceStatus === "filed" ? "text-emerald-400" : selectedProducer.complianceStatus === "overdue" ? "text-rose-400" : "text-amber-400")}>
                            {selectedProducer.complianceStatus}
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Residual materials</h4>
                        <div className="space-y-2">
                          {mats.map((m) => (
                            <div key={m.id}>
                              <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-zinc-200">
                                  {m.name}
                                  {m.confidence === "low" && <span className="ml-1.5 rounded bg-amber-500/15 px-1 text-[10px] text-amber-300">predicted</span>}
                                </span>
                                <span className="tabular-nums font-medium text-zinc-100">{m.tonnesPerYear.toFixed(1)} t</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                <div className="h-full rounded-full" style={{ width: `${(m.tonnesPerYear / max) * 100}%`, background: CATEGORY_COLORS[m.category] }} />
                              </div>
                              <div className="mt-0.5 text-[10px] text-zinc-500">
                                {m.categoryLabel} · {m.physicalForm} · <span className={CONTAMINATION_TONE[m.contamination]}>{m.contamination}</span> · reuse {m.reusePotential}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )
                })()}

                {selectedTaker && (
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Accepts</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTaker.categories.map((c) => (
                        <span key={c} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: CATEGORY_COLORS[c], color: CATEGORY_COLORS[c] }}>{labels[c]}</span>
                      ))}
                    </div>
                    <div className="mt-3 rounded-lg bg-zinc-950/60 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Inbound via matches</div>
                      <div className="text-lg font-semibold text-emerald-400">{selectedTaker.inboundTonnes} t<span className="text-xs text-zinc-500">/yr</span></div>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {selectedProducer ? "Where it can go" : "Where it comes from"} ({selectedFlows.filter((f) => (selectedProducer ? f.source : f.target) === selection!.id).length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedFlows
                      .filter((f) => (selectedProducer ? f.source : f.target) === selection!.id)
                      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
                      .map((f) => {
                        const otherId = selectedProducer ? f.target : f.source
                        const other = placeById.get(otherId)
                        return (
                          <button key={f.id} type="button" onClick={() => select(selectedProducer ? "taker" : "producer", otherId)}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-left hover:border-emerald-500/50 hover:bg-emerald-500/5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-medium text-zinc-100">{other?.name ?? otherId}</span>
                              <span className="flex-none rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-300">{f.compatibilityScore}%</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                              {f.category && <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_COLORS[f.category] }} />}
                              {f.material} · {f.tonnesPerYear} t/yr · {f.distanceKm} km
                            </div>
                          </button>
                        )
                      })}
                    {selectedFlows.filter((f) => (selectedProducer ? f.source : f.target) === selection!.id).length === 0 && (
                      <p className="text-xs text-zinc-500">No symbiotic matches yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Legend (hidden while the detail panel is open to keep the map readable) */}
          {!selection && <div className="absolute bottom-10 right-14 z-10 w-60 rounded-xl border border-zinc-800 bg-zinc-900/95 text-xs shadow-xl backdrop-blur">
            <button type="button" onClick={() => setShowLegend(!showLegend)} className="flex w-full items-center justify-between px-3 py-2 font-semibold text-zinc-200" aria-expanded={showLegend}>
              <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-emerald-400" /> Legend</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", !showLegend && "-rotate-90")} />
            </button>
            {showLegend && (
              <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {CATEGORY_ORDER.map((c) => (
                    <span key={c} className="flex items-center gap-1.5 text-zinc-400">
                      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />{labels[c]}
                    </span>
                  ))}
                </div>
                <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2 text-zinc-400">
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white bg-rose-500" /> Producer (main material)</div>
                  <div className="flex items-center gap-2"><span className="flex h-3 w-3 items-center justify-center rounded-[3px] bg-zinc-500 text-[8px] font-bold text-white">T</span> Taker — can absorb material</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-2 rounded-[1px] bg-gradient-to-t from-emerald-700 to-emerald-400" /> {mode === "3d" ? "Column height = tonnes/yr" : "Bubble = tonnes/yr"}</div>
                  <div className="flex items-center gap-2"><span className="h-0 w-4 border-t-2 border-dashed border-emerald-400" /> Flow, producer → taker</div>
                </div>
              </div>
            )}
          </div>}

          {/* Breakdown */}
          <div className="absolute bottom-10 left-3 z-10 w-[min(520px,calc(100%-300px))] rounded-xl border border-zinc-800 bg-zinc-900/95 text-xs shadow-xl backdrop-blur">
            <button type="button" onClick={() => setShowBreakdown(!showBreakdown)} className="flex w-full items-center justify-between px-3 py-2 font-semibold text-zinc-200" aria-expanded={showBreakdown}>
              <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-emerald-400" /> Materials breakdown</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", !showBreakdown && "rotate-180")} />
            </button>
            {showBreakdown && (
              <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 px-3 pb-3">
                {[
                  { title: "By category", rows: breakdown.cats.map(([c, t]) => ({ key: c, label: labels[c], t, color: CATEGORY_COLORS[c], max: maxCatT, onClick: () => toggleIn(setSelectedCats, c) })) },
                  { title: "Top materials", rows: breakdown.mats.map(([n, { t, cat }]) => ({ key: n, label: n, t, color: CATEGORY_COLORS[cat], max: maxMatT, onClick: () => setQuery(n) })) },
                ].map((col) => (
                  <div key={col.title}>
                    <h5 className="mb-1.5 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{col.title}</h5>
                    {col.rows.map((r) => (
                      <button type="button" key={r.key} onClick={r.onClick} title={`Filter by ${r.label}`}
                        className="my-0.5 grid w-full grid-cols-[92px_1fr_44px] items-center gap-1.5 rounded px-0.5 text-left hover:bg-zinc-800/60">
                        <span className="truncate text-zinc-400">{r.label}</span>
                        <span className="h-2 overflow-hidden rounded bg-zinc-800">
                          <span className="block h-full rounded" style={{ width: `${(r.t / r.max) * 100}%`, background: r.color }} />
                        </span>
                        <span className="text-right font-medium tabular-nums text-zinc-200">{fmtT(r.t)} t</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <CameraHint show={mode === "3d" && ready && !selection} />
        </Map3D>
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pr-20">
        <button type="button" onClick={() => setShowList(!showList)} aria-expanded={showList}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900">
          <List className="h-4 w-4 text-emerald-400" /> {showList ? "Hide" : "Show"} producer list ({filteredProducers.length})
        </button>
        <button type="button" onClick={exportCsv} disabled={!filteredProducers.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-40">
          <Download className="h-4 w-4 text-emerald-400" /> Export CSV
        </button>
      </div>

      {showList && (
        <div className="max-h-96 overflow-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-900 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">Producer</th><th className="px-3 py-2">Industry</th><th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Residual materials</th><th className="px-3 py-2 text-right">t/yr</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredProducers].sort((a, b) => b.tonnes - a.tonnes).map((p) => (
                <tr key={p.id} onClick={() => select("producer", p.id)}
                  className={cn("cursor-pointer border-t border-zinc-800/70 hover:bg-emerald-500/5", selection?.id === p.id && "bg-emerald-500/10")}>
                  <td className="px-3 py-2 font-medium text-zinc-100">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: p.dominant ? CATEGORY_COLORS[p.dominant] : "#f43f5e" }} />
                    {p.name}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{p.industryType}</td>
                  <td className="px-3 py-2 text-zinc-400">{p.address}</td>
                  <td className="px-3 py-2">
                    {p.materials.map((m) => (
                      <span key={m.id} className="mb-0.5 mr-1 inline-block rounded border px-1.5 text-[11px]" style={{ borderColor: CATEGORY_COLORS[m.category], color: CATEGORY_COLORS[m.category] }}>
                        {m.name}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-100">{p.tonnes.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
