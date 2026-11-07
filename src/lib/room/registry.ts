import { RoomLog } from './events';

/**
 * One log per room, held on the instance.
 *
 * Deliberately module-scoped: in this deployment the room is per-instance, which
 * is enough to demonstrate and test the transport contract (seq, replay,
 * heartbeat) but not enough to fan out across instances. The production shape is
 * Postgres for the append-only record plus one Redis pub/sub channel per room —
 * swap this module and nothing above it changes.
 *
 * Bounded, because it is reachable by anyone: every request used to create a
 * room for whatever id it named, reads included, with no limit on how many —
 * a loop of GETs to random ids was enough to grow the instance's memory without
 * end. Ids are now plain short names, reading never creates, and the instance
 * holds at most MAX_ROOMS, evicting the longest-idle room nobody is watching.
 */
export const ROOM_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MAX_ROOMS = 200;

const rooms = new Map<string, RoomLog>();

export function isRoomId(id: string): boolean {
  return ROOM_ID_RE.test(id);
}

/** The room if it exists. Never creates one. */
export function getRoom(id: string): RoomLog | null {
  return isRoomId(id) ? (rooms.get(id) ?? null) : null;
}

/**
 * The room, created if needed — for writes and live subscriptions only. Null
 * when the id is not a room name, or when the instance is full of rooms that
 * all have someone watching them.
 */
export function openRoom(id: string): RoomLog | null {
  if (!isRoomId(id)) return null;
  const existing = rooms.get(id);
  if (existing) return existing;
  if (rooms.size >= MAX_ROOMS && !evictIdle()) return null;
  const log = new RoomLog();
  rooms.set(id, log);
  return log;
}

function evictIdle(): boolean {
  let victim: string | null = null;
  let oldest = Infinity;
  for (const [id, log] of rooms) {
    if (log.subscriberCount === 0 && log.lastActive < oldest) {
      oldest = log.lastActive;
      victim = id;
    }
  }
  if (victim === null) return false;
  rooms.delete(victim);
  return true;
}

export function roomIds(): string[] {
  return [...rooms.keys()];
}
