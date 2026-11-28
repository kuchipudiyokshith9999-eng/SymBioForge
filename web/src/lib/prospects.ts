/**
 * Prospect classification for the SymbioForge market map.
 *
 * Raw factory records come from OpenStreetMap (see scripts/fetch-prospects.mjs). Each one is
 * classified into an industry sector from its OSM tags and name, then given a "fit score":
 * how likely it is to benefit from industrial symbiosis — either as a producer of reusable
 * residual materials or as a taker that can absorb other factories' residues.
 */

export type CityId = "coimbatore" | "bengaluru" | "hyderabad"
export type SectorId =
  | "recycling" | "construction" | "food" | "textile" | "metal" | "auto" | "plastics" | "paper"
  | "chemical" | "electronics" | "wood" | "energy" | "other"
export type ProspectRole = "producer" | "taker" | "both"

export interface City {
  id: CityId
  name: string
  /** [[minLng, minLat], [maxLng, maxLat]] */
  bounds: [[number, number], [number, number]]
}

export const CITIES: City[] = [
  { id: "coimbatore", name: "Coimbatore", bounds: [[76.75, 10.8], [77.25, 11.3]] },
  { id: "bengaluru", name: "Bengaluru", bounds: [[77.35, 12.75], [77.9, 13.25]] },
  { id: "hyderabad", name: "Hyderabad", bounds: [[78.2, 17.2], [78.7, 17.65]] },
]

interface SectorDef {
  label: string
  color: string
  role: ProspectRole
  /** Base symbiosis potential, 0–100 */
  fit: number
  /** OSM `industrial=*` / `craft=*` / `product=*` values that identify the sector */
  osm: string[]
  /** Name / product keywords */
  keywords: RegExp
  /** Residual materials such a site typically produces */
  wastes: string[]
  /** Residues from other factories such a site can typically use as input */
  absorbs: string[]
  why: string
}

