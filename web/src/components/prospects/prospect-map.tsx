"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GeoJSONSource, Map as MLMap, Popup } from "maplibre-gl"
import {
  Box, Building2, Check, ChevronDown, Copy, Download, ExternalLink, Globe, Layers, List, Map as MapIcon, Maximize2,
  Minimize2, RotateCcw, Satellite, Search, Square, Target, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { hexBin, hexagon } from "@/lib/geo"
import { Map3D, flyToPoint, type Basemap, type MapLibre, type ViewMode } from "@/components/maps/map-3d"
import { CameraHint, CheckRow, Segmented, StatCard, ToolbarButton, ToolbarPopover } from "@/components/maps/map-controls"
import { SECTORS, SECTOR_ORDER, type CityId, type Prospect, type ProspectDataset, type SectorId } from "@/lib/prospects"

type CityFilter = CityId | "all"
type RoleFilter = "all" | "producer" | "taker"
type Tier = Prospect["tier"]

const TIER_LABEL: Record<Tier, string> = { high: "High fit", medium: "Medium fit", low: "Low fit" }
const TIER_TONE: Record<Tier, string> = {
  high: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
}
const ROLE_LABEL = { producer: "Waste producer", taker: "Waste taker", both: "Producer & taker" } as const

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

/** Hex size for the 3D density columns; wider when showing all three cities at once. */
const binRadius = (city: CityFilter) => (city === "all" ? 2500 : 1100)

export function ProspectMap({ data }: { data: ProspectDataset }) {
  const [city, setCity] = useState<CityFilter>("coimbatore")
  const [mode, setMode] = useState<ViewMode>("3d")
  const [basemap, setBasemap] = useState<Basemap>("dark")
  const [query, setQuery] = useState("")
  const [sectors, setSectors] = useState<Set<SectorId>>(new Set())
  const [tiers, setTiers] = useState<Set<Tier>>(new Set())
  const [role, setRole] = useState<RoleFilter>("all")
  const [websiteOnly, setWebsiteOnly] = useState(false)
  const [layerDensity, setLayerDensity] = useState(true)
  const [layerPoints, setLayerPoints] = useState(true)
  const [layerEstates, setLayerEstates] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showList, setShowList] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const cityById = useMemo(() => new Map(data.cities.map((c) => [c.id, c])), [data])
  const inCity = useCallback((c: CityId) => city === "all" || c === city, [city])

  // ---------------- Derived ----------------
  const cityProspects = useMemo(() => data.prospects.filter((p) => inCity(p.city)), [data, inCity])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cityProspects.filter((p) => {
      if (sectors.size && !sectors.has(p.sector)) return false
      if (tiers.size && !tiers.has(p.tier)) return false
      if (role === "producer" && p.role === "taker") return false
      if (role === "taker" && p.role === "producer") return false
      if (websiteOnly && !p.website) return false
      if (q && !`${p.name} ${SECTORS[p.sector].label} ${p.address}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [cityProspects, query, sectors, tiers, role, websiteOnly])

  const sectorCounts = useMemo(() => {
    const m = new Map<SectorId, number>()
    cityProspects.forEach((p) => m.set(p.sector, (m.get(p.sector) ?? 0) + 1))
    return m
  }, [cityProspects])

  const estates = useMemo(() => data.estates.filter((e) => inCity(e.city)), [data, inCity])
  const highFit = filtered.filter((p) => p.tier === "high").length
  const takers = filtered.filter((p) => p.role !== "producer").length
  const topSector = useMemo(() => {
    const m = new Map<SectorId, number>()
    filtered.forEach((p) => p.sector !== "other" && m.set(p.sector, (m.get(p.sector) ?? 0) + 1))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]
  }, [filtered])

  const perCity = useMemo(() => {
    const m = new Map<CityId, number>()
    data.prospects.forEach((p) => m.set(p.city, (m.get(p.city) ?? 0) + 1))
    return m
  }, [data])

  const selected = selectedId ? data.prospects.find((p) => p.id === selectedId) : undefined
  const activeFilters = sectors.size + tiers.size + (role !== "all" ? 1 : 0) + (websiteOnly ? 1 : 0) + (query ? 1 : 0)
  const clearFilters = () => { setQuery(""); setSectors(new Set()); setTiers(new Set()); setRole("all"); setWebsiteOnly(false) }

  // ---------------- Map ----------------
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const hoverPopup = useRef<Popup | null>(null)
  const prevSelected = useRef<string | null>(null)
  const initialBounds = useMemo(() => cityById.get("coimbatore")?.bounds ?? null, [cityById])

  const handleReady = useCallback((map: MLMap, ml: MapLibre) => {
    mapRef.current = map
    const empty = { type: "FeatureCollection" as const, features: [] }
    map.addSource("pr-points", { type: "geojson", data: empty, promoteId: "id", attribution: "Factory data © OpenStreetMap contributors (ODbL)" })
    map.addSource("pr-bins", { type: "geojson", data: empty })
    map.addSource("pr-estates", { type: "geojson", data: empty })

    map.addLayer({
      id: "pr-heat",
      type: "heatmap",
      source: "pr-points",
      maxzoom: 15,
      paint: {
        "heatmap-weight": ["/", ["get", "fit"], 100],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.6],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 24, 15, 40],
        "heatmap-opacity": 0.75,
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)", 0.15, "#1e3a8a", 0.35, "#0891b2", 0.55, "#10b981", 0.75, "#facc15", 1, "#ef4444",
        ],
      },
    })
    map.addLayer({
      id: "pr-bins",
      type: "fill-extrusion",
      source: "pr-bins",
      // Area columns are an overview; zoomed in, individual factories take over
      maxzoom: 13,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["get", "avgFit"], 60, "#0e7490", 75, "#10b981", 85, "#a3e635", 92, "#facc15"],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-opacity": 0.82,
        "fill-extrusion-height-transition": { duration: 600 },
        "fill-extrusion-vertical-gradient": true,
      },
    })
    map.addLayer({
      id: "pr-estates",
      type: "circle",
      source: "pr-estates",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 14],
        "circle-color": "rgba(167,139,250,0.12)",
        "circle-stroke-color": "#a78bfa",
        "circle-stroke-width": 1.5,
        "circle-pitch-alignment": "map",
      },
    })
    map.addLayer({
      id: "pr-points",
      type: "circle",
      source: "pr-points",
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, ["case", ["==", ["get", "tier"], "high"], 3.5, 2.5], 14, ["case", ["==", ["get", "tier"], "high"], 8, 6]],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 1],
        "circle-pitch-alignment": "map",
      },
    })

    hoverPopup.current = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "sf-hover" })
    const hoverable = ["pr-points", "pr-bins", "pr-estates"]
    hoverable.forEach((layer) => {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer" })
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; hoverPopup.current?.remove() })
      map.on("mousemove", layer, (e) => {
        const p = e.features?.[0]?.properties as { name: string; sub: string } | undefined
        if (p) hoverPopup.current!.setLngLat(e.lngLat).setHTML(`<b>${escapeHtml(p.name)}</b><div>${escapeHtml(p.sub)}</div>`).addTo(map)
      })
    })
    map.on("click", (e) => {
      const visible = (l: string) => map.getLayoutProperty(l, "visibility") !== "none"
      const point = visible("pr-points") ? map.queryRenderedFeatures(e.point, { layers: ["pr-points"] })[0] : undefined
      if (point) return setSelectedId(String(point.properties.id))
      const bin = visible("pr-bins") ? map.queryRenderedFeatures(e.point, { layers: ["pr-bins"] })[0] : undefined
      if (bin) {
        const { lng, lat } = bin.properties as { lng: number; lat: number }
        return map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom() + 1.5, 13), duration: 900 })
      }
      setSelectedId(null)
    })
    setReady(true)
  }, [])

  // Points
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource("pr-points") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: filtered.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id, name: p.name, color: SECTORS[p.sector].color, fit: p.fitScore, tier: p.tier,
          sub: `${SECTORS[p.sector].label} · fit ${p.fitScore}`,
        },
      })),
    })
  }, [ready, filtered])

  // 3D density columns: hex bins, height = number of prospects, colour = average fit
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const r = binRadius(city)
    const bins = hexBin(filtered, r)
    ;(map.getSource("pr-bins") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: bins.map((b) => {
        const n = b.items.length
        const avgFit = Math.round(b.items.reduce((s, p) => s + p.fitScore, 0) / n)
        const counts = new Map<SectorId, number>()
        b.items.forEach((p) => counts.set(p.sector, (counts.get(p.sector) ?? 0) + 1))
        const top = Array.from(counts.entries()).filter(([s]) => s !== "other").sort((a, c) => c[1] - a[1])[0]
        return {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: hexagon(b.lng, b.lat, r * 0.9) },
          properties: {
            name: `${n} prospect${n === 1 ? "" : "s"}`,
            sub: `avg fit ${avgFit}${top ? ` · mostly ${SECTORS[top[0]].label.toLowerCase()}` : ""} — click to zoom in`,
            height: (city === "all" ? 2500 : 500) + Math.sqrt(n) * (city === "all" ? 5000 : 1600),
            avgFit, lng: b.lng, lat: b.lat,
          },
        }
      }),
    })
  }, [ready, filtered, city])

  // Industrial estates
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource("pr-estates") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: estates.map((e) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
        properties: { name: e.name, sub: "Industrial estate / area" },
      })),
    })
  }, [ready, estates])

  // Layer visibility: 3D → columns (+ points when zoomed); 2D → heatmap + points
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const vis = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    vis("pr-bins", layerDensity && mode === "3d")
    vis("pr-heat", layerDensity && mode === "2d")
    vis("pr-points", layerPoints)
    vis("pr-estates", layerEstates)
  }, [ready, layerDensity, layerPoints, layerEstates, mode])

  // City switch → frame the city
  const boundsFor = useCallback((c: CityFilter): [[number, number], [number, number]] =>
    c === "all"
      ? [[Math.min(...data.cities.map((x) => x.bounds[0][0])), Math.min(...data.cities.map((x) => x.bounds[0][1]))],
         [Math.max(...data.cities.map((x) => x.bounds[1][0])), Math.max(...data.cities.map((x) => x.bounds[1][1]))]]
      : cityById.get(c)!.bounds, [data, cityById])

  const frame = useCallback((c: CityFilter, duration = 1600) => {
    const map = mapRef.current
    if (!map) return
    const tilt = map.getPitch() > 10
    map.fitBounds(boundsFor(c), { padding: 60, pitch: tilt ? 50 : 0, bearing: tilt ? -15 : 0, duration })
  }, [boundsFor])

  // The map starts framed on Coimbatore; re-frame whenever the chosen city differs from what is shown
  // (including a switch made while the map was still loading)
  const framedCity = useRef<CityFilter>("coimbatore")
  useEffect(() => {
    if (!ready || framedCity.current === city) return
    framedCity.current = city
    setSelectedId(null)
    frame(city)
  }, [ready, city, frame])

  // Selection
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (prevSelected.current) map.setFeatureState({ source: "pr-points", id: prevSelected.current }, { selected: false })
    if (selectedId) map.setFeatureState({ source: "pr-points", id: selectedId }, { selected: true })
    prevSelected.current = selectedId
    const p = selectedId ? data.prospects.find((x) => x.id === selectedId) : undefined
    if (p) flyToPoint(map, p.lng, p.lat, 14)
    setCopied(false)
  }, [ready, selectedId, data])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (selectedId) setSelectedId(null)
      else if (expanded) setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, expanded])

  // ---------------- Actions ----------------
  const exportCsv = () => {
    const header = ["Name", "City", "Sector", "Role", "Fit score", "Tier", "Likely residuals", "Can absorb", "Address", "Website", "Latitude", "Longitude", "OpenStreetMap"]
    const lines = [header.join(",")]
    for (const p of filtered)
      lines.push([
        p.name, cityById.get(p.city)?.name, SECTORS[p.sector].label, ROLE_LABEL[p.role], p.fitScore, p.tier,
        p.wastes.join("; "), p.absorbs.join("; "), p.address, p.website ?? "", p.lat, p.lng, p.osmUrl,
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    lines.push(`"${data.attribution}"`)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
    a.download = `symbioforge-prospects-${city}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyLead = async (p: Prospect) => {
    const text = [p.name, `${SECTORS[p.sector].label} · ${cityById.get(p.city)?.name}`, `Fit ${p.fitScore}/100 (${TIER_LABEL[p.tier]})`,
      p.address, p.website, p.osmUrl].filter(Boolean).join("\n")
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* clipboard blocked */ }
  }

  const sectorsShown = SECTOR_ORDER.filter((s) => sectorCounts.get(s))

  return (
    <div className={cn("space-y-4", expanded && "fixed inset-0 z-50 overflow-auto bg-zinc-950 p-4 md:p-6")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-zinc-100">
            <Target className="h-7 w-7 text-emerald-400" /> Prospect Map
          </h1>
          <p className="mt-1 text-zinc-400">Factories in our launch cities that could join SymbioForge — ranked by how well they fit.</p>
        </div>
        {/* City switcher */}
        <div role="tablist" aria-label="City" className="flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {[...data.cities.map((c) => ({ id: c.id as CityFilter, name: c.name, n: perCity.get(c.id) ?? 0 })), { id: "all" as CityFilter, name: "All 3", n: data.prospects.length }].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={city === c.id} onClick={() => setCity(c.id)}
              className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                city === c.id ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-100")}>
              {c.name} <span className={cn("ml-1 text-xs tabular-nums", city === c.id ? "text-zinc-900/70" : "text-zinc-600")}>{c.n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Prospects" value={filtered.length} sub={activeFilters ? `of ${cityProspects.length} after filters` : "named manufacturing sites"} />
        <StatCard label="High fit" value={highFit} sub="score 88 or more" accent />
        <StatCard label="Potential takers" value={takers} sub="can absorb others' waste" />
        <StatCard label="Top sector" value={topSector ? SECTORS[topSector[0]].label.split(/[,&]/)[0].trim() : "—"} sub={topSector ? `${topSector[1]} sites` : undefined} />
        <StatCard label="Industrial estates" value={estates.length} sub="mapped industrial areas" />
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 lg:grid-cols-[290px_1fr]" style={{ height: expanded ? "calc(100vh - 260px)" : 680 }}>
        {/* Filters */}
        <aside className="hidden overflow-y-auto border-r border-zinc-800 bg-zinc-900/40 p-4 text-sm lg:block">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-zinc-100">Find prospects</span>
            {activeFilters > 0 && <button type="button" onClick={clearFilters} className="text-xs text-zinc-400 hover:text-zinc-100">Reset</button>}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company, industry, area…" aria-label="Search prospects"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-8 pr-8 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none" />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <h4 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fit</h4>
          <div className="flex flex-wrap gap-1.5">
            {(["high", "medium", "low"] as Tier[]).map((t) => (
              <button key={t} type="button" aria-pressed={tiers.has(t)} onClick={() => toggleIn(setTiers, t)}
                className={cn("rounded-full border px-2.5 py-1 text-xs", tiers.has(t) ? TIER_TONE[t] : "border-zinc-800 text-zinc-400 hover:text-zinc-200")}>
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>

          <h4 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Role in symbiosis</h4>
          <div className="flex rounded-lg border border-zinc-800 p-0.5 text-xs">
            {([["all", "All"], ["producer", "Producers"], ["taker", "Takers"]] as [RoleFilter, string][]).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={role === v} onClick={() => setRole(v)}
                className={cn("flex-1 rounded-md py-1", role === v ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200")}>{l}</button>
            ))}
          </div>

          <h4 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Industry</h4>
          <div className="space-y-0.5">
            {sectorsShown.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-zinc-200 hover:bg-zinc-800/50">
                <input type="checkbox" className="accent-emerald-500" checked={sectors.has(s)} onChange={() => toggleIn(setSectors, s)} />
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: SECTORS[s].color }} />
                <span className="flex-1 truncate">{SECTORS[s].label}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">{sectorCounts.get(s)}</span>
              </label>
            ))}
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-2 text-zinc-300">
            <input type="checkbox" className="accent-emerald-500" checked={websiteOnly} onChange={(e) => setWebsiteOnly(e.target.checked)} />
            <Globe className="h-3.5 w-3.5 text-zinc-500" /> Only with a website
          </label>
        </aside>

        <Map3D bounds={initialBounds} mode={mode} basemap={basemap} onReady={handleReady} className="min-h-0 min-w-0">
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <Segmented label="View" value={mode} onChange={setMode} options={[
                { value: "2d", label: <><Square className="h-3.5 w-3.5" /> 2D</> },
                { value: "3d", label: <><Box className="h-3.5 w-3.5" /> 3D</> },
              ]} />
              <Segmented label="Basemap" value={basemap} onChange={setBasemap} options={[
                { value: "dark", label: <><MapIcon className="h-3.5 w-3.5" /> Map</> },
                { value: "satellite", label: <><Satellite className="h-3.5 w-3.5" /> Satellite</> },
              ]} />
              <ToolbarButton onClick={() => frame(city, 900)} title="Reset view" aria-label="Reset view">
                <RotateCcw className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
              <ToolbarPopover button={(open, toggle) => (
                <ToolbarButton active={open} onClick={toggle} aria-expanded={open}><Layers className="h-3.5 w-3.5" /> Layers <ChevronDown className="h-3 w-3" /></ToolbarButton>
              )}>
                <CheckRow checked={layerDensity} onChange={setLayerDensity} hint={mode === "3d" ? "3D columns" : "heatmap"}>
                  <span className="h-3 w-2 rounded-[1px] bg-gradient-to-t from-cyan-700 to-yellow-400" /> Density
                </CheckRow>
                <CheckRow checked={layerPoints} onChange={setLayerPoints}>
                  <span className="h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" /> Factories
                </CheckRow>
                <CheckRow checked={layerEstates} onChange={setLayerEstates} hint={estates.length}>
                  <span className="h-3 w-3 rounded-full border-2 border-violet-400" /> Industrial estates
                </CheckRow>
              </ToolbarPopover>
              <ToolbarButton onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Exit full screen" : "Full screen"}>
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </ToolbarButton>
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/95 px-6 py-5 text-center shadow-2xl">
                <p className="font-medium text-zinc-100">No prospects match these filters</p>
                <button type="button" onClick={clearFilters} className="mt-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400">Clear filters</button>
              </div>
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div className="absolute bottom-3 right-3 top-24 z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl backdrop-blur xl:top-14">
              <div className="flex items-start justify-between gap-2 border-b border-zinc-800 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: SECTORS[selected.sector].color }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: SECTORS[selected.sector].color }} /> {SECTORS[selected.sector].label}
                  </div>
                  <h3 className="mt-0.5 font-semibold leading-snug text-zinc-100">{selected.name}</h3>
                  <p className="mt-0.5 text-xs text-zinc-400">{cityById.get(selected.city)?.name} · {ROLE_LABEL[selected.role]}</p>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close details (Esc)">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                <div className="rounded-lg bg-zinc-950/60 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">SymbioForge fit</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", TIER_TONE[selected.tier])}>{TIER_LABEL[selected.tier]}</span>
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{selected.fitScore}<span className="text-sm text-zinc-500">/100</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 via-emerald-500 to-lime-400" style={{ width: `${selected.fitScore}%` }} />
                  </div>
                  <ul className="mt-2.5 space-y-1 text-xs text-zinc-400">
                    {selected.reasons.map((r) => <li key={r} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 flex-none text-emerald-400" />{r}</li>)}
                  </ul>
                </div>
                {selected.wastes.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Likely residual materials</h4>
                    <div className="flex flex-wrap gap-1.5">{selected.wastes.map((w) => <span key={w} className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{w}</span>)}</div>
                  </div>
                )}
                {selected.absorbs.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Could take as input</h4>
                    <div className="flex flex-wrap gap-1.5">{selected.absorbs.map((w) => <span key={w} className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-xs text-emerald-300">{w}</span>)}</div>
                  </div>
                )}
                {selected.address && (
                  <div>
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Address</h4>
                    <p className="text-xs text-zinc-300">{selected.address}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.website && (
                    <a href={selected.website} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-emerald-400">
                      <Globe className="h-3.5 w-3.5" /> Website
                    </a>
                  )}
                  <a href={selected.osmUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-600">
                    <ExternalLink className="h-3.5 w-3.5" /> OpenStreetMap
                  </a>
                  <button type="button" onClick={() => copyLead(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-600">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy lead"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          {!selected && (
            <div className="absolute bottom-10 right-14 z-10 w-60 rounded-xl border border-zinc-800 bg-zinc-900/95 p-3 text-xs shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center gap-1.5 font-semibold text-zinc-200"><Layers className="h-3.5 w-3.5 text-emerald-400" /> Legend</div>
              <div className="space-y-1.5 text-zinc-400">
                <div>
                  <div className="h-2 rounded-full bg-gradient-to-r from-cyan-700 via-emerald-500 to-yellow-400" />
                  <div className="mt-0.5 flex justify-between text-[10px]"><span>lower fit</span><span>{mode === "3d" ? "column colour = avg fit" : "heat = density × fit"}</span><span>higher</span></div>
                </div>
                {mode === "3d" && <div className="flex items-center gap-2"><span className="h-3 w-2 rounded-[1px] bg-emerald-500" /> Column height = number of factories</div>}
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" /> Factory (colour = industry; bigger = high fit)</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-violet-400" /> Industrial estate</div>
              </div>
            </div>
          )}

          <CameraHint show={mode === "3d" && ready && !selected} />
        </Map3D>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pr-20">
        <button type="button" onClick={() => setShowList(!showList)} aria-expanded={showList}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900">
          <List className="h-4 w-4 text-emerald-400" /> {showList ? "Hide" : "Show"} lead list ({filtered.length})
        </button>
        <button type="button" onClick={exportCsv} disabled={!filtered.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-40">
          <Download className="h-4 w-4 text-emerald-400" /> Export leads (CSV)
        </button>
      </div>

      {showList && (
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-900 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">Company</th><th className="px-3 py-2">City</th><th className="px-3 py-2">Industry</th>
                <th className="px-3 py-2">Role</th><th className="px-3 py-2 text-right">Fit</th><th className="px-3 py-2">Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((p) => (
                <tr key={p.id} onClick={() => setSelectedId(p.id)}
                  className={cn("cursor-pointer border-t border-zinc-800/70 hover:bg-emerald-500/5", selectedId === p.id && "bg-emerald-500/10")}>
                  <td className="px-3 py-2 font-medium text-zinc-100">{p.name}</td>
                  <td className="px-3 py-2 text-zinc-400">{cityById.get(p.city)?.name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-zinc-300">
                      <span className="h-2 w-2 rounded-full" style={{ background: SECTORS[p.sector].color }} />{SECTORS[p.sector].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{ROLE_LABEL[p.role]}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", TIER_TONE[p.tier])}>{p.fitScore}</span>
                  </td>
                  <td className="px-3 py-2">
                    {p.website
                      ? <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"><Globe className="h-3 w-3" /> Website</a>
                      : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">Showing the top 500 by fit — export CSV for the full list.</p>}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Building2 className="h-3.5 w-3.5" />
        Sites come from OpenStreetMap, so coverage varies by area. Industry and fit are estimated from map tags and company names — confirm on a discovery call.
        Data as of {new Date(data.generatedAt).toLocaleDateString()}.
      </p>
    </div>
  )
}
