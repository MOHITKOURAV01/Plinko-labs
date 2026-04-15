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
  risk: string;
  dropColumn: number;
  binIndex: number;
  payoutMultiplier: number;
  betCents: number;
  pathJson: any; // used for JSON.parse
  revealedAt: Date | null;
}

const ensureFileAndRead = (): Round[] => {
  try {
    if (!fs.existsSync(STORAGE_PATH)) {
      fs.writeFileSync(STORAGE_PATH, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(STORAGE_PATH, 'utf-8');
    if (!data || data.trim() === '') {
       fs.writeFileSync(STORAGE_PATH, JSON.stringify([]));
       return [];
    }
    return JSON.parse(data) as Round[];
  } catch (e) {
    console.error('[STORAGE_ERROR] Corrupted JSON, resetting...', e);
    fs.writeFileSync(STORAGE_PATH, JSON.stringify([]));
    return [];
  }
};

const writeStorage = (rounds: Round[]) => {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(rounds, null, 2));
  } catch (e) {
    console.error('[STORAGE_WRITE_ERROR]', e);
  }
};

export const RoundRepository = {
  async getAll(limit = 10): Promise<Round[]> {
    const rounds = ensureFileAndRead();
    return rounds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  },

  async getById(id: string): Promise<Round | null> {
    const rounds = ensureFileAndRead();
    return rounds.find(r => r.id === id) || null;
  },

  async create(data: Partial<Round>): Promise<Round> {
    const rounds = ensureFileAndRead();
    
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
      risk: 'MEDIUM',
      dropColumn: 6,
      binIndex: 0,
      payoutMultiplier: 1.0,
      betCents: 100,
      pathJson: [],
      revealedAt: null,
      ...data,
    };

    rounds.push(newRound);
    writeStorage(rounds);
    return newRound;
  },

  async update(id: string, data: Partial<Round>): Promise<Round | null> {
    const rounds = ensureFileAndRead();
    const idx = rounds.findIndex(r => r.id === id);
    if (idx === -1) return null;

    rounds[idx] = { ...rounds[idx], ...data };
    writeStorage(rounds);
    return rounds[idx];
  }
};