/** Order matters: the first sector whose OSM values or keywords match wins. */
export const SECTORS: Record<SectorId, SectorDef> = {
  recycling: {
    label: "Recyclers & waste processors", color: "#10b981", role: "taker", fit: 95,
    osm: ["scrap_yard", "recycling", "waste_handling", "waste_management"],
    keywords: /recycl|scrap|e-?waste|reclaim|waste management/i,
    wastes: [],
    absorbs: ["Metal scrap", "Plastic scrap", "Paper & cardboard", "E-waste"],
    why: "Buys or processes other factories' residues — a direct taker for SymbioForge matches.",
  },
  construction: {
    label: "Cement, bricks & building materials", color: "#eab308", role: "taker", fit: 88,
    osm: ["cement", "concrete_plant", "brickyard", "brickworks", "bricks", "glass", "ceramics", "tiles", "quarry", "asphalt"],
    keywords: /cement|concrete|\brmc\b|brick|granite|tiles?\b|ceramic|glass|marble|asphalt|precast|ready ?mix|hollow block|fly ?ash/i,
    wastes: ["Broken product & rejects", "Kiln dust"],
    absorbs: ["Fly ash & slag", "Spent foundry sand", "Paper sludge", "Glass cullet"],
    why: "Mineral-hungry processes that can replace virgin raw material with fly ash, slag and foundry sand.",
  },
  food: {
    label: "Food & beverage", color: "#22c55e", role: "producer", fit: 88,
    osm: ["food", "food_industry", "brewery", "distillery", "bakery", "dairy", "slaughterhouse", "sugar", "oil_mill", "rice_mill", "beverages", "beverage", "winery"],
    keywords: /food|dairy|milk|bakery|biscuit|beverage|brew|distiller|rice mill|flour|spice|sugar|agro|oil mills?|masala|bottling|confection|snack|meat|poultry|cashew|coffee|chocolat|flavou?r|bakers?|tea\b|modern mill/i,
    wastes: ["Husk & bran", "Spent grain", "Organic sludge", "Process wastewater"],
    absorbs: ["Packaging", "Biomass fuel"],
    why: "Large, clean organic streams — feedstock for biogas, animal feed and bio-materials.",
  },
  textile: {
    label: "Textiles & apparel", color: "#e879f9", role: "producer", fit: 90,
    osm: ["textile", "textiles", "clothing", "garment", "garments", "spinning_mill"],
    keywords: /textile|spinning|\bmills?\b|garment|apparel|knit|dyeing|weav|fabric|cotton|yarn|hosiery|denim|sizing|footwear|shoes?|exports? ltd|fashion/i,
    wastes: ["Cotton lint & fibre", "Fabric offcuts", "Dye-house effluent", "Paper cones & packaging"],
    absorbs: ["Recycled fibre"],
    why: "High volumes of clean fibre and fabric waste with proven recycling and insulation-board routes.",
  },
  metal: {
    label: "Foundry & metal", color: "#94a3b8", role: "producer", fit: 92,
    osm: ["foundry", "metal_working", "metal", "steel", "mechanical_engineering", "machine_shop", "metal_processing", "forging", "metal_construction", "blacksmith", "engineering"],
    keywords: /foundr|casting|casters?|forg|steel|metal|alloy|\biron\b|alumin|fabricat|machin|engineering|engineers|precision|tools?\b|pumps?\b|valves?\b|compressor|extrusion|springs?\b|fasteners?/i,
    wastes: ["Metal turnings & scrap", "Spent foundry sand", "Slag", "Spent cutting oil"],
    absorbs: ["Metal scrap"],
    why: "Metal scrap and foundry sand have established reuse markets (smelters, cement and brick makers).",
  },
  auto: {
    label: "Automotive, aerospace & components", color: "#38bdf8", role: "producer", fit: 86,
    osm: ["automotive", "car_manufacturing", "vehicle", "vehicles", "automobile", "aerospace", "aircraft"],
    keywords: /\bauto|automotive|motors?\b|vehicle|tyres?\b|tires?\b|components?|bearings?|gears?\b|axle|aerospace|aeronautic|aircraft|helicopter|avio|bridgestone|\bbmw\b|defence|earth movers?/i,
    wastes: ["Steel & aluminium scrap", "Plastic trims", "Used oils & coolants", "Pallets & packaging"],
    absorbs: [],
    why: "Steady streams of sorted metal and plastic scrap from stamping and assembly lines.",
  },
  plastics: {
    label: "Plastics, rubber & packaging", color: "#f43f5e", role: "both", fit: 90,
    osm: ["plastic", "plastics", "rubber", "packaging", "polymer"],
    keywords: /plastic|polymer|rubber|\bpoly|pvc|mou?lding|packag|\bpet\b|foam|laminat/i,
    wastes: ["Plastic purgings & rejects", "Film offcuts", "Rubber trimmings"],
    absorbs: ["Clean plastic regrind"],
    why: "Can both sell clean plastic scrap and buy regrind back as cheaper feedstock.",
  },
  paper: {
    label: "Paper & printing", color: "#f97316", role: "producer", fit: 85,
    osm: ["paper", "printing", "printing_house", "pulp", "paper_mill", "cardboard"],
    keywords: /paper|\bboards?\b|print|\bpress\b|pulp|carton|corrugat/i,
    wastes: ["Paper trimmings", "Paper sludge", "Ink & solvent waste"],
    absorbs: ["Waste paper", "Cotton lint"],
    why: "Trimmings recycle directly; paper sludge is a known input for bricks and cement.",
  },
  chemical: {
    label: "Chemicals & pharma", color: "#3b82f6", role: "producer", fit: 74,
    osm: ["chemical", "chemicals", "pharmaceutical", "pharmaceuticals", "pharma", "fertilizer", "paint", "paints", "petrochemical"],
    keywords: /pharma|laborator|\blabs?\b|drugs?\b|chemical|paints?\b|solvent|fertili|bulk drug|resin|\bdyes?\b|pesticide|biotech|biolog|steril|life ?sciences/i,
    wastes: ["Spent solvents", "Chemical sludge", "Process water"],
    absorbs: ["Recovered solvents"],
    why: "Solvent recovery and by-product exchange are valuable, though hazardous streams need careful handling.",
  },
  electronics: {
    label: "Electronics & electrical", color: "#06b6d4", role: "producer", fit: 80,
    osm: ["electronics", "electrical", "electrical_engineering", "semiconductor", "electronics_manufacturing"],
    keywords: /electronic|electrical|semiconductor|\bpcbs?\b|solar|batter|cables?\b|wires?\b|transformer|switchgear|circuits?|electro|relays?|tronics?|\bled\b/i,
    wastes: ["E-waste & rejects", "Copper & metal scrap", "Packaging"],
    absorbs: [],
    why: "Small but high-value residues (copper, precious metals) attractive to specialist recyclers.",
  },
  wood: {
    label: "Wood & furniture", color: "#a16207", role: "producer", fit: 82,
    osm: ["sawmill", "wood", "furniture", "timber", "carpenter", "joinery"],
    keywords: /\bwood|timber|furniture|plywood|saw ?mill|veneer|interiors/i,
    wastes: ["Sawdust & shavings", "Offcuts"],
    absorbs: [],
    why: "Sawdust and offcuts feed particle board, biomass boilers and composites.",
  },
  energy: {
    label: "Power & energy", color: "#fde047", role: "both", fit: 78,
    osm: ["power", "power_plant", "energy", "biogas"],
    keywords: /\bpower\b|energy|biogas|biomethan|boilers?/i,
    wastes: ["Fly ash", "Waste heat"],
    absorbs: ["Biomass", "Organic waste (biogas)"],
    why: "Fly ash is in demand by cement and brick makers; biomass and biogas plants take organic waste.",
  },
  other: {
    label: "Other manufacturing", color: "#71717a", role: "producer", fit: 60,
    osm: [], keywords: /$^/, wastes: ["Mixed industrial waste", "Packaging"], absorbs: [],
    why: "Manufacturing site with an unknown process — worth a discovery call.",
  },
}

