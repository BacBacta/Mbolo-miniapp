import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, runtime, venues, INTENTS, GENDERS, CITIES } from './config.js';
import { store } from './store.js';
import { requireAuth } from './auth.js';
import { checkMessage } from './antiscam.js';
import { limiter, consommer } from './limites.js';
import { notify, notifyAdmin, sendSelfieToModeration, sendPhotoToModeration, decideVerification, onApproved } from './bot.js';
import { DEMO_REPLIES } from './seed.js';

export const api = express.Router();
api.use(requireAuth);
// Chaque appel authentifié vaut signe de vie : l'app interroge /summary toutes les 20 s tant qu'elle est ouverte
api.use((req, res, next) => { store.touchActivity(req.user.id); next(); });

const fail = (res, status, code, message) => res.status(status).json({ code, message });
const GESTURES = ['Lève deux doigts et souris', 'Touche ton oreille gauche', 'Fais un pouce levé', 'Pose ta main sur ta joue'];
// Durée de validité d'un geste de vérification
const GESTURE_TTL_MS = 10 * 60 * 1000;

// Tranche d'activité montrée aux autres. Volontairement floue : jamais l'heure exacte, jamais de
// temps réel. Un « en ligne maintenant » précis servirait à faire pression sur qui ne répond pas.
const ACTIVITY_STEPS = [['recent', 15 * 60e3], ['today', 24 * 3600e3], ['week', 7 * 86400e3]];
export function activityBucket(lastActiveAt, now = Date.now()) {
  if (!lastActiveAt) return null;
  const age = now - lastActiveAt;
  return ACTIVITY_STEPS.find(([, max]) => age < max)?.[0] || null;
}

// Profil visible par les autres : aucune donnée Telegram (pseudo, numéro) n'est exposée
function publicProfile(user) {
  const p = user.profile || {};
  return {
    id: user.id,
    name: p.name,
    age: p.age,
    intent: p.intent,
    intentLabel: INTENTS[p.intent],
    city: p.city,
    area: p.area,
    promptQ: p.promptQ,
    promptA: p.promptA,
    languages: p.languages || '',
    // Seules les photos validées par la modération sont montrées aux autres
    photos: store.photosOf(user).filter((x) => x.status === 'approved').map((x) => x.n),
    hasPhoto: store.photosOf(user).some((x) => x.status === 'approved'),
    verified: user.verification === 'approved',
    trust: p.trust || { selfie: user.verification === 'approved', guarantor: false, seniority: Date.now() - user.createdAt > 90 * 864e5 },
    demo: !!user.demo,
    // Les profils de démonstration répondent en quelques secondes : « aujourd'hui » est cohérent
    activity: user.demo ? 'today' : activityBucket(user.lastActiveAt),
    // Inscrit depuis moins d'une semaine. Dérivé, jamais la date elle-même. Les profils de
    // démonstration sont recréés à chaque démarrage : ils ne sont jamais « nouveaux »
    isNew: !user.demo && Date.now() - user.createdAt < 7 * 86400e3,
  };
}

function saveJpeg(dataUrl, file) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return false;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1.5 * 1024 * 1024) return false;
  fs.writeFileSync(file, buf);
  return true;
}

const isApproved = (u) => u.verification === 'approved' && u.profile;
const requireApproved = (req, res, next) => (isApproved(req.user) ? next() : fail(res, 403, 'NOT_VERIFIED', 'Vérifie ton profil pour accéder à cette fonction.'));

// ---------- Moi ----------
api.get('/me', (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    firstName: u.firstName,
    profile: u.profile,
    verification: u.verification,
    pendingGesture: u.pendingGesture || null,
    botUsername: runtime.botUsername,
    appName: config.appName,
    publicProfile: u.profile ? publicProfile(u) : null,
    photos: store.photosOf(u),
    filters: filtersOf(u),
    notificationsAvailable: !!config.botToken,
    options: { intents: INTENTS, genders: GENDERS, cities: CITIES },
  });
});

