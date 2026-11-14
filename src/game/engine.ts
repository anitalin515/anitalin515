import { SoundEngine } from './audio';
import { CUBE_PALETTE, rotateMatrixCW, SevenBagRandomizer } from './shapes';
import {
  ActivePiece,
  CubeColorId,
  FallingPiece,
  FloatingCallout,
  GameHudSnapshot,
  GameState,
  GridCell,
  LineClearEffect,
  Particle,
  ShapeDefinition,
} from './types';

export const COLS = 10;
export const ROWS = 18;
export const DANGER_ROW = 4; // Rows 0..3 are the top waiting drop zone

const BASE_DROP_SPEED = 2.0;       // 2 cells per second
const SPEED_STEP_INTERVAL = 20;    // Accelerate every 20 seconds
const SPEED_STEP_AMOUNT = 0.75;    // +0.75 cells/sec per tier
const MAX_DROP_SPEED = 8.0;        // Cap at 8 cells/sec

const BEST_SCORE_KEY = 'cubix_stack_best_score_v1';

export interface EngineCallbacks {
  onHudChange: (hud: GameHudSnapshot) => void;
  onGameOver: (hud: GameHudSnapshot) => void;
}

export class CubeStackEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sound: SoundEngine;
  private callbacks: EngineCallbacks;

  private grid: (GridCell | null)[][] = [];
  private bag = new SevenBagRandomizer();

  private gameState: GameState = 'TITLE_MENU';

  private activePiece: ActivePiece | null = null;
  private fallingPiece: FallingPiece | null = null;
  private nextShape: ShapeDefinition;
  private lineClear: LineClearEffect | null = null;

  private particles: Particle[] = [];
  private callouts: FloatingCallout[] = [];

  private score = 0;
  private bestScore = 0;
  private lines = 0;
  private combo = 0;
  private maxCombo = 0;
  private dropsCount = 0;
  private elapsedSeconds = 0;
  private lastSpeedTier = 0;
  private lastHudSecond = -1;
  private wasNearDanger = false;

  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private gameOverDelayTimer = 0;
  private pendingGameOver = false;
  private pulseClock = 0;

  private cellSize = 32;
  private boardWidth = 320;
  private boardHeight = 576;
  private dpr = 1;

  private rafId: number | null = null;
  private lastTimestamp = 0;

  // Pointer drag state
  private pointerActive = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private dragStartCol = 0;
  private hasDragged = false;

  constructor(
    canvas: HTMLCanvasElement,
    sound: SoundEngine,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.sound = sound;
    this.callbacks = callbacks;

    this.bestScore = this.loadBestScore();
    this.nextShape = this.bag.next();
    this.initEmptyGrid();
    this.resize();
  }

  private loadBestScore(): number {
    try {
      const saved = localStorage.getItem(BEST_SCORE_KEY);
      return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(value: number): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(value));
    } catch {
      // ignore storage errors
    }
  }

  private initEmptyGrid(): void {
    this.grid = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => null)
    );
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      this.update(dt);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.sound.stopMusic();
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const maxCellByWidth = Math.floor((rect.width - 8) / COLS);
    const maxCellByHeight = Math.floor((rect.height - 8) / ROWS);
    this.cellSize = Math.max(16, Math.min(maxCellByWidth, maxCellByHeight, 44));

    this.boardWidth = this.cellSize * COLS;
    this.boardHeight = this.cellSize * ROWS;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.boardWidth * this.dpr);
    this.canvas.height = Math.floor(this.boardHeight * this.dpr);
    this.canvas.style.width = `${this.boardWidth}px`;
    this.canvas.style.height = `${this.boardHeight}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  public startNewGame(): void {
    this.initEmptyGrid();
    this.bag.reset();
    this.particles = [];
    this.callouts = [];
    this.lineClear = null;
    this.fallingPiece = null;
    this.activePiece = null;

    this.score = 0;
    this.lines = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.dropsCount = 0;
    this.elapsedSeconds = 0;
    this.lastSpeedTier = 0;
    this.lastHudSecond = 0;
    this.wasNearDanger = false;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;
    this.pendingGameOver = false;
    this.gameOverDelayTimer = 0;

    this.nextShape = this.bag.next();
    this.gameState = 'PLAYING';
    this.sound.setTension(0, false);
    this.sound.startMusic();
    this.spawnNextPiece();
    this.emitHud();
  }

  public setGameState(state: GameState): void {
    const prev = this.gameState;
    this.gameState = state;
    if (state === 'PAUSED' && prev === 'PLAYING') {
      this.sound.pauseMusic();
    } else if (state === 'PLAYING' && prev === 'PAUSED') {
      this.sound.resumeMusic();
    } else if (state === 'TITLE_MENU' || state === 'GAME_OVER') {
      this.sound.stopMusic();
    }
  }

  private getSpeedTier(): number {
    return Math.floor(this.elapsedSeconds / SPEED_STEP_INTERVAL);
  }

  private getDropSpeed(): number {
    return Math.min(
      MAX_DROP_SPEED,
      BASE_DROP_SPEED + this.getSpeedTier() * SPEED_STEP_AMOUNT
    );
  }

  private getLevel(): number {
    return 1 + this.getSpeedTier();
  }

  private computeStackHeight(): number {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] !== null) {
          return ROWS - r;
        }
      }
    }
    return 0;
  }

  public getHudSnapshot(): GameHudSnapshot {
    const stackHeight = this.computeStackHeight();
    return {
      score: this.score,
      bestScore: this.bestScore,
      lines: this.lines,
      combo: this.combo,
      maxCombo: this.maxCombo,
      level: this.getLevel(),
      dropSpeed: this.getDropSpeed(),
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      stackHeight,
      nearDanger: stackHeight >= ROWS - DANGER_ROW - 2,
      nextShape: {
        ...this.nextShape,
        matrix: this.nextShape.matrix.map((r) => [...r]),
      },
      activeIsMagic: Boolean(this.activePiece?.isMagic || this.fallingPiece?.isMagic),
      dropsCount: this.dropsCount,
    };
  }

  private emitHud(): void {
    this.callbacks.onHudChange(this.getHudSnapshot());
  }

  private spawnNextPiece(): void {
    const shape = this.nextShape;
    this.nextShape = this.bag.next();

    const width = shape.matrix[0].length;
    const height = shape.matrix.length;
    const startCol = Math.floor((COLS - width) / 2);
    const startRow = Math.max(0, DANGER_ROW - height);

    if (!this.canPlace(shape.matrix, startCol, startRow)) {
      this.triggerGameOverSequence();
      return;
    }

    this.activePiece = {
      shapeId: shape.id,
      color: shape.color,
      matrix: shape.matrix,
      isMagic: Boolean(shape.isMagic),
      col: startCol,
      floatCol: startCol,
      row: startRow,
      fallProgress: 0,
      lockDelay: 0,
      lockResets: 0,
    };
  }

  private canPlace(matrix: number[][], col: number, row: number): boolean {
    const h = matrix.length;
    const w = matrix[0].length;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (!matrix[r][c]) continue;
        const gc = col + c;
        const gr = row + r;
        if (gc < 0 || gc >= COLS || gr >= ROWS) return false;
        if (gr >= 0 && this.grid[gr][gc] !== null) return false;
      }
    }
    return true;
  }

  private getLandingRow(matrix: number[][], col: number, startRow: number): number {
    let row = startRow;
    while (this.canPlace(matrix, col, row + 1)) {
      row++;
    }
    return row;
  }

  public moveHorizontal(delta: -1 | 1): boolean {
    if (
      this.gameState !== 'PLAYING' ||
      !this.activePiece ||
      this.fallingPiece ||
      this.lineClear ||
      this.pendingGameOver
    ) {
      return false;
    }

    const piece = this.activePiece;
    const nextCol = piece.col + delta;
    if (nextCol < 0 || nextCol + piece.matrix[0].length > COLS) {
      return false;
    }
    if (!this.canPlace(piece.matrix, nextCol, piece.row)) {
      return false;
    }

    piece.col = nextCol;

    // Prevent visual clipping if stepping diagonally against a neighbor block mid-cell
    if (piece.fallProgress > 0.05 && !this.canPlace(piece.matrix, nextCol, piece.row + 1)) {
      piece.fallProgress = 0;
    }

    if (!this.canPlace(piece.matrix, piece.col, piece.row + 1) && piece.lockResets < 4) {
      piece.lockDelay = 0;
      piece.lockResets++;
    }

    this.sound.playMove();
    return true;
  }

  public rotatePiece(): boolean {
    if (
      this.gameState !== 'PLAYING' ||
      !this.activePiece ||
      this.fallingPiece ||
      this.lineClear ||
      this.pendingGameOver
    ) {
      return false;
    }

    const piece = this.activePiece;
    const rotated = rotateMatrixCW(piece.matrix);
    const newWidth = rotated[0].length;

    const currentCenter = piece.col + piece.matrix[0].length / 2;
    let idealCol = Math.round(currentCenter - newWidth / 2);
    idealCol = Math.max(0, Math.min(COLS - newWidth, idealCol));

    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      const testCol = idealCol + kick;
      if (
        testCol >= 0 &&
        testCol + newWidth <= COLS &&
        this.canPlace(rotated, testCol, piece.row)
      ) {
        piece.matrix = rotated;
        piece.col = testCol;
        piece.floatCol = testCol;

        if (piece.fallProgress > 0.05 && !this.canPlace(rotated, testCol, piece.row + 1)) {
          piece.fallProgress = 0;
        }
        if (!this.canPlace(rotated, testCol, piece.row + 1) && piece.lockResets < 4) {
          piece.lockDelay = 0;
          piece.lockResets++;
        }

        this.sound.playRotate();
        return true;
      }
    }
    return false;
  }

  public dropPiece(): boolean {
    if (
      this.gameState !== 'PLAYING' ||
      !this.activePiece ||
      this.fallingPiece ||
      this.lineClear ||
      this.pendingGameOver
    ) {
      return false;
    }

    const piece = this.activePiece;
    const targetRow = this.getLandingRow(piece.matrix, piece.col, piece.row);

    // If already resting on the target row, lock immediately
    if (targetRow <= piece.row) {
      this.activePiece = null;
      this.dropsCount++;
      this.lockPieceAt(piece.matrix, piece.col, piece.row, piece.color, piece.isMagic);
      return true;
    }

    this.fallingPiece = {
      shapeId: piece.shapeId,
      color: piece.color,
      matrix: piece.matrix,
      isMagic: piece.isMagic,
      col: piece.col,
      startRow: piece.row + piece.fallProgress,
      targetRow,
      currentRow: piece.row + piece.fallProgress,
      velocity: 30,
    };
    this.activePiece = null;
    this.dropsCount++;
    this.sound.playDropWhoosh();
    return true;
  }

  // Pointer interaction on canvas
  public handlePointerDown(clientX: number, clientY: number): void {
    if (this.gameState !== 'PLAYING') return;
    this.pointerActive = true;
    this.pointerStartX = clientX;
    this.pointerStartY = clientY;
    this.hasDragged = false;
    this.dragStartCol = this.activePiece ? this.activePiece.col : 0;
  }

  public handlePointerMove(clientX: number): void {
    if (!this.pointerActive || this.gameState !== 'PLAYING' || !this.activePiece) return;

    const dx = clientX - this.pointerStartX;
    if (Math.abs(dx) > this.cellSize * 0.35) {
      this.hasDragged = true;
    }

    if (this.hasDragged) {
      const colOffset = Math.round(dx / this.cellSize);
      const maxCol = COLS - this.activePiece.matrix[0].length;
      const desiredCol = Math.max(0, Math.min(maxCol, this.dragStartCol + colOffset));
      if (desiredCol !== this.activePiece.col) {
        const step = desiredCol > this.activePiece.col ? 1 : -1;
        while (this.activePiece.col !== desiredCol) {
          if (!this.moveHorizontal(step)) break;
        }
      }
    }
  }

  public handlePointerUp(clientY: number): void {
    if (!this.pointerActive) return;
    this.pointerActive = false;

    if (this.gameState !== 'PLAYING') return;

    const dy = clientY - this.pointerStartY;
    if (!this.hasDragged || dy > this.cellSize * 0.8) {
      this.dropPiece();
    }
  }

  public handlePointerCancel(): void {
    this.pointerActive = false;
    this.hasDragged = false;
  }

  private update(dt: number): void {
    this.pulseClock += dt;

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 28);
    }

    this.updateParticles(dt);
    this.updateCallouts(dt);

    if (this.gameState !== 'PLAYING') {
      return;
    }

    if (this.pendingGameOver) {
      this.gameOverDelayTimer -= dt;
      if (this.gameOverDelayTimer <= 0) {
        this.pendingGameOver = false;
        this.gameState = 'GAME_OVER';
        this.callbacks.onGameOver(this.getHudSnapshot());
      }
      return;
    }

    // Track elapsed survival time and update dynamic speed tier
    this.elapsedSeconds += dt;
    const currentTier = this.getSpeedTier();
    if (currentTier > this.lastSpeedTier) {
      this.lastSpeedTier = currentTier;
      const newSpeed = this.getDropSpeed();
      this.sound.playSpeedUp();
      this.callouts.push({
        x: this.boardWidth / 2,
        y: (DANGER_ROW + 1.5) * this.cellSize,
        text: `${newSpeed.toFixed(2)} 格/秒`,
        subtext: '降落加速！',
        color: '#38BDF8',
        life: 0,
        maxLife: 1.05,
      });
      this.updateMusicTension();
      this.emitHud();
    } else {
      const wholeSec = Math.floor(this.elapsedSeconds);
      if (wholeSec !== this.lastHudSecond) {
        this.lastHudSecond = wholeSec;
        this.emitHud();
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Update squash & flash on locked cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;
        if (cell.squash > 0) {
          cell.squash = Math.max(0, cell.squash - dt * 8.5);
        }
        if (cell.flash > 0) {
          cell.flash = Math.max(0, cell.flash - dt * 7.5);
        }
      }
    }

    if (this.lineClear) {
      this.lineClear.timer += dt;
      if (this.lineClear.timer >= this.lineClear.duration) {
        this.finishLineClear();
      }
      return;
    }

    // Hard-drop slam animation
    if (this.fallingPiece) {
      this.fallingPiece.velocity += 200 * dt;
      this.fallingPiece.currentRow += this.fallingPiece.velocity * dt;

      if (this.fallingPiece.currentRow >= this.fallingPiece.targetRow) {
        const fp = this.fallingPiece;
        this.fallingPiece = null;
        this.lockPieceAt(fp.matrix, fp.col, fp.targetRow, fp.color, fp.isMagic);
      }
      return;
    }

    // Automatic time-accelerated downward gravity (starts at 2.0 cells/sec)
    if (this.activePiece) {
      const piece = this.activePiece;

      // Smooth horizontal visual lerp
      const diff = piece.col - piece.floatCol;
      piece.floatCol += diff * Math.min(1, dt * 26);

      const canFall = this.canPlace(piece.matrix, piece.col, piece.row + 1);
      if (canFall) {
        const dropSpeed = this.getDropSpeed();
        piece.fallProgress += dropSpeed * dt;
        while (piece.fallProgress >= 1) {
          if (this.canPlace(piece.matrix, piece.col, piece.row + 1)) {
            piece.row += 1;
            piece.fallProgress -= 1;
            piece.lockDelay = 0;
          } else {
            piece.fallProgress = 0;
            break;
          }
        }
        // Re-check if we just touched down on this frame
        if (!this.canPlace(piece.matrix, piece.col, piece.row + 1)) {
          piece.fallProgress = 0;
        }
      } else {
        piece.fallProgress = 0;
        piece.lockDelay += dt;
        if (piece.lockDelay >= 0.25) {
          this.activePiece = null;
          this.dropsCount++;
          this.lockPieceAt(piece.matrix, piece.col, piece.row, piece.color, piece.isMagic);
        }
      }
    }
  }

  private lockPieceAt(
    matrix: number[][],
    col: number,
    baseRow: number,
    color: CubeColorId,
    isMagic: boolean
  ): void {
    const h = matrix.length;
    const w = matrix[0].length;
    const magicOccupiedRows = new Set<number>();

    for (let r = 0; r < h; r++) {
      let rowHasBlock = false;
      for (let c = 0; c < w; c++) {
        if (!matrix[r][c]) continue;
        rowHasBlock = true;
        const gr = baseRow + r;
        const gc = col + c;
        if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) {
          this.grid[gr][gc] = {
            color,
            squash: 1,
            flash: 1,
          };
        }
      }
      if (isMagic && rowHasBlock) {
        const gr = baseRow + r;
        if (gr >= 0 && gr < ROWS) {
          magicOccupiedRows.add(gr);
        }
      }
    }

    const stackHeight = this.computeStackHeight();
    this.sound.playLand(stackHeight / ROWS);
    this.shakeIntensity = Math.max(this.shakeIntensity, isMagic ? 3.5 : 2.2);
    this.spawnLandingDust(matrix, col, baseRow, color);

    this.addScore(10);

    // Detect completed horizontal parallel lines + Magic Cube auto-cleared lines
    const rowsToClearSet = new Set<number>(magicOccupiedRows);
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) {
        rowsToClearSet.add(r);
      }
    }

    const clearedRows = Array.from(rowsToClearSet).sort((a, b) => a - b);

    if (clearedRows.length > 0) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);

      const lineBase = [0, 100, 300, 600, 1000][Math.min(clearedRows.length, 4)];
      const magicBonus = isMagic ? 120 * clearedRows.length : 0;
      const comboBonus = this.combo > 1 ? (this.combo - 1) * 50 * clearedRows.length : 0;
      const earned = (lineBase + magicBonus + comboBonus) * this.getLevel();
      this.addScore(earned);
      this.lines += clearedRows.length;

      this.sound.playLineClear(clearedRows.length, this.combo, isMagic);
      this.shakeIntensity = Math.max(this.shakeIntensity, 3.2 + clearedRows.length * 1.8);
      if (clearedRows.length >= 2 || isMagic) {
        this.hitstopTimer = 0.045;
      }

      for (const rowIdx of clearedRows) {
        this.spawnLineClearSparks(rowIdx, isMagic);
      }

      const midRow = clearedRows[Math.floor(clearedRows.length / 2)];
      const labelMap = ['', 'LINE CLEAR!', 'DOUBLE!', 'TRIPLE!', 'CUBE QUAD!'];
      const titleLabel = isMagic
        ? `魔術消除 ×${clearedRows.length}!`
        : labelMap[Math.min(clearedRows.length, 4)];
      const subtext =
        this.combo > 1 ? `${titleLabel} · COMBO ×${this.combo}` : titleLabel;

      this.callouts.push({
        x: this.boardWidth / 2,
        y: (midRow + 0.5) * this.cellSize,
        text: `+${earned}`,
        subtext,
        color: isMagic ? '#38BDF8' : clearedRows.length >= 2 ? '#FDE047' : '#F8FAFC',
        life: 0,
        maxLife: 0.95,
      });

      this.lineClear = {
        rows: clearedRows,
        isMagicClear: isMagic,
        timer: 0,
        duration: 0.24,
      };
      this.emitHud();
      return;
    }

    this.combo = 0;
    this.postSettleCheck();
  }

  private finishLineClear(): void {
    if (!this.lineClear) return;
    const rowsToRemove = new Set(this.lineClear.rows);
    this.lineClear = null;

    const remaining: (GridCell | null)[][] = [];
    for (let r = 0; r < ROWS; r++) {
      if (!rowsToRemove.has(r)) {
        remaining.push(this.grid[r]);
      }
    }
    while (remaining.length < ROWS) {
      remaining.unshift(Array.from({ length: COLS }, () => null));
    }
    this.grid = remaining;

    this.postSettleCheck();
  }

  private postSettleCheck(): void {
    let breachedCeiling = false;
    for (let r = 0; r < DANGER_ROW; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] !== null) {
          breachedCeiling = true;
          break;
        }
      }
      if (breachedCeiling) break;
    }

    if (breachedCeiling) {
      this.triggerGameOverSequence();
      return;
    }

    const stackHeight = this.computeStackHeight();
    const nearDanger = stackHeight >= ROWS - DANGER_ROW - 2;
    if (nearDanger && !this.wasNearDanger) {
      this.sound.playWarning();
    }
    this.wasNearDanger = nearDanger;
    this.updateMusicTension();

    this.spawnNextPiece();
    this.emitHud();
  }

  private updateMusicTension(): void {
    const speedRatio =
      (this.getDropSpeed() - BASE_DROP_SPEED) / (MAX_DROP_SPEED - BASE_DROP_SPEED);
    const stackHeight = this.computeStackHeight();
    const nearDanger = stackHeight >= ROWS - DANGER_ROW - 2;
    this.sound.setTension(speedRatio, nearDanger);
  }

  private triggerGameOverSequence(): void {
    this.pendingGameOver = true;
    this.gameOverDelayTimer = 0.44;
    this.activePiece = null;
    this.fallingPiece = null;
    this.shakeIntensity = 6;
    this.sound.stopMusic();
    this.sound.playGameOver();
    this.emitHud();
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveBestScore(this.bestScore);
    }
  }

  private spawnLandingDust(
    matrix: number[][],
    col: number,
    baseRow: number,
    colorId: CubeColorId
  ): void {
    const palette = CUBE_PALETTE[colorId];
    const h = matrix.length;
    const w = matrix[0].length;
    for (let c = 0; c < w; c++) {
      let lowestR = -1;
      for (let r = h - 1; r >= 0; r--) {
        if (matrix[r][c]) {
          lowestR = r;
          break;
        }
      }
      if (lowestR === -1) continue;
      const cx = (col + c + 0.5) * this.cellSize;
      const cy = (baseRow + lowestR + 1) * this.cellSize;
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI * (0.15 + Math.random() * 0.7);
        const speed = 35 + Math.random() * 65;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * this.cellSize * 0.5,
          y: cy - 2,
          vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
          vy: -Math.abs(Math.sin(angle) * speed) * 0.7,
          size: 3 + Math.random() * 3,
          color: palette.light,
          lightColor: '#FFFFFF',
          alpha: 0.9,
          rotation: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 8,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.14,
        });
      }
    }
  }

  private spawnLineClearSparks(rowIdx: number, isMagic: boolean): void {
    const y = (rowIdx + 0.5) * this.cellSize;
    const prismColors = ['#F43F5E', '#38BDF8', '#4ADE80', '#FDE047', '#A78BFA'];
    for (let c = 0; c < COLS; c++) {
      const cell = this.grid[rowIdx][c];
      const palette = cell ? CUBE_PALETTE[cell.color] : CUBE_PALETTE.ivory;
      const x = (c + 0.5) * this.cellSize;
      const burstCount = isMagic ? 4 : 3;
      for (let i = 0; i < burstCount; i++) {
        const vx = (Math.random() - 0.5) * 240;
        const vy = -65 - Math.random() * 145;
        const faceColor = isMagic
          ? prismColors[(c + i) % prismColors.length]
          : palette.face;
        this.particles.push({
          x,
          y,
          vx,
          vy,
          size: 4 + Math.random() * 5,
          color: faceColor,
          lightColor: '#FFFFFF',
          alpha: 1,
          rotation: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 14,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.25,
        });
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      p.alpha = 1 - p.life / p.maxLife;
    }
  }

  private updateCallouts(dt: number): void {
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.callouts.splice(i, 1);
        continue;
      }
      c.y -= 34 * dt;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.boardWidth;
    const h = this.boardHeight;
    const cs = this.cellSize;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    if (this.shakeIntensity > 0.1) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      ctx.translate(sx, sy);
    }

    // 1. Board Surface
    ctx.fillStyle = '#0D1322';
    ctx.fillRect(0, 0, w, h);

    // Waiting Drop Zone tint
    const dangerY = DANGER_ROW * cs;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.42)';
    ctx.fillRect(0, 0, w, dangerY);

    // 2. Subtle Grid Lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      const x = Math.floor(c * cs) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let r = 1; r < ROWS; r++) {
      const y = Math.floor(r * cs) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 3. Ceiling Limit Line ("警戒線")
    const stackHeight = this.computeStackHeight();
    const nearDanger = stackHeight >= ROWS - DANGER_ROW - 2;
    const dangerPulse = nearDanger ? 0.55 + 0.45 * Math.sin(this.pulseClock * 9) : 0.6;

    ctx.save();
    ctx.strokeStyle =
      this.pendingGameOver || nearDanger
        ? `rgba(239, 68, 68, ${dangerPulse})`
        : 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, dangerY);
    ctx.lineTo(w, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `600 ${Math.max(10, Math.round(cs * 0.34))}px "Noto Sans TC", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle =
      this.pendingGameOver || nearDanger
        ? `rgba(248, 113, 113, ${0.8 + 0.2 * dangerPulse})`
        : 'rgba(251, 191, 36, 0.72)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('警戒線', w - 6, dangerY - 3);
    ctx.restore();

    // 4. Ghost Drop Guide & Landing Silhouette
    if (this.activePiece && this.gameState === 'PLAYING' && !this.pendingGameOver) {
      this.renderGhostGuide(ctx, this.activePiece);
    }

    // 5. Locked Stack Cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;
        const isBreach = r < DANGER_ROW;
        this.drawCubeCell(
          ctx,
          c * cs,
          r * cs,
          cs,
          cell.color,
          cell.squash,
          cell.flash,
          isBreach,
          false
        );
      }
    }

    // 6. Line Clear Beam Sweep
    if (this.lineClear) {
      const progress = this.lineClear.timer / this.lineClear.duration;
      const alpha = Math.sin(progress * Math.PI);
      for (const rowIdx of this.lineClear.rows) {
        const y = rowIdx * cs;
        if (this.lineClear.isMagicClear) {
          const grad = ctx.createLinearGradient(0, y, w, y);
          grad.addColorStop(0, `rgba(56, 189, 248, ${0.85 * alpha})`);
          grad.addColorStop(0.5, `rgba(253, 224, 71, ${0.95 * alpha})`);
          grad.addColorStop(1, `rgba(244, 114, 182, ${0.85 * alpha})`);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.78 * alpha})`;
        }
        ctx.fillRect(0, y, w, cs);
      }
    }

    // 7. Hard-Drop Falling Piece
    if (this.fallingPiece) {
      const fp = this.fallingPiece;
      const palette = CUBE_PALETTE[fp.color];
      const trailHeight = Math.min(cs * 2.2, (fp.currentRow - fp.startRow) * cs);
      if (trailHeight > 4) {
        for (let r = 0; r < fp.matrix.length; r++) {
          for (let c = 0; c < fp.matrix[0].length; c++) {
            if (!fp.matrix[r][c]) continue;
            const x = (fp.col + c) * cs + 2;
            const y = (fp.currentRow + r) * cs;
            const grad = ctx.createLinearGradient(x, y - trailHeight, x, y);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(1, fp.isMagic ? 'rgba(56, 189, 248, 0.45)' : palette.glow);
            ctx.fillStyle = grad;
            ctx.fillRect(x, y - trailHeight, cs - 4, trailHeight);
          }
        }
      }

      for (let r = 0; r < fp.matrix.length; r++) {
        for (let c = 0; c < fp.matrix[0].length; c++) {
          if (!fp.matrix[r][c]) continue;
          this.drawCubeCell(
            ctx,
            (fp.col + c) * cs,
            (fp.currentRow + r) * cs,
            cs,
            fp.color,
            0,
            0,
            false,
            fp.isMagic
          );
        }
      }
    }

    // 8. Active Auto-Descending Piece
    if (this.activePiece && !this.pendingGameOver) {
      const piece = this.activePiece;
      const canFallFurther = this.canPlace(piece.matrix, piece.col, piece.row + 1);
      const visualRow = piece.row + (canFallFurther ? piece.fallProgress : 0);

      for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[0].length; c++) {
          if (!piece.matrix[r][c]) continue;
          this.drawCubeCell(
            ctx,
            (piece.floatCol + c) * cs,
            (visualRow + r) * cs,
            cs,
            piece.color,
            0,
            0,
            false,
            piece.isMagic
          );
        }
      }
    }

    // 9. Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.fillStyle = p.lightColor;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 0.45, p.size * 0.45);
      ctx.restore();
    }

    // 10. Floating Score / Speed / Magic Callouts
    for (const callout of this.callouts) {
      const t = callout.life / callout.maxLife;
      const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(cs * 0.56)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#090D18';
      ctx.fillText(callout.text, callout.x + 1, callout.y + 1);
      ctx.fillStyle = callout.color;
      ctx.fillText(callout.text, callout.x, callout.y);

      if (callout.subtext) {
        ctx.font = `700 ${Math.round(cs * 0.32)}px "Outfit", "Noto Sans TC", sans-serif`;
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(callout.subtext, callout.x, callout.y + cs * 0.48);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  private renderGhostGuide(ctx: CanvasRenderingContext2D, piece: ActivePiece): void {
    const cs = this.cellSize;
    const targetRow = this.getLandingRow(piece.matrix, piece.col, piece.row);
    const palette = CUBE_PALETTE[piece.color];

    // If Magic Cube, highlight the full horizontal rows it will auto-clear upon landing
    if (piece.isMagic) {
      const pulse = 0.12 + 0.08 * Math.sin(this.pulseClock * 8);
      ctx.save();
      for (let r = 0; r < piece.matrix.length; r++) {
        if (!piece.matrix[r].some(Boolean)) continue;
        const rowY = (targetRow + r) * cs;
        ctx.fillStyle = `rgba(56, 189, 248, ${pulse})`;
        ctx.fillRect(0, rowY, this.boardWidth, cs);
      }
      ctx.restore();
    }

    const leftX = piece.col * cs + 1;
    const rightX = (piece.col + piece.matrix[0].length) * cs - 1;
    const startY = (piece.row + piece.matrix.length) * cs;
    const endY = (targetRow + piece.matrix.length) * cs;

    if (endY > startY) {
      ctx.save();
      ctx.strokeStyle = piece.isMagic
        ? 'rgba(56, 189, 248, 0.28)'
        : 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(leftX, startY);
      ctx.lineTo(leftX, endY);
      ctx.moveTo(rightX, startY);
      ctx.lineTo(rightX, endY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[0].length; c++) {
        if (!piece.matrix[r][c]) continue;
        const x = (piece.col + c) * cs + 2;
        const y = (targetRow + r) * cs + 2;
        const size = cs - 4;
        const radius = Math.max(3, cs * 0.14);

        ctx.fillStyle = piece.isMagic
          ? 'rgba(56, 189, 248, 0.18)'
          : palette.glow.replace('0.35', '0.14').replace('0.3', '0.14');
        this.roundRectPath(ctx, x, y, size, size, radius);
        ctx.fill();

        ctx.strokeStyle = piece.isMagic ? '#38BDF8' : palette.light;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        this.roundRectPath(ctx, x, y, size, size, radius);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  private drawCubeCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cs: number,
    colorId: CubeColorId,
    squash: number,
    flash: number,
    isBreach: boolean,
    isMagic: boolean
  ): void {
    const palette = CUBE_PALETTE[colorId];
    const pad = 1;
    let drawW = cs - pad * 2;
    let drawH = cs - pad * 2;
    let drawX = x + pad;
    let drawY = y + pad;

    if (squash > 0) {
      const s = Math.sin(squash * Math.PI);
      const scaleY = 1 - 0.14 * s;
      const scaleX = 1 + 0.08 * s;
      const newW = drawW * scaleX;
      const newH = drawH * scaleY;
      drawX -= (newW - drawW) / 2;
      drawY += drawH - newH;
      drawW = newW;
      drawH = newH;
    }

    const outerRadius = Math.max(4, cs * 0.16);
    const stickerInset = Math.max(2.5, cs * 0.11);
    const innerRadius = Math.max(2, outerRadius - stickerInset * 0.5);

    // Outer dark Magic Cube bezel (shimmering prism border if isMagic)
    ctx.fillStyle = '#070B14';
    this.roundRectPath(ctx, drawX, drawY, drawW, drawH, outerRadius);
    ctx.fill();

    if (isMagic) {
      const hue = (this.pulseClock * 200) % 360;
      ctx.strokeStyle = `hsl(${hue}, 95%, 68%)`;
      ctx.lineWidth = 2;
      this.roundRectPath(ctx, drawX + 0.5, drawY + 0.5, drawW - 1, drawH - 1, outerRadius);
      ctx.stroke();
    }

    const sx = drawX + stickerInset;
    const sy = drawY + stickerInset;
    const sw = drawW - stickerInset * 2;
    const sh = drawH - stickerInset * 2;

    if (isMagic) {
      const hue = (this.pulseClock * 200) % 360;
      const grad = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      grad.addColorStop(0, `hsl(${hue}, 88%, 56%)`);
      grad.addColorStop(1, `hsl(${(hue + 80) % 360}, 88%, 50%)`);
      ctx.fillStyle = grad;
      this.roundRectPath(ctx, sx, sy, sw, sh, innerRadius);
      ctx.fill();

      // Crisp 4-point star emblem at center of Magic Cube face
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const rOuter = Math.min(sw, sh) * 0.34;
      const rInner = rOuter * 0.35;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? rOuter : rInner;
        const angle = (i * Math.PI) / 4;
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = palette.face;
      this.roundRectPath(ctx, sx, sy, sw, sh, innerRadius);
      ctx.fill();

      // Top-left bevel highlight
      ctx.fillStyle = palette.light;
      ctx.fillRect(sx + innerRadius * 0.5, sy, sw - innerRadius, Math.max(1.5, cs * 0.07));
      ctx.fillRect(sx, sy + innerRadius * 0.5, Math.max(1.5, cs * 0.07), sh - innerRadius);

      // Bottom-right bevel shadow
      ctx.fillStyle = palette.dark;
      ctx.fillRect(
        sx + innerRadius * 0.5,
        sy + sh - Math.max(1.5, cs * 0.08),
        sw - innerRadius,
        Math.max(1.5, cs * 0.08)
      );
      ctx.fillRect(
        sx + sw - Math.max(1.5, cs * 0.08),
        sy + innerRadius * 0.5,
        Math.max(1.5, cs * 0.08),
        sh - innerRadius
      );
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.55})`;
      this.roundRectPath(ctx, sx, sy, sw, sh, innerRadius);
      ctx.fill();
    }

    if (isBreach) {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      this.roundRectPath(ctx, drawX, drawY, drawW, drawH, outerRadius);
      ctx.stroke();
    }
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
