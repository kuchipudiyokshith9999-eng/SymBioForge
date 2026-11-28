import { NextResponse } from 'next/server';
import { guardRoute } from '@/lib/server/auth';
import { buildProspectDataset, type ProspectDataset } from '@/lib/prospects';
import raw from '@/data/prospects-osm.json';

// Per-request auth like the other data routes; the dataset itself is static and memoised
export const dynamic = 'force-dynamic';

let cached: ProspectDataset | null = null;

export async function GET() {
  await guardRoute();
  cached ??= buildProspectDataset(raw as unknown as Parameters<typeof buildProspectDataset>[0]);
  return NextResponse.json(cached);
}
