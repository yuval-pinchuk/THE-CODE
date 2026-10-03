export function readRoomFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("room")?.trim() ?? "";
  return /^\d{4}$/.test(code) ? code : null;
}

export function setRoomInUrl(roomCode: string | null) {
  const url = new URL(window.location.href);
  if (roomCode) url.searchParams.set("room", roomCode);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function roomInviteUrl(roomCode: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomCode);
  return url.toString();
}
