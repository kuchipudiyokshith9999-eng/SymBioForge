'use client';

import { LEAFLET_CSS } from './leaflet-css';
import { useWidgetSDK } from '@nitrostack/widgets';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import {
  Search, X, ChevronDown, ChevronRight, Maximize2, Download, Layers, BarChart3, List, MapPin, Factory,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types (mirror get-symbiosis-analysis tool output)
// ---------------------------------------------------------------------------
type Category = 'polymeric' | 'metallic' | 'organic' | 'cellulosic' | 'textile' | 'chemical';

interface Material {
  id: string;
  name: string;
  category: Category;
  categoryLabel: string;
  physicalForm: string;
  contamination: 'clean' | 'mild' | 'high' | 'hazardous';
  reusePotential: number;
  tonnesPerYear: number;
  confidence: 'high' | 'low';
}

interface Producer {
  id: string;
  name: string;
  industryType: string;
  address: string;
  lat: number;
  lng: number;
  complianceStatus: string;
  materials: Material[];
}

interface Taker {
  id: string;
  name: string;
  industryType: string;
  lat: number;
  lng: number;
  categories: Category[];
  inboundTonnes: number;
}

interface Flow {
  id: string;
  source: string;
  target: string;
  material: string;
  category?: Category;
  tonnesPerYear: number;
  distanceKm: number;
  compatibilityScore: number;
  status: string;
}

interface AnalysisData {
  success: boolean;
  region: string;
  initialCategory: Category | null;
  categoryLabels: Record<Category, string>;
  producers: Producer[];
  takers: Taker[];
  flows: Flow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CATEGORY_ORDER: Category[] = ['polymeric', 'metallic', 'organic', 'cellulosic', 'textile', 'chemical'];
const CATEGORY_COLORS: Record<Category, string> = {
  polymeric: '#e11d48',
  metallic: '#64748b',
  organic: '#16a34a',
  cellulosic: '#c2410c',
  textile: '#d946ef',
  chemical: '#2563eb',
};
const DEFAULT_LABELS: Record<Category, string> = {
  polymeric: 'Plastics',
  metallic: 'Metals',
  organic: 'Organics',
  cellulosic: 'Paper and Cardboard',
  textile: 'Textiles',
  chemical: 'Chemicals & Effluents',
};
const CONTAMINATION_LEVELS: Material['contamination'][] = ['clean', 'mild', 'high', 'hazardous'];

const NAVY = '#0b2545';
const ACCENT = '#10b981';
const BORDER = '#e2e8f0';

const fmtT = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t >= 100 ? Math.round(t).toString() : t.toFixed(1));

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SymbiosisAnalysis() {
  const { isReady, getToolOutput, requestFullscreen } = useWidgetSDK();
  const data = getToolOutput<AnalysisData>();

  // Filters
  const [query, setQuery] = useState('');
  const [searchByName, setSearchByName] = useState(true);
  const [searchByMaterial, setSearchByMaterial] = useState(true);
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(new Set());
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [contamination, setContamination] = useState<Set<string>>(new Set());
  const [includeLow, setIncludeLow] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<Category>>(new Set());
  const [showFilters, setShowFilters] = useState(true);
  const [showAllCats, setShowAllCats] = useState(false);

  // Layers
  const [layerHeat, setLayerHeat] = useState(true);
  const [layerQty, setLayerQty] = useState(true);
  const [layerProducers, setLayerProducers] = useState(true);
  const [layerFlows, setLayerFlows] = useState(false);
  const [takerCats, setTakerCats] = useState<Set<Category>>(new Set());
  const [takerMenuOpen, setTakerMenuOpen] = useState(false);

  // Panels
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showList, setShowList] = useState(false);

  const labels = data?.categoryLabels ?? DEFAULT_LABELS;

  // Pre-select category passed to the tool
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (data?.initialCategory && !appliedInitial.current) {
      appliedInitial.current = true;
      setSelectedCats(new Set([data.initialCategory]));
      setExpandedCats(new Set([data.initialCategory]));
    }
  }, [data?.initialCategory]);

  // ---------------- Derived data ----------------
  const allMaterialsByCat = useMemo(() => {
    const m = new Map<Category, Map<string, number>>();
    for (const p of data?.producers ?? []) {
      for (const mat of p.materials) {
        if (!includeLow && mat.confidence === 'low') continue;
        if (!m.has(mat.category)) m.set(mat.category, new Map());
        const inner = m.get(mat.category)!;
        inner.set(mat.name, (inner.get(mat.name) ?? 0) + mat.tonnesPerYear);
      }
    }
    return m;
  }, [data, includeLow]);

  const filteredProducers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.producers ?? [])
      .map(p => {
        const nameHit = q && searchByName &&
          (p.name.toLowerCase().includes(q) || p.industryType.toLowerCase().includes(q) || p.address.toLowerCase().includes(q));
        const mats = p.materials.filter(m => {
          if (!includeLow && m.confidence === 'low') return false;
          if (selectedCats.size && !selectedCats.has(m.category)) return false;
          if (selectedMaterials.size && !selectedMaterials.has(m.name)) {
            // A sub-material selection only narrows its own category
            const catHasSelection = [...selectedMaterials].some(n => allMaterialsByCat.get(m.category)?.has(n));
            if (catHasSelection) return false;
          }
          if (contamination.size && !contamination.has(m.contamination)) return false;
          if (q && !nameHit) {
            const matHit = searchByMaterial &&
              (m.name.toLowerCase().includes(q) || m.categoryLabel.toLowerCase().includes(q) || m.physicalForm.includes(q));
            if (!matHit) return false;
          }
          return true;
        });
        const tonnes = mats.reduce((s, m) => s + m.tonnesPerYear, 0);
        // dominant category for marker colour
        const byCat = new Map<Category, number>();
        mats.forEach(m => byCat.set(m.category, (byCat.get(m.category) ?? 0) + m.tonnesPerYear));
        const dominant = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return { ...p, materials: mats, tonnes, dominant };
      })
      .filter(p => p.materials.length > 0);
  }, [data, query, searchByName, searchByMaterial, selectedCats, selectedMaterials, contamination, includeLow, allMaterialsByCat]);

  const totalTonnes = filteredProducers.reduce((s, p) => s + p.tonnes, 0);

  const breakdown = useMemo(() => {
    const byCat = new Map<Category, number>();
    const byMat = new Map<string, { t: number; cat: Category }>();
    for (const p of filteredProducers) {
      for (const m of p.materials) {
        byCat.set(m.category, (byCat.get(m.category) ?? 0) + m.tonnesPerYear);
        const cur = byMat.get(m.name) ?? { t: 0, cat: m.category };
        cur.t += m.tonnesPerYear;
        byMat.set(m.name, cur);
      }
    }
    return {
      cats: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
      mats: [...byMat.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 8),
    };
  }, [filteredProducers]);

  const visibleTakers = useMemo(
    () => (data?.takers ?? []).filter(t => t.categories.some(c => takerCats.has(c))),
    [data, takerCats],
  );

  const visibleFlows = useMemo(() => {
    const ids = new Set(filteredProducers.map(p => p.id));
    return (data?.flows ?? []).filter(f =>
      ids.has(f.source) && (!selectedCats.size || (f.category && selectedCats.has(f.category))));
  }, [data, filteredProducers, selectedCats]);

  // ---------------- Leaflet map ----------------
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const layersRef = useRef<{ heat?: any; qty?: Leaflet.LayerGroup; producers?: Leaflet.LayerGroup; takers?: Leaflet.LayerGroup; flows?: Leaflet.LayerGroup }>({});
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(13);
  const fittedRef = useRef(false);
  const roRef = useRef<ResizeObserver | null>(null);
  const [hasSize, setHasSize] = useState(false);

  useEffect(() => {
    if (!isReady || !data || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      (window as any).L = L;
      await import('leaflet.heat');
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, preferCanvas: true })
        .setView([11.02, 76.96], 13);
      const base = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
      L.tileLayer(`${base}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      }).addTo(map);
      L.tileLayer(`${base}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map);
      L.control.scale({ position: 'bottomleft' }).addTo(map);
      map.on('zoomend', () => setZoom(map.getZoom()));
      // Keep Leaflet in sync with container size (panel toggles, fullscreen, widget mounted while hidden)
      const ro = new ResizeObserver(() => {
        map.invalidateSize();
        setHasSize((mapEl.current?.clientWidth ?? 0) > 0 && (mapEl.current?.clientHeight ?? 0) > 0);
      });
      ro.observe(mapEl.current);
      roRef.current = ro;
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => { cancelled = true; };
  }, [isReady, data]);

  useEffect(() => () => { roRef.current?.disconnect(); mapRef.current?.remove(); mapRef.current = null; }, []);

  // Fit to data once
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!mapReady || !hasSize || !L || !map || fittedRef.current || !data?.producers.length) return;
    fittedRef.current = true;
    const b = L.latLngBounds(data.producers.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b.pad(0.25));
  }, [mapReady, hasSize, data]);

  // Heatmap
  useEffect(() => {
    const L = LRef.current as any, map = mapRef.current;
    if (!mapReady || !L || !map) return;
    layersRef.current.heat?.remove();
    layersRef.current.heat = undefined;
    // leaflet.heat throws on a zero-sized canvas
    if (!layerHeat || !hasSize || !filteredProducers.length) return;
    const max = Math.max(...filteredProducers.map(p => p.tonnes), 1);
    const pts = filteredProducers.map(p => [p.lat, p.lng, Math.max(0.15, p.tonnes / max)]);
    layersRef.current.heat = L.heatLayer(pts, {
      radius: 40, blur: 28, maxZoom: 14, minOpacity: 0.35,
      gradient: { 0.2: '#6366f1', 0.45: '#22d3ee', 0.65: '#4ade80', 0.85: '#facc15', 1.0: '#ef4444' },
    }).addTo(map);
  }, [mapReady, hasSize, layerHeat, filteredProducers]);

  // Quantity bubbles — clustered in screen space, re-computed on zoom
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!mapReady || !L || !map) return;
    layersRef.current.qty?.remove();
    if (!layerQty) return;
    const group = L.layerGroup();
    const cell = 70; // px
    const buckets = new Map<string, { t: number; lat: number; lng: number; n: number }>();
    for (const p of filteredProducers) {
      const pt = map.project([p.lat, p.lng], zoom);
      const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
      const b = buckets.get(key) ?? { t: 0, lat: 0, lng: 0, n: 0 };
      b.t += p.tonnes; b.lat += p.lat * p.tonnes; b.lng += p.lng * p.tonnes; b.n += 1;
      buckets.set(key, b);
    }
    buckets.forEach(b => {
      const size = Math.round(Math.min(56, 26 + Math.sqrt(b.t) * 0.9));
      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        html: `<div class="sf-qty" style="width:${size}px;height:${size}px">${fmtT(b.t)}</div>`,
      });
      L.marker([b.lat / b.t, b.lng / b.t], { icon, interactive: true, zIndexOffset: -100 })
        .bindTooltip(`${b.n} producer${b.n > 1 ? 's' : ''} · ${b.t.toFixed(1)} t/yr`, { direction: 'top' })
        .on('click', () => map.setView([b.lat / b.t, b.lng / b.t], Math.min(zoom + 2, 16)))
        .addTo(group);
    });
    group.addTo(map);
    layersRef.current.qty = group;
  }, [mapReady, layerQty, filteredProducers, zoom]);

  // Producer pins
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!mapReady || !L || !map) return;
    layersRef.current.producers?.remove();
    if (!layerProducers) return;
    const group = L.layerGroup();
    for (const p of filteredProducers) {
      const color = p.dominant ? CATEGORY_COLORS[p.dominant] : '#ef4444';
      const icon = L.divIcon({
        className: '',
        iconSize: [22, 30],
        iconAnchor: [11, 30],
        popupAnchor: [0, -28],
        html: `<div class="sf-pin" style="--c:${color}"><span></span></div>`,
      });
      const rows = p.materials
        .sort((a, b) => b.tonnesPerYear - a.tonnesPerYear)
        .map(m => `<tr><td><i style="background:${CATEGORY_COLORS[m.category]}"></i>${escapeHtml(m.name)}${m.confidence === 'low' ? ' <em>predicted</em>' : ''}</td><td>${m.tonnesPerYear.toFixed(1)} t</td></tr>`)
        .join('');
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(
          `<div class="sf-pop"><b>${escapeHtml(p.name)}</b><div class="sf-sub">${escapeHtml(p.industryType)} · ${escapeHtml(p.address)}</div>` +
          `<table>${rows}</table><div class="sf-tot">Total residuals: <b>${p.tonnes.toFixed(1)} t/yr</b></div></div>`,
          { maxWidth: 300 },
        )
        .addTo(group);
    }
    group.addTo(map);
    layersRef.current.producers = group;
  }, [mapReady, layerProducers, filteredProducers]);

  // Takers
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!mapReady || !L || !map) return;
    layersRef.current.takers?.remove();
    if (!visibleTakers.length) return;
    const group = L.layerGroup();
    for (const t of visibleTakers) {
      const shown = t.categories.filter(c => takerCats.has(c));
      const color = CATEGORY_COLORS[shown[0]];
      const icon = L.divIcon({
        className: '',
        iconSize: [20, 20],
        html: `<div class="sf-taker" style="background:${color}">T</div>`,
      });
      L.marker([t.lat, t.lng], { icon, zIndexOffset: 200 })
        .bindPopup(
          `<div class="sf-pop"><b>${escapeHtml(t.name)}</b><div class="sf-sub">Taker · ${escapeHtml(t.industryType)}</div>` +
          `<div>Accepts: ${t.categories.map(c => escapeHtml(labels[c])).join(', ')}</div>` +
          `<div class="sf-tot">Inbound via matches: <b>${t.inboundTonnes} t/yr</b></div></div>`,
        )
        .addTo(group);
    }
    group.addTo(map);
    layersRef.current.takers = group;
  }, [mapReady, visibleTakers, takerCats, labels]);

  // Symbiotic flows
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!mapReady || !L || !map || !data) return;
    layersRef.current.flows?.remove();
    if (!layerFlows) return;
    const byId = new Map<string, { lat: number; lng: number; name: string }>();
    data.producers.forEach(p => byId.set(p.id, p));
    data.takers.forEach(t => byId.set(t.id, t));
    const group = L.layerGroup();
    for (const f of visibleFlows) {
      const a = byId.get(f.source), b = byId.get(f.target);
      if (!a || !b) continue;
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: f.category ? CATEGORY_COLORS[f.category] : NAVY,
        weight: Math.min(6, 1.5 + f.tonnesPerYear / 40),
        opacity: 0.75,
        dashArray: f.status === 'Active' ? undefined : '6 6',
      })
        .bindTooltip(`${escapeHtml(f.material)}: ${escapeHtml(a.name)} → ${escapeHtml(b.name)}<br>${f.tonnesPerYear} t/yr · ${f.distanceKm} km · ${f.compatibilityScore}% match`, { sticky: true })
        .addTo(group);
    }
    group.addTo(map);
    layersRef.current.flows = group;
  }, [mapReady, layerFlows, visibleFlows, data]);


  // ---------------- Actions ----------------
  // `_current` kept for call-site readability; the functional update avoids stale state on rapid clicks
  const toggle = <T,>(_current: Set<T>, v: T, setter: React.Dispatch<React.SetStateAction<Set<T>>>) => {
    setter(prev => {
      const n = new Set(prev);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });
  };

  const clearAll = () => {
    setQuery(''); setSelectedCats(new Set()); setSelectedMaterials(new Set()); setContamination(new Set());
  };

  const exportCsv = () => {
    const header = ['Producer', 'Industry', 'Address', 'Lat', 'Lng', 'Material', 'Category', 'Form', 'Contamination', 'Confidence', 'Tonnes/yr'];
    const lines = [header.join(',')];
    for (const p of filteredProducers)
      for (const m of p.materials)
        lines.push([p.name, p.industryType, p.address, p.lat, p.lng, m.name, m.categoryLabel, m.physicalForm, m.contamination, m.confidence, m.tonnesPerYear]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'symbiosis-residual-materials.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chips: { label: string; onRemove: () => void }[] = [
    ...(query ? [{ label: `“${query}”`, onRemove: () => setQuery('') }] : []),
    ...[...selectedCats].map(c => ({ label: labels[c], onRemove: () => toggle(selectedCats, c, setSelectedCats) })),
    ...[...selectedMaterials].map(m => ({ label: m, onRemove: () => toggle(selectedMaterials, m, setSelectedMaterials) })),
    ...[...contamination].map(c => ({ label: `Contamination: ${c}`, onRemove: () => toggle(contamination, c, setContamination) })),
  ];

  // ---------------- Render ----------------
  if (!isReady) return <div style={msgStyle}>Initializing SDK...</div>;
  if (!data) return <div style={msgStyle}>Loading symbiosis analysis…</div>;

  const catsWithData = CATEGORY_ORDER.filter(c => allMaterialsByCat.has(c));
  const catsShown = showAllCats ? catsWithData : catsWithData.slice(0, 5);
  const maxCatT = Math.max(...breakdown.cats.map(c => c[1]), 1);
  const maxMatT = Math.max(...breakdown.mats.map(m => m[1].t), 1);

  return (
    <div className="sf-root">
      <style>{LEAFLET_CSS + CSS}</style>

      {/* Header */}
      <div className="sf-header">
        <div>
          <h1>Industrial Symbiosis Data Analysis</h1>
          <div className="sf-region"><MapPin size={12} /> {data.region}</div>
        </div>
        <div className="sf-kpis">
          <span><b>{filteredProducers.length.toLocaleString()}</b> producers</span>
          <span><b>{Math.round(totalTonnes).toLocaleString()}t</b>/yr of residual materials</span>
        </div>
      </div>

      <div className="sf-chipsrow">
        <div className="sf-chips">
          {chips.map(c => (
            <span key={c.label} className="sf-chip">{c.label}<X size={11} onClick={c.onRemove} /></span>
          ))}
          {chips.length > 0 && <button className="sf-link" onClick={clearAll}><X size={12} /> Clear all filters</button>}
        </div>
        <label className="sf-switch">
          <input type="checkbox" checked={includeLow} onChange={e => setIncludeLow(e.target.checked)} />
          <span className="sf-track"><span /></span>
          Include low confidence predictions
        </label>
      </div>

      <div className="sf-body" style={{ gridTemplateColumns: showFilters ? '270px 1fr' : '0 1fr' }}>
        {/* Filters */}
        <aside className="sf-filters" style={{ visibility: showFilters ? 'visible' : 'hidden' }}>
          <div className="sf-fhead">
            <span>Producers filters</span>
            <button className="sf-link" onClick={() => setShowFilters(false)}>Hide</button>
          </div>
          <div className="sf-search">
            <input placeholder="Type material, factory, industry…" value={query} onChange={e => setQuery(e.target.value)} />
            <button><Search size={15} /></button>
          </div>
          <label className="sf-switch sm">
            <input type="checkbox" checked={searchByName} onChange={e => setSearchByName(e.target.checked)} />
            <span className="sf-track"><span /></span> Search by business name
          </label>
          <label className="sf-switch sm">
            <input type="checkbox" checked={searchByMaterial} onChange={e => setSearchByMaterial(e.target.checked)} />
            <span className="sf-track"><span /></span> Search by material type
          </label>

          <h4>Residual Material Type</h4>
          {catsShown.map(c => {
            const mats = [...(allMaterialsByCat.get(c)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
            const open = expandedCats.has(c);
            return (
              <div key={c}>
                <div className="sf-check">
                  <button className="sf-exp" onClick={() => toggle(expandedCats, c, setExpandedCats)}>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  <label>
                    <input type="checkbox" checked={selectedCats.has(c)} onChange={() => toggle(selectedCats, c, setSelectedCats)} />
                    <i style={{ background: CATEGORY_COLORS[c] }} />
                    {labels[c]}
                  </label>
                </div>
                {open && mats.map(([name, t]) => (
                  <label key={name} className="sf-check sub">
                    <input type="checkbox" checked={selectedMaterials.has(name)} onChange={() => toggle(selectedMaterials, name, setSelectedMaterials)} />
                    {name} <span className="sf-muted">{fmtT(t)} t</span>
                  </label>
                ))}
              </div>
            );
          })}
          {catsWithData.length > 5 && (
            <button className="sf-link" onClick={() => setShowAllCats(!showAllCats)}>
              {showAllCats ? 'Show less' : 'Show more'} <ChevronRight size={12} />
            </button>
          )}

          <h4>Contamination Level</h4>
          {CONTAMINATION_LEVELS.map(c => (
            <label key={c} className="sf-check flat">
              <input type="checkbox" checked={contamination.has(c)} onChange={() => toggle(contamination, c, setContamination)} />
              <span style={{ textTransform: 'capitalize' }}>{c}</span>
            </label>
          ))}
        </aside>

        {/* Map */}
        <div className="sf-mapwrap">
          <div ref={mapEl} className="sf-map" />

          {!showFilters && (
            <button className="sf-btn sf-showfilters" onClick={() => setShowFilters(true)}>Filters</button>
          )}

          <div className="sf-toolbar-left">
            <button className="sf-icon" title="Fullscreen" onClick={() => requestFullscreen().catch(() => {})}><Maximize2 size={14} /></button>
          </div>

          {/* Taker dropdown */}
          <div className="sf-takers">
            <button className="sf-btn" onClick={() => setTakerMenuOpen(!takerMenuOpen)}>
              <Factory size={13} /> Takers {takerCats.size ? `(${takerCats.size})` : ''} <ChevronDown size={13} />
            </button>
            {takerMenuOpen && (
              <div className="sf-menu">
                {CATEGORY_ORDER.filter(c => data.takers.some(t => t.categories.includes(c))).map(c => (
                  <div key={c} className={`sf-menuitem ${takerCats.has(c) ? 'on' : ''}`} onClick={() => toggle(takerCats, c, setTakerCats)}>
                    <i style={{ background: CATEGORY_COLORS[c] }} />
                    {labels[c]}
                    <span className="sf-muted">{data.takers.filter(t => t.categories.includes(c)).length}</span>
                  </div>
                ))}
                {data.takers.length === 0 && <div className="sf-menuitem">No takers matched yet</div>}
              </div>
            )}
          </div>

          {/* Layer toggles */}
          <div className="sf-layers">
            {([
              ['Heatmap', layerHeat, setLayerHeat],
              ['Quantity (t)', layerQty, setLayerQty],
              ['Producers', layerProducers, setLayerProducers],
              ['Flows', layerFlows, setLayerFlows],
            ] as const).map(([label, on, set]) => (
              <button key={label} className={`sf-btn ${on ? '' : 'off'}`} onClick={() => set(!on)}>
                {label} <span className="sf-tick">{on ? '✓' : ''}</span>
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="sf-legend">
            <div className="sf-legend-title"><Layers size={12} /> Residual materials</div>
            <div className="sf-legend-grid">
              {CATEGORY_ORDER.map(c => (
                <span key={c}><i style={{ background: CATEGORY_COLORS[c] }} />{labels[c]}</span>
              ))}
            </div>
            <div className="sf-legend-foot">
              <span><span className="sf-pin mini" style={{ ['--c' as any]: '#e11d48' }}><span /></span> Producer</span>
              <span><span className="sf-taker mini" style={{ background: '#64748b' }}>T</span> Taker</span>
              <span><span className="sf-qty mini">t</span> Tonnes/yr</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className={`sf-breakdown ${showBreakdown ? 'open' : ''}`}>
            <div className="sf-bhead" onClick={() => setShowBreakdown(!showBreakdown)}>
              <span><BarChart3 size={13} /> Residual Materials Breakdown</span>
              <span className="sf-link">{showBreakdown ? 'Hide' : 'Show'}</span>
            </div>
            {showBreakdown && (
              <div className="sf-bbody">
                <div className="sf-bcol">
                  <h5>By category</h5>
                  {breakdown.cats.map(([c, t]) => (
                    <div key={c} className="sf-bar">
                      <span className="sf-blabel">{labels[c]}</span>
                      <span className="sf-btrack"><span style={{ width: `${(t / maxCatT) * 100}%`, background: CATEGORY_COLORS[c] }} /></span>
                      <span className="sf-bval">{fmtT(t)} t</span>
                    </div>
                  ))}
                </div>
                <div className="sf-bcol">
                  <h5>Top materials</h5>
                  {breakdown.mats.map(([name, { t, cat }]) => (
                    <div key={name} className="sf-bar">
                      <span className="sf-blabel">{name}</span>
                      <span className="sf-btrack"><span style={{ width: `${(t / maxMatT) * 100}%`, background: CATEGORY_COLORS[cat] }} /></span>
                      <span className="sf-bval">{fmtT(t)} t</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sf-footer">
        <button className="sf-link" onClick={() => setShowList(!showList)}>
          <List size={13} /> {showList ? 'Hide' : 'Show'} list of producers for active filters
        </button>
        <button className="sf-link" onClick={exportCsv}><Download size={13} /> Export Data</button>
      </div>

      {showList && (
        <div className="sf-table">
          <table>
            <thead>
              <tr><th>Producer</th><th>Industry</th><th>Location</th><th>Residual materials</th><th style={{ textAlign: 'right' }}>t/yr</th></tr>
            </thead>
            <tbody>
              {[...filteredProducers].sort((a, b) => b.tonnes - a.tonnes).map(p => (
                <tr key={p.id} onClick={() => mapRef.current?.setView([p.lat, p.lng], 15)}>
                  <td><b>{p.name}</b></td>
                  <td>{p.industryType}</td>
                  <td>{p.address}</td>
                  <td>
                    {p.materials.map(m => (
                      <span key={m.id} className="sf-tag" style={{ borderColor: CATEGORY_COLORS[m.category], color: CATEGORY_COLORS[m.category] }}>{m.name}</span>
                    ))}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.tonnes.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const msgStyle: React.CSSProperties = { padding: 20, color: '#666', textAlign: 'center', fontFamily: 'sans-serif' };

const CSS = `
.sf-root{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;background:#fff;border-radius:12px;border:1px solid ${BORDER};overflow:hidden}
.sf-root button{font-family:inherit;cursor:pointer}
.sf-header{display:flex;justify-content:space-between;align-items:flex-end;padding:16px 18px 6px;gap:12px;flex-wrap:wrap}
.sf-header h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}
.sf-region{display:flex;align-items:center;gap:4px;font-size:11px;color:#64748b;margin-top:3px}
.sf-kpis{display:flex;gap:14px;font-size:13px;color:#334155}
.sf-kpis b{font-size:16px;color:#0f172a}
.sf-chipsrow{display:flex;justify-content:space-between;align-items:center;padding:4px 18px 10px;gap:10px;flex-wrap:wrap;min-height:28px}
.sf-chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sf-chip{display:inline-flex;align-items:center;gap:5px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600}
.sf-chip svg{cursor:pointer}
.sf-link{background:none;border:none;color:${ACCENT};font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;padding:0}
.sf-link:hover{text-decoration:underline}
.sf-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#334155;cursor:pointer;user-select:none}
.sf-switch.sm{display:flex;margin:6px 0;font-size:12px}
.sf-switch input{display:none}
.sf-track{width:30px;height:16px;border-radius:9px;background:#cbd5e1;position:relative;transition:.2s;flex:none}
.sf-track span{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.sf-switch input:checked + .sf-track{background:${ACCENT}}
.sf-switch input:checked + .sf-track span{left:16px}
.sf-body{display:grid;border-top:1px solid ${BORDER};transition:grid-template-columns .2s;height:600px}
.sf-filters{overflow-y:auto;padding:14px;border-right:1px solid ${BORDER};font-size:12px}
.sf-fhead{display:flex;justify-content:space-between;align-items:center;color:${ACCENT};font-weight:700;margin-bottom:10px}
.sf-search{display:flex;margin-bottom:8px}
.sf-search input{flex:1;min-width:0;border:1px solid ${BORDER};border-right:none;border-radius:6px 0 0 6px;padding:8px 10px;font-size:12px;outline:none}
.sf-search input:focus{border-color:${ACCENT}}
.sf-search button{background:${ACCENT};color:#fff;border:none;border-radius:0 6px 6px 0;padding:0 11px}
.sf-filters h4{font-size:13px;margin:16px 0 6px;color:#0f172a}
.sf-check{display:flex;align-items:center;gap:2px;margin:3px 0}
.sf-check label,.sf-check.sub,.sf-check.flat{display:flex;align-items:center;gap:6px;cursor:pointer;color:#1e293b}
.sf-check.sub{padding-left:34px;font-size:11.5px;color:#334155}
.sf-check.flat{padding-left:2px}
.sf-check input{accent-color:${NAVY};margin:0}
.sf-check i,.sf-menuitem i,.sf-legend i{width:9px;height:9px;border-radius:2px;display:inline-block;flex:none}
.sf-exp{background:none;border:none;color:#64748b;padding:0 2px;display:flex}
.sf-muted{color:#94a3b8;font-size:10.5px;margin-left:auto}
.sf-mapwrap{position:relative;min-width:0}
.sf-map{position:absolute;inset:0;background:#e5e7eb}
.sf-btn{display:inline-flex;align-items:center;gap:6px;background:${NAVY};color:#fff;border:none;border-radius:4px;padding:7px 11px;font-size:12px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.sf-btn.off{background:#fff;color:${NAVY}}
.sf-tick{display:inline-block;width:10px}
.sf-icon{background:#fff;border:1px solid ${BORDER};border-radius:4px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#334155;box-shadow:0 1px 4px rgba(0,0,0,.15)}
.sf-toolbar-left{position:absolute;left:54px;top:10px;z-index:500}
.sf-showfilters{position:absolute;left:94px;top:10px;z-index:500}
.sf-takers{position:absolute;left:50%;transform:translateX(-50%);top:10px;z-index:600}
.sf-menu{margin-top:4px;background:#fff;border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.18);min-width:220px;padding:4px 0}
.sf-menuitem{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:12px;color:#94a3b8;cursor:pointer;border-left:3px solid transparent}
.sf-menuitem.on{color:#0f172a;border-left-color:${ACCENT};background:#f0fdf4}
.sf-menuitem:hover{background:#f8fafc}
.sf-layers{position:absolute;right:10px;top:10px;z-index:500;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:60%}
.sf-legend{position:absolute;right:10px;bottom:22px;z-index:500;background:#fff;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18);padding:9px 11px;font-size:11px;width:250px}
.sf-legend-title{display:flex;align-items:center;gap:5px;font-weight:700;margin-bottom:6px;color:${NAVY}}
.sf-legend-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}
.sf-legend-grid span,.sf-legend-foot>span{display:flex;align-items:center;gap:5px;color:#334155}
.sf-legend-foot{display:flex;justify-content:space-between;border-top:1px solid ${BORDER};margin-top:7px;padding-top:6px}
.sf-breakdown{position:absolute;left:10px;bottom:52px;z-index:500;background:#fff;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18);width:min(560px,calc(100% - 290px));font-size:12px}
.sf-bhead{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;font-weight:600}
.sf-bhead>span:first-child{display:flex;align-items:center;gap:6px}
.sf-bbody{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:0 12px 12px;border-top:1px solid ${BORDER}}
.sf-bcol h5{margin:9px 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.sf-bar{display:grid;grid-template-columns:96px 1fr 46px;align-items:center;gap:6px;margin:4px 0;font-size:11px}
.sf-blabel{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#334155}
.sf-btrack{height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden}
.sf-btrack span{display:block;height:100%;border-radius:4px}
.sf-bval{text-align:right;font-weight:600;color:#0f172a}
.sf-footer{display:flex;justify-content:space-between;padding:10px 18px;border-top:1px solid ${BORDER};background:#f8fafc}
.sf-table{max-height:280px;overflow:auto;border-top:1px solid ${BORDER}}
.sf-table table{width:100%;border-collapse:collapse;font-size:12px}
.sf-table th{position:sticky;top:0;background:#f1f5f9;text-align:left;padding:7px 10px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.03em}
.sf-table td{padding:7px 10px;border-top:1px solid #f1f5f9;vertical-align:top}
.sf-table tbody tr{cursor:pointer}
.sf-table tbody tr:hover{background:#f0fdf4}
.sf-tag{display:inline-block;border:1px solid;border-radius:3px;padding:0 5px;margin:1px 3px 1px 0;font-size:10.5px}
.sf-qty{display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(56,152,236,.78);color:#fff;font-size:11px;font-weight:700;border:2px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(0,0,0,.25);transform:translate(0,0)}
.sf-qty.mini{width:14px;height:14px;font-size:8px;border-width:1px}
.sf-pin{position:relative;width:22px;height:30px}
.sf-pin::before{content:'';position:absolute;left:1px;top:0;width:20px;height:20px;background:var(--c);border-radius:50% 50% 50% 0;transform:rotate(-45deg);transform-origin:center;top:1px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box}
.sf-pin span{position:absolute;left:8px;top:7px;width:6px;height:6px;border-radius:50%;background:#fff}
.sf-pin.mini{display:inline-block;transform:scale(.5);transform-origin:left center;width:11px;height:15px}
.sf-taker{width:20px;height:20px;border-radius:4px;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box}
.sf-taker.mini{width:14px;height:14px;font-size:8px;border-width:1px;display:inline-flex}
.sf-pop{font-size:12px;min-width:200px}
.sf-pop .sf-sub{color:#64748b;font-size:11px;margin:2px 0 6px}
.sf-pop table{width:100%;border-collapse:collapse}
.sf-pop td{padding:2px 0}
.sf-pop td:last-child{text-align:right;font-weight:600;white-space:nowrap;padding-left:8px}
.sf-pop i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}
.sf-pop em{color:#f59e0b;font-size:10px;font-style:normal}
.sf-pop .sf-tot{border-top:1px solid ${BORDER};margin-top:6px;padding-top:5px}
.leaflet-container{font-family:inherit}
`;
