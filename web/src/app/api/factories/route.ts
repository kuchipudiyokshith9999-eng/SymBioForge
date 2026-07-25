import { NextRequest, NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const factories = engine.getFactories();
  return NextResponse.json({ factories });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, industryType, location, productionCapacity, rawMaterials, declaredWastes } = body;

    if (!name || !industryType || !location || !productionCapacity || !rawMaterials || !declaredWastes) {
      return NextResponse.json(
        { error: 'Missing required fields: name, industryType, location, productionCapacity, rawMaterials, declaredWastes' },
        { status: 400 }
      );
    }

    const factory = engine.registerFactory({
      name,
      industryType,
      location,
      productionCapacity,
      rawMaterials,
      declaredWastes,
    });

    return NextResponse.json({ factory }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
