import { useState } from "react";
import { alertsStatus, disableAlerts, enableAlerts, type AlertsStatus } from "../pushAlerts";

export default function TurnAlertsToggle() {
  const [status, setStatus] = useState<AlertsStatus>(() => alertsStatus());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (status === "unsupported") return null;

  async function toggle() {
    setBusy(true);
    setMessage(null);
    if (status === "on") {
      await disableAlerts();
      setStatus(alertsStatus());
    } else {
      const error = await enableAlerts();
      if (error) setMessage(error);
      setStatus(alertsStatus());
    }
    setBusy(false);
  }

  if (status === "ios-needs-home-screen") {
    return (
      <p className="turn-alerts-hint">
        For turn alerts on iPhone: tap Share → Add to Home Screen, then open PIN CODE from there.
      </p>
    );
  }

  if (status === "blocked") {
    return (
      <p className="turn-alerts-hint">
        Notifications are blocked for this site. Allow them in your browser settings to get turn alerts.
      </p>
    );
  }

  return (
    <div className="turn-alerts">
      <button
        type="button"
        className={`turn-alerts-btn ${status === "on" ? "on" : ""}`}
        disabled={busy}
        onClick={toggle}
      >
        {status === "on" ? "Turn alerts: On" : "Turn alerts: Off — tap to enable"}
      </button>
      {message ? <p className="turn-alerts-hint">{message}</p> : null}
    </div>
  );
}
