import { NextRequest, NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const blueprint = engine.getBlueprintByOpportunityId(id);

  if (!blueprint) {
    return NextResponse.json(
      { error: `No blueprint found for opportunity ID: ${id}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ blueprint });
}
