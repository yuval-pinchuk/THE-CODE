const NOTES_PREFIX = "ofiny_notes_";

export function notesStorageKey(roomCode: string, playerId: string, roundId: string) {
  return `${NOTES_PREFIX}${roomCode}_${playerId}_${roundId}`;
}

/** Remove all deduction-board keys for a room (any player/round). */
export function clearRoomNotes(roomCode: string) {
  const prefix = `${NOTES_PREFIX}${roomCode}_`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) toRemove.push(key);
  }
  for (const key of toRemove) localStorage.removeItem(key);
}
