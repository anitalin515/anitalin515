import React from 'react';
import { CUBE_PALETTE } from '../game/shapes';
import { ShapeDefinition } from '../game/types';

interface NextPiecePreviewProps {
  shape: ShapeDefinition;
  cellPx?: number;
}

export const NextPiecePreview: React.FC<NextPiecePreviewProps> = ({
  shape,
  cellPx = 16,
}) => {
  const rows = shape.matrix.length;
  const cols = shape.matrix[0].length;
  const palette = CUBE_PALETTE[shape.color];
  const width = cols * cellPx;
  const height = rows * cellPx;
  const isMagic = Boolean(shape.isMagic);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block shrink-0"
      aria-label={isMagic ? `特殊魔術方塊 ${shape.id}` : `下一個方塊 ${shape.id}`}
    >
      {isMagic && (
        <defs>
          <linearGradient id="magic-preview-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#FDE047" />
            <stop offset="100%" stopColor="#F472B6" />
          </linearGradient>
        </defs>
      )}
      {shape.matrix.map((row, r) =>
        row.map((val, c) => {
          if (!val) return null;
          const x = c * cellPx + 1;
          const y = r * cellPx + 1;
          const s = cellPx - 2;
          const inset = Math.max(1.5, cellPx * 0.12);
          const cx = x + s / 2;
          const cy = y + s / 2;
          const starR = s * 0.22;

          return (
            <g key={`${r}-${c}`}>
              <rect
                x={x}
                y={y}
                width={s}
                height={s}
                rx={Math.max(2, cellPx * 0.16)}
                fill="#070B14"
                stroke={isMagic ? '#38BDF8' : undefined}
                strokeWidth={isMagic ? 1 : undefined}
              />
              <rect
                x={x + inset}
                y={y + inset}
                width={s - inset * 2}
                height={s - inset * 2}
                rx={Math.max(1.5, cellPx * 0.1)}
                fill={isMagic ? 'url(#magic-preview-grad)' : palette.face}
              />
              {isMagic ? (
                <polygon
                  points={`${cx},${cy - starR} ${cx + starR * 0.38},${cy - starR * 0.38} ${cx + starR},${cy} ${cx + starR * 0.38},${cy + starR * 0.38} ${cx},${cy + starR} ${cx - starR * 0.38},${cy + starR * 0.38} ${cx - starR},${cy} ${cx - starR * 0.38},${cy - starR * 0.38}`}
                  fill="#FFFFFF"
                />
              ) : (
                <rect
                  x={x + inset + 1}
                  y={y + inset}
                  width={Math.max(1, s - inset * 2 - 2)}
                  height={1.5}
                  fill={palette.light}
                />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
};
