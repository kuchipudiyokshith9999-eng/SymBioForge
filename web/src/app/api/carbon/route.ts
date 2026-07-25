import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const metrics = engine.getCarbonMetrics();
  return NextResponse.json(metrics);
}
