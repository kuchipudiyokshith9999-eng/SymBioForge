import { ToolDecorator as Tool, Widget, Injectable, ExecutionContext, z } from '@nitrostack/core';
import { stateManager } from './bootstrap.js';
import { WasteStream } from '../core/types.js';

// Human-friendly material groups for the geographic analysis view.
const CATEGORY_LABELS: Record<WasteStream['category'], string> = {
  polymeric: 'Plastics',
  metallic: 'Metals',
  organic: 'Organics',
  cellulosic: 'Paper and Cardboard',
  textile: 'Textiles',
  chemical: 'Chemicals & Effluents',
};

// kg/day (or L/day) → tonnes/year
const toTonnesPerYear = (volumePerDay: number) => Math.round((volumePerDay * 365) / 1000 * 10) / 10;

@Injectable()
export class SymbiosisAnalysisTools {
  @Tool({
    name: 'get-symbiosis-analysis',
    description:
      'Geographic industrial symbiosis data analysis: every producer of residual materials on a map with ' +
      'tonnage, material type, heatmap and the takers (factories that can absorb each material). ' +
      'Supports filtering by material category in the widget.',
    inputSchema: z.object({
      category: z
        .enum(['polymeric', 'metallic', 'organic', 'cellulosic', 'textile', 'chemical'])
        .optional()
        .describe('Optional material category to pre-select in the filter'),
    }),
  })
  @Widget({
    route: 'symbiosis-analysis',
    csp: {
      // Map tiles (Esri light-gray canvas basemap)
      resourceDomains: ['https://server.arcgisonline.com'],
    },
  })
  public async getSymbiosisAnalysis(args: { category?: WasteStream['category'] }, ctx: ExecutionContext) {
    ctx.logger.info('[SymbioForge] Building geographic symbiosis analysis');
    const state = stateManager.getState();

    const streamById = new Map<string, WasteStream>();
    for (const f of state.factories) for (const ws of f.wasteStreams ?? []) streamById.set(ws.id, ws);

    const producers = state.factories
      .filter(f => (f.wasteStreams ?? []).length > 0)
      .map(f => {
        const declared = new Set(f.declaredWastes.map(w => w.toLowerCase().trim()));
        const materials = (f.wasteStreams ?? []).map(ws => ({
          id: ws.id,
          name: ws.name,
          category: ws.category,
          categoryLabel: CATEGORY_LABELS[ws.category],
          physicalForm: ws.physicalForm,
          contamination: ws.contamination,
          reusePotential: ws.reusePotential,
          tonnesPerYear: toTonnesPerYear(ws.volume),
          // Declared by the factory = high confidence; inferred by Profiler from industry type = low confidence
          confidence: !ws.id.endsWith('_inferred') && declared.has(ws.name.toLowerCase().trim()) ? 'high' : 'low',
        }));
        return {
          id: f.id,
          name: f.name,
          industryType: f.industryType,
          address: f.location.address,
          lat: f.location.lat,
          lng: f.location.lng,
          complianceStatus: f.complianceStatus,
          materials,
        };
      });

    // Takers = factories that absorb a residual material through a symbiotic match
    const takerMap = new Map<string, { id: string; name: string; industryType: string; lat: number; lng: number; categories: Set<string>; inboundTonnes: number }>();
    for (const m of state.matches) {
      const target = state.factories.find(f => f.id === m.targetFactoryId);
      const stream = streamById.get(m.wasteStreamId);
      if (!target || !stream) continue;
      let t = takerMap.get(target.id);
      if (!t) {
        t = { id: target.id, name: target.name, industryType: target.industryType, lat: target.location.lat, lng: target.location.lng, categories: new Set(), inboundTonnes: 0 };
        takerMap.set(target.id, t);
      }
      t.categories.add(stream.category);
      t.inboundTonnes += m.volumeTonsPerYear;
    }
    const takers = [...takerMap.values()].map(t => ({ ...t, categories: [...t.categories], inboundTonnes: Math.round(t.inboundTonnes) }));

    const flows = state.matches.map(m => ({
      id: m.id,
      source: m.sourceFactoryId,
      target: m.targetFactoryId,
      material: m.wasteStreamName,
      category: streamById.get(m.wasteStreamId)?.category,
      tonnesPerYear: m.volumeTonsPerYear,
      distanceKm: m.distanceKm,
      compatibilityScore: m.compatibilityScore,
      status: m.status,
    }));

    return {
      success: true,
      region: 'Coimbatore Industrial Cluster',
      initialCategory: args?.category ?? null,
      categoryLabels: CATEGORY_LABELS,
      producers,
      takers,
      flows,
      widgetUri: 'ui://symbiosis-analysis',
    };
  }
}
