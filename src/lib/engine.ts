import crypto from 'crypto';

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
export function runRound(serverSeed: string, clientSeed: string, nonce: string, dropColumn: number) {
  const { commitHex } = generateCommit(serverSeed, nonce);
  const combinedSeed = generateCombinedSeed(serverSeed, clientSeed, nonce);
  
  // Seed from first 4 bytes of combinedSeed hex (big-endian uint32)
  const seedInt = parseInt(combinedSeed.substring(0, 8), 16) >>> 0;
  const prng = new Xorshift32(seedInt);

  const pegMap = generatePegMap(prng);
  const pegMapHash = sha256(JSON.stringify(pegMap));
  
  const { path, binIndex } = resolvePath(prng, pegMap, dropColumn);

  return {
    commitHex,
    combinedSeed,
    pegMapHash,
    pegMap,
    path,
    binIndex
  };
}

// Self-test block
if (require.main === module) {
  console.log('--- PLINKO ENGINE SELF-TEST ---');
  
  const serverSeed = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
  const nonce = "42";
  const clientSeed = "candidate-hello";
  const dropColumn = 6;

  const results = runRound(serverSeed, clientSeed, nonce, dropColumn);
  
  const tests = [
    { name: 'commitHex', actual: results.commitHex, expected: 'bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34' },
    { name: 'combinedSeed', actual: results.combinedSeed, expected: 'e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0' },
    { name: 'binIndex', actual: results.binIndex, expected: 6 },
    { name: 'Row 0 peg', actual: results.pegMap[0][0], expected: 0.422123 },
    { name: 'Row 1 pegs', actual: JSON.stringify(results.pegMap[1]), expected: JSON.stringify([0.552503, 0.408786]) },
    { name: 'Row 2 pegs', actual: JSON.stringify(results.pegMap[2]), expected: JSON.stringify([0.491574, 0.468780, 0.436540]) }
  ];

  let allPassed = true;
  tests.forEach(test => {
    const passed = test.actual === test.expected;
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'}: ${test.name} (Actual: ${test.actual}, Expected: ${test.expected})`);
    if (!passed) allPassed = false;
  });

  // PRNG verify (first 5)
  const seedInt = parseInt(results.combinedSeed.substring(0, 8), 16) >>> 0;
  const testPrng = new Xorshift32(seedInt);
  const expectedPrng = [0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297];
  expectedPrng.forEach((expected, i) => {
    const actual = Number(testPrng.rand().toFixed(10));
    const passed = Math.abs(actual - expected) < 0.0000000001;
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'}: PRNG value ${i} (Actual: ${actual}, Expected: ${expected})`);
    if (!passed) allPassed = false;
  });

  console.log('\nFinal Result:', allPassed ? '🚀 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED');
  process.exit(allPassed ? 0 : 1);
}
