import { getPushKey, removePushSubscription, savePushSubscription } from "./socket";

const FLAG_KEY = "ofiny_turn_alerts";

export type AlertsStatus =
  | "unsupported"
  | "ios-needs-home-screen"
  | "blocked"
  | "off"
  | "on";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function alertsSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function alertsStatus(): AlertsStatus {
  if (!alertsSupported()) {
    // iOS only exposes web push to sites added to the Home Screen.
    return isIos() && !isStandalone() ? "ios-needs-home-screen" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const wanted = localStorage.getItem(FLAG_KEY) === "1";
  return wanted && Notification.permission === "granted" ? "on" : "off";
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameAppServerKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  if (bytes.length !== key.length) return false;
  return bytes.every((b, i) => b === key[i]);
}

/** Make sure this browser has a subscription the server knows about. */
async function ensureSubscription(): Promise<string | null> {
  const keyRes = await getPushKey();
  if (!keyRes.ok) return keyRes.error;

  const appKey = urlBase64ToUint8Array(keyRes.publicKey);
  const reg = await readyRegistration();
  let sub = await reg.pushManager.getSubscription();
  // The server's VAPID key changed (e.g. restart without env keys): resubscribe.
  if (sub && !sameAppServerKey(sub, appKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    });
  }

  const saved = await savePushSubscription(sub.toJSON());
  return saved.ok ? null : saved.error;
}

/** Turn on alerts. Must be called from a user tap (asks for permission). */
export async function enableAlerts(): Promise<string | null> {
  if (!alertsSupported()) return "Turn alerts aren’t supported in this browser.";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return "Allow notifications for this site to get turn alerts.";
    }
    const error = await ensureSubscription();
    if (error) return error;
    localStorage.setItem(FLAG_KEY, "1");
    return null;
  } catch {
    return "Couldn’t turn on alerts. Try again.";
  }
}

export async function disableAlerts(): Promise<void> {
  localStorage.removeItem(FLAG_KEY);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    // Best effort: the server prunes dead subscriptions on its own.
  }
  await removePushSubscription();
}

/** Re-send the subscription after joining or reconnecting. Silent if alerts are off. */
export async function syncAlerts(): Promise<void> {
  if (!alertsSupported()) return;
  if (localStorage.getItem(FLAG_KEY) !== "1") return;
  if (Notification.permission !== "granted") return;
  try {
    await ensureSubscription();
  } catch {
    // Retried on the next join or reconnect.
  }
}
