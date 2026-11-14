import React, { useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import BACKDROP_URL from '../assets/images/magic_cube_backdrop_1794646377147.jpg';

interface TitleScreenProps {
  bestScore: number;
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  bestScore,
  muted,
  onToggleMute,
  onStart,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#090d18] text-slate-50 flex flex-col justify-between">
      {/* Full-bleed Illustrated Key Art Backdrop with CSS Fallback */}
      {!imgError ? (
        <img
          src={BACKDROP_URL}
          alt="魔術方塊疊疊樂視覺背景"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover object-center lg:object-[72%_center] pointer-events-none select-none"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_72%_60%,rgba(37,99,235,0.22),transparent_48%),radial-gradient(circle_at_20%_25%,rgba(234,179,8,0.12),transparent_42%)]"
        />
      )}

      {/* Measured Contrast Scrim keeping calm negative space on left & top */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#090d18]/90 via-[#090d18]/72 to-[#090d18]/95 lg:bg-gradient-to-r lg:from-[#090d18]/95 lg:via-[#090d18]/78 lg:to-[#090d18]/25 pointer-events-none"
      />

      {/* Minimal Top Utility Row */}
      <div className="relative z-10 flex items-center justify-between px-5 sm:px-10 pt-safe pt-4">
        <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-400">
          <span>2D 幾何益智街機</span>
          <span aria-hidden="true">·</span>
          <span>
            最高紀錄{' '}
            <strong className="font-mono-num text-slate-100 font-semibold">
              {bestScore.toLocaleString()}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? '開啟音效與音樂' : '靜音'}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-800 bg-[#0d1322]/85 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Hero Lockup & Start CTA positioned in calm negative space */}
      <main className="relative z-10 flex-1 flex items-center px-5 sm:px-10 lg:px-16">
        <div className="w-full max-w-lg flex flex-col gap-6">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3.5">
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect x="3" y="3" width="19" height="19" rx="4" fill="#070B14" />
                <rect x="5.5" y="5.5" width="14" height="14" rx="2.5" fill="#E11D48" />
                <rect x="26" y="3" width="19" height="19" rx="4" fill="#070B14" />
                <rect x="28.5" y="5.5" width="14" height="14" rx="2.5" fill="#2563EB" />
                <rect x="3" y="26" width="19" height="19" rx="4" fill="#070B14" />
                <rect x="5.5" y="28.5" width="14" height="14" rx="2.5" fill="#EAB308" />
                <rect x="26" y="26" width="19" height="19" rx="4" fill="#070B14" />
                <rect x="28.5" y="28.5" width="14" height="14" rx="2.5" fill="#16A34A" />
              </svg>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white text-balance leading-tight">
                魔術方塊疊疊樂
              </h1>
            </div>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
              方塊將以每秒 2 格起自動降落並隨時間逐步加速。左右移動與旋轉湊滿整條水平線消除，留意隨機登場的「虹彩魔術方塊」——落地即可直接掃平所在整行！
            </p>
          </div>

          {/* Concise Unboxed Rules Summary */}
          <div className="flex flex-col gap-2 text-xs sm:text-sm text-slate-300 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-2">
              <span className="font-mono-num text-amber-400 font-semibold">01</span>
              <span>起始每秒 2 格自動降落，每 20 秒平穩加速（最高 8 格／秒）</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-num text-sky-400 font-semibold">02</span>
              <span>特殊虹彩魔術方塊隨機現身，落地直接自動消除所在平行線</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-num text-rose-400 font-semibold">03</span>
              <span>堆疊高度觸及上方警戒線時結束遊戲</span>
            </div>
          </div>

          {/* Primary Start CTA */}
          <div className="flex items-center gap-4 pt-1">
            <button
              type="button"
              onClick={onStart}
              className="min-h-[52px] px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-display font-bold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/20 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>開始遊戲</span>
            </button>
          </div>
        </div>
      </main>

      {/* Single Flat Control-Hint Line */}
      <footer className="relative z-10 px-5 sm:px-10 pb-safe pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>左右拖曳或 ◀ ▶ 移動</span>
          <span aria-hidden="true">·</span>
          <span>↻ 旋轉方塊</span>
          <span aria-hidden="true">·</span>
          <span>點擊盤面或空白鍵急降</span>
          <span aria-hidden="true">·</span>
          <span>Esc 暫停</span>
        </div>
      </footer>
    </div>
  );
};
