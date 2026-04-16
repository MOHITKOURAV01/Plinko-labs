# 🧪 Plinko Lab Pro (Provably-Fair)

A high-fidelity, provably-fair Plinko implementation built as a take-home engineering assignment for **Daphnis Labs**.

## 🚀 Live Links
- **Application**: [plinko-lab-pro.vercel.app](https://plinko-labs-xi.vercel.app/) 
- **Verifier Page**: [/verify](https://plinko-labs-xi.vercel.app/verify)
- **Example Round**: [Audit Report](https://plinko-labs-xi.vercel.app/verify)

---

## 🛠 Tech Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Vanilla CSS (Premium OLED Black Theme)
- **Physics**: Custom Deterministic Canvas Engine (60 FPS)
- **Database**: SQLite with Prisma 7
- **Hashing**: SHA-256 (Node.js `crypto`)
- **PRNG**: Xorshift32

---

## ⚖️ Provably-Fair Protocol

Our implementation follows a strict **Commit-Reveal** protocol to ensure 100% transparency and zero server-side manipulation.

### 1. Seeding Mechanism
- **Server Seed**: A random 64-char hex string generated server-side.
- **Nonce**: A unique, incremental integer for each round.
- **Commitment**: The server publishes `SHA256(serverSeed + ":" + nonce)` before the round.
- **Client Seed**: A user-provided string (entropy contribution) used to randomize the outcome.

### 2. Randomness Generation
Everything in the game is driven by a single `combinedSeed`:
```text
combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)
```
The first 4 bytes of this hash are used to seed an **Xorshift32 PRNG**. This PRNG is used in a specific stream order:
1. **Peg Map Generation**: Every peg's `leftBias` is calculated.
2. **Path Resolution**: Every row's `Left/Right` decision is calculated.

### 3. Peg Map Logic
- **Rows**: 12
- **Base Bias**: `0.5 + (rand() - 0.5) * 0.2` (clamped between 0.4 and 0.6).
- **Rounding**: All biases are rounded to **6 decimal places** for stable hashing.
- **Peg Map Hash**: `SHA256(JSON.stringify(pegMap))`

### 4. Deterministic Decisions
At each row `r`, we calculate `bias'`:
```text
adj = (dropColumn - floor(R/2)) * 0.01
bias' = clamp(leftBias + adj, 0, 1)
```
If `rand() < bias'`, the ball moves **Left**, else **Right**.

---

## 🕹 Features & Easter Eggs

- **OLED Dark Mode**: Optimized for high-contrast laboratory environments.
- **Sound System**: Subtle peg ticks and celebratory landing SFX (Mute Toggle included).
- **Accessibility**: 
    - Full keyboard support: `Arrow Left/Right` to select column, `Space` to drop.
    - `Turbo Mode` (Reduced Motion) support.
- **Easter Eggs (Implemented)**:
    - **TILT Mode**: Press `T` to trigger a vintage arcade tilt effect with sepia filters.
    - **Golden Ball**: Hitting the center bin 3 times in a row triggers a "Golden Ball" with a special trail and glow.

---

## 🤖 AI Usage & Documentation

This project was developed with the assistance of **Antigravity (Google Deepmind)**.

### Where AI was used:
1.  **PRNG Implementation**: Used AI to generate a robust `Xorshift32` and `mulberry32` comparison to ensure bit-perfect determinism.
2.  **Styles & Animations**: AI helped refine the "Glossy Button" CSS tokens and the 3D-effect canvas gradients for the pegs.
3.  **Audit Reports**: AI assisted in drafting the clinical audit templates used in the PDF/CSV exports.
4.  **Unit Tests**: AI was used to generate edge-case test vectors to ensure `binIndex` never exceeds the valid range [0..12].

### Tradeoffs:
- **Physics vs. Math**: Chose a discrete "Path-Based" animation rather than true fixed-timestep physics (like Matter.js) to guarantee that the visual ball always matches the provably-fair math 100%.

---

## ⏱ Time Log

| Task | Duration |
| :--- | :--- |
| Core Engine & PRNG Logic | 2h |
| API Layer & Prisma Integration | 1.5h |
| Canvas Board UI & Animations | 2.5h |
| Verifier Page & Export Engines | 1.5h |
| Final Polish & Easter Eggs | 0.5h |
| **Total** | **8 Hours** |

---

## 🔧 Local Setup

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```
2.  **Environment Variables**:
    Create a `.env` file:
    ```env
    DATABASE_URL="file:./dev.db"
    ```
3.  **Run Migrations**:
    ```bash
    npx prisma migrate dev --name init
    ```
4.  **Start Development Server**:
    ```bash
    pnpm dev
    ```
5.  **Run Tests**:
    ```bash
    npm test
    ```

---

**Crafted with precision for Daphnis Labs.**
