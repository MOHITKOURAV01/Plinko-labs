import { NextRequest, NextResponse } from 'next/server';
import { RoundRepository } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitStr = searchParams.get('limit') || '20';
    let limit = parseInt(limitStr, 10);

    if (isNaN(limit)) limit = 20;
    if (limit > 100) limit = 100;

    const rounds = await RoundRepository.getAll(limit);

    // Sanitize: Omit serverSeed unless REVEALED
    const result = rounds.map(round => ({
      ...round,
      serverSeed: round.status === 'REVEALED' ? round.serverSeed : null,
    }));

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[GET_ROUNDS_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
