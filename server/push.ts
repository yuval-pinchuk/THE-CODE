import webpush from "web-push";
import type { Room } from "./rooms.js";

/** Browser push subscription as produced by PushSubscription.toJSON(). */
export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

interface PushEntry {
  roomCode: string;
  subscription: PushSubscriptionData;
  /** Turn key we already pinged for, so one turn sends at most one push. */
  lastNotifiedKey: string | null;
}

/** Keyed by player id. In-memory, like room state. */
const entries = new Map<string, PushEntry>();

const TURN_PUSH_TTL_SECONDS = 60 * 60;

let publicKey = "";

function initVapid(): void {
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;

  if (pub && priv) {
    publicKey = pub;
    webpush.setVapidDetails(subject, pub, priv);
    return;
  }

  // Dev fallback: fresh keys each start. Browsers re-subscribe automatically on rejoin.
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  console.warn(
    "[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set; using temporary keys. Set them so push keeps working across restarts.",
  );
}

initVapid();

export function getVapidPublicKey(): string {
  return publicKey;
}

function isSubscription(value: unknown): value is PushSubscriptionData {
  if (!value || typeof value !== "object") return false;
  const sub = value as Partial<PushSubscriptionData>;
  if (typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) return false;
  const keys = sub.keys as Partial<PushSubscriptionData["keys"]> | undefined;
  return typeof keys?.p256dh === "string" && typeof keys?.auth === "string";
}

export function saveSubscription(
  room: Room,
  playerId: string,
  raw: unknown,
): { ok: true } | { ok: false; error: string } {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.isBot) return { ok: false, error: "Player not in room." };
  if (!isSubscription(raw)) return { ok: false, error: "Invalid push subscription." };

  entries.set(playerId, {
    roomCode: room.code,
    subscription: {
      endpoint: raw.endpoint,
      expirationTime: raw.expirationTime ?? null,
      keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
    },
    lastNotifiedKey: null,
  });
  return { ok: true };
}

export function removeSubscription(playerId: string): void {
  entries.delete(playerId);
}

/** Call when a room is deleted so its subscriptions don't linger. */
export function dropRoomSubscriptions(roomCode: string): void {
  for (const [playerId, entry] of entries) {
    if (entry.roomCode === roomCode) entries.delete(playerId);
  }
}

async function send(playerId: string, entry: PushEntry, payload: object): Promise<void> {
  try {
    await webpush.sendNotification(entry.subscription, JSON.stringify(payload), {
      TTL: TURN_PUSH_TTL_SECONDS,
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404 / 410: the browser dropped the subscription. Forget it.
    if (status === 404 || status === 410) {
      entries.delete(playerId);
    } else {
      console.warn("[push] send failed", status ?? err);
    }
  }
}

/**
 * Ping the current turn player if they are a disconnected human (the game is
 * paused waiting on them). Runs after every state broadcast, so it also covers
 * turns that advance on timers or bots.
 */
export function notifyTurnPlayers(room: Room): void {
  for (const [playerId, entry] of entries) {
    if (entry.roomCode === room.code && !room.players.some((p) => p.id === playerId)) {
      entries.delete(playerId);
    }
  }

  if (room.phase !== "playing" || !room.turnPlayerId) return;
  const current = room.players.find((p) => p.id === room.turnPlayerId);
  if (!current || current.isBot || current.connected) return;

  const entry = entries.get(current.id);
  if (!entry || entry.roomCode !== room.code) return;

  const key = `${room.roundId}:${room.turnPlayerId}:${room.turnSerial}`;
  if (entry.lastNotifiedKey === key) return;
  entry.lastNotifiedKey = key;

  void send(current.id, entry, {
    title: "PIN CODE",
    body: `It's your turn in room ${room.code}`,
    tag: `turn-${room.code}`,
    url: "/",
  });
}
