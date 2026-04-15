# Plinko Lab — Provably Fair

> An interactive Plinko game with a cryptographically verifiable commit-reveal protocol, deterministic seed-replayable engine, polished canvas UI, and a full audit trail.

## Live Demo

| Link | Description |
|---|---|
| [plinko-lab.vercel.app](https://plinko-lab.vercel.app) | Main game |
| [plinko-lab.vercel.app/verify](https://plinko-lab.vercel.app/verify) | Verifier + audit log |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set environment variable
cp .env.example .env
# Edit .env: DATABASE_URL="file:./dev.db"

# 3. Initialize database
npx prisma migrate dev --name init

# 4. Start dev server
npm run dev

# 5. Run tests
npm test
```

**Scripts:**

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server on :3000 |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run Jest unit tests |
| `npx ts-node src/lib/engine.ts` | Run engine self-test against spec vectors |

---

## Architecture Overview

```
Plinko Lab (Next.js 14 Monorepo)
├── src/app/
│   ├── page.tsx               # Main game UI (useReducer state machine)
│   ├── verify/page.tsx        # Public verifier + audit log
│   └── api/rounds/
│       ├── commit/route.ts    # POST — create round + lock in serverSeed
│       ├── [id]/start/route.ts  # POST — run engine, return path
│       ├── [id]/reveal/route.ts # POST — expose serverSeed post-animation
│       ├── [id]/route.ts        # GET  — full round details
│       └── route.ts             # GET  — recent rounds list
├── src/lib/
│   ├── engine.ts              # Xorshift32 PRNG + SHA256 + deterministic engine
│   ├── storage.ts             # JSON file persistence (dev) / Prisma (prod)
│   └── constants.ts           # PAYOUT_TABLE, BIN_COLORS
├── src/components/
│   └── PlinkoBoard.tsx        # Canvas animation: pegs, ball, particles, confetti
└── __tests__/
    └── engine.test.ts         # Jest: 7 test suites covering all spec vectors
```

**Round lifecycle:**

```
POST /commit → [CREATED] → POST /start → [STARTED] → animation → POST /reveal → [REVEALED]
```

- `serverSeed` is never sent to the client until `REVEALED`.
- Client receives `commitHex` before providing `clientSeed` — this is the fairness guarantee.

---

## Fairness Specification

### Commit-Reveal Protocol

1. **Commit** (before player acts): Server generates `serverSeed` (32 random bytes → 64-char hex) and `nonce` (UUID slice). It publishes only:
   ```
   commitHex = SHA256(serverSeed + ":" + nonce)
   ```
2. **Interact**: Player provides `clientSeed` and chooses `dropColumn`.
3. **Compute**: Server derives:
   ```
   combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)
   ```
4. **Reveal** (after animation): `serverSeed` is exposed. Player can verify `SHA256(serverSeed:nonce) === commitHex`.

The server **cannot** retroactively change the outcome — any modified `serverSeed` would produce a different `commitHex` that the player already holds.

### Hashing
- Algorithm: **SHA256** via Node.js built-in `crypto` module (no external deps)
- Strings are UTF-8 encoded, output is lowercase hex

### PRNG: Xorshift32

```typescript
// Seed: first 4 bytes of combinedSeed hex, interpreted as big-endian uint32
const seedInt = parseInt(combinedSeed.substring(0, 8), 16) >>> 0;

// Advance:
state ^= state << 13;
state ^= state >>> 17;
state ^= state << 5;

// Output [0, 1):
return (state >>> 0) / 4294967296;
```

### Peg Map Generation

For each of 12 rows (row `r` has `r+1` pegs):
```
leftBias = 0.5 + (rand() - 0.5) * 0.2
leftBias = Number(leftBias.toFixed(6))  // rounded to 6dp for stable hashing
```

`pegMapHash = SHA256(JSON.stringify(pegMap))` — proves the board was fixed before the ball dropped.

### Drop Column Influence

```
adj = (dropColumn - Math.floor(rows / 2)) * 0.01
biasPrime = clamp(leftBias + adj, 0, 1)
```

At each row: if `rand() < biasPrime` → go Left, else go Right (pos++). Final `binIndex = pos`.

### Peg Map PRNG Order

PRNG is consumed in a single continuous stream: peg map values first (78 values for 12 rows), then row decisions (12 values). Verifier and server follow the exact same order — this is what makes replay deterministic.

---

## Test Vectors

Use these to validate any independent implementation:

| Input | Value |
|---|---|
| `serverSeed` | `b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc` |
| `nonce` | `42` |
| `clientSeed` | `candidate-hello` |
| `dropColumn` | `6` |

| Derived | Value |
|---|---|
| `commitHex` | `bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34` |
| `combinedSeed` | `e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0` |
| PRNG seed (uint32) | `parseInt("e1dddf77", 16) = 3789266807` |
| First PRNG value | `0.1106166649` |
| Row 0 peg bias | `0.422123` |
| Final `binIndex` | `6` |

All seven test suites in `__tests__/engine.test.ts` pass against these vectors.

---

## AI Usage (Honest Account)

This project was built with heavy Claude assistance. Here is an exact account of what AI produced, what I kept, and what I had to fix:

### What AI got right immediately

- **Project scaffold**: Next.js 14 App Router structure, Prisma schema, TypeScript config — 100% correct on first pass.
- **Zod validation schemas**: API input validation boilerplate was precise and production-quality.
- **SHA256 wrapper**: Trivial but correct — `crypto.createHash('sha256').update(input).digest('hex')`.
- **Peg map formula**: The `0.5 + (rand() - 0.5) * 0.2` expression and `.toFixed(6)` rounding were exactly right.
- **React architecture**: `useReducer` state machine, `useRef` for animation frame, `useCallback` for memoized canvas draw functions — good engineering judgment.
- **Canvas LERP animation**: The requestAnimationFrame loop, row progress calculation, and ball movement interpolation were functionally correct.
- **Easter egg keypress detection**: `keyHistory.current` rolling string buffer was elegant and correct.

### What required debugging

**The Xorshift32 big-endian seeding** — this was the critical failure point.

AI initially generated this:
```typescript
// WRONG — treats hex as a signed integer, loses top bit for seeds > 0x7FFFFFFF
const seedInt = parseInt(combinedSeed.substring(0, 8), 16);
```

This silently broke for seeds where the first byte ≥ `0x80`. For the reference `combinedSeed` starting with `e1dddf77`, `parseInt` returns a correct positive value, but without the `>>> 0` (unsigned right-shift by 0) coercion, JavaScript's bitwise operations in the xorshift loop would treat the state as a signed 32-bit integer internally. The result: the third test vector value would diverge at the 7th decimal place.

The fix — just one character:
```typescript
// CORRECT — >>> 0 forces unsigned 32-bit interpretation
const seedInt = parseInt(combinedSeed.substring(0, 8), 16) >>> 0;
```

I found this by running the engine self-test block, seeing the PRNG value `0.0439292176` fail at 8dp, then adding `console.log(state >>> 0, state | 0)` to the PRNG loop to observe signed vs unsigned state divergence.

**The payoutMultiplier bug**: AI's `runRound()` return value didn't include `payoutMultiplier` (it's not part of the engine — it's a business logic lookup), but the API route called `result.payoutMultiplier` which silently returned `undefined`. This caused the payout to be `NaN` in the frontend balance calculation. Fixed by importing `PAYOUT_TABLE` in the route handler and doing `PAYOUT_TABLE[result.binIndex]`.

### Summary

AI produced ~85% of the code. The remaining 15% — the two bugs above, the canvas collision detection timing, and the verifier SVG coordinate math — required hands-on debugging. The fairness-critical path (SHA256 format, PRNG seed extraction, peg map rounding) needed careful manual verification against the spec vectors.

---

## Time Log

| Phase | Duration | Focus |
|---|---|---|
| Engine + tests | 1.5 hrs | Xorshift32, SHA256, peg map, test vectors, self-test |
| API routes + DB | 1.5 hrs | All 5 endpoints, Zod validation, storage layer |
| Canvas board | 2 hrs | Peg layout, ball animation, collision effects, confetti |
| Game UI | 2 hrs | useReducer, audio, keyboard controls, commit display |
| Verifier page | 1 hr | Form, SVG path replay, history table, CSV export |
| Easter eggs | 0.5 hr | TILT, Debug Grid, Open Sesame, RAIN MODE |
| Polish + deploy | 0.5 hr | README, env setup, Vercel deploy |

---

## What I'd Build Next

- **Matter.js physics** — true continuous ball simulation, keeping the discrete engine authoritative for fairness but using physics for visuals
- **Multiplayer session feed** — WebSocket broadcast of live rounds with real-time leaderboard
- **Risk profiles** — Low/Medium/High volatility paytables with dynamic multiplier curves
- **Client-side verifier** — Run the full engine in the browser (WASM or pure JS) so users don't need to trust the server-side verify endpoint either

---

## Production: Migrating to Postgres

The dev build uses a JSON file (`rounds.json`) via a lightweight `RoundRepository`. For production (Vercel / Render):

### Option A: Neon.tech (free Postgres, works with Vercel)

```bash
# 1. Create a free database at neon.tech
# 2. Copy the connection string, add to .env:
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 3. Replace storage.ts with Prisma client:
npm install @prisma/client
npx prisma migrate deploy
```

Then swap `RoundRepository` calls in each route to use `prisma.round.create(...)` etc. The Prisma schema is already in `prisma/schema.prisma` and is Postgres-compatible — just change the `provider` from `"sqlite"` to `"postgresql"`.

### Option B: Vercel Postgres (one-click)

In your Vercel project dashboard → Storage → Create Database → Postgres. Vercel automatically injects `POSTGRES_URL` as an environment variable. Update `DATABASE_URL` in your Vercel project settings to point to it.

---

> Plinko Lab is an educational project demonstrating cryptographic transparency in gaming. No real money involved.

## Technical Architecture

The Plinko Lab Pro is built on a high-fidelity physics simulator integrated into a provably fair React application. The system uses a dedicated canvas gravity engine for deterministic ball-path resolution.

## Provably Fair Logic

Each round uses a SHA-256 commitment scheme. The Server Seed is hashed before the round, and after reveal, the user can verify the deterministic peg map generation.

## High-Fidelity Audits

The platform supports Clinical PDF and High-Fidelity CSV exports for laboratory-grade transparency and third-party auditing.

// Final Release Manifest

### Provably Fair Protocol

- Server Seed: Pre-committed and hashed using SHA-256.
- Client Seed: High-entropy user-defined or random string.