api.put('/me/profile', limiter('profil'), async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 30);
  const age = Number(b.age);
  if (!name) return fail(res, 400, 'NAME_REQUIRED', 'Indique ton prénom.');
  if (!Number.isInteger(age) || age < 18 || age > 99) return fail(res, 400, 'AGE_INVALID', `${config.appName} est réservé aux 18 ans et plus.`);
  if (!GENDERS[b.gender]) return fail(res, 400, 'GENDER_REQUIRED', 'Indique si tu es une femme ou un homme.');
  if (!INTENTS[b.intent]) return fail(res, 400, 'INTENT_REQUIRED', 'Choisis ce que tu cherches.');
  if (!CITIES.includes(b.city)) return fail(res, 400, 'CITY_REQUIRED', 'Choisis ta ville.');
  const promptA = String(b.promptA || '').trim().slice(0, 120);
  if (promptA.length < 3) return fail(res, 400, 'PROMPT_REQUIRED', 'Réponds à la question pour que les autres te découvrent.');
  const profileText = [name, b.area, b.promptQ, promptA, b.languages].filter(Boolean).join(' ');
  if (!checkMessage(profileText, 0, 1).ok) return fail(res, 400, 'PROFILE_CONTACT', "Ton profil ne doit contenir ni numéro, ni lien, ni pseudo, ni demande d'argent.");

  // Ancien champ « photo » : il alimente l'emplacement 1, avec la même modération
  if (b.photo && !(await acceptPhoto(req.user, 1, b.photo))) return fail(res, 400, 'PHOTO_INVALID', 'Photo trop lourde ou format non pris en charge.');
  const hasPhoto = store.photosOf(req.user).some((x) => x.status === 'approved');
  const profile = {
    name, age, gender: b.gender, intent: b.intent, city: b.city,
    area: String(b.area || '').trim().slice(0, 40),
    promptQ: String(b.promptQ || 'Mon plat du dimanche').slice(0, 60),
    promptA,
    languages: String(b.languages || '').trim().slice(0, 60),
    hasPhoto,
  };
  store.updateUser(req.user.id, { profile });
  res.json({ profile });
});

api.post('/me/verification/start', limiter('verification'), (req, res) => {
  if (!req.user.profile) return fail(res, 400, 'PROFILE_REQUIRED', "Crée ton profil avant la vérification.");
  // Un compte déjà vérifié ne repasse pas par là : sinon une simple modification de profil
  // suffisait à perdre son badge, et un compte validé pouvait se rétrograder tout seul.
  if (req.user.verification === 'approved') return fail(res, 409, 'ALREADY_VERIFIED', 'Ton profil est déjà vérifié.');
  const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
  store.updateUser(req.user.id, { pendingGesture: gesture, pendingGestureAt: Date.now() });
  res.json({ gesture });
});

api.post('/me/verification', limiter('verification'), async (req, res) => {
  const u = req.user;
  if (!u.profile) return fail(res, 400, 'PROFILE_REQUIRED', "Crée ton profil avant la vérification.");
  if (!u.pendingGesture) return fail(res, 400, 'GESTURE_REQUIRED', 'Demande un geste avant de prendre le selfie.');
  // Le geste est à usage unique et périme : sans cela, on pouvait tirer des gestes jusqu'à
  // tomber sur celui d'une photo déjà prise, ou réutiliser un selfie ancien.
  if (Date.now() - (u.pendingGestureAt || 0) > GESTURE_TTL_MS) {
    store.updateUser(u.id, { pendingGesture: null, pendingGestureAt: null });
    return fail(res, 400, 'GESTURE_EXPIRED', 'Ce geste a expiré. Demandes-en un nouveau et reprends le selfie.');
  }
  if (!saveJpeg(req.body?.selfie, path.join(config.uploadsDir, `${u.id}-selfie.jpg`))) return fail(res, 400, 'SELFIE_INVALID', 'Selfie illisible ou trop lourd. Réessaie.');
  store.updateUser(u.id, { verification: 'pending', pendingGestureAt: null, verificationSentAt: Date.now() });

  const sent = await sendSelfieToModeration(u.id).catch((e) => { console.warn('Envoi en modération impossible :', e.message); return false; });
  if (config.autoApprove) {
    // Tests uniquement : validation automatique. En production : AUTO_APPROVE=false et ADMIN_CHAT_ID configuré.
    setTimeout(() => decideVerification(u.id, true), 3000);
  } else if (!sent) {
    console.warn(`Selfie de ${u.id} en attente : configure BOT_TOKEN et ADMIN_CHAT_ID pour le recevoir en modération.`);
  }
  res.json({ verification: 'pending' });
});

