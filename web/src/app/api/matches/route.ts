import { NextResponse } from 'next/server';
import { getSyncedEngine } from '@/lib/server/synced-engine';

export async function GET() {
  const engine = await getSyncedEngine();
  const matches = engine.getMatches();
  return NextResponse.json({ matches });
}
