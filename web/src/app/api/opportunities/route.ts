import { NextResponse } from 'next/server';
import { getSyncedEngine } from '@/lib/server/synced-engine';

export async function GET() {
  const engine = await getSyncedEngine();
  const opportunities = engine.getOpportunityFeed();
  return NextResponse.json({ opportunities });
}
