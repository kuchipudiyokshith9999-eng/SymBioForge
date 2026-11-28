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
