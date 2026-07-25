import { NextRequest, NextResponse } from 'next/server';
import { getSyncedEngine } from '@/lib/server/synced-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const engine = await getSyncedEngine();

    if (!action || !['start', 'stop', 'reset'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: start, stop, reset' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'start':
        engine.setSwarmActive(true);
        return NextResponse.json({ status: 'started', swarmActive: true });
      case 'stop':
        engine.setSwarmActive(false);
        return NextResponse.json({ status: 'stopped', swarmActive: false });
      case 'reset':
        engine.resetState();
        return NextResponse.json({ status: 'reset', swarmActive: false });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