export const SECTOR_ORDER = Object.keys(SECTORS) as SectorId[]

/** Raw record as written by scripts/fetch-prospects.mjs */
export interface RawProspect {
  id: string // e.g. "way/123"
  city: CityId
  name: string
  lat: number
  lng: number
  tags: Record<string, string>
}

export interface Prospect {
  id: string
  city: CityId
  name: string
  lat: number
  lng: number
  sector: SectorId
  role: ProspectRole
  fitScore: number
  tier: "high" | "medium" | "low"
  reasons: string[]
  wastes: string[]
  absorbs: string[]
  address: string
  website?: string
  osmUrl: string
}

export interface IndustrialEstate { id: string; city: CityId; name: string; lat: number; lng: number; osmUrl: string }

// Sites that carry industrial tags but are not manufacturing (or not a lead)
const EXCLUDED_INDUSTRIAL = new Set([
  "warehouse", "depot", "logistics", "storage", "distributor", "wholesale", "port", "service", "repair", "garage",
  "bus_depot", "railway", "telecommunication", "water", "sewage", "office",
])
const NON_MANUFACTURING_NAME = /\b(bwssb|bmtc|bescom|tneb|tangedco|kseb|tsspdcl|hmwssb|ghmc|bbmp|kptcl)\b|dhobi|receiving terminal|pumping station|treatment plant|\bstp\b|\bdepot\b|godown|gowdown|warehous|studio|training|commerce|\bbsnl\b|metro maintenance|infotech|infosystems|cloud|\bsoft\b|cheque|logistic|transport|courier|bank\b|school|college|universit|hospital|hotel|showroom|office|tech ?park|it ?park|software|\bsez\b|metro depot|bus depot|petrol|fuel station|substation|sub-station|temple|church|mosque/i

// Names of shared industrial areas (estates), as opposed to a single company's compound
const ESTATE_NAME = /industrial (area|estate|park|zone|layout|corridor|town|suburb|complex|cluster)|sidco|kiadb|tsiic|apiic|sipcot|\bsez\b|\bphase\b|\bestate\b|\bi\.?d\.?a\.?\b|\bindl\.? (area|estate)|aerospace park|\bpark$/i

/**
 * Industrial estates / areas are context, not leads. In Indian cities many single-company
 * compounds are mapped as `landuse=industrial` named after the company, so only names that
 * read like a shared estate count as estates; the rest are treated as factories.
 */
