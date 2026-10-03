import { useState } from "react";
import type { AssignmentEdge, LockedBoard, PublicPlayer } from "@shared/types";
import { COL_LABELS, ROW_LABELS } from "@shared/types";

type Props = {
  players: PublicPlayer[];
  assignments: AssignmentEdge[];
  viewerId: string;
  yourTargetId: string | null;
  playerLockedBoards: Record<string, LockedBoard>;
  onClose: () => void;
};

const EMPTY_BOARD: LockedBoard = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

export default function AssignmentCircle({
  players,
  assignments,
  viewerId,
  yourTargetId,
  playerLockedBoards,
  onClose,
}: Props) {
  const [peekId, setPeekId] = useState<string | null>(null);
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 105;
  const n = Math.max(players.length, 1);

  const positions = new Map(
    players.map((p, i) => {
      const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      return [
        p.id,
        {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
          player: p,
        },
      ] as const;
    }),
  );

  const peekPlayer = peekId ? players.find((p) => p.id === peekId) : null;
  const peekBoard = peekId ? (playerLockedBoards[peekId] ?? EMPTY_BOARD) : null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Who solves for whom"
      onClick={onClose}
    >
      <div className="modal assignment-modal" onClick={(e) => e.stopPropagation()}>
        {peekPlayer && peekBoard ? (
          <div className="assignment-peek">
            <button
              type="button"
              className="assignment-peek-close"
              aria-label="Back to who solves whom"
              onClick={() => setPeekId(null)}
            >
              ×
            </button>
            <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
              {peekPlayer.name}’s board
            </h2>
            <p style={{ color: "var(--muted)", fontWeight: 700, marginTop: 0 }}>
              Only digits they’ve locked as large.
            </p>
            <div
              className="assignment-peek-grid"
              role="img"
              aria-label={`${peekPlayer.name} locked digits`}
            >
              <div className="assignment-peek-corner" />
              {COL_LABELS.map((label) => (
                <div key={label} className="assignment-peek-label">
                  {label}
                </div>
              ))}
              {ROW_LABELS.flatMap((rowLabel, r) => [
                <div key={rowLabel} className="assignment-peek-label">
                  {rowLabel}
                </div>,
                ...peekBoard[r].map((digit, c) => (
                  <div
                    key={`${r}-${c}`}
                    className={`assignment-peek-cell ${digit !== null ? "filled" : ""}`}
                  >
                    {digit ?? ""}
                  </div>
                )),
              ])}
            </div>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
              Who solves whom
            </h2>
            <p style={{ color: "var(--muted)", fontWeight: 700, marginTop: 0 }}>
              Arrows point to the code each player is cracking. Tap a player to peek
              their locked digits.
            </p>
            <svg
              className="assignment-svg"
              viewBox={`0 0 ${size} ${size}`}
              width="100%"
              role="img"
              aria-label="Assignment circle"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--teal)" />
                </marker>
              </defs>
              {assignments.map(({ fromId, toId }) => {
                const from = positions.get(fromId);
                const to = positions.get(toId);
                if (!from || !to) return null;
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.hypot(dx, dy) || 1;
                const inset = 28;
                const x1 = from.x + (dx / len) * inset;
                const y1 = from.y + (dy / len) * inset;
                const x2 = to.x - (dx / len) * inset;
                const y2 = to.y - (dy / len) * inset;
                const highlight =
                  fromId === viewerId || toId === viewerId || toId === yourTargetId;
                return (
                  <line
                    key={`${fromId}-${toId}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={highlight ? "var(--coral)" : "var(--teal)"}
                    strokeWidth={highlight ? 3 : 2}
                    markerEnd="url(#arrowhead)"
                    opacity={0.85}
                  />
                );
              })}
              {[...positions.values()].map(({ x, y, player }) => {
                const isYou = player.id === viewerId;
                const isTarget = player.id === yourTargetId;
                return (
                  <g
                    key={player.id}
                    className={isYou ? undefined : "assignment-node-hit"}
                    role={isYou ? undefined : "button"}
                    tabIndex={isYou ? undefined : 0}
                    aria-label={
                      isYou ? undefined : `View ${player.name}’s locked digits`
                    }
                    onClick={
                      isYou
                        ? undefined
                        : () => {
                            setPeekId(player.id);
                          }
                    }
                    onKeyDown={
                      isYou
                        ? undefined
                        : (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPeekId(player.id);
                            }
                          }
                    }
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={24}
                      className={`assignment-node ${isYou ? "you" : ""} ${isTarget ? "target" : ""}`}
                    />
                    <text
                      x={x}
                      y={y + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="assignment-label"
                    >
                      {player.name.slice(0, 8)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="assignment-legend">
              <span><i className="swatch you" /> You</span>
              <span><i className="swatch target" /> Your target</span>
            </div>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
