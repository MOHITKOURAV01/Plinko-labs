import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { runRound } from '@/lib/engine';
import { PAYOUT_TABLE } from '@/lib/constants';

const startSchema = z.object({
  clientSeed: z.string().min(1),
  betCents: z.number().int().min(1).max(100000),
  dropColumn: z.number().int().min(0).max(12),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validatedData = startSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json({ error: 'Invalid input', details: validatedData.error.format() }, { status: 400 });
    }

    const { clientSeed, betCents, dropColumn } = validatedData.data;

    const round = await db.round.findUnique({
      where: { id },
    });

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    if (round.status !== 'CREATED') {
      return NextResponse.json({ error: 'Round already started or revealed' }, { status: 400 });
    }

    // Run engine
    const engineResults = runRound(round.serverSeed!, clientSeed, round.nonce, dropColumn);

    // Look up payout
    const payoutMultiplier = PAYOUT_TABLE[engineResults.binIndex];

    // Update Round
    const updatedRound = await db.round.update({
      where: { id },
      data: {
        status: 'STARTED',
        clientSeed,
        betCents,
        dropColumn,
        combinedSeed: engineResults.combinedSeed,
        pegMapHash: engineResults.pegMapHash,
        binIndex: engineResults.binIndex,
        payoutMultiplier,
        pathJson: JSON.stringify(engineResults.path),
      },
    });

    return NextResponse.json({
      roundId: updatedRound.id,
      pegMapHash: engineResults.pegMapHash,
      rows: 12,
      binIndex: engineResults.binIndex,
      path: engineResults.path,
      payoutMultiplier,
      pegMap: engineResults.pegMap, // Return full pegMap as requested
    });

  } catch (error) {
    console.error('[START_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
