export const ROWS = 12;

/**
 * Symmetric payout table for 12-row Plinko (13 bins).
 * Edges: 10x, Near-edges: 5x/3x, Middle: 0.5x
 */
export const PAYOUT_TABLE: number[] = [
  10,   // 0
  5,    // 1
  3,    // 2
  2,    // 3
  1.5,  // 4
  1.1,  // 5
  0.5,  // 6 (Middle)
  1.1,  // 7
  1.5,  // 8
  2,    // 9
  3,    // 10
  5,    // 11
  10    // 12
];

/**
 * Gradient from Red (#ef4444) at edges to Green (#22c55e) at center.
 * length: 13
 */
export const BIN_COLORS: string[] = [
  "#ef4444", // 0 (Red)
  "#f97316", // 1
  "#fbbf24", // 2
  "#fde047", // 3
  "#a3e635", // 4
  "#4ade80", // 5
  "#22c55e", // 6 (Green)
  "#4ade80", // 7
  "#a3e635", // 8
  "#fde047", // 9
  "#fbbf24", // 10
  "#f97316", // 11
  "#ef4444"  // 12 (Red)
];
