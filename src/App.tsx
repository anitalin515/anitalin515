import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GameOverModal, PauseModal } from './components/GameModals';
import { NextPiecePreview } from './components/NextPiecePreview';
import { TitleScreen } from './components/TitleScreen';
import { SoundEngine } from './game/audio';
import { CubeStackEngine } from './game/engine';
import { SHAPES } from './game/shapes';
import { GameHudSnapshot, GameState } from './game/types';

const BEST_SCORE_KEY = 'cubix_stack_best_score_v1';
const MUTE_KEY = 'cubix_stack_muted_v1';

function readInitialBest(): number {
  try {
    return Math.max(0, parseInt(localStorage.getItem(BEST_SCORE_KEY) || '0', 10) || 0);
  } catch {
    return 0;
  }
}

function readInitialMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const INITIAL_HUD: GameHudSnapshot = {
  score: 0,
  bestScore: readInitialBest(),
  lines: 0,
  combo: 0,
  maxCombo: 0,
  level: 1,
  dropSpeed: 2.0,
  elapsedSeconds: 0,
  stackHeight: 0,
  nearDanger: false,
  nextShape: SHAPES.T,
  activeIsMagic: false,
  dropsCount: 0,
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [muted, setMuted] = useState<boolean>(readInitialMute);
  const [hud, setHud] = useState<GameHudSnapshot>(INITIAL_HUD);
  const [isNewBest, setIsNewBest] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CubeStackEngine | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);

  const gameStateRef = useRef<GameState>(gameState);
  const bestBeforeRunRef = useRef<number>(INITIAL_HUD.bestScore);

  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const heldKeyDirRef = useRef<-1 | 1 | 0>(0);

  useEffect(() => {
    gameStateRef.current = gameState;
    engineRef.current?.setGameState(gameState);
  }, [gameState]);

  const clearHoldRepeat = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    heldKeyDirRef.current = 0;
  }, []);

  if (!soundRef.current) {
    soundRef.current = new SoundEngine(muted);
  }

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundRef.current?.setMuted(next);
      try {
        localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const startGame = useCallback(() => {
    clearHoldRepeat();
    bestBeforeRunRef.current = readInitialBest();
    setIsNewBest(false);
    setGameState('PLAYING');

    if (engineRef.current) {
      engineRef.current.startNewGame();
    }
  }, [clearHoldRepeat]);

  const pauseGame = useCallback(() => {
    if (gameStateRef.current === 'PLAYING') {
      clearHoldRepeat();
      setGameState('PAUSED');
    }
  }, [clearHoldRepeat]);

  const resumeGame = useCallback(() => {
    if (gameStateRef.current === 'PAUSED') {
      setGameState('PLAYING');
    }
  }, []);

  const togglePause = useCallback(() => {
    if (gameStateRef.current === 'PLAYING') {
      pauseGame();
    } else if (gameStateRef.current === 'PAUSED') {
      resumeGame();
    }
  }, [pauseGame, resumeGame]);

  const quitToTitle = useCallback(() => {
    clearHoldRepeat();
    setGameState('TITLE_MENU');
    setHud((prev) => ({ ...prev, bestScore: readInitialBest() }));
  }, [clearHoldRepeat]);

  useEffect(() => {
    if (gameState === 'TITLE_MENU') {
      engineRef.current?.destroy();
      engineRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    const container = boardContainerRef.current;
    const sound = soundRef.current;
    if (!canvas || !container || !sound) return;

    const engine = new CubeStackEngine(canvas, sound, {
      onHudChange: (snapshot) => {
        setHud(snapshot);
      },
      onGameOver: (snapshot) => {
        setHud(snapshot);
        setIsNewBest(
          snapshot.score > 0 && snapshot.score > bestBeforeRunRef.current
        );
        setGameState('GAME_OVER');
      },
    });

    engineRef.current = engine;
    engine.resize();
    engine.startLoop();
    engine.startNewGame();

    const observer = new ResizeObserver(() => {
      engine.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState === 'TITLE_MENU']);

  const startMoveHold = useCallback(
    (dir: -1 | 1) => {
      if (gameStateRef.current !== 'PLAYING') return;
      clearHoldRepeat();
      heldKeyDirRef.current = dir;
      engineRef.current?.moveHorizontal(dir);
      holdTimerRef.current = window.setTimeout(() => {
        holdIntervalRef.current = window.setInterval(() => {
          if (gameStateRef.current === 'PLAYING') {
            engineRef.current?.moveHorizontal(dir);
          }
        }, 65);
      }, 170);
    },
    [clearHoldRepeat]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
        return;
      }

      const currentState = gameStateRef.current;

      if (currentState === 'TITLE_MENU' || currentState === 'GAME_OVER') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        togglePause();
        return;
      }

      if (currentState !== 'PLAYING') return;

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        if (!e.repeat && heldKeyDirRef.current !== -1) {
          startMoveHold(-1);
        }
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        if (!e.repeat && heldKeyDirRef.current !== 1) {
          startMoveHold(1);
        }
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (!e.repeat) {
          engineRef.current?.rotatePiece();
        }
      } else if (
        e.code === 'Space' ||
        e.code === 'ArrowDown' ||
        e.code === 'KeyS' ||
        e.code === 'Enter'
      ) {
        e.preventDefault();
        if (!e.repeat) {
          engineRef.current?.dropPiece();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        (e.code === 'ArrowLeft' || e.code === 'KeyA') &&
        heldKeyDirRef.current === -1
      ) {
        clearHoldRepeat();
      } else if (
        (e.code === 'ArrowRight' || e.code === 'KeyD') &&
        heldKeyDirRef.current === 1
      ) {
        clearHoldRepeat();
      }
    };

    const handleWindowBlur = () => {
      clearHoldRepeat();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      clearHoldRepeat();
    };
  }, [clearHoldRepeat, startGame, startMoveHold, toggleMute, togglePause]);

  if (gameState === 'TITLE_MENU') {
    return (
      <TitleScreen
        bestScore={hud.bestScore}
        muted={muted}
        onToggleMute={toggleMute}
        onStart={startGame}
      />
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#090d18] text-slate-50 flex flex-col select-none">
      {/* Compact Top Perimeter HUD (<= 52px on mobile, explicit Pause button) */}
      <header className="h-[52px] shrink-0 pt-safe px-3 sm:px-6 border-b border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-5 min-w-0">
          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-[11px] sm:text-xs text-slate-400">分數</span>
            <span className="font-mono-num text-sm sm:text-lg font-bold text-white">
              {hud.score.toLocaleString()}
            </span>
          </div>

          <span className="text-slate-700" aria-hidden="true">/</span>

          <div className="flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-[11px] sm:text-xs text-slate-400">消除</span>
            <span className="font-mono-num text-sm sm:text-base font-semibold text-slate-200">
              {hud.lines}
            </span>
          </div>

          <span className="hidden xs:inline text-slate-700" aria-hidden="true">/</span>

          <div className="hidden xs:flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-[11px] sm:text-xs text-slate-400">速度</span>
            <span className="font-mono-num text-xs sm:text-sm font-semibold text-sky-400">
              {hud.dropSpeed.toFixed(1)}/s
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Compact mobile next-piece indicator */}
          <div className="lg:hidden flex items-center gap-1.5 pr-1.5 border-r border-slate-800">
            <span
              className={`text-[11px] whitespace-nowrap ${
                hud.nextShape.isMagic ? 'text-sky-400 font-semibold' : 'text-slate-400'
              }`}
            >
              {hud.nextShape.isMagic ? '魔術' : '下一個'}
            </span>
            <div className="w-9 h-7 flex items-center justify-center">
              <NextPiecePreview shape={hud.nextShape} cellPx={9} />
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? '開啟音效與背景音樂' : '靜音'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={togglePause}
            aria-label={gameState === 'PAUSED' ? '繼續遊戲' : '暫停遊戲'}
            className="min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-100 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            {gameState === 'PAUSED' ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>繼續</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>暫停</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Playfield Area */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-10 px-2 sm:px-6 py-2 sm:py-4">
        {/* Desktop Left Telemetry */}
        <aside className="hidden lg:flex flex-col gap-6 w-52 shrink-0 text-left">
          <div className="flex flex-col gap-1 border-b border-slate-800 pb-4">
            <span className="text-xs text-slate-400">存活時間 · 降落速度</span>
            <div className="flex items-baseline gap-2.5 font-mono-num text-lg font-bold">
              <span className="text-white">{formatElapsed(hud.elapsedSeconds)}</span>
              <span className="text-slate-600">·</span>
              <span className="text-sky-400">{hud.dropSpeed.toFixed(2)} 格/秒</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-b border-slate-800 pb-4">
            <span className="text-xs text-slate-400">最高紀錄 · 連擊</span>
            <div className="flex items-baseline gap-2 font-mono-num text-lg font-semibold text-slate-100">
              <span className="text-amber-400">{hud.bestScore.toLocaleString()}</span>
              <span className="text-slate-600">·</span>
              <span className={hud.combo > 1 ? 'text-amber-300' : 'text-slate-300'}>
                ×{hud.combo}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-slate-400 leading-relaxed">
            <span className="text-slate-200 font-medium">操作說明</span>
            <span>← / → 或拖曳：左右移動</span>
            <span>↑ / W / 右鍵：旋轉方塊</span>
            <span>空白鍵 / 點擊：立即急降</span>
            <span>P / Esc：暫停 · M：靜音</span>
          </div>
        </aside>

        {/* Isolated Canvas Stage */}
        <div
          ref={boardContainerRef}
          className="relative flex-1 min-h-0 w-full max-w-[440px] lg:max-w-[460px] lg:h-full flex items-center justify-center"
        >
          <div
            className={`relative rounded-xl border ${
              hud.nearDanger
                ? 'border-red-500/60 shadow-[0_0_28px_rgba(239,68,68,0.18)]'
                : hud.activeIsMagic
                  ? 'border-sky-400/50 shadow-[0_0_24px_rgba(56,189,248,0.15)]'
                  : 'border-slate-800 shadow-2xl'
            } bg-[#0d1322] overflow-hidden transition-colors`}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                if (e.button === 2) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                engineRef.current?.handlePointerDown(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                engineRef.current?.handlePointerMove(e.clientX);
              }}
              onPointerUp={(e) => {
                if (e.button === 2) return;
                engineRef.current?.handlePointerUp(e.clientY);
              }}
              onPointerCancel={() => {
                engineRef.current?.handlePointerCancel();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                engineRef.current?.rotatePiece();
              }}
              className="block touch-none cursor-pointer"
            />
          </div>
        </div>

        {/* Desktop Right Side: Next Piece + Controls */}
        <aside className="hidden lg:flex flex-col gap-5 w-52 shrink-0">
          <div className="flex flex-col gap-2.5 rounded-xl border border-slate-800 bg-[#0d1322] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">下一個方塊</span>
              {hud.nextShape.isMagic && (
                <span className="text-xs font-semibold text-sky-400">魔術消行</span>
              )}
            </div>
            <div className="h-20 flex items-center justify-center">
              <NextPiecePreview shape={hud.nextShape} cellPx={20} />
            </div>
            {hud.nextShape.isMagic && (
              <p className="text-[11px] text-slate-400 leading-snug">
                落地後自動消除所在的整條平行線
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onPointerDown={() => startMoveHold(-1)}
                onPointerUp={clearHoldRepeat}
                onPointerLeave={clearHoldRepeat}
                onPointerCancel={clearHoldRepeat}
                aria-label="向左移動"
                className="min-h-[44px] rounded-xl border border-slate-800 bg-[#0d1322] hover:bg-slate-800 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.rotatePiece()}
                aria-label="旋轉方塊"
                className="min-h-[44px] rounded-xl border border-slate-800 bg-[#0d1322] hover:bg-slate-800 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onPointerDown={() => startMoveHold(1)}
                onPointerUp={clearHoldRepeat}
                onPointerLeave={clearHoldRepeat}
                onPointerCancel={clearHoldRepeat}
                aria-label="向右移動"
                className="min-h-[44px] rounded-xl border border-slate-800 bg-[#0d1322] hover:bg-slate-800 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => engineRef.current?.dropPiece()}
              className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ArrowDownToLine className="w-5 h-5" />
              <span>立即急降</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile Bottom Ergonomic Thumb Zone Controls */}
      <div className="lg:hidden shrink-0 px-3 pb-safe pt-1.5 pb-2 border-t border-slate-800/80 bg-[#090d18]">
        <div className="mx-auto max-w-[440px] grid grid-cols-5 gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              startMoveHold(-1);
            }}
            onPointerUp={clearHoldRepeat}
            onPointerLeave={clearHoldRepeat}
            onPointerCancel={clearHoldRepeat}
            aria-label="向左移動"
            className="min-h-[52px] rounded-xl border border-slate-800 bg-[#111827] active:bg-slate-800 text-slate-100 flex items-center justify-center transition-colors touch-none cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={() => engineRef.current?.rotatePiece()}
            aria-label="旋轉方塊"
            className="min-h-[52px] rounded-xl border border-slate-800 bg-[#111827] active:bg-slate-800 text-slate-100 flex items-center justify-center transition-colors touch-none cursor-pointer"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              startMoveHold(1);
            }}
            onPointerUp={clearHoldRepeat}
            onPointerLeave={clearHoldRepeat}
            onPointerCancel={clearHoldRepeat}
            aria-label="向右移動"
            className="min-h-[52px] rounded-xl border border-slate-800 bg-[#111827] active:bg-slate-800 text-slate-100 flex items-center justify-center transition-colors touch-none cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={() => engineRef.current?.dropPiece()}
            className="col-span-2 min-h-[52px] rounded-xl bg-amber-500 active:bg-amber-400 active:scale-[0.98] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-1.5 transition-all whitespace-nowrap touch-none cursor-pointer"
          >
            <ArrowDownToLine className="w-5 h-5" />
            <span>急降</span>
          </button>
        </div>
      </div>

      {/* Pause & Game Over Modals */}
      {gameState === 'PAUSED' && (
        <PauseModal
          hud={hud}
          onResume={resumeGame}
          onRestart={startGame}
          onQuitToTitle={quitToTitle}
        />
      )}

      {gameState === 'GAME_OVER' && (
        <GameOverModal
          hud={hud}
          isNewBest={isNewBest}
          onPlayAgain={startGame}
          onQuitToTitle={quitToTitle}
        />
      )}
    </div>
  );
}
