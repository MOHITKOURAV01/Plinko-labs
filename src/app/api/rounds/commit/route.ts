import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { sha256 } from '@/lib/engine';

export async function POST() {
  try {
    // Generate random 64-char hex serverSeed (32 bytes)
    const serverSeed = crypto.randomBytes(32).toString('hex');

    // Generate random 4-digit nonce
    const nonce = crypto.randomInt(1000, 9999).toString();

    // Compute commitHex
    const commitHex = sha256(`${serverSeed}:${nonce}`);

    // Save Round with status=CREATED
    const round = await db.round.create({
      data: {
        serverSeed,
        nonce,
        commitHex,
        status: 'CREATED',
        clientSeed: '',
        combinedSeed: '',
        pegMapHash: '',
        rows: 12,
        dropColumn: 0,
        binIndex: 0,
        payoutMultiplier: 1.0,
        betCents: 100,
        pathJson: JSON.stringify([]),
      },
    });

    return NextResponse.json({
      roundId: round.id,
      commitHex: round.commitHex,
      nonce: round.nonce,
    }, { status: 201 });

  } catch (error) {
    console.error('[COMMIT_ERROR]', error);
    return NextResponse.json({ error: 'Failed to create round commitment' }, { status: 500 });
  }
}
