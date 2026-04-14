import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateServerSeed, sha256 } from "@/lib/engine";
import { RoundRepository } from "@/lib/storage";

export async function POST() {
  try {
    const serverSeed = generateServerSeed();
    const nonce = uuidv4().slice(0, 8);
    const commitHex = sha256(serverSeed + ":" + nonce);

    const round = await RoundRepository.create({
      status: "CREATED",
      nonce,
      commitHex,
      serverSeed, // Stored safely for later reveal
    });

    return NextResponse.json({
      roundId: round.id,
      commitHex: round.commitHex,
      nonce: round.nonce,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[COMMIT_ERROR]', error);
    return NextResponse.json({ error: 'Failed to create round commitment' }, { status: 500 });
  }
}
