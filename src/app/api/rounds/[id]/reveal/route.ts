import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const round = await db.round.findUnique({
      where: { id },
    });

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    if (round.status === 'CREATED') {
      return NextResponse.json({ error: 'Round has not been started yet' }, { status: 400 });
    }

    const updatedRound = await db.round.update({
      where: { id },
      data: {
        status: 'REVEALED',
        revealedAt: new Date(),
      },
    });

    return NextResponse.json({
      serverSeed: updatedRound.serverSeed,
      combinedSeed: updatedRound.combinedSeed,
      commitHex: updatedRound.commitHex,
    });

  } catch (error) {
    console.error('[REVEAL_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
