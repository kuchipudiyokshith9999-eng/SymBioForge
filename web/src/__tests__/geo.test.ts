import { describe, expect, test } from "vitest"
import { boundsOf, columnHeight, hexagon } from "../lib/geo"

describe("geo helpers", () => {
  test("hexagon is a closed 7-point ring of roughly the requested radius", () => {
    const [ring] = hexagon(76.96, 11.02, 100)
    expect(ring).toHaveLength(7)
    expect(ring[0]).toEqual(ring[6])
    // Each vertex ~100 m from the centre (1° lat ≈ 111.32 km)
    for (const [lng, lat] of ring.slice(0, 6)) {
      const dy = (lat - 11.02) * 111_320
      const dx = (lng - 76.96) * 111_320 * Math.cos((11.02 * Math.PI) / 180)
      expect(Math.hypot(dx, dy)).toBeCloseTo(100, 0)
    }
  })

  test("boundsOf returns [[minLng,minLat],[maxLng,maxLat]] or null", () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([{ lat: 11, lng: 77 }, { lat: 10.9, lng: 77.1 }])).toEqual([[77, 10.9], [77.1, 11]])
  })

  test("columnHeight grows with tonnage but sub-linearly", () => {
    expect(columnHeight(0)).toBe(80)
    expect(columnHeight(400)).toBeGreaterThan(columnHeight(100))
    expect(columnHeight(400) - 80).toBeCloseTo((columnHeight(100) - 80) * 2, 0)
  })
})
