// Stockage dans un fichier JSON. C'est le mode par défaut, sans rien à installer : il suffit à
// une bêta fermée de quelques centaines de personnes, sur une seule instance.
//
// Son interface est asynchrone alors que rien ici ne l'exige : c'est la même que celle de
// store.pg.js, pour que le reste de l'app ne sache pas lequel des deux il utilise. Seules les
// trois méthodes de présence restent synchrones — elles vivent en mémoire, dans les deux modes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { fichierVoix } from './voix.js';

const file = path.join(config.dataDir, 'db.json');
const empty = () => ({ users: {}, swipes: [], matches: {}, messages: {}, reports: [], blocks: [], dates: {}, events: [] });

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
  getUser: async (id) => db.users[String(id)] || null,

  async upsertTelegramUser(tgUser) {
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

  async updateUser(id, patch) {
    const u = db.users[String(id)];
    if (!u) return null;
    Object.assign(u, patch);
    save();
    return u;
  },

  // Droit à l'effacement (loi camerounaise sur les données personnelles)
  async deleteUser(id) {
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
    // Sans cette ligne, les événements de mesure survivraient à l'effacement d'un compte, et la
    // promesse « tout part » deviendrait fausse. Les lignes sans identifiant (account_deleted)
    // ne sont pas concernées : elles ne désignent personne.
    db.events = db.events.filter((e) => e.u !== id);
    for (const f of ['profile', 'selfie', 'photo-1', 'photo-2', 'photo-3']) {
      const p = path.join(config.uploadsDir, `${id}-${f}.jpg`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    // La présentation vocale n'est pas un .jpg : oubliée ici, elle survivrait à l'effacement.
    const voix = path.join(config.uploadsDir, fichierVoix(id));
    if (fs.existsSync(voix)) fs.unlinkSync(voix);
    save();
  },

  // Purge des fichiers dont la modération n'a jamais tranché. La promesse faite à la personne
  // est que son selfie disparaît après décision ; sans décision, il ne doit pas rester pour
  // autant. Au-delà du délai, le selfie est supprimé et la vérification revient à zéro : la
  // personne peut recommencer, et rien n'est conservé entre-temps.
  async purgerVerificationsOubliees(delaiMs) {
    const limite = Date.now() - delaiMs;
    let supprimes = 0;
    for (const u of Object.values(db.users)) {
      if (u.verification !== 'pending') continue;
      const envoi = u.verificationSentAt || u.createdAt || 0;
      if (envoi > limite) continue;
      const fichier = path.join(config.uploadsDir, `${u.id}-selfie.jpg`);
      if (fs.existsSync(fichier)) fs.unlinkSync(fichier);
      u.verification = 'none';
      u.pendingGesture = null;
      u.pendingGestureAt = null;
      u.verificationSentAt = null;
      supprimes += 1;
    }
    if (supprimes) save();
    return supprimes;
  },

  // ---------- Photos ----------
  // Jusqu'à trois photos par personne, fichiers <id>-photo-<n>.jpg. Chacune passe par la
  // modération avant d'être montrée aux autres. Les anciens profils n'avaient qu'une photo,
  // <id>-profile.jpg : elle devient l'emplacement 1, déjà validée, à la première lecture.
  async photosOf(user) {
    if (!user.photos) {
      user.photos = [];
      if (user.profile?.hasPhoto) {
        const old = path.join(config.uploadsDir, `${user.id}-profile.jpg`);
        if (fs.existsSync(old)) fs.renameSync(old, path.join(config.uploadsDir, `${user.id}-photo-1.jpg`));
        user.photos.push({ n: 1, status: 'approved' });
      }
      save();
    }
    return user.photos;
  },

  // hasPhoto reste synchronisé : « au moins une photo validée », ce que voient les autres
  // Renvoie la liste obtenue, comme store.pg.js : celui qui appelle n'a pas à relire la personne.
  async setPhoto(userId, n, status) {
    const u = db.users[String(userId)];
    if (!u) return [];
    u.photos = [...(await store.photosOf(u)).filter((p) => p.n !== n), { n, status }].sort((a, b) => a.n - b.n);
    if (u.profile) u.profile.hasPhoto = u.photos.some((p) => p.status === 'approved');
    save();
    return u.photos;
  },

  // La présentation vocale : un seul emplacement, et son fichier à côté. Le statut suit celui
  // des photos — « pending » tant que la modération n'a pas écouté, « approved » ensuite.
  async setVoice(userId, status, duree) {
    const u = db.users[String(userId)];
    if (!u) return null;
    u.voix = { status, duree: Number(duree) || 0, at: Date.now() };
    save();
    return u.voix;
  },

  async removeVoice(userId) {
    const u = db.users[String(userId)];
    if (!u) return null;
    // null, pas « delete » : store.pg.js fusionne du JSON et ne sait pas retirer une clé. Les
    // deux stockages doivent rendre la même chose, sinon un « === undefined » marche d'un côté
    // seulement — et ne se voit qu'en production.
    u.voix = null;
    const f = path.join(config.uploadsDir, fichierVoix(u.id));
    if (fs.existsSync(f)) fs.unlinkSync(f);
    save();
    return null;
  },

  async removePhoto(userId, n) {
    const u = db.users[String(userId)];
    if (!u) return [];
    u.photos = (await store.photosOf(u)).filter((p) => p.n !== n);
    const f = path.join(config.uploadsDir, `${u.id}-photo-${n}.jpg`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    if (u.profile) u.profile.hasPhoto = u.photos.some((p) => p.status === 'approved');
    save();
    return u.photos;
  },

  // ---------- Bannissement ----------
  // Le compte reste, mais il est clos : les conditions promettent qu'un compte banni pour arnaque
  // ne peut pas être recréé, ce qui suppose de garder de quoi le reconnaître. Ses matchs sont
  // défaits pour que personne ne reste en discussion avec lui.
  async banUser(id, { motif = '', par = '' } = {}) {
    const u = db.users[String(id)];
    if (!u) return null;
    u.banned = { at: Date.now(), motif: String(motif).slice(0, 200), par: String(par) };
    for (const m of Object.values(db.matches)) {
      if (m.users.includes(String(id))) await store.removeMatch(m.id);
    }
    save();
    return u;
  },

  async unbanUser(id) {
    const u = db.users[String(id)];
    if (!u) return null;
    delete u.banned;
    save();
    return u;
  },

  bannis: async () => Object.values(db.users).filter((u) => u.banned),

  allUsers: async () => Object.values(db.users),

  // Lectures en vrac. La découverte a besoin, pour chaque candidat, de savoir s'il est bloqué,
  // si je l'ai déjà balayé et s'il m'a liké. Poser ces trois questions par candidat faisait
  // N allers-retours ; on charge les trois relations une fois, et le filtre redevient local.
  blocksOf: async (id) => db.blocks.filter((b) => b.from === String(id) || b.to === String(id)).map((b) => (b.from === String(id) ? b.to : b.from)),
  swipesFrom: async (id) => db.swipes.filter((s) => s.from === String(id)),
  swipesTo: async (id) => db.swipes.filter((s) => s.to === String(id)),

  // ---------- Likes et matchs ----------
  hasSwiped: async (from, to) => db.swipes.some((s) => s.from === String(from) && s.to === String(to)),

  async addSwipe(from, to, action) {
    db.swipes.push({ from: String(from), to: String(to), action, at: Date.now() });
    save();
  },

  likedBy: async (from, to) => db.swipes.some((s) => s.from === String(from) && s.to === String(to) && s.action === 'like'),

  swipeOf: async (from, to) => db.swipes.find((s) => s.from === String(from) && s.to === String(to)) || null,

  // Rattrapage depuis la liste : un « Passer » peut devenir un « J'aime ». La date est mise à jour,
  // donc ce nouveau choix compte dans le quota du jour comme n'importe quel balayage.
  async updateSwipe(from, to, action) {
    const s = db.swipes.find((x) => x.from === String(from) && x.to === String(to));
    if (!s) return false;
    s.action = action;
    s.at = Date.now();
    save();
    return true;
  },

  matchBetween: async (a, b) => Object.values(db.matches).find((m) => m.key === pairKey(a, b)) || null,

  // Seuls les « J'aime » comptent dans le quota : passer un profil qui ne convient pas ne doit pas
  // coûter une journée de découverte, sinon le quota punit la personne qui trie sérieusement.
  // Nombre de lignes de balayage d'une personne, tous types confondus. Sert à vérifier qu'un
  // rattrapage réutilise la ligne existante au lieu d'en créer une seconde.
  async swipesCount(from) {
    return db.swipes.filter((s) => s.from === String(from)).length;
  },

  async swipesToday(from) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return db.swipes.filter((s) => s.from === String(from) && s.action === 'like' && s.at >= start.getTime()).length;
  },

  async createMatch(a, b) {
    const key = pairKey(a, b);
    const found = Object.values(db.matches).find((m) => m.key === key);
    if (found) return found;
    const m = { id: newId(), key, users: [String(a), String(b)], createdAt: Date.now() };
    db.matches[m.id] = m;
    db.messages[m.id] = [];
    save();
    return m;
  },

  getMatch: async (id) => db.matches[id] || null,
  matchesOf: async (uid) => Object.values(db.matches).filter((m) => m.users.includes(String(uid))),

  // ---------- Lecture et présence ----------
  async markRead(matchId, userId) {
    const m = db.matches[matchId];
    if (!m) return;
    m.readAt = { ...(m.readAt || {}), [String(userId)]: Date.now() };
    save();
  },

  async unreadCount(matchId, userId) {
    const m = db.matches[matchId];
    const since = m?.readAt?.[String(userId)] || 0;
    return (db.messages[matchId] || []).filter((x) => x.from !== String(userId) && x.at > since).length;
  },

  hasOpened: async (matchId, userId) => !!db.matches[matchId]?.readAt?.[String(userId)],

  touchPresence: (userId, matchId) => presence.set(`${userId}:${matchId}`, Date.now()),

  leavePresence: (userId) => { for (const k of presence.keys()) if (k.startsWith(`${userId}:`)) presence.delete(k); },

  isViewing: (userId, matchId, withinMs = 10000) => Date.now() - (presence.get(`${userId}:${matchId}`) || 0) < withinMs,

  // ---------- Activité ----------
  // Un seul horodatage par personne, jamais exposé brut : les autres ne voient qu'une tranche
  // (voir publicProfile dans routes.js). Écrit au plus une fois par minute, sinon chaque personne
  // réécrirait db.json toutes les 20 s, au rythme des appels à /summary.
  async touchActivity(userId) {
    const u = db.users[String(userId)];
    if (!u || Date.now() - (u.lastActiveAt || 0) < 60000) return;
    u.lastActiveAt = Date.now();
    save();
  },

  // ---------- Messages ----------
  messagesOf: async (matchId) => db.messages[matchId] || [],

  async addMessage(matchId, from, text) {
    const msg = { id: newId(), from: String(from), text, at: Date.now() };
    (db.messages[matchId] ||= []).push(msg);
    save();
    return msg;
  },

  // ---------- Mesure ----------
  // Voir audit/05-mesure-produit.md : aucun texte, aucun identifiant nouveau, et rien du tout
  // quand EVENTS_RETENTION_DAYS vaut 0.
  async addEvent(k, u, p) {
    if (!config.eventsRetentionDays) return null;
    const e = { id: newId(), k: String(k), at: Date.now() };
    if (u !== null && u !== undefined) e.u = String(u);
    if (p && Object.keys(p).length) e.p = p;
    db.events.push(e);
    save();
    return e;
  },

  events: async ({ depuis = 0, k = null } = {}) => db.events.filter((e) => e.at >= depuis && (!k || e.k === k)),

  // Ce qui a dépassé la durée de conservation s'en va, y compris les lignes sans identifiant.
  async purgerEvenements(jours = config.eventsRetentionDays) {
    if (!jours) return 0;
    const limite = Date.now() - jours * 24 * 3600 * 1000;
    const avant = db.events.length;
    db.events = db.events.filter((e) => e.at >= limite);
    if (db.events.length !== avant) save();
    return avant - db.events.length;
  },

  // ---------- Signalements et blocages ----------
  async addReport(report) {
    db.reports.push({ id: newId(), at: Date.now(), ...report });
    save();
  },

  // Du plus ancien au plus récent : la modération lit une file, pas un journal à l'envers.
  reports: async () => db.reports.slice(),

  // Ouvrir un fil de discussion signalé laisse une trace sur le signalement : qui a lu, quand.
  // Sans elle, lire les messages de deux personnes ne coûterait rien à personne.
  async marquerSignalementLu(id, par) {
    const r = db.reports.find((x) => x.id === id);
    if (!r) return null;
    (r.lectures ||= []).push({ par: String(par), at: Date.now() });
    save();
    return r;
  },

  // Défaire un match : la discussion, ses messages et ses rendez-vous disparaissent des deux
  // côtés. Les balayages restent, pour que les deux personnes ne se revoient pas en découverte.
  async removeMatch(matchId) {
    const m = db.matches[matchId];
    if (!m) return false;
    delete db.matches[matchId];
    delete db.messages[matchId];
    for (const [did, d] of Object.entries(db.dates)) if (d.matchId === matchId) delete db.dates[did];
    save();
    return true;
  },

  async block(from, to) {
    if (!(await store.isBlocked(from, to))) db.blocks.push({ from: String(from), to: String(to), at: Date.now() });
    save();
  },

  isBlocked: async (a, b) => db.blocks.some((x) => (x.from === String(a) && x.to === String(b)) || (x.from === String(b) && x.to === String(a))),

  // ---------- Rendez-vous ----------
  async addDate(date) {
    const d = { id: newId(), createdAt: Date.now(), arrivals: {}, ...date };
    db.dates[d.id] = d;
    save();
    return d;
  },

  getDate: async (id) => db.dates[id] || null,
  datesOfMatch: async (matchId) => Object.values(db.dates).filter((d) => d.matchId === matchId),

  async updateDate(id, patch) {
    const d = db.dates[id];
    if (!d) return null;
    // updatedAt permet à la discussion de savoir qu'un rendez-vous a bougé sans renvoyer
    // les rendez-vous à chaque interrogation.
    Object.assign(d, patch, { updatedAt: Date.now() });
    save();
    return d;
  },

};
