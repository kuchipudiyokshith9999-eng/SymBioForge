import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const matches = engine.getMatches();
  return NextResponse.json({ matches });
}
