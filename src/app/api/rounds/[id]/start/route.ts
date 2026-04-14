import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runRound, sha256 } from "@/lib/engine";
import { RoundRepository } from "@/lib/storage";
import { PAYOUT_TABLE } from "@/lib/constants";

const startSchema = z.object({
  clientSeed: z.string().min(1),
  betCents: z.number().int().min(1).max(100000),
  dropColumn: z.number().int().min(0).max(12),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validatedData = startSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid input", details: validatedData.error.format() }, { status: 400 });
    }

    const { clientSeed, betCents, dropColumn } = validatedData.data;

    const round = await RoundRepository.getById(id);
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
    if (round.status !== "CREATED") return NextResponse.json({ error: "Round already started" }, { status: 400 });

    const result = runRound(round.serverSeed!, clientSeed, round.nonce, dropColumn);
    const combinedSeed = sha256(`${round.serverSeed}:${clientSeed}:${round.nonce}`);
    const payoutMultiplier = PAYOUT_TABLE[result.binIndex];

    const updatedRound = await RoundRepository.update(id, {
      status: "STARTED",
      clientSeed,
      betCents,
      dropColumn,
      combinedSeed,
      pegMapHash: result.pegMapHash,
      binIndex: result.binIndex,
      payoutMultiplier,
      pathJson: JSON.stringify(result.path),
    });

    return NextResponse.json({
      roundId: updatedRound?.id,
      pegMapHash: result.pegMapHash,
      rows: 12,
      binIndex: result.binIndex,
      path: result.path,
      payoutMultiplier,
      pegMap: result.pegMap,
    });
  } catch (error: any) {
    console.error("[START_ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
