import * as crypto from 'crypto';

/**
 * Generates a random 64-char hex server seed
 */
export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * SHA256 helper using Node.js crypto
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Xorshift32 PRNG implementation
 */
export class Xorshift32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  rand(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 4294967296;
  }
}

/**
 * Generates commit hex for a server seed and nonce
 */
export function generateCommit(serverSeed: string, nonce: string) {
  return { commitHex: sha256(`${serverSeed}:${nonce}`) };
}

/**
 * Generates combined seed from server seed, client seed, and nonce
 */
export function generateCombinedSeed(serverSeed: string, clientSeed: string, nonce: string): string {
  return sha256(`${serverSeed}:${clientSeed}:${nonce}`);
}

/**
 * Generates a deterministic map of pegs with randomized biases
 */
export function generatePegMap(prng: Xorshift32, rows: number = 12): number[][] {
  const pegMap: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let i = 0; i < r + 1; i++) {
      // leftBias = 0.5 + (rand() - 0.5) * 0.2, rounded to 6 decimal places
      const bias = 0.5 + (prng.rand() - 0.5) * 0.2;
      row.push(Number(bias.toFixed(6)));
    }
    pegMap.push(row);
  }
  return pegMap;
}

/**
 * Resolves the path of the ball through the peg map
 */
export function resolvePath(
  prng: Xorshift32,
  pegMap: number[][],
  dropColumn: number,
  rows: number = 12
): { path: ('L' | 'R')[], binIndex: number } {
  let pos = 0;
  const path: ('L' | 'R')[] = [];
  const center = Math.floor(rows / 2);
  const adj = (dropColumn - center) * 0.01;

  for (let r = 0; r < rows; r++) {
    const leftBias = pegMap[r][pos];
    const biasPrime = Math.min(Math.max(leftBias + adj, 0), 1);
    
    if (prng.rand() < biasPrime) {
      path.push('L');
    } else {
      path.push('R');
      pos++;
    }
  }

  return { path, binIndex: pos };
}

/**
 * Orchestrates a full Plinko round
 */
export function runRound(serverSeed: string, clientSeed: string, nonce: string, dropColumn: number, rows: number = 12, risk: string = 'MEDIUM') {
  const { commitHex } = generateCommit(serverSeed, nonce);
  const combinedSeed = generateCombinedSeed(serverSeed, clientSeed, nonce);
  
  // Seed from first 4 bytes of combinedSeed hex (big-endian uint32)
  const seedInt = parseInt(combinedSeed.substring(0, 8), 16) >>> 0;
  const prng = new Xorshift32(seedInt);

  const pegMap = generatePegMap(prng, rows);
  const pegMapHash = sha256(JSON.stringify(pegMap));
  
  const { path, binIndex } = resolvePath(prng, pegMap, dropColumn, rows);

  return {
    commitHex,
    combinedSeed,
    pegMapHash,
    pegMap,
    path,
    binIndex,
    rows,
    risk
  };
}

// Self-test block removed for ESM/Next.js compatibility. 
// If you need to test the engine, use a dedicated script or test runner.

// DX: Laboratory metadata annotation

// Laboratory-grade metadata tracking for provable fairness audit trails.
