import { NextResponse } from "next/server";
import { RoundRepository } from "@/lib/storage";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const round = await RoundRepository.getById(id);

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    if (round.status !== "STARTED") {
      return NextResponse.json({ error: "Round not in revealable state" }, { status: 400 });
    }

    const updatedRound = await RoundRepository.update(id, {
      status: "REVEALED",
      revealedAt: new Date(),
    });

    return NextResponse.json({
      serverSeed: round.serverSeed,
      payoutMultiplier: round.payoutMultiplier,
      resultAmount: (round.betCents * round.payoutMultiplier) / 100,
    });
  } catch (error: any) {
    console.error("[REVEAL_ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
