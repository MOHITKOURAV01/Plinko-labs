import { NextRequest, NextResponse } from 'next/server';
import { runRound, generateCommit } from '@/lib/engine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serverSeed = searchParams.get('serverSeed');
    const clientSeed = searchParams.get('clientSeed');
    const nonce = searchParams.get('nonce');
    const dropColumnStr = searchParams.get('dropColumn');

    if (!serverSeed || !clientSeed || !nonce || !dropColumnStr) {
      return NextResponse.json({ error: 'Missing required query parameters' }, { status: 400 });
    }

    const dropColumn = parseInt(dropColumnStr, 10);
    if (isNaN(dropColumn)) {
      return NextResponse.json({ error: 'Invalid dropColumn' }, { status: 400 });
    }

    // Deterministic re-run
    const results = runRound(serverSeed, clientSeed, nonce, dropColumn);
    const { commitHex: expectedCommit } = generateCommit(serverSeed, nonce);

    return NextResponse.json({
      commitHex: results.commitHex,
      combinedSeed: results.combinedSeed,
      pegMapHash: results.pegMapHash,
      binIndex: results.binIndex,
      path: results.path,
      valid: results.commitHex === expectedCommit,
    });

  } catch (error) {
    console.error('[VERIFY_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
