import { CubeColorId, CubePaletteEntry, ShapeDefinition, ShapeId } from './types';

export const CUBE_PALETTE: Record<CubeColorId, CubePaletteEntry> = {
  red: {
    id: 'red',
    face: '#E11D48',
    light: '#FB7185',
    dark: '#9F1239',
    glow: 'rgba(225, 29, 72, 0.35)',
  },
  blue: {
    id: 'blue',
    face: '#2563EB',
    light: '#60A5FA',
    dark: '#1E40AF',
    glow: 'rgba(37, 99, 235, 0.35)',
  },
  green: {
    id: 'green',
    face: '#16A34A',
    light: '#4ADE80',
    dark: '#166534',
    glow: 'rgba(22, 163, 74, 0.35)',
  },
  yellow: {
    id: 'yellow',
    face: '#EAB308',
    light: '#FDE047',
    dark: '#A16207',
    glow: 'rgba(234, 179, 8, 0.35)',
  },
  orange: {
    id: 'orange',
    face: '#EA580C',
    light: '#FB923C',
    dark: '#9A3412',
    glow: 'rgba(234, 88, 12, 0.35)',
  },
  ivory: {
    id: 'ivory',
    face: '#E2E8F0',
    light: '#FFFFFF',
    dark: '#94A3B8',
    glow: 'rgba(226, 232, 240, 0.3)',
  },
  violet: {
    id: 'violet',
    face: '#7C3AED',
    light: '#A78BFA',
    dark: '#5B21B6',
    glow: 'rgba(124, 58, 237, 0.35)',
  },
};

export const SHAPES: Record<ShapeId, ShapeDefinition> = {
  I: {
    id: 'I',
    color: 'blue',
    matrix: [[1, 1, 1, 1]],
  },
  O: {
    id: 'O',
    color: 'yellow',
    matrix: [
      [1, 1],
      [1, 1],
    ],
  },
  T: {
    id: 'T',
    color: 'violet',
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
    ],
  },
  L: {
    id: 'L',
    color: 'orange',
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  },
  J: {
    id: 'J',
    color: 'ivory',
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
  S: {
    id: 'S',
    color: 'green',
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
    ],
  },
  Z: {
    id: 'Z',
    color: 'red',
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  },
};

const SHAPE_KEYS: ShapeId[] = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];

export class SevenBagRandomizer {
  private bag: ShapeId[] = [];
  private drawnCount = 0;
  private sinceLastMagic = 0;

  private refill(): void {
    const copy = [...SHAPE_KEYS];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    this.bag = copy;
  }

  public next(): ShapeDefinition {
    if (this.bag.length === 0) {
      this.refill();
    }
    const id = this.bag.pop()!;
    const def = SHAPES[id];
    this.drawnCount++;

    // Roll for special Magic Cube starting from the 4th piece, with a 9-piece pity window
    let isMagic = false;
    if (this.drawnCount >= 4) {
      this.sinceLastMagic++;
      if (this.sinceLastMagic >= 9 || Math.random() < 0.16) {
        isMagic = true;
        this.sinceLastMagic = 0;
      }
    }

    return {
      ...def,
      isMagic,
      matrix: def.matrix.map((row) => [...row]),
    };
  }

  public reset(): void {
    this.bag = [];
    this.drawnCount = 0;
    this.sinceLastMagic = 0;
  }
}

export function rotateMatrixCW(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return result;
}