api.post('/me/test-notification', async (req, res) => {
  const r = await notify(req.user.id, `Les notifications ${config.appName} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.`, { label: `Ouvrir ${config.appName}`, params: { screen: 'me' } }, 'test', 30 * 1000);
  const messages = {
    NO_BOT: "Le bot n'est pas configuré sur le serveur (BOT_TOKEN).",
    THROTTLED: 'Patiente 30 secondes avant un nouveau test.',
    TELEGRAM_ERROR: "Telegram a refusé l'envoi. Envoie /start au bot puis réessaie.",
    NO_USER: 'Compte introuvable.',
  };
  res.json({ sent: r.sent, message: r.sent ? `Message envoyé : ferme ${config.appName} et regarde ta conversation avec le bot.` : messages[r.reason] });
});

api.delete('/me', (req, res) => {
  store.deleteUser(req.user.id);
  res.json({ deleted: true });
});

// ---------- Photos : jusqu'à trois, chacune modérée avant d'être montrée ----------
const PHOTO_SLOTS = [1, 2, 3];
async function acceptPhoto(user, n, dataUrl) {
  if (!saveJpeg(dataUrl, path.join(config.uploadsDir, `${user.id}-photo-${n}.jpg`))) return false;
  // Tests uniquement : validation automatique. En production : AUTO_APPROVE=false et ADMIN_CHAT_ID configuré.
  store.setPhoto(user.id, n, config.autoApprove ? 'approved' : 'pending');
  if (!config.autoApprove) {
    const sent = await sendPhotoToModeration(user.id, n).catch((e) => { console.warn('Envoi en modération impossible :', e.message); return false; });
    if (!sent) console.warn(`Photo ${n} de ${user.id} en attente : configure BOT_TOKEN et ADMIN_CHAT_ID pour la recevoir en modération.`);
  }
  return true;
}
const slotOf = (req) => (PHOTO_SLOTS.includes(Number(req.params.n)) ? Number(req.params.n) : null);

api.put('/me/photos/:n', limiter('photo'), async (req, res) => {
  const n = slotOf(req);
  if (!n) return fail(res, 400, 'PHOTO_SLOT', 'Trois photos au plus.');
  if (!req.user.profile) return fail(res, 400, 'PROFILE_REQUIRED', 'Crée ton profil avant d\'ajouter des photos.');
  if (!(await acceptPhoto(req.user, n, req.body?.photo))) return fail(res, 400, 'PHOTO_INVALID', 'Photo trop lourde ou format non pris en charge.');
  res.json({ photos: store.photosOf(req.user) });
});

api.delete('/me/photos/:n', (req, res) => {
  const n = slotOf(req);
  if (!n) return fail(res, 400, 'PHOTO_SLOT', 'Trois photos au plus.');
  store.removePhoto(req.user.id, n);
  res.json({ photos: store.photosOf(req.user) });
});

// ---------- Filtres : ce que je veux voir ----------
// Seule la tranche d'âge se règle ; ville et intention viennent du profil
const DEFAULT_FILTERS = { ageMin: 18, ageMax: 99 };
const filtersOf = (u) => ({ ...DEFAULT_FILTERS, ...(u.filters || {}) });
const inAgeRange = (me, other) => { const f = filtersOf(me); return other.profile.age >= f.ageMin && other.profile.age <= f.ageMax; };

api.put('/me/filters', (req, res) => {
  const ageMin = Number(req.body?.ageMin), ageMax = Number(req.body?.ageMax);
  const ok = (n) => Number.isInteger(n) && n >= 18 && n <= 99;
  if (!ok(ageMin) || !ok(ageMax)) return fail(res, 400, 'FILTERS_INVALID', 'Indique des âges entre 18 et 99 ans.');
  if (ageMin > ageMax) return fail(res, 400, 'FILTERS_INVALID', "L'âge minimum doit être inférieur ou égal au maximum.");
  const filters = { ageMin, ageMax };
  store.updateUser(req.user.id, { filters });
  res.json({ filters });
});

