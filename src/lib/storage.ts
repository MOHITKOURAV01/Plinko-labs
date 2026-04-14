import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_PATH = path.join(process.cwd(), 'rounds.json');

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
  dropColumn: number;
  binIndex: number;
  payoutMultiplier: number;
  betCents: number;
  pathJson: any; // stringified JSON
  revealedAt: Date | null;
}

const ensureFile = () => {
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify([]));
  }
};

export const RoundRepository = {
  async getAll(limit = 10): Promise<Round[]> {
    ensureFile();
    const data = fs.readFileSync(STORAGE_PATH, 'utf-8');
    const rounds = JSON.parse(data) as Round[];
    return rounds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  },

  async getById(id: string): Promise<Round | null> {
    ensureFile();
    const data = fs.readFileSync(STORAGE_PATH, 'utf-8');
    const rounds = JSON.parse(data) as Round[];
    return rounds.find(r => r.id === id) || null;
  },

  async create(data: Partial<Round>): Promise<Round> {
    ensureFile();
    const roundsData = fs.readFileSync(STORAGE_PATH, 'utf-8');
    const rounds = JSON.parse(roundsData) as Round[];
    
    const newRound: Round = {
      id: uuidv4(),
      createdAt: new Date(),
      status: 'CREATED',
      nonce: '',
      commitHex: '',
      serverSeed: null,
      clientSeed: '',
      combinedSeed: '',
      pegMapHash: '',
      rows: 12,
      dropColumn: 6,
      binIndex: 0,
      payoutMultiplier: 1.0,
      betCents: 100,
      pathJson: [],
      revealedAt: null,
      ...data,
    };

    rounds.push(newRound);
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(rounds, null, 2));
    return newRound;
  },

  async update(id: string, data: Partial<Round>): Promise<Round | null> {
    ensureFile();
    const roundsData = fs.readFileSync(STORAGE_PATH, 'utf-8');
    const rounds = JSON.parse(roundsData) as Round[];
    const idx = rounds.findIndex(r => r.id === id);
    if (idx === -1) return null;

    rounds[idx] = { ...rounds[idx], ...data };
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(rounds, null, 2));
    return rounds[idx];
  }
};