export const isEstate = (tags: Record<string, string>, name = tags.name ?? "") =>
  tags.landuse === "industrial" && !tags.man_made && !tags.industrial && ESTATE_NAME.test(name)

export function isProspect(raw: RawProspect): boolean {
  if (isEstate(raw.tags, raw.name)) return false
  if (raw.tags.industrial && EXCLUDED_INDUSTRIAL.has(raw.tags.industrial)) return false
  if (NON_MANUFACTURING_NAME.test(raw.name)) return false
  return raw.name.trim().length >= 3
}

export function classifySector(tags: Record<string, string>, name: string): SectorId {
  const osmValues = [tags.industrial, tags.craft, tags.product, tags.works]
    .filter(Boolean)
    .flatMap((v) => v.toLowerCase().split(/[;,]/).map((x) => x.trim()))
  for (const id of SECTOR_ORDER) if (osmValues.some((v) => SECTORS[id].osm.includes(v))) return id
  const text = `${name} ${tags.product ?? ""} ${tags.description ?? ""} ${tags.operator ?? ""}`
  for (const id of SECTOR_ORDER) if (SECTORS[id].keywords.test(text)) return id
  return "other"
}

export function scoreProspect(raw: RawProspect, sector: SectorId): { score: number; reasons: string[] } {
  const def = SECTORS[sector]
  let score = def.fit
  const reasons = [def.why]
  if (raw.tags.man_made === "works" || /industrial|factory|manufacture/.test(raw.tags.building ?? "")) {
    score += 4
    reasons.push("Mapped as an active manufacturing site.")
  }
  if (raw.tags.website || raw.tags["contact:website"]) {
    score += 2
    reasons.push("Has a public website — easy to research and contact.")
  }
  if (sector === "other") reasons.push("Industry not stated in the map data; confirm the process on a call.")
  return { score: Math.max(0, Math.min(100, score)), reasons }
}

export const tierOf = (score: number): Prospect["tier"] => (score >= 88 ? "high" : score >= 75 ? "medium" : "low")

const addressOf = (t: Record<string, string>) =>
  [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] ?? t["addr:place"], t["addr:city"], t["addr:postcode"]]
    .filter(Boolean)
    .join(", ")

const safeWebsite = (url?: string) => {
  if (!url) return undefined
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`
  try {
    const parsed = new URL(u)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

export function toProspect(raw: RawProspect): Prospect {
  const sector = classifySector(raw.tags, raw.name)
  const { score, reasons } = scoreProspect(raw, sector)
  const def = SECTORS[sector]
  return {
    id: raw.id,
    city: raw.city,
    name: raw.name.trim(),
    lat: raw.lat,
    lng: raw.lng,
    sector,
    role: def.role,
    fitScore: score,
    tier: tierOf(score),
    reasons,
    wastes: def.wastes,
    absorbs: def.absorbs,
    address: addressOf(raw.tags),
    website: safeWebsite(raw.tags.website ?? raw.tags["contact:website"]),
    osmUrl: `https://www.openstreetmap.org/${raw.id}`,
  }
}

export interface ProspectDataset {
  generatedAt: string
  attribution: string
  cities: City[]
  prospects: Prospect[]
  estates: IndustrialEstate[]
}

export function buildProspectDataset(raw: { generatedAt: string; features: RawProspect[] }): ProspectDataset {
  const prospects: Prospect[] = []
  const estates: IndustrialEstate[] = []
  for (const r of raw.features) {
    if (isEstate(r.tags, r.name)) estates.push({ id: r.id, city: r.city, name: r.name, lat: r.lat, lng: r.lng, osmUrl: `https://www.openstreetmap.org/${r.id}` })
    else if (isProspect(r)) prospects.push(toProspect(r))
  }
  prospects.sort((a, b) => b.fitScore - a.fitScore || a.name.localeCompare(b.name))
  return {
    generatedAt: raw.generatedAt,
    attribution: "Factory locations © OpenStreetMap contributors, available under the ODbL",
    cities: CITIES,
    prospects,
    estates,
  }
}