// ---------- Photos (servies uniquement aux membres vérifiés) ----------
// Une photo n'est servie aux autres qu'une fois validée ; on voit les siennes quel que soit leur état
function servePhoto(req, res, n) {
  const target = store.getUser(req.params.userId);
  if (!target || store.isBlocked(req.user.id, target.id)) return fail(res, 404, 'NO_PHOTO', 'Pas de photo.');
  const own = target.id === req.user.id;
  const photo = store.photosOf(target).find((x) => x.n === n && (own || x.status === 'approved'));
  const file = path.join(config.uploadsDir, `${target.id}-photo-${n}.jpg`);
  if (!photo || !fs.existsSync(file)) return fail(res, 404, 'NO_PHOTO', 'Pas de photo.');
  res.set('Cache-Control', 'private, max-age=3600').sendFile(file);
}
api.get('/photos/:userId/:n', requireApproved, (req, res) => servePhoto(req, res, Number(req.params.n)));
// Sans numéro : la première photo validée (adresse historique)
api.get('/photos/:userId', requireApproved, (req, res) => {
  const target = store.getUser(req.params.userId);
  const first = target && store.photosOf(target).find((x) => x.status === 'approved');
  servePhoto(req, res, first ? first.n : 1);
});

// ---------- Découverte ----------
function compatible(me, other) {
  const a = me.profile, b = other.profile;
  if (!a || !b || a.intent !== b.intent || a.city !== b.city) return false;
  // Voir README, section Juridique : pour « Relation sérieuse », mise en relation femme/homme uniquement
  if (a.intent === 'serieux' && config.matchPolicy === 'romance_opposite' && a.gender === b.gender) return false;
  return true;
}

// Même quartier que moi ? Le quartier déclaré tient lieu de proximité, sans jamais demander la position
const sameArea = (me, p) => Number(!!me.profile.area && p.area === me.profile.area);

// Un écran vide ne dit rien s'il ne dit pas pourquoi. Trois situations très différentes se
// ressemblaient : personne d'autre n'est vérifié dans ta ville, tu as déjà tout vu, ou ton quota
// du jour est épuisé. On renvoie donc de quoi les distinguer et proposer le bon geste.
function vivier(me) {
  const compatibles = store.allUsers().filter((u) => u.id !== me.id && isApproved(u) && !store.isBlocked(me.id, u.id) && compatible(me, u));
  return {
    total: compatibles.length,
    horsTranche: compatibles.filter((u) => !inAgeRange(me, u)).length,
    vus: compatibles.filter((u) => inAgeRange(me, u) && store.hasSwiped(me.id, u.id)).length,
  };
}

api.get('/discover', requireApproved, (req, res) => {
  const me = req.user;
  const remaining = Math.max(0, config.dailyProfiles - store.swipesToday(me.id));
  if (!remaining) return res.json({ profiles: [], remaining: 0, vivier: vivier(me) });
  const profiles = store.allUsers()
    .filter((u) => u.id !== me.id && isApproved(u) && !store.hasSwiped(me.id, u.id) && !store.isBlocked(me.id, u.id) && compatible(me, u) && inAgeRange(me, u))
    // Avant le match, on ne dit que « cette semaine » ou rien : la tranche fine est réservée aux matchs
    .map((u) => { const p = publicProfile(u); return { ...p, activity: p.activity ? 'week' : null, likedYou: store.likedBy(u.id, me.id) }; })
    // Ceux qui t'ont liké, puis ton quartier
    .sort((a, b) => Number(b.likedYou) - Number(a.likedYou) || sameArea(me, b) - sameArea(me, a))
    .slice(0, Math.min(10, remaining));
  res.json({ profiles, remaining, vivier: vivier(me) });
});

