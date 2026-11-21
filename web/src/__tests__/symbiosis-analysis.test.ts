import { describe, expect, test } from "vitest"
import { buildSymbiosisAnalysis, toTonnesPerYear } from "../lib/symbiosis-analysis"
import type { Factory, SymbioticMatch, WasteStream } from "../lib/types"

const stream = (over: Partial<WasteStream>): WasteStream => ({
  id: "ws",
  factoryId: "f1",
  factoryName: "F1",
  name: "Steel scrap",
  category: "metallic",
  physicalForm: "solid",
  volume: 100,
  contamination: "clean",
  seasonalVariation: "none",
  reusePotential: 90,
  ...over,
})

const factory = (id: string, wasteStreams: WasteStream[], declaredWastes: string[] = []): Factory => ({
  id,
  name: `Factory ${id}`,
  industryType: "Metal Fabrication",
  location: { lat: 11, lng: 77, address: "Coimbatore" },
  productionCapacity: "1 t/day",
  rawMaterials: [],
  declaredWastes,
  wasteStreams,
  complianceStatus: "filed",
  savingsEarned: 0,
  co2Avoided: 0,
})

const match = (over: Partial<SymbioticMatch>): SymbioticMatch => ({
  id: "m1",
  sourceFactoryId: "f1",
  sourceFactoryName: "F1",
  targetFactoryId: "f2",
  targetFactoryName: "F2",
  wasteStreamId: "ws1",
  wasteStreamName: "Steel scrap",
  compatibilityScore: 80,
  distanceKm: 3,
  volumeTonsPerYear: 20,
  co2SavedTonsPerYear: 5,
  savingsInrPerYear: 1000,
  status: "New",
  ...over,
})

describe("buildSymbiosisAnalysis", () => {
  test("converts kg/day to tonnes/year", () => {
    expect(toTonnesPerYear(100)).toBe(36.5)
  })

  test("marks declared streams high confidence and inferred ones low", () => {
    const f1 = factory(
      "f1",
      [
        stream({ id: "ws1", name: "Steel scrap" }),
        stream({ id: "f1_foundry_sand_inferred", name: "Foundry sand" }),
      ],
      ["Steel scrap"],
    )
    const { producers } = buildSymbiosisAnalysis({ factories: [f1], matches: [] })
    expect(producers[0].materials.map((m) => m.confidence)).toEqual(["high", "low"])
    expect(producers[0].materials[0].categoryLabel).toBe("Metals")
  })

  test("skips factories without waste streams and builds takers from matches", () => {
    const f1 = factory("f1", [stream({ id: "ws1" })], ["Steel scrap"])
    const f2 = factory("f2", [])
    const { producers, takers, flows } = buildSymbiosisAnalysis({
      factories: [f1, f2],
      matches: [match({ id: "a" }), match({ id: "b", volumeTonsPerYear: 10.4 })],
    })
    expect(producers.map((p) => p.id)).toEqual(["f1"])
    expect(takers).toHaveLength(1)
    expect(takers[0]).toMatchObject({ id: "f2", categories: ["metallic"], inboundTonnes: 30 })
    expect(flows.map((f) => f.category)).toEqual(["metallic", "metallic"])
  })
})
