import { describe, expect, test } from "vitest"
import { buildProspectDataset, classifySector, isProspect, scoreProspect, tierOf, toProspect, type RawProspect } from "../lib/prospects"

const raw = (name: string, tags: Record<string, string> = {}, over: Partial<RawProspect> = {}): RawProspect => ({
  id: "node/1", city: "coimbatore", name, lat: 11, lng: 77, tags: { name, ...tags }, ...over,
})

describe("classifySector", () => {
  test("prefers explicit OSM industry tags over the name", () => {
    expect(classifySector({ industrial: "brewery" }, "Sri Lakshmi Mills")).toBe("food")
    expect(classifySector({ industrial: "foundry" }, "ABC Industries")).toBe("metal")
  })

  test("falls back to name keywords", () => {
    expect(classifySector({}, "Lakshmi Mills")).toBe("textile")
    expect(classifySector({}, "Sri Murugan Rice Mill")).toBe("food") // rice mill is food, not textile
    expect(classifySector({}, "Coimbatore Steel Castings")).toBe("metal")
    expect(classifySector({}, "Aurobindo Pharma Unit IX")).toBe("chemical")
    expect(classifySector({}, "Green Plastic Recyclers")).toBe("recycling") // recyclers are takers
    expect(classifySector({}, "Ultratech Cement RMC")).toBe("construction")
    expect(classifySector({}, "Acme Widgets")).toBe("other")
  })
})

describe("isProspect", () => {
  test("drops warehouses, non-manufacturing names and industrial estates", () => {
    expect(isProspect(raw("Big Logistics Hub", { industrial: "warehouse" }))).toBe(false)
    expect(isProspect(raw("Sri Ram Godown", { building: "industrial" }))).toBe(false)
    expect(isProspect(raw("Peenya Industrial Area", { landuse: "industrial" }))).toBe(false)
    expect(isProspect(raw("Lakshmi Mills", { man_made: "works" }))).toBe(true)
  })
})

describe("scoring", () => {
  test("confirmed works and a website raise the score; tiers follow thresholds", () => {
    const base = scoreProspect(raw("X Foundry"), "metal").score
    const boosted = scoreProspect(raw("X Foundry", { man_made: "works", website: "x.com" }), "metal")
    expect(boosted.score).toBe(base + 6)
    expect(boosted.reasons.length).toBeGreaterThan(1)
    expect(tierOf(90)).toBe("high")
    expect(tierOf(80)).toBe("medium")
    expect(tierOf(60)).toBe("low")
  })

  test("toProspect normalises website and builds an OSM link", () => {
    const p = toProspect(raw("Acme Foods", { website: "acme.example" }, { id: "way/42" }))
    expect(p.website).toBe("https://acme.example/")
    expect(p.osmUrl).toBe("https://www.openstreetmap.org/way/42")
    expect(toProspect(raw("Acme Foods", { website: "javascript:alert(1)" })).website).toBeUndefined()
  })
})

describe("buildProspectDataset", () => {
  test("splits estates from prospects and sorts by fit", () => {
    const ds = buildProspectDataset({
      generatedAt: "2026-11-28T00:00:00Z",
      features: [
        raw("Acme Widgets", {}, { id: "node/1" }),
        raw("Peenya Industrial Area", { landuse: "industrial" }, { id: "way/2" }),
        raw("City Scrap Recyclers", {}, { id: "node/3" }),
      ],
    })
    expect(ds.estates.map((e) => e.name)).toEqual(["Peenya Industrial Area"])
    expect(ds.prospects.map((p) => p.name)).toEqual(["City Scrap Recyclers", "Acme Widgets"])
    expect(ds.attribution).toMatch(/OpenStreetMap/)
  })
})

describe("estates vs company compounds", () => {
  test("landuse=industrial named after a company is a prospect, a named estate is not", async () => {
    const { isEstate } = await import("../lib/prospects")
    expect(isEstate({ landuse: "industrial" }, "Peenya Industrial Area")).toBe(true)
    expect(isEstate({ landuse: "industrial" }, "SIDCO Industrial Estate, Kurichi")).toBe(true)
    expect(isEstate({ landuse: "industrial" }, "Taegutec")).toBe(false)
    expect(isProspect(raw("Taegutec", { landuse: "industrial" }))).toBe(true)
    expect(isProspect(raw("BWSSB", { landuse: "industrial" }))).toBe(false)
    expect(classifySector({}, "Dedienne Aerospace India Pvt. Ltd.")).toBe("auto")
  })
})

describe("keyword coverage for common Indian factory names", () => {
  test.each([
    ["Alubee Die Casters Pvt Ltd", "metal"],
    ["Ascent Circuits", "electronics"],
    ["Aarya Ready Mix", "construction"],
    ["Bliss Chocolates India Pvt Ltd", "food"],
    ["Bridgestone India Pvt Ltd", "auto"],
    ["Biomethanation Plant", "energy"],
    ["BALAJI SIZING", "textile"],
  ])("%s → %s", (name, sector) => {
    expect(classifySector({}, name)).toBe(sector)
  })

  test("drops non-factories", () => {
    for (const n of ["Allu Studio", "Blinkit Commerce Pvt. Ltd.", "BSNL", "ASRS Gowdown"]) expect(isProspect(raw(n))).toBe(false)
  })
})