// Liste des profils compatibles, balayés ou non : la vue d'ensemble que les cartes n'offrent pas.
// Parcourir ne consomme rien ; seul un « J'aime » compte dans le quota du jour (route /swipes).
const ACTIVITY_RANK = { recent: 3, today: 2, week: 1 };
const listRank = (p) => (p.status === 'match' ? 0 : p.status ? 1 : p.likedYou ? 3 : 2);
api.get('/profiles', requireApproved, (req, res) => {
  const me = req.user;
  const profiles = store.allUsers()
    .filter((u) => u.id !== me.id && isApproved(u) && !store.isBlocked(me.id, u.id) && compatible(me, u) && inAgeRange(me, u))
    .map((u) => {
      const p = publicProfile(u);
      const swipe = store.swipeOf(me.id, u.id);
      const match = store.matchBetween(me.id, u.id);
      return {
        ...p,
        // Même règle qu'en découverte : la tranche fine d'activité est réservée aux matchs
        activity: match ? p.activity : (p.activity ? 'week' : null),
        likedYou: store.likedBy(u.id, me.id),
        status: match ? 'match' : swipe ? (swipe.action === 'like' ? 'liked' : 'passed') : null,
        matchId: match?.id || null,
        since: u.createdAt,
      };
    })
    // Ceux qui attendent ta réponse d'abord, puis ceux que tu n'as pas encore vus, puis les balayés,
    // et les matchs en dernier : ils sont déjà dans Messages. À égalité : ton quartier, les plus actifs, les plus récents.
    .sort((a, b) => listRank(b) - listRank(a) || sameArea(me, b) - sameArea(me, a) || (ACTIVITY_RANK[b.activity] || 0) - (ACTIVITY_RANK[a.activity] || 0) || b.since - a.since)
    .slice(0, 50)
    .map(({ since, ...p }) => p);
  res.json({ profiles });
});

// Ceux qui ont aimé mon profil et attendent ma réponse. Un like est un signal qui m'est adressé :
// il ignore ma tranche d'âge, sinon « tu as plu à quelqu'un » mènerait parfois à un écran vide.
const likersOf = (me) => store.allUsers()
  .filter((u) => u.id !== me.id && isApproved(u) && !store.isBlocked(me.id, u.id) && compatible(me, u) && store.likedBy(u.id, me.id) && !store.hasSwiped(me.id, u.id))
  .sort((a, b) => store.swipeOf(b.id, me.id).at - store.swipeOf(a.id, me.id).at);

api.get('/likes', requireApproved, (req, res) => {
  const profiles = likersOf(req.user).slice(0, 20).map((u) => {
    const p = publicProfile(u);
    return { ...p, activity: p.activity ? 'week' : null, likedYou: true, status: null, matchId: null };
  });
  res.json({ profiles });
});

api.post('/swipes', requireApproved, limiter('swipe'), async (req, res) => {
  const me = req.user;
  const { targetId, action } = req.body || {};
  const target = store.getUser(targetId);
  if (!target || !['like', 'pass'].includes(action) || target.id === me.id) return fail(res, 400, 'SWIPE_INVALID', 'Action impossible.');
  if (store.swipesToday(me.id) >= config.dailyProfiles) return fail(res, 429, 'DAILY_LIMIT', "Tu as vu tous tes profils du jour. Reviens demain.");
  const previous = store.swipeOf(me.id, target.id);
  if (!previous) store.addSwipe(me.id, target.id, action);
  // Rattrapage depuis la liste : un « Passer » peut devenir un « J'aime ». L'inverse, non : un like
  // a pu prévenir la personne, on ne le retire pas en silence.
  else if (previous.action === 'pass' && action === 'like') store.updateSwipe(me.id, target.id, 'like');

  if (action === 'like') {
    // Les profils de démonstration « likent » en retour pour pouvoir tester seul
    if (target.demo && target.demoLikeBack !== false && !store.hasSwiped(target.id, me.id)) store.addSwipe(target.id, me.id, 'like');
    if (store.likedBy(target.id, me.id)) {
      const match = store.createMatch(me.id, target.id);
      notify(target.id, `Nouveau match : ${me.profile.name} et toi, vous vous plaisez.`, { label: 'Écrire', params: { screen: 'chat', match: match.id } });
      return res.json({ match: { id: match.id, other: publicProfile(target) } });
    }
    // Like non réciproque : on prévient la personne sans révéler qui (au plus une fois par jour)
    // Écran Messages, pas Découvrir : qui t'a liké apparaît dans /likes, qui ignore le filtre d'âge,
    // alors que /discover l'applique. La notification envoyait donc parfois vers un écran vide.
    notify(target.id, `Tu as plu à quelqu'un à ${target.profile.city}. Ouvre ${config.appName} pour découvrir de qui il s'agit.`, { label: 'Découvrir', params: { screen: 'matches' } }, 'likes', 24 * 3600 * 1000);
  }
  res.json({ match: null });
});

