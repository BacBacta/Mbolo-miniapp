// Stockage minimal dans un fichier JSON, suffisant pour une bêta fermée de quelques centaines de personnes.
// Pour aller plus loin : PostgreSQL (voir README).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const file = path.join(config.dataDir, 'db.json');
const empty = () => ({ users: {}, swipes: [], matches: {}, messages: {}, reports: [], blocks: [], dates: {} });

fs.mkdirSync(config.uploadsDir, { recursive: true });

let db = empty();
if (fs.existsSync(file)) {
  try {
    db = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    console.error('Base illisible, démarrage avec une base vide :', e.message);
  }
}

// Présence en mémoire : qui regarde quelle discussion en ce moment (évite les notifications inutiles)
const presence = new Map();

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }, 200);
}

export const newId = () => crypto.randomBytes(8).toString('hex');
const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

export const store = {
  // ---------- Utilisateurs ----------
  getUser: (id) => db.users[String(id)] || null,

  upsertTelegramUser(tgUser) {
    const id = String(tgUser.id);
    const existing = db.users[id];
    if (existing) {
      // Met à jour uniquement ce qui vient de Telegram, sans perdre le reste (geste en attente, profil…)
      existing.firstName = tgUser.first_name || existing.firstName;
      existing.languageCode = tgUser.language_code || existing.languageCode;
      return existing;
    }
    db.users[id] = {
      id,
      firstName: tgUser.first_name || 'Toi',
      languageCode: tgUser.language_code || 'fr',
      createdAt: Date.now(),
      profile: null,
      verification: 'none',
      pendingGesture: null,
      demo: false,
      lastNotifiedAt: {},
    };
    save();
    return db.users[id];
  },

  updateUser(id, patch) {
    const u = db.users[String(id)];
    if (!u) return null;
    Object.assign(u, patch);
    save();
    return u;
  },

  // Droit à l'effacement (loi camerounaise sur les données personnelles)
  deleteUser(id) {
    id = String(id);
    delete db.users[id];
    db.swipes = db.swipes.filter((s) => s.from !== id && s.to !== id);
    for (const [mid, m] of Object.entries(db.matches)) {
      if (m.users.includes(id)) {
        delete db.matches[mid];
        delete db.messages[mid];
        for (const [did, d] of Object.entries(db.dates)) if (d.matchId === mid) delete db.dates[did];
      }
    }
    db.blocks = db.blocks.filter((b) => b.from !== id && b.to !== id);
    for (const f of ['profile', 'selfie']) {
      const p = path.join(config.uploadsDir, `${id}-${f}.jpg`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    save();
  },

  allUsers: () => Object.values(db.users),

  // ---------- Likes et matchs ----------
  hasSwiped: (from, to) => db.swipes.some((s) => s.from === String(from) && s.to === String(to)),

  addSwipe(from, to, action) {
    db.swipes.push({ from: String(from), to: String(to), action, at: Date.now() });
    save();
  },

  likedBy: (from, to) => db.swipes.some((s) => s.from === String(from) && s.to === String(to) && s.action === 'like'),

  swipesToday(from) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return db.swipes.filter((s) => s.from === String(from) && s.at >= start.getTime()).length;
  },

  createMatch(a, b) {
    const key = pairKey(a, b);
    const found = Object.values(db.matches).find((m) => m.key === key);
    if (found) return found;
    const m = { id: newId(), key, users: [String(a), String(b)], createdAt: Date.now() };
    db.matches[m.id] = m;
    db.messages[m.id] = [];
    save();
    return m;
  },

  getMatch: (id) => db.matches[id] || null,
  matchesOf: (uid) => Object.values(db.matches).filter((m) => m.users.includes(String(uid))),

  // ---------- Lecture et présence ----------
  markRead(matchId, userId) {
    const m = db.matches[matchId];
    if (!m) return;
    m.readAt = { ...(m.readAt || {}), [String(userId)]: Date.now() };
    save();
  },

  unreadCount(matchId, userId) {
    const m = db.matches[matchId];
    const since = m?.readAt?.[String(userId)] || 0;
    return (db.messages[matchId] || []).filter((x) => x.from !== String(userId) && x.at > since).length;
  },

  hasOpened: (matchId, userId) => !!db.matches[matchId]?.readAt?.[String(userId)],

  touchPresence: (userId, matchId) => presence.set(`${userId}:${matchId}`, Date.now()),

  leavePresence: (userId) => { for (const k of presence.keys()) if (k.startsWith(`${userId}:`)) presence.delete(k); },

  isViewing: (userId, matchId, withinMs = 10000) => Date.now() - (presence.get(`${userId}:${matchId}`) || 0) < withinMs,

  // ---------- Activité ----------
  // Un seul horodatage par personne, jamais exposé brut : les autres ne voient qu'une tranche
  // (voir publicProfile dans routes.js). Écrit au plus une fois par minute, sinon chaque personne
  // réécrirait db.json toutes les 20 s, au rythme des appels à /summary.
  touchActivity(userId) {
    const u = db.users[String(userId)];
    if (!u || Date.now() - (u.lastActiveAt || 0) < 60000) return;
    u.lastActiveAt = Date.now();
    save();
  },

  // ---------- Messages ----------
  messagesOf: (matchId) => db.messages[matchId] || [],

  addMessage(matchId, from, text) {
    const msg = { id: newId(), from: String(from), text, at: Date.now() };
    (db.messages[matchId] ||= []).push(msg);
    save();
    return msg;
  },

  // ---------- Signalements et blocages ----------
  addReport(report) {
    db.reports.push({ id: newId(), at: Date.now(), ...report });
    save();
  },

  block(from, to) {
    if (!store.isBlocked(from, to)) db.blocks.push({ from: String(from), to: String(to), at: Date.now() });
    save();
  },

  isBlocked: (a, b) => db.blocks.some((x) => (x.from === String(a) && x.to === String(b)) || (x.from === String(b) && x.to === String(a))),

  // ---------- Rendez-vous ----------
  addDate(date) {
    const d = { id: newId(), createdAt: Date.now(), arrivals: {}, ...date };
    db.dates[d.id] = d;
    save();
    return d;
  },

  getDate: (id) => db.dates[id] || null,
  datesOfMatch: (matchId) => Object.values(db.dates).filter((d) => d.matchId === matchId),

  updateDate(id, patch) {
    const d = db.dates[id];
    if (!d) return null;
    Object.assign(d, patch);
    save();
    return d;
  },

  // Utilisé par le jeu de démonstration
  _raw: () => db,
  _save: save,
};
