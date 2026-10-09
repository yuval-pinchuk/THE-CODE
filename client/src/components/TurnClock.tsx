import { useEffect, useRef, useState } from "react";

type Props = {
  deadline: number;
  urgentAt: number;
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function TurnClock({ deadline, urgentAt }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const vibrated = useRef(false);

  useEffect(() => {
    vibrated.current = false;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [deadline]);

  const remainingMs = deadline - now;
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const urgent = remainingSec <= urgentAt;

  useEffect(() => {
    if (!urgent || vibrated.current) return;
    vibrated.current = true;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([80, 40, 80]);
    }
  }, [urgent, deadline]);

  return (
    <div className={`turn-clock ${urgent ? "urgent" : ""}`} aria-live="polite">
      {formatRemaining(remainingMs)}
    </div>
  );
}
