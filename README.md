# Plinko Lab (Provably-Fair)

A high-fidelity, provably-fair Plinko implementation built as a take-home engineering assignment for **Daphnis Labs**.

---

## Links

- **Live App**: [plinko-labs-xi.vercel.app](https://plinko-labs-xi.vercel.app/)
- **Verifier Page**: [/verify](https://plinko-labs-xi.vercel.app/verify)
- **Example Round**: [Audit Report](https://plinko-labs-xi.vercel.app/verify)

---

## How to Run Locally

### Prerequisites
- Node.js 18+
- pnpm

### Steps

1. **Clone & Install**:
    ```bash
    git clone https://github.com/MOHITKOURAV01/Plinko-labs.git
    cd Plinko-labs
    pnpm install
    ```

2. **Environment Variables**:
    Create a `.env` file in the project root:
    ```env
    DATABASE_URL="postgresql://user:password@your-neon-host.neon.tech/dbname?sslmode=require"
    ```
    > The app uses **PostgreSQL** via [Neon Serverless](https://neon.tech). Create a free database at neon.tech and paste the connection string above.

3. **Push Database Schema**:
    ```bash
    pnpm db:push
    ```

4. **Start Development Server**:
    ```bash
    pnpm dev
    ```
    App will be available at `http://localhost:3000`.

5. **Run Tests**:
    ```bash
    pnpm test
    ```

---

## Architecture Overview

### Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 + Custom Vanilla CSS (OLED Black Theme) |
| Physics | Custom Deterministic Canvas Engine (`requestAnimationFrame`) |
| Database | PostgreSQL (Neon Serverless) via Prisma 7 (Driver Adapter) |
| Validation | Zod 4 (API input schemas) |
| Hashing | SHA-256 (Node.js `crypto`) |
| PRNG | Xorshift32 |

### System Flow

```
┌─────────────┐     POST /commit      ┌──────────────────┐
│             │ ──────────────────────▶│  Generate Seed   │
│   Client    │     commitHex, nonce   │  + Store in DB   │
│  (React +   │ ◀──────────────────── │                  │
│   Canvas)   │                        └──────────────────┘
│             │     POST /start
│             │ ──────────────────────▶┌──────────────────┐
│             │  clientSeed, bet,      │  runRound()      │
│             │  dropColumn, rows,     │  Xorshift32 PRNG │
│             │  risk                  │  → pegMap + path  │
│             │ ◀──────────────────── │  → binIndex      │
│             │  path, pegMap,         └──────────────────┘
│             │  binIndex
│             │                        ┌──────────────────┐
│  (Animate   │     POST /reveal       │  Reveal server   │
│   ball on   │ ──────────────────────▶│  seed + payout   │
│   canvas)   │     serverSeed,        │  Mark REVEALED   │
│             │     payout             └──────────────────┘
│             │ ◀────────────────────
└─────────────┘
        │
        │  User navigates to /verify
        ▼
┌─────────────────────────────────────────────┐
│  Verifier Page                              │
│  • Re-run engine with revealed seeds        │
│  • SVG path replay visualization            │
│  • DB cross-reference check                 │
│  • CSV / PDF audit export                   │
└─────────────────────────────────────────────┘
```

### API Routes

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/rounds/commit` | POST | Generates server seed, nonce, publishes SHA-256 commitment |
| `/api/rounds/[id]/start` | POST | Accepts client seed + config, runs deterministic engine, stores result |
| `/api/rounds/[id]/reveal` | POST | Reveals server seed and calculates payout |
| `/api/rounds` | GET | Lists recent rounds (server seed hidden until revealed) |
| `/api/rounds/[id]` | GET | Single round detail (server seed hidden until revealed) |
| `/api/verify` | GET | Stateless deterministic re-run for independent verification |

### Key Source Files

| File | Responsibility |
| :--- | :--- |
| `src/lib/engine.ts` | SHA-256 hashing, Xorshift32 PRNG, peg map generation, path resolution, `runRound()` |
| `src/lib/constants.ts` | Payout tables for 8/12/16 rows x LOW/MEDIUM/HIGH risk, bin color generator |
| `src/lib/storage.ts` | `RoundRepository` — Prisma-backed CRUD for the `Round` model |
| `src/lib/prisma.ts` | Prisma Client singleton with `@prisma/adapter-neon` driver adapter |
| `src/components/PlinkoBoard.tsx` | Canvas renderer — 3D peg gradients, ball animation, collision glow, bin highlights |
| `src/app/page.tsx` | Main game — `useReducer` state machine, Web Audio SFX, keyboard controls, auto-play |
| `src/app/verify/page.tsx` | Verifier — 3-tab UI, SVG path replay, CSV/PDF export, DB cross-reference |

---

## Fairness Spec (Provably-Fair Protocol)

The implementation follows a strict **Commit-Reveal** protocol ensuring zero server-side manipulation.

### 1. Seeding Mechanism

- **Server Seed**: A random 64-character hex string — `crypto.randomBytes(32).toString('hex')`.
- **Nonce**: A unique 8-character string derived from `uuidv4().slice(0, 8)` per round.
- **Commitment**: Before the round, the server publishes:
  ```
  commitHex = SHA256(serverSeed + ":" + nonce)
  ```
  This hash is locked and cannot be changed retroactively.
- **Client Seed**: A user-provided string (default: `"plinko-lab-v1"`) contributing entropy. Users can change this at any time.

### 2. Combined Seed & PRNG

All randomness is derived from a single deterministic seed:
```
combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)
```

The **first 4 bytes** of this hex hash are parsed as a **big-endian unsigned 32-bit integer** and used to seed an **Xorshift32** PRNG:

```javascript
// Xorshift32 implementation
class Xorshift32 {
  constructor(seed) { this.state = seed >>> 0; }
  rand() {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 4294967296;
  }
}
```

The PRNG is consumed in a **strict stream order**:
1. First: **Peg Map Generation** (all peg biases).
2. Then: **Path Resolution** (all row decisions).

### 3. Peg Map Rules

- **Rows**: Configurable — `8`, `12`, or `16`.
- **Pegs per row**: `row_index + 1` pegs (row 0 has 1 peg, row 11 has 12 pegs).
- **Left Bias formula**: Each peg gets:
  ```
  leftBias = 0.5 + (rand() - 0.5) * 0.2
  ```
  This naturally produces values in the range `[0.4, 0.6]`.
- **Rounding**: All biases are rounded to **6 decimal places** via `.toFixed(6)` to ensure stable cross-platform hashing.
- **Peg Map Hash**: `SHA256(JSON.stringify(pegMap))` — enables independent verification of the entire peg layout.

### 4. Path Resolution (Deterministic Decisions)

At each row `r`, the ball's direction is determined by:
```
center    = floor(rows / 2)
adj       = (dropColumn - center) * 0.01
bias'     = clamp(leftBias[r][currentPos] + adj, 0, 1)

if rand() < bias':  move LEFT   (position stays)
else:               move RIGHT  (position += 1)
```

The final `binIndex` equals the total number of RIGHT moves across all rows.

### 5. Payout Resolution

Three risk levels with distinct payout curves per row count:

| Rows | Risk | Payout Table (Left to Right) |
| :--- | :--- | :--- |
| 12 | LOW | `10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10` |
| 12 | MEDIUM | `33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33` |
| 12 | HIGH | `170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170` |

Payout tables are also defined for 8-row and 16-row configurations.

### 6. Reference Test Vector

```
Server Seed : b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc
Client Seed : candidate-hello
Nonce       : 42
Drop Column : 6
Rows        : 12

commitHex    : bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34
combinedSeed : e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0
PRNG Seed    : 0xe1dddf77 (3789889399)
binIndex     : 6
```

This vector is covered by 7 unit test cases in `__tests__/engine.test.ts`.

---

## AI Usage & Documentation

This project was developed with the assistance of **Antigravity (Google DeepMind)**.

### Where AI Was Used

| Area | What AI Did | What I Kept / Changed |
| :--- | :--- | :--- |
| **PRNG Engine** | Generated `Xorshift32` implementation and compared it against `mulberry32` for bit-perfect determinism. | Kept the Xorshift32 implementation as-is — it matched reference vectors perfectly. Discarded mulberry32 since Xorshift32 was sufficient. |
| **CSS & Animations** | Refined the `btn-glossy` CSS system (inset highlights, hover lift, active press) and 3D radial gradient code for canvas pegs and bins. | Kept the glossy button system and canvas gradient approach. Adjusted specific color values and shadow intensities to match the OLED black theme. |
| **Audit Exports** | Drafted the PDF audit template (clinical print layout) and the RFC-4180 CSV formatter with UTF-8 BOM for Excel compatibility. | Kept the `window.open()` + `window.print()` approach for zero-dependency PDF. Added the UTF-8 BOM myself for Excel auto-detection. |
| **Unit Tests** | Generated edge-case test vectors and reference value comparisons to ensure `binIndex` never exceeds `[0..rows]`. | Kept all generated tests. Added the full end-to-end "full test vector" suite myself to lock in the reference values. |
| **Prisma/Neon Migration** | Assisted in migrating from SQLite to PostgreSQL via Prisma 7's driver adapter pattern for Vercel serverless deployment. | Kept the `@prisma/adapter-neon` integration. Configured the `prisma.config.ts` and `postinstall` scripts myself. |

### Key Prompts (Summarized)
1. *"Generate a deterministic Xorshift32 PRNG in TypeScript that seeds from 4 bytes of a SHA-256 hash, with `.rand()` returning [0, 1)."*
2. *"Create a CSS class for glossy buttons with inset highlight on top half, hover lift with brightness, and active press state."*
3. *"Build a print-optimized HTML template for a game audit report — no dependencies, opens in new tab and triggers print dialog."*
4. *"Generate Jest tests covering SHA-256 known vectors, PRNG sequence verification, and deterministic replay for a Plinko fairness engine."*

### Tradeoffs
- **Path-Based Animation vs. Physics Engine**: Chose discrete "path-based" canvas animation over true physics (Matter.js) to guarantee the visual ball **always** matches the provably-fair math 1:1. A physics engine would require post-hoc correction to match predetermined outcomes.
- **Print-Based PDF vs. Library**: Used `window.open()` + `window.print()` instead of a PDF library (jsPDF, pdfmake) to keep bundle size minimal and ensure cross-browser reliability.

---

## Time Log

| Task | Duration | Details |
| :--- | :--- | :--- |
| Core Engine & PRNG Logic | 2h | `engine.ts` — SHA-256, Xorshift32, peg map, path resolution, `runRound()` |
| API Layer & Prisma Integration | 1.5h | 6 API routes, Zod validation, Prisma schema, Neon adapter setup |
| Canvas Board UI & Animations | 2.5h | `PlinkoBoard.tsx` — 3D pegs, ball physics, collision glow, bin rendering |
| Verifier Page & Export Engines | 1.5h | 3-tab UI, SVG replay, CSV/PDF exports, DB cross-reference |
| Final Polish & Easter Eggs | 0.5h | TILT mode, Golden Ball, sound system, keyboard controls |
| **Total** | **8 Hours** | |

### What I Would Do Next With More Time
- **Multiplayer Leaderboard**: WebSocket-based live feed of drops across all users with a shared global board.
- **Animated Confetti**: Replace the `console.log` confetti stub with `canvas-confetti` library for big-win celebrations.
- **Mobile Responsive Layout**: The current sidebar layout is desktop-optimized; would add a bottom-sheet drawer for mobile.
- **Server Seed Rotation**: Automatic server seed rotation after N rounds with a rotation history UI.
- **Comprehensive E2E Tests**: Playwright tests covering the full commit, start, animate, reveal, verify lifecycle.
- **Rate Limiting & Auth**: Add API rate limiting and optional user accounts for persistent balance tracking.

---

## Project Structure

```
Plinko-labs/
├── __tests__/
│   └── engine.test.ts              # 7 test suites — full fairness pipeline
├── prisma/
│   └── schema.prisma               # Round model (PostgreSQL)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── rounds/
│   │   │   │   ├── route.ts            # GET  /api/rounds
│   │   │   │   ├── commit/route.ts     # POST /api/rounds/commit
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts        # GET  /api/rounds/:id
│   │   │   │       ├── start/route.ts  # POST /api/rounds/:id/start
│   │   │   │       └── reveal/route.ts # POST /api/rounds/:id/reveal
│   │   │   └── verify/route.ts         # GET  /api/verify
│   │   ├── verify/page.tsx         # Verifier (3-tab: Verify / History / How It Works)
│   │   ├── page.tsx                # Main game page
│   │   ├── layout.tsx              # Root layout (Geist font)
│   │   └── globals.css             # OLED theme + glossy system + animations
│   ├── components/
│   │   └── PlinkoBoard.tsx         # Canvas board renderer
│   └── lib/
│       ├── engine.ts               # Core fairness engine (SHA-256, Xorshift32, runRound)
│       ├── constants.ts            # Payout tables (8/12/16 x LOW/MED/HIGH) + bin colors
│       ├── storage.ts              # RoundRepository (Prisma CRUD)
│       ├── prisma.ts               # Prisma client with Neon adapter
│       └── db.ts                   # Legacy Prisma singleton
├── prisma.config.ts
├── jest.config.js
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

**Crafted with precision for Daphnis Labs.**
