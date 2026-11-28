#!/usr/bin/env node
/**
 * Fetch manufacturing sites for the prospect map from OpenStreetMap (Overpass API).
 *
 *   node scripts/fetch-prospects.mjs            # all cities
 *   node scripts/fetch-prospects.mjs bengaluru  # one city (merged into the existing file)
 *
 * Writes src/data/prospects-osm.json. Classification/scoring happens in src/lib/prospects.ts.
 * Data © OpenStreetMap contributors, ODbL — keep the attribution wherever it is shown.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "prospects-osm.json")

// South, west, north, east — metro areas incl. the main industrial estates
const CITIES = {
  coimbatore: [10.8, 76.75, 11.3, 77.25],
  bengaluru: [12.75, 77.35, 13.25, 77.9],
  hyderabad: [17.2, 78.2, 17.65, 78.7],
}

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]

const KEEP_TAGS = [
  "name", "man_made", "industrial", "building", "landuse", "craft", "product", "works", "operator", "description",
  "website", "contact:website", "addr:housenumber", "addr:street", "addr:suburb", "addr:place", "addr:city", "addr:postcode",
]

const query = (bbox) => {
  const b = bbox.join(",")
  return `[out:json][timeout:180];
(
  nwr["man_made"="works"]["name"](${b});
  nwr["industrial"]["name"](${b});
  nwr["building"~"^(industrial|factory|manufacture)$"]["name"](${b});
  nwr["landuse"="industrial"]["name"](${b});
);
out center tags;`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overpass(q) {
  let wait = 5000
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length]
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "symbioforge-prospect-map/1.0" },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(240_000),
      })
      if (res.ok) return await res.json()
      console.warn(`  ${url} → HTTP ${res.status}, retrying in ${wait / 1000}s`)
    } catch (e) {
      console.warn(`  ${url} → ${e.message}, retrying in ${wait / 1000}s`)
    }
    await sleep(wait)
    wait = Math.min(wait * 2, 60_000)
  }
  throw new Error("Overpass unavailable after retries")
}

const norm = (s) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|co|company|india|inc)\b\.?/g, "").replace(/[^a-z0-9]/g, "")

function toFeatures(city, elements) {
  const out = []
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null || !el.tags?.name) continue
    const tags = Object.fromEntries(KEEP_TAGS.filter((k) => el.tags[k]).map((k) => [k, el.tags[k]]))
    out.push({ id: `${el.type}/${el.id}`, city, name: el.tags.name.trim(), lat: +lat.toFixed(6), lng: +lng.toFixed(6), tags })
  }
  // De-duplicate: the same site is often mapped as a node and as a building (~within 400 m)
  const kept = []
  const richness = (f) => Object.keys(f.tags).length + (f.id.startsWith("way") ? 1 : 0)
  for (const f of out.sort((a, b) => richness(b) - richness(a))) {
    const dup = kept.find((k) => norm(k.name) === norm(f.name) && Math.hypot(k.lat - f.lat, k.lng - f.lng) < 0.004 &&
      (k.tags.landuse === "industrial") === (f.tags.landuse === "industrial"))
    if (!dup) kept.push(f)
  }
  return kept
}

async function main() {
  const only = process.argv[2]
  const cities = only ? { [only]: CITIES[only] } : CITIES
  if (only && !CITIES[only]) throw new Error(`Unknown city "${only}". Use one of: ${Object.keys(CITIES).join(", ")}`)

  let existing = []
  if (only) {
    try { existing = JSON.parse(await readFile(OUT, "utf8")).features.filter((f) => f.city !== only) } catch { /* first run */ }
  }

  const features = [...existing]
  for (const [city, bbox] of Object.entries(cities)) {
    console.log(`Fetching ${city}…`)
    const json = await overpass(query(bbox))
    const f = toFeatures(city, json.elements ?? [])
    console.log(`  ${json.elements?.length ?? 0} elements → ${f.length} unique named sites`)
    features.push(...f)
    await sleep(3000)
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    attribution: "© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
    features: features.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)),
  }
  await writeFile(OUT, JSON.stringify(payload, null, 0) + "\n")
  console.log(`Wrote ${features.length} sites to ${path.relative(process.cwd(), OUT)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
