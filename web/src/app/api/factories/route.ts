import { NextRequest, NextResponse } from 'next/server';
import { getSyncedEngine, persistFactory } from '@/lib/server/synced-engine';

export async function GET() {
  const engine = await getSyncedEngine();
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

    const engine = await getSyncedEngine();
    const factory = engine.registerFactory({
      name,
      industryType,
      location,
      productionCapacity,
      rawMaterials,
      declaredWastes,
    });
    await persistFactory(factory);

    return NextResponse.json({ factory }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
