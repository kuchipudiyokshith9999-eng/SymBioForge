import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), '..', 'src', 'data');

function loadJson<T>(filename: string): T {
  const filePath = path.join(dataDir, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export interface RawFactory {
  id: string;
  name: string;
  industryType: string;
  location: { lat: number; lng: number; address: string };
  productionCapacity: string;
  rawMaterials: string[];
  declaredWastes: string[];
  complianceStatus: 'filed' | 'pending' | 'overdue';
  lastFiledDate?: string;
  savingsEarned: number;
  co2Avoided: number;
}

export interface CompatibilityRule {
  sourceCategory: string;
  sourceForm: string;
  targetIndustry: string;
  targetInput: string;
  compatibilityScore: number;
  notes: string;
}

export interface MaterialInfo {
  category: string;
  physicalForm: string;
  volumeEstimate: number;
  contamination: string;
  seasonalVariation: string;
  reusePotential: number;
}

export interface MarketProduct {
  name: string;
  description: string;
  wasteStreams: string[];
  manufacturingProcess: string;
  productionCostPerUnit: number;
  marketPricePerUnit: number;
  targetMarket: string;
  unit: string;
}

export interface ManufacturingProcess {
  name: string;
  description: string;
  requiredEquipment: { name: string; spec: string; costInr: number }[];
  facilityRequirements: {
    spaceSqFt: number;
    powerKw: number;
    waterLpd: number;
    ventilation: string;
  };
  capexInr: number;
  timelineWeeks: number;
  regulatoryNotes: string[];
}

export interface EmissionFactors {
  landfillMethane: number;
  virginMaterialExtraction: Record<string, number>;
  transportEmissionsPerKmTon: number;
  waterSavedPerKg: Record<string, number>;
  energySavedKwhPerKg: Record<string, number>;
}

// Lazy-loaded cached data
let _factoriesInitial: RawFactory[] | null = null;
let _factoryFeed: RawFactory[] | null = null;
let _compatibilityRules: CompatibilityRule[] | null = null;
let _materialsDb: Record<string, MaterialInfo> | null = null;
let _marketProducts: MarketProduct[] | null = null;
let _manufacturingProcesses: ManufacturingProcess[] | null = null;
let _emissionFactors: EmissionFactors | null = null;

export function getFactoriesInitial(): RawFactory[] {
  if (!_factoriesInitial) {
    _factoriesInitial = loadJson<RawFactory[]>('factories-initial.json');
  }
  return _factoriesInitial;
}

export function getFactoryFeed(): RawFactory[] {
  if (!_factoryFeed) {
    _factoryFeed = loadJson<RawFactory[]>('factory-feed.json');
  }
  return _factoryFeed;
}

export function getCompatibilityRules(): CompatibilityRule[] {
  if (!_compatibilityRules) {
    const data = loadJson<{ rules: CompatibilityRule[] }>('compatibility-matrix.json');
    _compatibilityRules = data.rules;
  }
  return _compatibilityRules;
}

export function getMaterialsDb(): Record<string, MaterialInfo> {
  if (!_materialsDb) {
    _materialsDb = loadJson<Record<string, MaterialInfo>>('materials-db.json');
  }
  return _materialsDb;
}

export function getMarketProducts(): MarketProduct[] {
  if (!_marketProducts) {
    const data = loadJson<{ products: MarketProduct[] }>('market-data.json');
    _marketProducts = data.products;
  }
  return _marketProducts;
}

export function getManufacturingProcesses(): ManufacturingProcess[] {
  if (!_manufacturingProcesses) {
    const data = loadJson<{ processes: ManufacturingProcess[] }>('manufacturing-processes.json');
    _manufacturingProcesses = data.processes;
  }
  return _manufacturingProcesses;
}

export function getEmissionFactors(): EmissionFactors {
  if (!_emissionFactors) {
    const data = loadJson<{ emissionFactors: EmissionFactors }>('emission-factors.json');
    _emissionFactors = data.emissionFactors;
  }
  return _emissionFactors;
}
