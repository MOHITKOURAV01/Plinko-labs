import { sha256, Xorshift32, runRound, generateCombinedSeed, generateCommit } from '../src/lib/engine';

describe('SHA256 / commit-reveal', () => {
  it('should equal the known SHA256 of "hello"', () => {
    expect(sha256("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it('should generate correct commitHex for reference inputs', () => {
    const serverSeed = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
    const nonce = "42";
    const { commitHex } = generateCommit(serverSeed, nonce);
    expect(commitHex).toBe("bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34");
  });
});

describe('combinedSeed', () => {
  it('should match the expected combinedSeed for reference inputs', () => {
    const serverSeed = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
    const nonce = "42";
    const clientSeed = "candidate-hello";
    const combinedSeed = generateCombinedSeed(serverSeed, clientSeed, nonce);
    expect(combinedSeed).toBe("e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0");
  });
});

describe('xorshift32 PRNG', () => {
  it('should generate exactly the first 5 reference values', () => {
    const combinedSeed = "e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0";
    const seedInt = parseInt(combinedSeed.substring(0, 8), 16) >>> 0;
    const prng = new Xorshift32(seedInt);
    
    const expected = [0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297];
    expected.forEach((val) => {
      expect(prng.rand()).toBeCloseTo(val, 8);
    });
  });
});

describe('pegMap generation', () => {
  const serverSeed = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
  const nonce = "42";
  const clientSeed = "candidate-hello";
  const dropColumn = 6;

  it('should match reference values for first 3 rows', () => {
    const results = runRound(serverSeed, clientSeed, nonce, dropColumn);
    
    // Tolerance check for float values
    expect(results.pegMap[0][0]).toBeCloseTo(0.422123, 6);
    
    expect(results.pegMap[1][0]).toBeCloseTo(0.552503, 6);
    expect(results.pegMap[1][1]).toBeCloseTo(0.408786, 6);
    
    expect(results.pegMap[2][0]).toBeCloseTo(0.491574, 6);
    expect(results.pegMap[2][1]).toBeCloseTo(0.468780, 6);
    expect(results.pegMap[2][2]).toBeCloseTo(0.436540, 6);
  });

  it('should have stable pegMapHash across identical calls', () => {
    const res1 = runRound(serverSeed, clientSeed, nonce, dropColumn);
    const res2 = runRound(serverSeed, clientSeed, nonce, dropColumn);
    expect(res1.pegMapHash).toBe(res2.pegMapHash);
  });
});

describe('path resolution', () => {
  it('should result in expected binIndex and path structure', () => {
    const serverSeed = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
    const nonce = "42";
    const clientSeed = "candidate-hello";
    const dropColumn = 6;

    const { binIndex, path } = runRound(serverSeed, clientSeed, nonce, dropColumn);
    
    expect(binIndex).toBe(6);
    expect(path).toHaveLength(12);
    expect(path.every(step => step === 'L' || step === 'R')).toBe(true);
  });
});

describe('replay determinism', () => {
  it('should produce identical results for identical inputs', () => {
    const serverSeed = "random-seed-123";
    const clientSeed = "user-seed-abc";
    const nonce = "101";
    const dropColumn = 3;

    const res1 = runRound(serverSeed, clientSeed, nonce, dropColumn);
    const res2 = runRound(serverSeed, clientSeed, nonce, dropColumn);

    expect(res1.binIndex).toBe(res2.binIndex);
    expect(res1.path).toEqual(res2.path);
    expect(res1.pegMapHash).toBe(res2.pegMapHash);
    expect(res1.combinedSeed).toBe(res2.combinedSeed);
  });
});

describe('full test vector', () => {
  it('should pass the complete reference test vector', () => {
    const serverSeed = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
    const nonce = "42";
    const clientSeed = "candidate-hello";
    const dropColumn = 6;

    const results = runRound(serverSeed, clientSeed, nonce, dropColumn);

    expect(results.commitHex).toBe("bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34");
    expect(results.combinedSeed).toBe("e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0");
    expect(results.binIndex).toBe(6);
    expect(results.pegMap[0][0]).toBeCloseTo(0.422123, 6);
    expect(results.pegMap[1][1]).toBeCloseTo(0.408786, 6);
    expect(results.pegMap[2][2]).toBeCloseTo(0.436540, 6);
  });
});
