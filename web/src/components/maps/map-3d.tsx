"use client"

import "maplibre-gl/dist/maplibre-gl.css"
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { Map as MLMap, StyleSpecification } from "maplibre-gl"
import { cn } from "@/lib/utils"
import type { LngLat } from "@/lib/geo"

export type MapLibre = typeof import("maplibre-gl")
export type ViewMode = "2d" | "3d"
export type Basemap = "dark" | "satellite"

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services"
const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

/** Raster-only style: no vector tiles or font glyphs needed, so no API keys. */
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    dark: {
      type: "raster",
      tiles: [`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
    },
    darkLabels: {
      type: "raster",
      tiles: [`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 16,
    },
    satellite: {
      type: "raster",
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    terrain: {
      type: "raster-dem",
      tiles: [TERRAIN_TILES],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
      attribution: "Elevation: Mapzen / AWS Terrain Tiles",
    },
    // A separate DEM source for hillshading is recommended by MapLibre when terrain is on
    hillshadeDem: { type: "raster-dem", tiles: [TERRAIN_TILES], encoding: "terrarium", tileSize: 256, maxzoom: 14 },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#09090b" } },
    { id: "base-dark", type: "raster", source: "dark" },
    { id: "base-satellite", type: "raster", source: "satellite", layout: { visibility: "none" }, paint: { "raster-saturation": -0.25, "raster-brightness-max": 0.85 } },
    {
      id: "hillshade",
      type: "hillshade",
      source: "hillshadeDem",
      paint: { "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#3f3f46", "hillshade-exaggeration": 0.35 },
    },
    { id: "labels-dark", type: "raster", source: "darkLabels", paint: { "raster-opacity": 0.9 } },
  ],
}

/** Layer id that data layers should be inserted *below* so place names stay readable. */
export const LABELS_LAYER = "labels-dark"

export const PITCH_3D = 58
const BEARING_3D = -18

interface Map3DProps {
  /** Initial area to frame. */
  bounds: [LngLat, LngLat] | null
  mode: ViewMode
  basemap: Basemap
  /** Called once after the style has loaded; add sources/layers/handlers here. */
  onReady: (map: MLMap, ml: MapLibre) => void
  className?: string
  style?: React.CSSProperties
  children?: ReactNode
}

/**
 * MapLibre map with a dark/satellite basemap, real terrain (AWS terrain tiles), hillshading
 * and a sky/fog horizon. `mode="3d"` tilts the camera and switches terrain on.
 */
export function Map3D({ bounds, mode, basemap, onReady, className, style, children }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const initial = useRef({ bounds, mode })

  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null
    ;(async () => {
      const ml = await import("maplibre-gl")
      if (cancelled || !containerRef.current) return
      const { bounds: b, mode: m } = initial.current
      let map: MLMap
      try {
        map = new ml.Map({
          container: containerRef.current,
          style: BASE_STYLE,
          center: [76.96, 11.02],
          zoom: 12,
          ...(b ? { bounds: b, fitBoundsOptions: { padding: 80 } } : {}),
          pitch: m === "3d" ? PITCH_3D : 0,
          bearing: m === "3d" ? BEARING_3D : 0,
          maxPitch: 78,
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: true },
        })
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "WebGL is not available")
        return
      }
      mapRef.current = map
      map.addControl(new ml.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right")
      map.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left")
      map.on("load", () => {
        if (cancelled) return
        map.setSky({
          "sky-color": "#0b1220",
          "horizon-color": "#1e293b",
          "fog-color": "#09090b",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.6,
          "fog-ground-blend": 0.35,
        })
        if (m === "3d") map.setTerrain({ source: "terrain", exaggeration: 1.4 })
        // Frame the data now that the container has its final size (the constructor may have run mid-layout)
        if (b) map.fitBounds(b, { padding: 80, pitch: m === "3d" ? PITCH_3D : 0, bearing: m === "3d" ? BEARING_3D : 0, duration: 0 })
        onReadyRef.current(map, ml)
        setLoaded(true)
      })
      ro = new ResizeObserver(() => map.resize())
      ro.observe(containerRef.current)
    })()
    return () => {
      cancelled = true
      ro?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
      setLoaded(false)
    }
  }, [])

  // 2D ⇄ 3D: terrain + camera tilt
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    if (mode === "3d") {
      map.setTerrain({ source: "terrain", exaggeration: 1.4 })
      if (map.getPitch() < 20) map.easeTo({ pitch: PITCH_3D, bearing: BEARING_3D, duration: 900 })
    } else {
      map.setTerrain(null)
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
    }
  }, [mode, loaded])

  // Basemap
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const sat = basemap === "satellite"
    map.setLayoutProperty("base-dark", "visibility", sat ? "none" : "visible")
    map.setLayoutProperty("labels-dark", "visibility", sat ? "none" : "visible")
    map.setLayoutProperty("base-satellite", "visibility", sat ? "visible" : "none")
  }, [basemap, loaded])

  return (
    <div className={cn("relative overflow-hidden bg-zinc-950", className)} style={style}>
      {/* Inline position: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which would beat a class */}
      <div ref={containerRef} className="sf-map3d" style={{ position: "absolute", inset: 0 }} />
      {!loaded && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/90 px-4 py-2 text-sm text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Loading map…
          </div>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-400">
          The map could not start ({failed}). Try a browser with WebGL enabled.
        </div>
      )}
      {children}
    </div>
  )
}

/** Fly the camera to a point, keeping the current tilt/rotation. */
export function flyToPoint(map: MLMap, lng: number, lat: number, zoom = 15) {
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), zoom), speed: 1.2, essential: true })
}

/** Re-frame to the given bounds, restoring the mode's default camera angle. */
export function resetCamera(map: MLMap, bounds: [LngLat, LngLat] | null, mode: ViewMode) {
  if (!bounds) return
  map.fitBounds(bounds, {
    padding: 80,
    pitch: mode === "3d" ? PITCH_3D : 0,
    bearing: mode === "3d" ? BEARING_3D : 0,
    duration: 900,
  })
}

/** Paint a colored icon into the map's sprite (no external sprite sheet needed). */
export function addSquareIcon(map: MLMap, id: string, color: string, letter: string) {
  if (map.hasImage(id)) return
  const size = 44
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.beginPath(); ctx.roundRect(2, 2, size - 4, size - 4, 9); ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.roundRect(6, 6, size - 12, size - 12, 6); ctx.fill()
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 22px system-ui, sans-serif"
  ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillText(letter, size / 2, size / 2 + 1)
  map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 })
}

// MapLibre's "marching ants" sequence: dashes move along the line direction (source → target)
const DASH_SEQUENCE = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]

/** Animate the dashes of the given line layers so flows visibly move from source to target. */
export function useFlowAnimation(map: MLMap | null, ready: boolean, layerIds: string[]) {
  const key = layerIds.join(",")
  useEffect(() => {
    if (!ready || !map) return
    const ids = key.split(",")
    let step = 0, raf = 0, last = 0
    const tick = (ts: number) => {
      if (ts - last > 70) {
        last = ts
        step = (step + 1) % DASH_SEQUENCE.length
        for (const id of ids) if (map.getLayer(id)) map.setPaintProperty(id, "line-dasharray", DASH_SEQUENCE[step])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map, ready, key])
}
