import React from 'react';
import { Home, Play, RotateCcw } from 'lucide-react';
import { GameHudSnapshot } from '../game/types';

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface PauseModalProps {
  hud: GameHudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onRestart,
  onQuitToTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090d18]/88 p-5"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#111827] p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="pause-title" className="font-display text-2xl font-bold text-white">
            遊戲暫停
          </h2>
          <p className="text-sm text-slate-400">
            計時與背景音樂已暫停，隨時可恢復堆疊挑戰。
          </p>
        </div>

        <div className="flex items-center justify-between border-y border-slate-800 py-3 text-xs text-slate-400">
          <span>
            分數 <strong className="font-mono-num text-sm text-white ml-1">{hud.score.toLocaleString()}</strong>
          </span>
          <span>
            速度 <strong className="font-mono-num text-sm text-sky-400 ml-1">{hud.dropSpeed.toFixed(2)}/s</strong>
          </span>
          <span>
            時間 <strong className="font-mono-num text-sm text-slate-200 ml-1">{formatElapsed(hud.elapsedSeconds)}</strong>
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-base flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>繼續遊戲</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-slate-100 font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重新開始</span>
          </button>

          <button
            type="button"
            onClick={onQuitToTitle}
            className="min-h-[44px] w-full rounded-xl text-slate-400 hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>返回主選單</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  hud: GameHudSnapshot;
  isNewBest: boolean;
  onPlayAgain: () => void;
  onQuitToTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  hud,
  isNewBest,
  onPlayAgain,
  onQuitToTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090d18]/90 p-5"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#111827] p-6 shadow-2xl flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="gameover-title" className="font-display text-2xl font-bold text-white">
              堆疊觸及警戒線
            </h2>
            {isNewBest && (
              <span className="text-xs font-semibold text-amber-400 whitespace-nowrap">
                新紀錄達成
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            方塊疊高至上方等待掉落處，本局挑戰結束。
          </p>
        </div>

        {/* Clean Unboxed Stats Grid */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-y border-slate-800 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400">最終分數</span>
            <span className="font-mono-num text-2xl font-bold text-white">
              {hud.score.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400">歷史最高</span>
            <span className="font-mono-num text-2xl font-bold text-amber-400">
              {hud.bestScore.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400">消除平行線</span>
            <span className="font-mono-num text-lg font-semibold text-slate-100">
              {hud.lines} 行
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400">存活時間 / 最高速度</span>
            <span className="font-mono-num text-lg font-semibold text-slate-100">
              {formatElapsed(hud.elapsedSeconds)} · {hud.dropSpeed.toFixed(1)}/s
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>再玩一次</span>
          </button>

          <button
            type="button"
            onClick={onQuitToTitle}
            className="min-h-[44px] w-full rounded-xl border border-slate-800 hover:bg-slate-800/70 text-slate-300 hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>返回主選單</span>
          </button>
        </div>
      </div>
    </div>
  );
};
