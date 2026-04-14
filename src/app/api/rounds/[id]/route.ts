import { NextRequest, NextResponse } from 'next/server';
import { RoundRepository } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const round = await RoundRepository.getById(id);

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    // Sanitize: Omit serverSeed unless REVEALED
    const result = {
      ...round,
      serverSeed: round.status === 'REVEALED' ? round.serverSeed : null,
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[GET_ROUND_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
