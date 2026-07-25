import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const state = engine.getState();
  return NextResponse.json(state);
}
