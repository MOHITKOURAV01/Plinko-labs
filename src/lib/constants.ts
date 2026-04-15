export const ROWS = 12;

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export const PAYOUTS: Record<number, Record<RiskLevel, number[]>> = {
  8: {
    LOW: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    MEDIUM: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    HIGH: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
  },
  12: {
    LOW: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    MEDIUM: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    HIGH: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170]
  },
  16: {
    LOW: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    MEDIUM: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110], // The exact screenshot mapping
    HIGH: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
  }
};

// Fallback for current hardcoded implementations until fully abstracted
export const PAYOUT_TABLE = PAYOUTS[12]['MEDIUM'];

/**
 * Generates colors based on payout value: Red for loss, Yellow for neutral, Green for gain.
 */
export function getBinColors(binsCount: number, payouts?: number[]): string[] {
  if (!payouts) {
    // Default fallback if no payouts provided
    return Array(binsCount).fill('#0fbd20');
  }

  return payouts.map(val => {
    if (val < 1) {
      // Loss: Red range
      if (val < 0.5) return '#ff1100'; // Critical loss
      return '#ff4400'; // Minor loss
    } else if (val === 1) {
      // Neutral: Yellow
      return '#ffbf00';
    } else {
      // Gain: Green range
      if (val >= 10) return '#00ff00'; // Big win
      if (val >= 2) return '#00e601'; // Good win
      return '#d9f958'; // Small gain
    }
  });
}

// Fallback for current implementation
export const BIN_COLORS = getBinColors(13);
