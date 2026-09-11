import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, runtime, venues, INTENTS, GENDERS, CITIES } from './config.js';
import { store } from './store.js';
import { requireAuth } from './auth.js';
import { checkMessage } from './antiscam.js';
import { notify, notifyAdmin, sendSelfieToModeration, decideVerification, onApproved } from './bot.js';
import { DEMO_REPLIES } from './seed.js';

export const api = express.Router();
api.use(requireAuth);
// Chaque appel authentifié vaut signe de vie : l'app interroge /summary toutes les 20 s tant qu'elle est ouverte
api.use((req, res, next) => { store.touchActivity(req.user.id); next(); });

const fail = (res, status, code, message) => res.status(status).json({ code, message });
const GESTURES = ['Lève deux doigts et souris', 'Touche ton oreille gauche', 'Fais un pouce levé', 'Pose ta main sur ta joue'];

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
    hasPhoto: !!p.hasPhoto,
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
    filters: filtersOf(u),
    notificationsAvailable: !!config.botToken,
    options: { intents: INTENTS, genders: GENDERS, cities: CITIES },
  });
});

api.put('/me/profile', (req, res) => {
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
  const profileText = [name, b.area, promptA, b.languages].filter(Boolean).join(' ');
  if (!checkMessage(profileText, 0, 1).ok) return fail(res, 400, 'PROFILE_CONTACT', "Ton profil ne doit contenir ni numéro, ni lien, ni pseudo, ni demande d'argent.");

  let hasPhoto = !!req.user.profile?.hasPhoto;
  if (b.photo) {
    if (!saveJpeg(b.photo, path.join(config.uploadsDir, `${req.user.id}-profile.jpg`))) return fail(res, 400, 'PHOTO_INVALID', 'Photo trop lourde ou format non pris en charge.');
    hasPhoto = true;
  }
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

api.post('/me/verification/start', (req, res) => {
  if (!req.user.profile) return fail(res, 400, 'PROFILE_REQUIRED', "Crée ton profil avant la vérification.");
  const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
  store.updateUser(req.user.id, { pendingGesture: gesture });
  res.json({ gesture });
});

api.post('/me/verification', async (req, res) => {
  const u = req.user;
  if (!u.profile) return fail(res, 400, 'PROFILE_REQUIRED', "Crée ton profil avant la vérification.");
  if (!u.pendingGesture) return fail(res, 400, 'GESTURE_REQUIRED', 'Demande un geste avant de prendre le selfie.');
  if (!saveJpeg(req.body?.selfie, path.join(config.uploadsDir, `${u.id}-selfie.jpg`))) return fail(res, 400, 'SELFIE_INVALID', 'Selfie illisible ou trop lourd. Réessaie.');
  store.updateUser(u.id, { verification: 'pending' });

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
api.get('/photos/:userId', requireApproved, (req, res) => {
  const target = store.getUser(req.params.userId);
  const file = path.join(config.uploadsDir, `${req.params.userId}-profile.jpg`);
  if (!target?.profile?.hasPhoto || !fs.existsSync(file) || store.isBlocked(req.user.id, target.id)) return fail(res, 404, 'NO_PHOTO', 'Pas de photo.');
  res.set('Cache-Control', 'private, max-age=3600').sendFile(file);
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

api.get('/discover', requireApproved, (req, res) => {
  const me = req.user;
  const remaining = Math.max(0, config.dailyProfiles - store.swipesToday(me.id));
  if (!remaining) return res.json({ profiles: [], remaining: 0 });
  const profiles = store.allUsers()
    .filter((u) => u.id !== me.id && isApproved(u) && !store.hasSwiped(me.id, u.id) && !store.isBlocked(me.id, u.id) && compatible(me, u) && inAgeRange(me, u))
    // Avant le match, on ne dit que « cette semaine » ou rien : la tranche fine est réservée aux matchs
    .map((u) => { const p = publicProfile(u); return { ...p, activity: p.activity ? 'week' : null, likedYou: store.likedBy(u.id, me.id) }; })
    // Ceux qui t'ont liké, puis ton quartier
    .sort((a, b) => Number(b.likedYou) - Number(a.likedYou) || sameArea(me, b) - sameArea(me, a))
    .slice(0, Math.min(10, remaining));
  res.json({ profiles, remaining });
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

api.post('/swipes', requireApproved, async (req, res) => {
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
    if (target.demo && !store.hasSwiped(target.id, me.id)) store.addSwipe(target.id, me.id, 'like');
    if (store.likedBy(target.id, me.id)) {
      const match = store.createMatch(me.id, target.id);
      notify(target.id, `Nouveau match : ${me.profile.name} et toi, vous vous plaisez.`, { label: 'Écrire', params: { screen: 'chat', match: match.id } });
      return res.json({ match: { id: match.id, other: publicProfile(target) } });
    }
    // Like non réciproque : on prévient la personne sans révéler qui (au plus une fois par jour)
    notify(target.id, `Tu as plu à quelqu'un à ${target.profile.city}. Ouvre ${config.appName} pour découvrir de qui il s'agit.`, { label: 'Découvrir', params: { screen: 'discover' } }, 'likes', 24 * 3600 * 1000);
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
      return { id: m.id, other: publicProfile(other), lastMessage: msgs.at(-1) || null, createdAt: m.createdAt, unread: store.unreadCount(m.id, req.user.id), isNew: !store.hasOpened(m.id, req.user.id) };
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
  const messages = store.messagesOf(r.m.id).filter((x) => x.at > after).map((x) => ({ ...x, mine: x.from === req.user.id }));
  const dates = store.datesOfMatch(r.m.id).map((d) => ({ ...d, venue: venues.find((v) => v.id === d.venueId), arrivedMe: !!d.arrivals[req.user.id] }));
  res.json({ id: r.m.id, other: publicProfile(r.other), messages, dates, unlockAfter: config.contactUnlockAfter });
});

api.post('/matches/:id/messages', requireApproved, async (req, res) => {
  const r = loadMatch(req, res);
  if (!r) return;
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return fail(res, 400, 'EMPTY', "Écris un message avant d'envoyer.");
  const check = checkMessage(text, store.messagesOf(r.m.id).length, config.contactUnlockAfter);
  if (!check.ok) return fail(res, 422, check.code, check.message);

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
    notify(me.id, `Tu as plu à quelqu'un à ${me.profile.city}. Ouvre ${config.appName} pour découvrir de qui il s'agit.`, { label: 'Découvrir', params: { screen: 'discover' } }, 'likes', 24 * 3600 * 1000);
  }, config.demoLikeDelayMs);
});

// ---------- Rendez-vous ----------
api.get('/venues', requireApproved, (req, res) => {
  const city = req.user.profile.city;
  res.json({ venues: venues.filter((v) => v.city === city).map(({ code, ...v }) => v) });
});

api.post('/matches/:id/dates', requireApproved, (req, res) => {
  const r = loadMatch(req, res);
  if (!r) return;
  const venue = venues.find((v) => v.id === req.body?.venueId);
  const slot = String(req.body?.slot || '').slice(0, 40);
  if (!venue || !slot) return fail(res, 400, 'DATE_INVALID', 'Choisis un lieu et un horaire.');
  const d = store.addDate({ matchId: r.m.id, proposedBy: req.user.id, venueId: venue.id, slot, status: 'proposed' });
  notify(r.other.id, `${req.user.profile.name} te propose un rendez-vous : ${venue.name} (${venue.area}), ${slot}.`, { label: 'Voir la proposition', params: { screen: 'chat', match: r.m.id } });
  res.json({ date: { ...d, venue: { ...venue, code: undefined } } });
});

api.post('/dates/:id/checkin', requireApproved, (req, res) => {
  const d = store.getDate(req.params.id);
  const m = d && store.getMatch(d.matchId);
  if (!d || !m || !m.users.includes(req.user.id)) return fail(res, 404, 'DATE_NOT_FOUND', 'Rendez-vous introuvable.');
  const venue = venues.find((v) => v.id === d.venueId);
  if (String(req.body?.code || '').trim() !== venue.code) return fail(res, 400, 'WRONG_VENUE', `Ce code ne correspond pas à ${venue.name}. Scanne le code posé sur ta table.`);
  store.updateDate(d.id, { arrivals: { ...d.arrivals, [req.user.id]: Date.now() } });
  const otherId = m.users.find((x) => x !== req.user.id);
  notify(otherId, `${req.user.profile.name} est bien arrivé(e) à ${venue.name}.`, { label: 'Ouvrir la discussion', params: { screen: 'chat', match: m.id } });
  res.json({ arrived: true, venue: { name: venue.name, perk: venue.perk } });
});

// ---------- Signalements ----------
api.post('/reports', requireApproved, (req, res) => {
  const { targetId, reason, matchId } = req.body || {};
  const target = store.getUser(targetId);
  if (!target || target.id === req.user.id) return fail(res, 400, 'REPORT_INVALID', 'Signalement impossible.');
  store.addReport({ from: req.user.id, targetId: target.id, reason: String(reason || 'autre').slice(0, 60), matchId: matchId || null });
  store.block(req.user.id, target.id);
  notifyAdmin(`Signalement : ${target.profile?.name || target.id} (ID ${target.id}), motif « ${reason || 'autre'} ».`);
  res.json({ reported: true });
});
