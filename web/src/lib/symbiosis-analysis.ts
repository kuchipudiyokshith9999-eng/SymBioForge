import type { ClusterState, WasteStream } from "@/lib/types"

export type MaterialCategory = WasteStream["category"]

export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  polymeric: "Plastics",
  metallic: "Metals",
  organic: "Organics",
  cellulosic: "Paper and Cardboard",
  textile: "Textiles",
  chemical: "Chemicals & Effluents",
}

export interface AnalysisMaterial {
  id: string
  name: string
  category: MaterialCategory
  categoryLabel: string
  physicalForm: WasteStream["physicalForm"]
  contamination: WasteStream["contamination"]
  reusePotential: number
  tonnesPerYear: number
  /** high = declared by the factory, low = inferred by the Profiler */
  confidence: "high" | "low"
}

export interface AnalysisProducer {
  id: string
  name: string
  industryType: string
  address: string
  lat: number
  lng: number
  complianceStatus: string
  materials: AnalysisMaterial[]
}

export interface AnalysisTaker {
  id: string
  name: string
  industryType: string
  lat: number
  lng: number
  categories: MaterialCategory[]
  inboundTonnes: number
}

export interface AnalysisFlow {
  id: string
  source: string
  target: string
  material: string
  category?: MaterialCategory
  tonnesPerYear: number
  distanceKm: number
  compatibilityScore: number
  status: string
}

export interface SymbiosisAnalysis {
  region: string
  categoryLabels: Record<MaterialCategory, string>
  producers: AnalysisProducer[]
  takers: AnalysisTaker[]
  flows: AnalysisFlow[]
}

/** kg/day (or L/day) → tonnes/year, one decimal */
export const toTonnesPerYear = (volumePerDay: number) => Math.round(((volumePerDay * 365) / 1000) * 10) / 10

/**
 * Shape the cluster state for the geographic analysis map: producers of residual
 * materials, the takers that absorb them through matches, and the flows between them.
 */
export function buildSymbiosisAnalysis(
  state: Pick<ClusterState, "factories" | "matches">,
  region = "Coimbatore Industrial Cluster",
): SymbiosisAnalysis {
  const streamById = new Map<string, WasteStream>()
  for (const f of state.factories) for (const ws of f.wasteStreams ?? []) streamById.set(ws.id, ws)

  const producers: AnalysisProducer[] = state.factories
    .filter((f) => (f.wasteStreams ?? []).length > 0)
    .map((f) => {
      const declared = new Set(f.declaredWastes.map((w) => w.toLowerCase().trim()))
      return {
        id: f.id,
        name: f.name,
        industryType: f.industryType,
        address: f.location.address,
        lat: f.location.lat,
        lng: f.location.lng,
        complianceStatus: f.complianceStatus,
        materials: (f.wasteStreams ?? []).map((ws) => ({
          id: ws.id,
          name: ws.name,
          category: ws.category,
          categoryLabel: CATEGORY_LABELS[ws.category],
          physicalForm: ws.physicalForm,
          contamination: ws.contamination,
          reusePotential: ws.reusePotential,
          tonnesPerYear: toTonnesPerYear(ws.volume),
          confidence:
            !ws.id.endsWith("_inferred") && declared.has(ws.name.toLowerCase().trim()) ? "high" : "low",
        })),
      }
    })

  const factoryById = new Map(state.factories.map((f) => [f.id, f]))
  const takerMap = new Map<string, AnalysisTaker & { cats: Set<MaterialCategory> }>()
  for (const m of state.matches) {
    const target = factoryById.get(m.targetFactoryId)
    const stream = streamById.get(m.wasteStreamId)
    if (!target || !stream) continue
    let t = takerMap.get(target.id)
    if (!t) {
      t = {
        id: target.id,
        name: target.name,
        industryType: target.industryType,
        lat: target.location.lat,
        lng: target.location.lng,
        categories: [],
        cats: new Set(),
        inboundTonnes: 0,
      }
      takerMap.set(target.id, t)
    }
    t.cats.add(stream.category)
    t.inboundTonnes += m.volumeTonsPerYear
  }
  const takers: AnalysisTaker[] = Array.from(takerMap.values()).map(({ cats, ...t }) => ({
    ...t,
    categories: Array.from(cats),
    inboundTonnes: Math.round(t.inboundTonnes),
  }))

  const flows: AnalysisFlow[] = state.matches.map((m) => ({
    id: m.id,
    source: m.sourceFactoryId,
    target: m.targetFactoryId,
    material: m.wasteStreamName,
    category: streamById.get(m.wasteStreamId)?.category,
    tonnesPerYear: m.volumeTonsPerYear,
    distanceKm: m.distanceKm,
    compatibilityScore: m.compatibilityScore,
    status: m.status,
  }))

  return { region, categoryLabels: CATEGORY_LABELS, producers, takers, flows }
}
