"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GeoJSONSource, Map as MLMap, Marker, Popup } from "maplibre-gl"
import {
  ArrowDownLeft, ArrowUpRight, Box, ChevronDown, Layers, Map as MapIcon, Maximize2, Minimize2, RotateCcw, Satellite, Search,
  Square, Tag, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { boundsOf, hexagon } from "@/lib/geo"
import { Map3D, flyToPoint, resetCamera, useFlowAnimation, type Basemap, type MapLibre, type ViewMode } from "@/components/maps/map-3d"
import { CameraHint, Segmented, StatCard, ToolbarButton } from "@/components/maps/map-controls"

export interface EcosystemNode { id: string; label: string; type: string; lat: number; lng: number }
export interface EcosystemEdge { id: string; source: string; target: string; label: string; weight: number }
export interface EcosystemData { nodes: EcosystemNode[]; edges: EcosystemEdge[] }

const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#e879f9", "#f43f5e", "#22d3ee", "#a3e635", "#f97316", "#818cf8", "#94a3b8", "#14b8a6", "#facc15"]
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

/** Show every factory name from this zoom level up (below it, names only for the selection). */
const LABEL_ZOOM = 14

/** Edge colour ramps from deep to bright emerald with compatibility score. */
const edgeColor = (w: number) => (w >= 90 ? "#6ee7b7" : w >= 80 ? "#34d399" : "#059669")

export function Ecosystem3D({ data }: { data: EcosystemData }) {
  const [mode, setMode] = useState<ViewMode>("3d")
  const [basemap, setBasemap] = useState<Basemap>("dark")
  const [showLabels, setShowLabels] = useState(true)
  const [minScore, setMinScore] = useState(70)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // ---------------- Derived ----------------
  const industryColor = useMemo(() => {
    const types = Array.from(new Set(data.nodes.map((n) => n.type))).sort()
    return new Map(types.map((t, i) => [t, PALETTE[i % PALETTE.length]]))
  }, [data])

  const edges = useMemo(() => data.edges.filter((e) => e.weight >= minScore), [data, minScore])
  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data])

  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1)
      d.set(e.target, (d.get(e.target) ?? 0) + 1)
    }
    return d
  }, [edges])

  const hub = useMemo(() => {
    let best: EcosystemNode | null = null, n = 0
    for (const node of data.nodes) {
      const k = degree.get(node.id) ?? 0
      if (k > n) { n = k; best = node }
    }
    return best ? { node: best, n } : null
  }, [data, degree])

  const avgScore = edges.length ? Math.round(edges.reduce((s, e) => s + e.weight, 0) / edges.length) : 0
  const isolated = data.nodes.filter((n) => !degree.get(n.id)).length

  const selected = selectedId ? nodeById.get(selectedId) : undefined
  const outgoing = useMemo(() => edges.filter((e) => e.source === selectedId).sort((a, b) => b.weight - a.weight), [edges, selectedId])
  const incoming = useMemo(() => edges.filter((e) => e.target === selectedId).sort((a, b) => b.weight - a.weight), [edges, selectedId])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return data.nodes.filter((n) => n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)).slice(0, 8)
  }, [data, search])

  const bounds = useMemo(() => boundsOf(data.nodes), [data])

  // ---------------- Map ----------------
  const mapRef = useRef<MLMap | null>(null)
  const mlRef = useRef<MapLibre | null>(null)
  const [ready, setReady] = useState(false)
  const labelMarkers = useRef<Marker[]>([])
  const hoverPopup = useRef<Popup | null>(null)
  const prevSelected = useRef<string | null>(null)
  const [zoom, setZoom] = useState(0)

  const handleReady = useCallback((map: MLMap, ml: MapLibre) => {
    mapRef.current = map
    mlRef.current = ml
    const empty = { type: "FeatureCollection" as const, features: [] }
    map.addSource("eco-nodes", { type: "geojson", data: empty, promoteId: "id" })
    map.addSource("eco-columns", { type: "geojson", data: empty, promoteId: "id" })
    map.addSource("eco-edges", { type: "geojson", data: empty })
    map.addSource("eco-edges-selected", { type: "geojson", data: empty })

    map.addLayer({
      id: "eco-edges",
      type: "line",
      source: "eco-edges",
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": ["get", "opacity"], "line-dasharray": [0, 4, 3] },
    })
    map.addLayer({
      id: "eco-edges-selected-glow",
      type: "line",
      source: "eco-edges-selected",
      paint: { "line-color": "#34d399", "line-width": 12, "line-opacity": 0.22, "line-blur": 6 },
    })
    map.addLayer({
      id: "eco-edges-selected",
      type: "line",
      source: "eco-edges-selected",
      paint: { "line-color": ["get", "color"], "line-width": 4, "line-dasharray": [0, 4, 3] },
    })
    map.addLayer({
      id: "eco-columns",
      type: "fill-extrusion",
      source: "eco-columns",
      paint: {
        "fill-extrusion-color": ["case", ["boolean", ["feature-state", "selected"], false], "#fafafa", ["get", "color"]],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-opacity": 0.9,
        "fill-extrusion-vertical-gradient": true,
      },
    })
    map.addLayer({
      id: "eco-nodes",
      type: "circle",
      source: "eco-nodes",
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 8, 17, 12],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 1.5],
        "circle-opacity": ["get", "opacity"],
        "circle-stroke-opacity": ["get", "opacity"],
        "circle-pitch-alignment": "map",
      },
    })

    hoverPopup.current = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "sf-hover" })
    for (const layer of ["eco-nodes", "eco-columns"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer" })
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; hoverPopup.current?.remove() })
      map.on("mousemove", layer, (e) => {
        const p = e.features?.[0]?.properties as { name: string; sub: string } | undefined
        if (p) hoverPopup.current!.setLngLat(e.lngLat).setHTML(`<b>${escapeHtml(p.name)}</b><div>${escapeHtml(p.sub)}</div>`).addTo(map)
      })
    }
    map.on("mouseenter", "eco-edges", () => { map.getCanvas().style.cursor = "help" })
    map.on("mouseleave", "eco-edges", () => { map.getCanvas().style.cursor = ""; hoverPopup.current?.remove() })
    map.on("mousemove", "eco-edges", (e) => {
      const p = e.features?.[0]?.properties as { name: string; sub: string } | undefined
      if (p) hoverPopup.current!.setLngLat(e.lngLat).setHTML(`<b>${escapeHtml(p.name)}</b><div>${escapeHtml(p.sub)}</div>`).addTo(map)
    })
    map.on("zoomend", () => setZoom(map.getZoom()))
    setZoom(map.getZoom())
    map.on("click", (e) => {
      const layers = ["eco-nodes", "eco-columns"].filter((l) => map.getLayoutProperty(l, "visibility") !== "none")
      const f = map.queryRenderedFeatures(e.point, { layers })[0]
      setSelectedId(f ? String(f.properties.id) : null)
    })
    setReady(true)
  }, [])

  // Nodes + columns (column height = number of connections → hubs stand out)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const connected = selectedId ? new Set([selectedId, ...outgoing.map((e) => e.target), ...incoming.map((e) => e.source)]) : null
    const feats = data.nodes.map((n) => {
      const k = degree.get(n.id) ?? 0
      return {
        id: n.id,
        name: n.label,
        sub: `${n.type} · ${k} connection${k === 1 ? "" : "s"}`,
        color: industryColor.get(n.type) ?? "#94a3b8",
        // Dim everything not linked to the selection
        opacity: connected && !connected.has(n.id) ? 0.25 : 1,
        height: 100 + k * 120,
        n,
      }
    })
    ;(map.getSource("eco-nodes") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: feats.map(({ n, ...p }) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [n.lng, n.lat] }, properties: p })),
    })
    ;(map.getSource("eco-columns") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: feats
        .filter((f) => !connected || connected.has(f.id))
        .map(({ n, ...p }) => ({ type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: hexagon(n.lng, n.lat, 120) }, properties: p })),
    })
  }, [ready, data, degree, industryColor, selectedId, outgoing, incoming])

  // Edges
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const toFeature = (e: EcosystemEdge, dim: boolean) => {
      const a = nodeById.get(e.source), b = nodeById.get(e.target)
      if (!a || !b) return []
      return [{
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
        properties: {
          name: e.label,
          sub: `${a.label} → ${b.label} · ${Math.round(e.weight)}% compatible`,
          color: edgeColor(e.weight),
          width: 1 + (e.weight - 60) / 12,
          opacity: dim ? 0.15 : 0.85,
        },
      }]
    }
    const sel = selectedId ? edges.filter((e) => e.source === selectedId || e.target === selectedId) : []
    ;(map.getSource("eco-edges") as GeoJSONSource).setData({ type: "FeatureCollection", features: edges.flatMap((e) => toFeature(e, !!selectedId)) })
    ;(map.getSource("eco-edges-selected") as GeoJSONSource).setData({ type: "FeatureCollection", features: sel.flatMap((e) => toFeature(e, false)) })
  }, [ready, edges, nodeById, selectedId])

  // 3D columns only in 3D view
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty("eco-columns", "visibility", mode === "3d" ? "visible" : "none")
  }, [ready, mode])

  // Factory name labels (HTML markers: no font glyph server needed).
  // To avoid clutter: all names once zoomed in; otherwise only the selection and its partners.
  const zoomedIn = zoom >= LABEL_ZOOM
  useEffect(() => {
    const map = mapRef.current, ml = mlRef.current
    labelMarkers.current.forEach((m) => m.remove())
    labelMarkers.current = []
    if (!ready || !map || !ml || !showLabels) return
    const related = selectedId
      ? new Set([selectedId, ...outgoing.map((e) => e.target), ...incoming.map((e) => e.source)])
      : null
    for (const n of data.nodes) {
      if (!zoomedIn && !related?.has(n.id)) continue
      const el = document.createElement("button")
      el.type = "button"
      el.className = "sf-label"
      el.textContent = n.label
      if (related && !related.has(n.id)) el.style.opacity = "0.3"
      if (n.id === selectedId) el.style.borderColor = "#10b981"
      el.addEventListener("click", (ev) => { ev.stopPropagation(); setSelectedId(n.id) })
      labelMarkers.current.push(new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([n.lng, n.lat]).addTo(map))
    }
  }, [ready, data, showLabels, selectedId, outgoing, incoming, zoomedIn])

  // Selection highlight + camera
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const set = (id: string | null, v: boolean) => {
      if (!id) return
      map.setFeatureState({ source: "eco-nodes", id }, { selected: v })
      map.setFeatureState({ source: "eco-columns", id }, { selected: v })
    }
    set(prevSelected.current, false)
    set(selectedId, true)
    prevSelected.current = selectedId
    const n = selectedId ? nodeById.get(selectedId) : undefined
    if (n) flyToPoint(map, n.lng, n.lat, 13.5)
  }, [ready, selectedId, nodeById])

  useFlowAnimation(mapRef.current, ready, ["eco-edges", "eco-edges-selected"])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (selectedId) setSelectedId(null)
      else if (expanded) setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, expanded])

  const pick = (id: string) => { setSelectedId(id); setSearch(""); setSearchOpen(false) }

  const ConnectionList = ({ title, icon, list, otherKey }: { title: string; icon: React.ReactNode; list: EcosystemEdge[]; otherKey: "source" | "target" }) => (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{icon}{title} ({list.length})</h4>
      <div className="space-y-1.5">
        {list.map((e) => {
          const other = nodeById.get(e[otherKey])
          return (
            <button key={e.id} type="button" onClick={() => setSelectedId(e[otherKey])}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-left hover:border-emerald-500/50 hover:bg-emerald-500/5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-zinc-100">{other?.label ?? e[otherKey]}</span>
                <span className="flex-none rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-300">{Math.round(e.weight)}%</span>
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-400">{e.label}</div>
            </button>
          )
        })}
        {list.length === 0 && <p className="text-xs text-zinc-500">None at ≥{minScore}% compatibility.</p>}
      </div>
    </div>
  )

  return (
    <div className={cn("space-y-4", expanded && "fixed inset-0 z-50 overflow-auto bg-zinc-950 p-4 md:p-6")}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Ecosystem Map</h1>
        <p className="mt-1 text-zinc-400">The industrial symbiosis network: factories and the waste streams that connect them.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Factories" value={data.nodes.length} sub={isolated ? `${isolated} not yet connected` : "all connected"} />
        <StatCard label="Connections" value={edges.length} sub={`at ≥${minScore}% compatibility`} accent />
        <StatCard label="Avg compatibility" value={edges.length ? `${avgScore}%` : "—"} sub="across shown links" />
        <StatCard label="Biggest hub" value={hub ? hub.node.label : "—"} sub={hub ? `${hub.n} connections` : undefined} />
      </div>

      <Map3D bounds={bounds} mode={mode} basemap={basemap} onReady={handleReady}
        className="rounded-2xl border border-zinc-800" style={{ height: expanded ? "calc(100vh - 230px)" : 660 }}>

        {/* Toolbar */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter" && searchResults[0]) pick(searchResults[0].id) }}
              placeholder="Find a factory…"
              aria-label="Find a factory"
              className="w-52 rounded-lg border border-zinc-800 bg-zinc-900/95 py-1.5 pl-8 pr-3 text-xs text-zinc-100 shadow-lg placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-800 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur">
                {searchResults.map((n) => (
                  <button key={n.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(n.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-800">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: industryColor.get(n.type) }} />
                    <span className="flex-1 truncate text-zinc-100">{n.label}</span>
                    <span className="truncate text-[10px] text-zinc-500">{n.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Segmented label="View" value={mode} onChange={setMode} options={[
            { value: "2d", label: <><Square className="h-3.5 w-3.5" /> 2D</> },
            { value: "3d", label: <><Box className="h-3.5 w-3.5" /> 3D</> },
          ]} />
          <Segmented label="Basemap" value={basemap} onChange={setBasemap} options={[
            { value: "dark", label: <><MapIcon className="h-3.5 w-3.5" /> Map</> },
            { value: "satellite", label: <><Satellite className="h-3.5 w-3.5" /> Satellite</> },
          ]} />
          <ToolbarButton onClick={() => mapRef.current && resetCamera(mapRef.current, bounds, mode)} title="Reset view" aria-label="Reset view">
            <RotateCcw className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/95 px-2.5 py-1.5 text-xs text-zinc-300 shadow-lg" title="Hide weaker matches">
            Min match
            <input type="range" min={70} max={95} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-20 accent-emerald-500" aria-label="Minimum compatibility" />
            <span className="w-8 tabular-nums text-emerald-300">{minScore}%</span>
          </label>
          <ToolbarButton active={showLabels} onClick={() => setShowLabels(!showLabels)} aria-pressed={showLabels} title="Factory names">
            <Tag className="h-3.5 w-3.5" /> Names
          </ToolbarButton>
          <ToolbarButton onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Exit full screen" : "Full screen"} title={expanded ? "Exit full screen (Esc)" : "Full screen"}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </ToolbarButton>
        </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="absolute bottom-3 right-3 top-24 z-20 flex w-80 xl:top-14 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: industryColor.get(selected.type) }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: industryColor.get(selected.type) }} /> {selected.type}
                </div>
                <h3 className="mt-0.5 font-semibold leading-snug text-zinc-100">{selected.label}</h3>
                <p className="mt-0.5 text-xs text-zinc-400">{outgoing.length + incoming.length} connections</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close details (Esc)">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <ConnectionList title="Sends waste to" icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />} list={outgoing} otherKey="target" />
              <ConnectionList title="Receives from" icon={<ArrowDownLeft className="h-3.5 w-3.5 text-sky-400" />} list={incoming} otherKey="source" />
            </div>
          </div>
        )}

        {/* Legend */}
        {!selected && (
          <div className="absolute bottom-10 right-14 z-10 w-64 rounded-xl border border-zinc-800 bg-zinc-900/95 text-xs shadow-xl backdrop-blur">
            <button type="button" onClick={() => setShowLegend(!showLegend)} className="flex w-full items-center justify-between px-3 py-2 font-semibold text-zinc-200" aria-expanded={showLegend}>
              <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-emerald-400" /> Legend</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", !showLegend && "-rotate-90")} />
            </button>
            {showLegend && (
              <div className="max-h-72 overflow-y-auto border-t border-zinc-800 px-3 pb-3 pt-2">
                <div className="space-y-1">
                  {Array.from(industryColor.entries()).map(([t, c]) => (
                    <div key={t} className="flex items-center gap-2 text-zinc-400"><span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: c }} />{t}</div>
                  ))}
                </div>
                <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2 text-zinc-400">
                  <div className="flex items-center gap-2"><span className="h-3 w-2 rounded-[1px] bg-gradient-to-t from-emerald-700 to-emerald-400" /> {mode === "3d" ? "Column height = connections" : "Dot = factory"}</div>
                  <div className="flex items-center gap-2"><span className="h-0 w-5 border-t-2 border-dashed border-emerald-400" /> Waste flow (brighter = better match)</div>
                </div>
              </div>
            )}
          </div>
        )}

        <CameraHint show={mode === "3d" && ready && !selected} />
      </Map3D>
      <p className="pr-20 text-xs text-zinc-500">
        Tip: click a factory to see what it sends and receives (Esc to close). Zoom in to see every factory name.
      </p>
    </div>
  )
}
