import { createNotification } from './models.js';
import { uid } from './util.js';

const PER_USER = 300;

export function notify(db, userId, n) {
  const u = db.users.find((x) => x.id === userId);
  if (!u || u.isBot) return null;
  const item = createNotification({ userId, ...n });
  db.notifications.push(item);
  // Keep each player's inbox bounded without touching anyone else's.
  const mine = db.notifications.filter((x) => x.userId === userId);
  if (mine.length > PER_USER) {
    const drop = new Set(mine.slice(0, mine.length - PER_USER));
    db.notifications = db.notifications.filter((x) => !drop.has(x));
  }
  return item;
}

/** Public "recent winners" stream used on landing + home. */
export function feed(db, item) {
  db.feed.unshift({ id: uid('fd'), at: Date.now(), ...item });
  db.feed.length = Math.min(db.feed.length, 60);
}

export function audit(db, actorId, action, target, meta = {}, ip = null) {
  db.audit.unshift({ id: uid('aud'), at: Date.now(), actorId, action, target, meta, ip: ip || null });
  if (db.audit.length > 20000) db.audit.length = 20000;
}

export function fraudAlert(db, userId, alert) {
  const dup = db.fraud.find((f) => f.userId === userId && f.kind === alert.kind && f.status === 'open');
  if (dup) return dup;
  const f = { id: uid('frd'), userId, status: 'open', at: Date.now(), ...alert };
  db.fraud.unshift(f);
  return f;
}
