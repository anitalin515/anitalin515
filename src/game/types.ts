export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type CubeColorId =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'ivory'
  | 'violet';

export interface CubePaletteEntry {
  id: CubeColorId;
  face: string;
  light: string;
  dark: string;
  glow: string;
}

export type ShapeId = 'I' | 'O' | 'T' | 'L' | 'J' | 'S' | 'Z';

export interface ShapeDefinition {
  id: ShapeId;
  color: CubeColorId;
  matrix: number[][];
  isMagic?: boolean;
}

export interface GridCell {
  color: CubeColorId;
  squash: number; // 0..1 animation progress after landing
  flash: number;  // 0..1 white impact flash
}

export interface ActivePiece {
  shapeId: ShapeId;
  color: CubeColorId;
  matrix: number[][];
  isMagic: boolean;
  col: number;          // discrete grid column
  floatCol: number;     // continuous column for smooth horizontal lerp
  row: number;          // current integer grid row
  fallProgress: number; // 0..1 progress toward row + 1
  lockDelay: number;    // seconds resting on ground/stack before locking
  lockResets: number;   // cap infinite stalling
}

export interface FallingPiece {
  shapeId: ShapeId;
  color: CubeColorId;
  matrix: number[][];
  isMagic: boolean;
  col: number;
  startRow: number;
  targetRow: number;
  currentRow: number;
  velocity: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  lightColor: string;
  alpha: number;
  rotation: number;
  vRot: number;
  life: number;
  maxLife: number;
}

export interface FloatingCallout {
  x: number;
  y: number;
  text: string;
  subtext?: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface LineClearEffect {
  rows: number[];
  isMagicClear: boolean;
  timer: number;
  duration: number;
}

export interface GameHudSnapshot {
  score: number;
  bestScore: number;
  lines: number;
  combo: number;
  maxCombo: number;
  level: number;
  dropSpeed: number; // cells per second (2.0 -> 8.0)
  elapsedSeconds: number;
  stackHeight: number;
  nearDanger: boolean;
  nextShape: ShapeDefinition;
  activeIsMagic: boolean;
  dropsCount: number;
}