// ---------- Matchs et messages ----------
// Réponses de démo déjà programmées, pour ne pas répondre à chaque message envoyé rapidement
const demoPending = new Map();
function loadMatch(req, res) {
  const m = store.getMatch(req.params.id);
  if (!m || !m.users.includes(req.user.id)) { fail(res, 404, 'MATCH_NOT_FOUND', 'Discussion introuvable.'); return null; }
  const otherId = m.users.find((x) => x !== req.user.id);
  if (store.isBlocked(req.user.id, otherId)) { fail(res, 403, 'BLOCKED', 'Cette discussion est fermée.'); return null; }
  return { m, other: store.getUser(otherId) };
}

api.get('/matches', requireApproved, (req, res) => {
  const list = store.matchesOf(req.user.id)
    .map((m) => {
      const other = store.getUser(m.users.find((x) => x !== req.user.id));
      if (!other || store.isBlocked(req.user.id, other.id)) return null;
      const msgs = store.messagesOf(m.id);
      const dernier = msgs.at(-1) || null;
      return {
        id: m.id,
        other: publicProfile(other),
        lastMessage: dernier,
        createdAt: m.createdAt,
        unread: store.unreadCount(m.id, req.user.id),
        isNew: !store.hasOpened(m.id, req.user.id),
        // « moi » : c'est à moi de répondre, ou de commencer. « autre » : la balle est dans son camp.
        aQuiDeParler: !dernier ? 'moi' : dernier.from === req.user.id ? 'autre' : 'moi',
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.lastMessage?.at || b.createdAt) - (a.lastMessage?.at || a.createdAt));
  res.json({ matches: list });
});

// L'app signale sa fermeture : les notifications partent alors sans attendre
api.post('/presence/leave', (req, res) => {
  store.leavePresence(req.user.id);
  res.json({ ok: true });
});

// Compteurs pour les onglets (messages non lus, nouveaux matchs)
api.get('/summary', requireApproved, (req, res) => {
  let unread = 0, newMatches = 0;
  for (const m of store.matchesOf(req.user.id)) {
    const otherId = m.users.find((x) => x !== req.user.id);
    if (store.isBlocked(req.user.id, otherId)) continue;
    unread += store.unreadCount(m.id, req.user.id);
    if (!store.hasOpened(m.id, req.user.id)) newMatches += 1;
  }
  res.json({ unread, newMatches, likes: likersOf(req.user).length });
});

api.get('/matches/:id', requireApproved, (req, res) => {
  const r = loadMatch(req, res);
  if (!r) return;
  store.touchPresence(req.user.id, r.m.id);
  store.markRead(r.m.id, req.user.id);
  const after = Number(req.query.after || 0);
  // Premier chargement : tout. Interrogations suivantes : seulement les nouveaux messages.
  // Renvoyer le profil complet de l'autre personne toutes les quatre secondes coûtait environ
  // 700 Ko par heure de discussion ouverte, sans qu'aucun message n'arrive.
  const premierAppel = !req.query.suivi;
  const messages = store.messagesOf(r.m.id).filter((x) => x.at > after).map((x) => ({ ...x, mine: x.from === req.user.id }));
  // L'heure d'arrivée de l'autre personne n'est jamais renvoyée : savoir qu'elle est sur place
  // depuis douze minutes est une information de filature, pas une information de rendez-vous.
  const dates = store.datesOfMatch(r.m.id).map(({ arrivals, ...d }) => ({
    ...d,
    venue: venues.find((v) => v.id === d.venueId),
    arrivedMe: !!arrivals[req.user.id],
    arrivedOther: Object.keys(arrivals).some((id) => id !== req.user.id),
  }));
  const reponse = { id: r.m.id, messages };
  if (premierAppel) Object.assign(reponse, { other: publicProfile(r.other), dates, unlockAfter: config.contactUnlockAfter });
  // Un rendez-vous peut naître ou changer entre deux interrogations : on renvoie les rendez-vous
  // aussi quand l'un d'eux a bougé depuis le dernier appel.
  else if (dates.some((d) => (d.updatedAt || d.createdAt || 0) > after)) reponse.dates = dates;
  res.json(reponse);
});

api.post('/matches/:id/messages', requireApproved, limiter('message'), async (req, res) => {
  const r = loadMatch(req, res);
  if (!r) return;
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return fail(res, 400, 'EMPTY', "Écris un message avant d'envoyer.");
  // Le seuil compte l'échange, pas le total : en comptant tous les messages, il suffisait d'en
  // envoyer dix tout seul pour s'autoriser à donner son numéro.
  const messages = store.messagesOf(r.m.id);
  const echange = Math.min(
    messages.filter((x) => x.from === req.user.id).length,
    messages.filter((x) => x.from === r.other.id).length,
  );
  const check = checkMessage(text, echange, config.contactUnlockAfter);
  if (!check.ok) {
    // Un blocage d'argent est un signal utile pour la modération : c'est ainsi qu'on saura
    // quelles formulations circulent vraiment, et qu'on remplacera mon corpus écrit à la main.
    // Trois alertes par heure et par compte au plus, pour ne pas noyer le groupe.
    if (check.code === 'MONEY_BLOCKED' && consommer(req.user.id, 'alerteModeration') === null) {
      notifyAdmin(`Message bloqué (${check.categorie}) de ${req.user.profile.name} (ID ${req.user.id}) : « ${text.slice(0, 120)} »`);
    }
    return fail(res, 422, check.code, check.message);
  }

  const msg = store.addMessage(r.m.id, req.user.id, text);
  if (!store.isViewing(r.other.id, r.m.id)) {
    notify(r.other.id, `${req.user.profile.name} t'a écrit : « ${text.slice(0, 60)}${text.length > 60 ? '…' : ''} »`, { label: 'Répondre', params: { screen: 'chat', match: r.m.id } }, `msg:${r.m.id}`);
  }

  // Profil de démo : répond après un délai (le temps de fermer l'app pour tester la notification)
  const demoReplies = store.messagesOf(r.m.id).filter((x) => x.from === r.other.id).length + (demoPending.get(r.m.id) || 0);
  if (r.other.demo && demoReplies < DEMO_REPLIES.length) {
    const me = req.user;
    demoPending.set(r.m.id, (demoPending.get(r.m.id) || 0) + 1);
    setTimeout(() => {
      demoPending.set(r.m.id, demoPending.get(r.m.id) - 1);
      const reply = store.addMessage(r.m.id, r.other.id, DEMO_REPLIES[demoReplies]);
      if (!store.isViewing(me.id, r.m.id)) {
        notify(me.id, `${r.other.profile.name} t'a écrit : « ${reply.text.slice(0, 60)}${reply.text.length > 60 ? '…' : ''} »`, { label: 'Répondre', params: { screen: 'chat', match: r.m.id } }, `msg:${r.m.id}`);
      }
    }, config.demoReplyDelayMs);
  }
  res.json({ message: { ...msg, mine: true } });
});

// ---------- Démo : quelqu'un te « like » pendant ton absence ----------
onApproved((userId) => {
  if (!config.seedDemo) return;
  setTimeout(() => {
    const me = store.getUser(userId);
    if (!me?.profile) return;
    const demo = store.allUsers().find((u) => u.demo && compatible(me, u) && !store.hasSwiped(u.id, me.id) && !store.hasSwiped(me.id, u.id));
    if (!demo) return;
    store.addSwipe(demo.id, me.id, 'like');
    notify(me.id, `Tu as plu à quelqu'un à ${me.profile.city}. Ouvre ${config.appName} pour découvrir de qui il s'agit.`, { label: 'Découvrir', params: { screen: 'matches' } }, 'likes', 24 * 3600 * 1000);
  }, config.demoLikeDelayMs);
});

// ---------- Rendez-vous ----------
api.get('/venues', requireApproved, (req, res) => {
  const city = req.user.profile.city;
  res.json({ venues: venues.filter((v) => v.city === city).map(({ code, ...v }) => v) });
});

api.post('/matches/:id/dates', requireApproved, limiter('rendezvous'), (req, res) => {
  const r = loadMatch(req, res);
  if (!r) return;
  const venue = venues.find((v) => v.id === req.body?.venueId);
  const slot = String(req.body?.slot || '').slice(0, 40);
  if (!venue || !slot) return fail(res, 400, 'DATE_INVALID', 'Choisis un lieu et un horaire.');
  // Le créneau est un champ libre affiché à l'autre personne : il passe par le même filtre
  // que les messages, sinon il suffisait d'y écrire un numéro pour contourner le blocage.
  const controleSlot = checkMessage(slot, 0, config.contactUnlockAfter);
  if (!controleSlot.ok) return fail(res, 422, controleSlot.code, controleSlot.message);
  const d = store.addDate({ matchId: r.m.id, proposedBy: req.user.id, venueId: venue.id, slot, status: 'proposed' });
  notify(r.other.id, `${req.user.profile.name} te propose un rendez-vous : ${venue.name} (${venue.area}), ${slot}.`, { label: 'Voir la proposition', params: { screen: 'chat', match: r.m.id } });
  res.json({ date: { ...d, venue: { ...venue, code: undefined } } });
});

api.post('/dates/:id/checkin', requireApproved, (req, res) => {
  const d = store.getDate(req.params.id);
  const m = d && store.getMatch(d.matchId);
  if (!d || !m || !m.users.includes(req.user.id)) return fail(res, 404, 'DATE_NOT_FOUND', 'Rendez-vous introuvable.');
  // Un blocage ferme la discussion : il doit aussi fermer le rendez-vous. Sans ce contrôle,
  // quelqu'un de bloqué déclenchait encore une notification d'arrivée chez la personne protégée.
  const autreId = m.users.find((x) => x !== req.user.id);
  if (store.isBlocked(req.user.id, autreId)) return fail(res, 403, 'BLOCKED', 'Ce rendez-vous est annulé.');
  const venue = venues.find((v) => v.id === d.venueId);
  if (String(req.body?.code || '').trim() !== venue.code) return fail(res, 400, 'WRONG_VENUE', `Ce code ne correspond pas à ${venue.name}. Scanne le code posé sur ta table.`);
  store.updateDate(d.id, { arrivals: { ...d.arrivals, [req.user.id]: Date.now() } });
  notify(autreId, `${req.user.profile.name} est bien arrivé(e) à ${venue.name}.`, { label: 'Ouvrir la discussion', params: { screen: 'chat', match: m.id } });
  res.json({ arrived: true, venue: { name: venue.name, perk: venue.perk } });
});

// Défaire un match. Sans notification, volontairement : prévenir quelqu'un qu'on le retire
// expose la personne qui part. La discussion disparaît des deux côtés.
api.delete('/matches/:id', requireApproved, (req, res) => {
  const m = store.getMatch(req.params.id);
  if (!m || !m.users.includes(req.user.id)) return fail(res, 404, 'MATCH_NOT_FOUND', 'Discussion introuvable.');
  store.removeMatch(m.id);
  res.json({ removed: true });
});

// Bloquer sans accuser. Jusqu'ici, se débarrasser de quelqu'un passait obligatoirement par un
// signalement, donc par une accusation envoyée à la modération : beaucoup de gens ne le font pas,
// et restent exposés. Le blocage ferme la discussion, le rendez-vous et le check-in.
api.post('/blocks', requireApproved, limiter('signalement'), (req, res) => {
  const cible = store.getUser(req.body?.targetId);
  if (!cible || cible.id === req.user.id) return fail(res, 400, 'BLOCK_INVALID', 'Blocage impossible.');
  store.block(req.user.id, cible.id);
  const m = store.matchBetween(req.user.id, cible.id);
  if (m) store.removeMatch(m.id);
  res.json({ blocked: true });
});

// ---------- Signalements ----------
api.post('/reports', requireApproved, limiter('signalement'), (req, res) => {
  const { targetId, reason, matchId } = req.body || {};
  const target = store.getUser(targetId);
  if (!target || target.id === req.user.id) return fail(res, 400, 'REPORT_INVALID', 'Signalement impossible.');
  store.addReport({ from: req.user.id, targetId: target.id, reason: String(reason || 'autre').slice(0, 60), matchId: matchId || null });
  store.block(req.user.id, target.id);
  notifyAdmin(`Signalement : ${target.profile?.name || target.id} (ID ${target.id}), motif « ${reason || 'autre'} ».`);
  res.json({ reported: true });
});
