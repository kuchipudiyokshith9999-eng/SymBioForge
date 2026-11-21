import { NextResponse } from 'next/server';
import { getSyncedEngine } from '@/lib/server/synced-engine';
import { guardRoute } from '@/lib/server/auth';
import { buildSymbiosisAnalysis } from '@/lib/symbiosis-analysis';

// Live cluster data + per-request auth: never prerender at build time
export const dynamic = 'force-dynamic';

export async function GET() {
  await guardRoute();
  const engine = await getSyncedEngine();
  return NextResponse.json(buildSymbiosisAnalysis(engine.getState()));
}
