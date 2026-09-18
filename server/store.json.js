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
import { fichiersDUnePhoto, fichiersDUnCompte, supprimerLesPhotosDuChat } from './photos.js';

const file = path.join(config.dataDir, 'db.json');
const empty = () => ({ users: {}, swipes: [], matches: {}, messages: {}, reports: [], blocks: [], dates: {}, events: [], paiements: [] });

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
const frappe = new Map();

let timer = null;
// Écriture atomique, et durable : le fichier puis le dossier sont synchronisés sur le disque
// avant le renommage, sans quoi une coupure laissait un db.json vide et le démarrage repartait
// sur une base vide. Une erreur (disque plein) est dite, jamais lancée depuis un minuteur : elle
// arrêterait le processus sans que personne l'attrape.
function ecrireMaintenant() {
  clearTimeout(timer);
  timer = null;
  try {
    const tmp = `${file}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, JSON.stringify(db));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, file);
    try {
      const dir = fs.openSync(path.dirname(file), 'r');
      fs.fsyncSync(dir);
      fs.closeSync(dir);
    } catch { /* certains systèmes refusent fsync sur un dossier : le renommage est déjà posé */ }
  } catch (e) {
    console.error(`Écriture de ${file} impossible (les données restent en mémoire) : ${e.message}`);
  }
}
function save() {
  clearTimeout(timer);
  timer = setTimeout(ecrireMaintenant, 200);
}

export const newId = () => crypto.randomBytes(8).toString('hex');
const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

// Compteurs de limitation de débit. Voir limiteConsommer plus bas : ils restent en mémoire
// parce que ce stockage est mono-instance par construction.
const limites = new Map();
// La plus longue fenêtre des règles (une heure) : au-delà, une entrée ne dit plus rien.
const FENETRE_MAX_MS = 3_600_000;

export const store = {
  // ---------- Utilisateurs ----------
  getUser: async (id) => db.users[String(id)] || null,
  userByPid: async (pid) => (pid ? Object.values(db.users).find((u) => u.pid === pid) || null : null),

  // Charger quelques comptes nommés, plutôt que toute la table pour en garder trois. Sur ce
  // stockage c'est une lecture de map ; c'est côté PostgreSQL que la différence se paie, et
  // c'est là-bas qu'il faut lire le commentaire.
  usersByIds: async (ids) => (ids || []).map((id) => db.users[String(id)]).filter(Boolean),

  // À l'arrêt : ce qui attendait le minuteur part tout de suite.
  async arreter() { if (timer) ecrireMaintenant(); },

  // Le jeton du lien de modération, comparé et effacé d'un seul geste.
  async consommerJetonModeration(id, usage) {
    const u = db.users[String(id)];
    if (!u || !usage || u.modJeton !== usage) return false;
    u.modJeton = null;
    save();
    return true;
  },

  async upsertTelegramUser(tgUser) {
    const id = String(tgUser.id);
    const existing = db.users[id];
    if (existing) {
      // Met à jour uniquement ce qui vient de Telegram, sans perdre le reste (geste en attente, profil…)
      existing.firstName = tgUser.first_name || existing.firstName;
      existing.languageCode = tgUser.language_code || existing.languageCode;
      // Les comptes d'avant l'identifiant public en reçoivent un à leur prochain passage.
      if (!existing.pid) { existing.pid = newId(); save(); }
      return existing;
    }
    db.users[id] = {
      id,
      // L'identifiant public : ce que les autres membres voient et renvoient. Aléatoire, sans lien
      // avec l'identifiant Telegram — qui ouvre une fiche et une discussion hors de l'app
      // (audit/09-revue-code.md, I6).
      pid: newId(),
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
        supprimerLesPhotosDuChat(config.uploadsDir, mid);
        for (const [did, d] of Object.entries(db.dates)) if (d.matchId === mid) delete db.dates[did];
      }
    }
    db.blocks = db.blocks.filter((b) => b.from !== id && b.to !== id);
    // Les signalements, dans les deux sens : émis, ils portent l'identifiant de qui part ; reçus,
    // il n'y a plus de compte à trancher. Et la personne de confiance de quelqu'un d'autre : son
    // identifiant et son prénom restaient chez ce membre (audit/09-revue-code.md, I4).
    db.reports = db.reports.filter((r) => r.from !== id && r.targetId !== id);
    for (const u of Object.values(db.users)) if (u.confiance?.id === id) u.confiance = null;
    // Sans cette ligne, les événements de mesure survivraient à l'effacement d'un compte, et la
    // promesse « tout part » deviendrait fausse. Les lignes sans identifiant (account_deleted)
    // ne sont pas concernées : elles ne désignent personne.
    db.events = db.events.filter((e) => e.u !== id);
    // Un paiement encaissé se garde comme une facture : la ligne reste, sans personne derrière.
    for (const p of db.paiements) if (p.userId === id) p.userId = null;
    for (const f of fichiersDUnCompte()) {
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
  // Rend la liste des comptes purgés, avec le numéro du message du groupe : c'est à l'appelant
  // de retirer la photo de Telegram, le stockage ne parle pas au bot.
  async purgerVerificationsOubliees(delaiMs) {
    const limite = Date.now() - delaiMs;
    const purges = [];
    for (const u of Object.values(db.users)) {
      if (u.verification !== 'pending') continue;
      const envoi = u.verificationSentAt || u.createdAt || 0;
      if (envoi > limite) continue;
      const fichier = path.join(config.uploadsDir, `${u.id}-selfie.jpg`);
      if (fs.existsSync(fichier)) fs.unlinkSync(fichier);
      purges.push({ id: u.id, verifMessageId: u.verifMessageId || null });
      u.verification = 'none';
      u.pendingGesture = null;
      u.pendingGestureAt = null;
      u.verificationSentAt = null;
      u.verifMessageId = null;
    }
    if (purges.length) save();
    return purges;
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
    for (const nom of fichiersDUnePhoto(n)) {
      const f = path.join(config.uploadsDir, `${u.id}-${nom}.jpg`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
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

  // ---------- Limitation de débit ----------
  // En mémoire, et c'est correct ici : un fichier JSON ne supporte qu'une seule instance, donc il
  // n'y a personne avec qui partager. Les écrire dans le fichier coûterait une réécriture complète
  // à chaque message envoyé, pour une exactitude que ce mode n'a pas à garantir. Le stockage
  // PostgreSQL, lui, peut tourner à plusieurs : il les met en base (voir store.pg.js).
  //
  // Conséquence assumée, la même qu'avant ce chantier : les compteurs repartent à zéro au
  // redémarrage.
  async limiteConsommer(cle, max, fenetreMs, maintenant = Date.now()) {
    const gardes = (limites.get(cle) || []).filter((t) => maintenant - t < fenetreMs);
    if (gardes.length >= max) {
      limites.set(cle, gardes);
      return Math.max(1, Math.ceil((fenetreMs - (maintenant - gardes[0])) / 1000));
    }
    gardes.push(maintenant);
    limites.set(cle, gardes);
    return null;
  },

  async limitesReinitialiser() { limites.clear(); },

  // Rien à purger qu'un redémarrage ne fasse déjà : la carte ne survit pas au processus. On
  // enlève quand même les fenêtres mortes, sans quoi elle grossirait d'une entrée par compte et
  // par action tant que le serveur tourne.
  async purgerLimites(maintenant = Date.now()) {
    let n = 0;
    for (const [cle, horodatages] of limites) {
      if (!horodatages.length || maintenant - horodatages[horodatages.length - 1] > FENETRE_MAX_MS) { limites.delete(cle); n += 1; }
    }
    return n;
  },

  // Lectures en vrac. La découverte a besoin, pour chaque candidat, de savoir s'il est bloqué,
  // si je l'ai déjà balayé et s'il m'a liké. Poser ces trois questions par candidat faisait
  // N allers-retours ; on charge les trois relations une fois, et le filtre redevient local.
  blocksOf: async (id) => db.blocks.filter((b) => b.from === String(id) || b.to === String(id)).map((b) => (b.from === String(id) ? b.to : b.from)),
  swipesFrom: async (id) => db.swipes.filter((s) => s.from === String(id)),
  swipesTo: async (id) => db.swipes.filter((s) => s.to === String(id)),

  // ---------- Likes et matchs ----------
  hasSwiped: async (from, to) => db.swipes.some((s) => s.from === String(from) && s.to === String(to)),

  // `sur` et `mot` : le « J'aime » sur une réponse (migration 008 côté PostgreSQL). Absents,
  // ils ne sont pas écrits : la ligne garde la forme qu'elle a toujours eue.
  async addSwipe(from, to, action, { sur, mot } = {}) {
    db.swipes.push({ from: String(from), to: String(to), action, at: Date.now(), ...(sur ? { sur } : {}), ...(mot ? { mot } : {}) });
    save();
  },

  likedBy: async (from, to) => db.swipes.some((s) => s.from === String(from) && s.to === String(to) && s.action === 'like'),

  swipeOf: async (from, to) => db.swipes.find((s) => s.from === String(from) && s.to === String(to)) || null,

  // Rattrapage depuis la liste : un « Passer » peut devenir un « J'aime ». La date est mise à jour,
  // donc ce nouveau choix compte dans le quota du jour comme n'importe quel balayage.
  async updateSwipe(from, to, action, { sur, mot } = {}) {
    const s = db.swipes.find((x) => x.from === String(from) && x.to === String(to));
    if (!s) return false;
    s.action = action;
    s.at = Date.now();
    if (sur) s.sur = sur; else delete s.sur;
    if (mot) s.mot = mot; else delete s.mot;
    save();
    return true;
  },

  // Revenir sur un balayage : la ligne part, donc le quota du jour la rend et la carte revient
  // dans le paquet. Rend le balayage retiré, ou null s'il n'y en avait pas.
  async removeSwipe(from, to) {
    const i = db.swipes.findIndex((x) => x.from === String(from) && x.to === String(to));
    if (i < 0) return null;
    const [s] = db.swipes.splice(i, 1);
    save();
    return s;
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
    // Le fichier n'est réécrit que si la lecture change quelque chose — un message plus récent
    // que la dernière lecture. Sinon chaque interrogation, toutes les 4 s, resérialisait tout.
    const dernier = (db.messages[matchId] || []).at(-1)?.at || 0;
    const lu = m.readAt?.[String(userId)] || 0;
    m.readAt = { ...(m.readAt || {}), [String(userId)]: Date.now() };
    if (dernier > lu) save();
  },

  async unreadCount(matchId, userId) {
    const m = db.matches[matchId];
    const since = m?.readAt?.[String(userId)] || 0;
    // Un message retiré ne se compte pas : la pastille dirait « 1 » pour une bulle qui dit « supprimé ».
    return (db.messages[matchId] || []).filter((x) => x.from !== String(userId) && x.at > since && !x.deletedAt).length;
  },

  hasOpened: async (matchId, userId) => !!db.matches[matchId]?.readAt?.[String(userId)],

  touchPresence: (userId, matchId) => presence.set(`${userId}:${matchId}`, Date.now()),

  leavePresence: (userId) => { for (const k of presence.keys()) if (k.startsWith(`${userId}:`)) presence.delete(k); },
  // La carte ne rétrécissait que sur /presence/leave : une app fermée sans le dire y restait.
  purgerPresence: async (delaiMs = 10 * 60 * 1000) => {
    const limite = Date.now() - delaiMs;
    for (const [k, at] of presence) if (at < limite) presence.delete(k);
    // La frappe vit six secondes : tout ce qui traîne ici est mort depuis longtemps.
    for (const [k, at] of frappe) if (at < limite) frappe.delete(k);
  },

  isViewing: (userId, matchId, withinMs = 10000) => Date.now() - (presence.get(`${userId}:${matchId}`) || 0) < withinMs,

  // ---------- Qui est en train d'écrire ----------
  //
  // Éphémère par construction, et **jamais stocké** : une carte en mémoire, comme la présence,
  // qui meurt avec le processus. Savoir qu'une personne hésite au-dessus de son clavier n'a
  // aucune raison de survivre à un redémarrage, et encore moins de finir dans une sauvegarde.
  // Le mot arrive par l'interrogation qui partait déjà (`?ecrit=1`) : aucune requête de plus.
  touchTyping: (userId, matchId) => frappe.set(`${userId}:${matchId}`, Date.now()),
  isTyping: (userId, matchId, withinMs = 6000) => Date.now() - (frappe.get(`${userId}:${matchId}`) || 0) < withinMs,

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

  // `extras` : `replyTo` (l'identifiant du message auquel on répond) et `photo` (vrai pour une
  // image). Les deux stockages rendent la même forme : { id, from, text, at, replyTo?, photo?,
  // deletedAt? }, les champs absents n'y sont pas — pas « null ».
  async addMessage(matchId, from, text, { replyTo, photo } = {}) {
    const msg = { id: newId(), from: String(from), text, at: Date.now(), ...(replyTo ? { replyTo: String(replyTo) } : {}), ...(photo ? { photo: true } : {}) };
    (db.messages[matchId] ||= []).push(msg);
    save();
    return msg;
  },

  // Une réaction sur un message : un emoji par membre et par message, `null` pour la retirer.
  // La ligne garde l'heure du dernier changement (reagiAt), pour que l'interrogation la rattrape.
  // Rend le message, ou null s'il n'est pas dans cette discussion ou s'il est retiré.
  async reagir(matchId, messageId, userId, emoji) {
    const msg = (db.messages[matchId] || []).find((x) => x.id === String(messageId));
    if (!msg || msg.deletedAt) return null;
    const reactions = { ...(msg.reactions || {}) };
    if (emoji) reactions[String(userId)] = emoji; else delete reactions[String(userId)];
    if (Object.keys(reactions).length) msg.reactions = reactions; else delete msg.reactions;
    msg.reagiAt = Date.now();
    save();
    return msg;
  },

  // Retirer un message : **le sien seulement**. La ligne reste, marquée — les deux écrans
  // montrent « Message supprimé », et la modération peut encore lire le texte si la discussion
  // est signalée. Rend le message marqué, ou null s'il n'est pas à cette personne.
  async supprimerMessage(matchId, messageId, from) {
    const msg = (db.messages[matchId] || []).find((x) => x.id === String(messageId) && x.from === String(from));
    if (!msg) return null;
    if (!msg.deletedAt) { msg.deletedAt = Date.now(); save(); }
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

  // ---------- Paiements ----------
  // Une ligne par paiement reçu, jamais retirée. `chargeId` est la référence Telegram : la même
  // ne s'enregistre pas deux fois — un webhook rejoué rend la ligne déjà écrite.
  async addPaiement({ userId, chargeId, source, jours, stars }) {
    const deja = db.paiements.find((p) => p.chargeId === String(chargeId));
    if (deja) return { ...deja, deja: true };
    const p = { id: newId(), userId: String(userId), chargeId: String(chargeId), source, jours: Number(jours), stars: Number(stars), statut: 'paye', at: Date.now() };
    db.paiements.push(p);
    save();
    return p;
  },
  paiementParCharge: async (chargeId) => db.paiements.find((p) => p.chargeId === String(chargeId)) || null,
  paiementsDe: async (userId) => db.paiements.filter((p) => p.userId === String(userId)).sort((a, b) => b.at - a.at),
  async marquerRembourse(chargeId) {
    const p = db.paiements.find((x) => x.chargeId === String(chargeId));
    if (!p || p.statut === 'rembourse') return null;
    p.statut = 'rembourse'; p.rembourseLe = Date.now();
    save();
    return p;
  },
  paiements: async () => [...db.paiements],

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
    supprimerLesPhotosDuChat(config.uploadsDir, matchId);
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
