import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const products = engine.getProducts();
  return NextResponse.json({ products });
}
