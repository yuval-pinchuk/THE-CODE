import { useEffect, useRef } from "react";
import type { CelebrationState } from "@shared/types";

type Props = {
  celebration: CelebrationState;
  viewerId: string;
  busy: boolean;
  /** False when every player still in the round has solved (restart voters ignored). */
  canContinue: boolean;
  onContinue: () => void;
  onRestart: () => void;
  onLeave: () => void;
};

function burstConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colors = ["#ff6b4a", "#2db8a2", "#f5c518", "#0b3d4a", "#ff8a6d", "#ffe56a"];
  const pieces = Array.from({ length: 90 }, () => ({
    x: w * 0.5 + (Math.random() - 0.5) * 40,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 14 - 4,
    g: 0.28 + Math.random() * 0.12,
    size: 5 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  let frame = 0;
  let raf = 0;
  const maxFrames = 120;

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of pieces) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    frame += 1;
    if (frame < maxFrames) raf = requestAnimationFrame(draw);
  }

  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

export default function SolveCelebration({
  celebration,
  viewerId,
  busy,
  canContinue,
  onContinue,
  onRestart,
  onLeave,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isSolver = celebration.solverId === viewerId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return burstConfetti(canvas);
  }, [celebration.id]);

  return (
    <div className="modal-backdrop celebration-backdrop" role="dialog" aria-modal="true">
      <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
      <div className="modal celebration-modal">
        <p className="guess-result-kicker">Code cracked!</p>
        <h2 className="celebration-title">
          {isSolver ? "You" : celebration.solverName} solved{" "}
          {celebration.targetId === viewerId ? "your" : `${celebration.targetName}’s`} code
        </h2>
        <p className="celebration-sub">
          {!canContinue
            ? "Everyone left in the round has solved — restart or leave."
            : isSolver
              ? "Continue as a spectator, wait to restart, or leave."
              : "Continue playing, wait to restart, or leave."}
        </p>
        <div className="celebration-actions">
          {canContinue ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={onContinue}
            >
              Continue
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-coral"
            disabled={busy}
            onClick={onRestart}
          >
            Restart
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onLeave}
            style={{ width: "100%" }}
          >
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
