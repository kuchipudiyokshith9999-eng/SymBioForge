import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const opportunities = engine.getOpportunityFeed();
  return NextResponse.json({ opportunities });
}
