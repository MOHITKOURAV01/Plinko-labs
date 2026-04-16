import { prisma } from './prisma';

export interface Round {
  id: string;
  createdAt: Date;
  status: string; // CREATED | STARTED | REVEALED
  nonce: string;
  commitHex: string;
  serverSeed: string | null;
  clientSeed: string;
  combinedSeed: string;
  pegMapHash: string;
  rows: number;
  risk: string;
  dropColumn: number;
  binIndex: number;
  payoutMultiplier: number;
  betCents: number;
  pathJson: any; // used for JSON.parse
  revealedAt: Date | null;
}

export const RoundRepository = {
  async getAll(limit = 10): Promise<Round[]> {
    const rounds = await prisma.round.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rounds as any as Round[];
  },

  async getById(id: string): Promise<Round | null> {
    const round = await prisma.round.findUnique({
      where: { id },
    });
    return (round as any as Round) || null;
  },

  async create(data: Partial<Round>): Promise<Round> {
    const round = await prisma.round.create({
      data: {
        status: data.status || 'CREATED',
        nonce: data.nonce || '',
        commitHex: data.commitHex || '',
        serverSeed: data.serverSeed || null,
        clientSeed: data.clientSeed || '',
        combinedSeed: data.combinedSeed || '',
        pegMapHash: data.pegMapHash || '',
        rows: data.rows || 12,
        risk: data.risk || 'MEDIUM',
        dropColumn: data.dropColumn || 6,
        binIndex: data.binIndex || 0,
        payoutMultiplier: data.payoutMultiplier || 1.0,
        betCents: data.betCents || 100,
        pathJson: data.pathJson ? JSON.stringify(data.pathJson) : '[]',
        revealedAt: data.revealedAt || null,
      },
    });
    return round as any as Round;
  },

  async update(id: string, data: Partial<Round>): Promise<Round | null> {
    const updateData: any = { ...data };
    
    // Ensure pathJson is stringified if it's being updated
    if (data.pathJson !== undefined) {
      updateData.pathJson = JSON.stringify(data.pathJson);
    }

    const round = await prisma.round.update({
      where: { id },
      data: updateData,
    });
    return round as any as Round;
  }
};
