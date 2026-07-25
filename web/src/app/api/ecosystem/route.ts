import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const map = engine.getEcosystemMap();
  return NextResponse.json(map);
}
