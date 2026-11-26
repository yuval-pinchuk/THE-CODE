import { FormEvent, useState } from "react";
import type { PlayerChoice, TimeChoice } from "@shared/types";
import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS, TIME_CHOICES } from "@shared/types";

const PLAYER_OPTIONS: PlayerChoice[] = [
  "any",
  ...Array.from(
    { length: MATCH_MAX_PLAYERS - MATCH_MIN_PLAYERS + 1 },
    (_, i) => MATCH_MIN_PLAYERS + i,
  ),
];

type Props = {
  initialName: string;
  busy: boolean;
  error: string | null;
  onStart: (name: string, players: PlayerChoice, timeChoice: TimeChoice) => void;
  onBack: () => void;
};

export default function FindGame({ initialName, busy, error, onStart, onBack }: Props) {
  const [name, setName] = useState(initialName);
  const [players, setPlayers] = useState<PlayerChoice>("any");
  const [timeChoice, setTimeChoice] = useState<TimeChoice>("any");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("ofiny_name", name.trim());
    onStart(name.trim(), players, timeChoice);
  }

  return (
    <div className="panel">
      <h2>Join random game</h2>
      <p className="lobby-lead">
        Tell us what you’d like and we’ll put you in a room with players who want the same.
        “Any” means you don’t mind.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="find-name">
          Display name
        </label>
        <input
          id="find-name"
          className="field"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
          required
          autoFocus
        />

        <span className="label">Players</span>
        <div className="line-picker" role="radiogroup" aria-label="Number of players">
          {PLAYER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={players === option}
              className={`chip ${players === option ? "selected" : ""}`}
              onClick={() => setPlayers(option)}
            >
              {option === "any" ? "Any" : option}
            </button>
          ))}
        </div>

        <span className="label">Turn time</span>
        <div className="line-picker" role="radiogroup" aria-label="Turn time">
          {TIME_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={timeChoice === choice.id}
              className={`chip chip-stacked ${timeChoice === choice.id ? "selected" : ""}`}
              onClick={() => setTimeChoice(choice.id)}
            >
              <span>{choice.label}</span>
              <small>{choice.sublabel}</small>
            </button>
          ))}
        </div>

        <button className="btn btn-coral" type="submit" disabled={busy}>
          {busy ? "Looking…" : "Start looking for rooms"}
        </button>
      </form>
      <div style={{ height: "0.65rem" }} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
      </div>
    </div>
  );
}
