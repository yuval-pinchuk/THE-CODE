import { FormEvent, useState } from "react";
import type { Difficulty } from "@shared/types";
import TurnTimeControl from "../components/TurnTimeControl";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

type Props = {
  initialName: string;
  initialDifficulty: Difficulty;
  initialTurnSeconds: number;
  lockName?: boolean;
  busy: boolean;
  error: string | null;
  startLabel: string;
  onStart: (name: string, difficulty: Difficulty, turnSeconds: number) => void;
  onBack?: () => void;
  backLabel?: string;
};

export default function VsSetup({
  initialName,
  initialDifficulty,
  initialTurnSeconds,
  lockName,
  busy,
  error,
  startLabel,
  onStart,
  onBack,
  backLabel = "Back",
}: Props) {
  const [name, setName] = useState(initialName);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [turnSeconds, setTurnSeconds] = useState(initialTurnSeconds);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("ofiny_name", name.trim());
    onStart(name.trim(), difficulty, turnSeconds);
  }

  return (
    <div className="panel">
      <h2>VS Computer</h2>
      <p className="lobby-lead">
        Pick a difficulty and how long each turn lasts. The computer guesses on its
        own, and the game scores those guesses for you.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="vs-name">
          Display name
        </label>
        <input
          id="vs-name"
          className="field"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
          required
          readOnly={lockName}
          autoFocus={!lockName}
        />

        <span className="label">Difficulty</span>
        <div className="line-picker" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((level) => (
            <button
              key={level}
              type="button"
              className={`chip ${difficulty === level ? "selected" : ""}`}
              onClick={() => setDifficulty(level)}
            >
              {level[0].toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        <TurnTimeControl
          id="vs-time"
          seconds={turnSeconds}
          onChange={setTurnSeconds}
        />

        <button className="btn btn-coral" type="submit" disabled={busy}>
          {startLabel}
        </button>
      </form>
      {onBack ? (
        <>
          <div style={{ height: "0.65rem" }} />
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
              {backLabel}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
