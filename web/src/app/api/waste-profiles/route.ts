import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const profiles = engine.getWasteProfiles();
  return NextResponse.json({ profiles });
}
