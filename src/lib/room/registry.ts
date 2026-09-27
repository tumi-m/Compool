import { RoomLog } from './events';

/**
 * One log per room, held on the instance.
 *
 * Deliberately module-scoped: in this deployment the room is per-instance, which
 * is enough to demonstrate and test the transport contract (seq, replay,
 * heartbeat) but not enough to fan out across instances. The production shape is
 * Postgres for the append-only record plus one Redis pub/sub channel per room —
 * swap this module and nothing above it changes.
 */
const rooms = new Map<string, RoomLog>();

export function roomLog(id: string): RoomLog {
  let log = rooms.get(id);
  if (!log) {
    log = new RoomLog();
    rooms.set(id, log);
  }
  return log;
}

export function roomIds(): string[] {
  return [...rooms.keys()];
}
