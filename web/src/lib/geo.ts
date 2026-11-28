/** Small geometry helpers for the 3D maps (no map library dependency, unit-testable). */

export type LngLat = [number, number]

const METERS_PER_DEG_LAT = 111_320

/**
 * Closed hexagon ring (GeoJSON Polygon coordinates) of `radiusM` meters around a point.
 * Used as the footprint of the 3D tonnage columns.
 */
export function hexagon(lng: number, lat: number, radiusM: number): LngLat[][] {
  const dLat = radiusM / METERS_PER_DEG_LAT
  const dLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  const ring: LngLat[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  ring.push(ring[0])
  return [ring]
}

/** [[minLng, minLat], [maxLng, maxLat]] for a set of points, or null when empty. */
export function boundsOf(points: { lat: number; lng: number }[]): [LngLat, LngLat] | null {
  if (!points.length) return null
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const p of points) {
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
  }
  return [[minLng, minLat], [maxLng, maxLat]]
}

/** Column height in meters for a tonnage — sqrt keeps one huge producer from dwarfing the rest. */
export const columnHeight = (tonnes: number) => Math.round(80 + Math.sqrt(Math.max(0, tonnes)) * 32)

export interface HexBin<T> {
  key: string
  lat: number
  lng: number
  items: T[]
}

/**
 * Group points into a pointy-top hexagonal grid of `radiusM` meters (centre-to-vertex),
 * using a local equirectangular projection around `originLat`. Bin centres line up with
 * `hexagon(lng, lat, radiusM)` footprints, so the bins tile without gaps.
 */
export function hexBin<T extends { lat: number; lng: number }>(points: T[], radiusM: number, originLat?: number): HexBin<T>[] {
  if (!points.length) return []
  const lat0 = originLat ?? points.reduce((s, p) => s + p.lat, 0) / points.length
  const kx = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180)
  const ky = METERS_PER_DEG_LAT
  const bins = new Map<string, HexBin<T>>()
  for (const p of points) {
    const x = p.lng * kx, y = p.lat * ky
    // pixel → axial (pointy-top), then cube rounding
    const qf = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / radiusM
    const rf = ((2 / 3) * y) / radiusM
    const sf = -qf - rf
    let q = Math.round(qf), r = Math.round(rf)
    const s = Math.round(sf)
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf)
    if (dq > dr && dq > ds) q = -r - s
    else if (dr > ds) r = -q - s
    const key = `${q}:${r}`
    let bin = bins.get(key)
    if (!bin) {
      const cx = radiusM * Math.sqrt(3) * (q + r / 2)
      const cy = radiusM * 1.5 * r
      bin = { key, lng: cx / kx, lat: cy / ky, items: [] }
      bins.set(key, bin)
    }
    bin.items.push(p)
  }
  return Array.from(bins.values())
}
