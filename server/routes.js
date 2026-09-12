import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, runtime, venues, INTENTS, GENDERS } from './config.js';
import { estPays, cleVille, villeAffichee, paysDuFuseau, COUNTRY_CODES, VILLES_CONNUES, nomPays } from './geo.js';
import { LANGUES, t as tr } from './i18n.js';
import { store } from './store.js';
import { requireAuth } from './auth.js';
import { checkMessage } from './antiscam.js';
import { limiter, consommer } from './limites.js';
import { notify, notifyAdmin, boutonBannir, sendSelfieToModeration, sendPhotoToModeration, decideVerification, onApproved } from './bot.js';
import { DEMO_REPLIES } from './seed.js';

export const api = express.Router();

// Express 4 n'attend pas les promesses que rendent les gestionnaires. Depuis que le stockage est
// asynchrone, une requête qui échoue en base laisserait la promesse rejetée sans personne pour
// l'attraper : la requête resterait suspendue jusqu'au délai du client, au lieu de renvoyer une
// erreur. On enveloppe donc chaque gestionnaire une fois pour toutes, à l'enregistrement.
// Les gestionnaires d'erreur d'Express prennent quatre arguments : ils ne sont pas enveloppés.
for (const verbe of ['get', 'post', 'put', 'delete', 'patch', 'use', 'all']) {
  const original = api[verbe].bind(api);
  api[verbe] = (...args) => original(...args.map((a) => (
    typeof a === 'function' && a.length < 4
      ? (req, res, next) => Promise.resolve(a(req, res, next)).catch(next)
      : a
  )));
}

api.use(requireAuth);
// Chaque appel authentifié vaut signe de vie : l'app interroge /summary toutes les 20 s tant qu'elle est ouverte
api.use(async (req, res, next) => { await store.touchActivity(req.user.id); next(); });

// L'interface traduit les erreurs par leur code ; certaines phrases ont besoin d'une valeur
// (le nombre de messages, le nom du lieu). extra les transporte, sans jamais traduire côté serveur.
const fail = (res, status, code, message, extra) => res.status(status).json({ code, message, ...extra });
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
async function publicProfile(user) {
  const p = user.profile || {};
  return {
    id: user.id,
    name: p.name,
    age: p.age,
    intent: p.intent,
    intentLabel: INTENTS[p.intent],
    country: p.country,
    city: p.city,
    area: p.area,
    promptQ: p.promptQ,
    promptA: p.promptA,
    languages: p.languages || '',
    // Seules les photos validées par la modération sont montrées aux autres
    photos: (await store.photosOf(user)).filter((x) => x.status === 'approved').map((x) => x.n),
    hasPhoto: (await store.photosOf(user)).some((x) => x.status === 'approved'),
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

// Un compte banni n'est plus « vérifié » au sens de la découverte : il disparaît des cartes, des
// listes et des « ont aimé ton profil » d'un coup, parce que tout passe par là.
const isApproved = (u) => u.verification === 'approved' && u.profile && !u.banned;
const requireApproved = (req, res, next) => (isApproved(req.user) ? next() : fail(res, 403, 'NOT_VERIFIED', 'Vérifie ton profil pour accéder à cette fonction.'));

// ---------- Moi ----------
api.get('/me', async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    firstName: u.firstName,
    profile: u.profile,
    verification: u.verification,
    pendingGesture: u.pendingGesture || null,
    botUsername: runtime.botUsername,
    appName: config.appName,
    publicProfile: u.profile ? await publicProfile(u) : null,
    photos: await store.photosOf(u),
    filters: filtersOf(u),
    notificationsAvailable: !!config.botToken,
    // Les noms de pays ne transitent pas : le navigateur les affiche dans la langue de la
    // personne à partir du code ISO. On n'envoie donc que les codes, et des suggestions de villes.
    lang: u.lang || null,
    options: {
      intents: INTENTS, genders: GENDERS, countries: COUNTRY_CODES, knownCities: VILLES_CONNUES,
      defaultCountry: config.defaultCountry,
      // Pays déduit du fuseau envoyé par le navigateur (?tz=). Il n'est ni stocké ni journalisé :
      // il sert à préremplir le menu, puis il est oublié. null si le fuseau est inconnu.
      suggestedCountry: paysDuFuseau(req.query.tz),
    },
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
  // Pays : une liste fermée, parce qu'il en existe un nombre fini et que la comparaison doit être
  // exacte. Ville : un champ libre, parce qu'aucune liste ne couvre le monde. Les comptes créés
  // avant l'ouverture internationale n'ont pas de pays : ils gardent celui par défaut.
  const country = estPays(b.country) ? String(b.country).toUpperCase() : (req.user.profile?.country || config.defaultCountry);
  const city = villeAffichee(String(b.city || '').slice(0, 40));
  if (cleVille(city).length < 2) return fail(res, 400, 'CITY_REQUIRED', 'Indique ta ville.');
  const promptA = String(b.promptA || '').trim().slice(0, 120);
  if (promptA.length < 3) return fail(res, 400, 'PROMPT_REQUIRED', 'Réponds à la question pour que les autres te découvrent.');
  const profileText = [name, b.area, b.promptQ, promptA, b.languages].filter(Boolean).join(' ');
  if (!checkMessage(profileText, 0, 1).ok) return fail(res, 400, 'PROFILE_CONTACT', "Ton profil ne doit contenir ni numéro, ni lien, ni pseudo, ni demande d'argent.");

  // Ancien champ « photo » : il alimente l'emplacement 1, avec la même modération. L'interface
  // envoie désormais les photos à PUT /me/photos/:n ; ce chemin ne sert plus qu'aux vieux clients.
  // Une image refusée arrête l'enregistrement, mais une modération injoignable ne doit pas faire
  // perdre le profil : l'emplacement a déjà été retiré, la personne réessaiera la photo seule.
  let photos = null;
  if (b.photo) {
    const r = await acceptPhoto(req.user, 1, b.photo);
    if (r.code === 'PHOTO_INVALID') return fail(res, 400, r.code, r.message);
    photos = r.photos;
  }
  const hasPhoto = (photos || await store.photosOf(req.user)).some((x) => x.status === 'approved');
  const profile = {
    name, age, gender: b.gender, intent: b.intent, country, city,
    // Clé de comparaison, jamais affichée : c'est elle qui réunit « Yaoundé » et « Yaounde »
    cityKey: cleVille(city),
    area: String(b.area || '').trim().slice(0, 40),
    promptQ: String(b.promptQ || 'Mon plat du dimanche').slice(0, 60),
    promptA,
    languages: String(b.languages || '').trim().slice(0, 60),
    hasPhoto,
  };
  await store.updateUser(req.user.id, { profile });
  res.json({ profile });
});

api.post('/me/verification/start', limiter('verification'), async (req, res) => {
  if (!req.user.profile) return fail(res, 400, 'PROFILE_REQUIRED', "Crée ton profil avant la vérification.");
  // Un compte déjà vérifié ne repasse pas par là : sinon une simple modification de profil
  // suffisait à perdre son badge, et un compte validé pouvait se rétrograder tout seul.
  if (req.user.verification === 'approved') return fail(res, 409, 'ALREADY_VERIFIED', 'Ton profil est déjà vérifié.');
  const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
  await store.updateUser(req.user.id, { pendingGesture: gesture, pendingGestureAt: Date.now() });
  res.json({ gesture });
});

api.post('/me/verification', limiter('verification'), async (req, res) => {
  const u = req.user;
  if (!u.profile) return fail(res, 400, 'PROFILE_REQUIRED', "Crée ton profil avant la vérification.");
  if (!u.pendingGesture) return fail(res, 400, 'GESTURE_REQUIRED', 'Demande un geste avant de prendre le selfie.');
  // Le geste est à usage unique et périme : sans cela, on pouvait tirer des gestes jusqu'à
  // tomber sur celui d'une photo déjà prise, ou réutiliser un selfie ancien.
  if (Date.now() - (u.pendingGestureAt || 0) > GESTURE_TTL_MS) {
    await store.updateUser(u.id, { pendingGesture: null, pendingGestureAt: null });
    return fail(res, 400, 'GESTURE_EXPIRED', 'Ce geste a expiré. Demandes-en un nouveau et reprends le selfie.');
  }
  if (!saveJpeg(req.body?.selfie, path.join(config.uploadsDir, `${u.id}-selfie.jpg`))) return fail(res, 400, 'SELFIE_INVALID', 'Selfie illisible ou trop lourd. Réessaie.');
  await store.updateUser(u.id, { verification: 'pending', pendingGestureAt: null, verificationSentAt: Date.now() });

  const sent = await sendSelfieToModeration(u.id).catch((e) => { console.warn('Envoi en modération impossible :', e.message); return false; });
  if (config.autoApprove) {
    // Tests uniquement : validation automatique. En production : AUTO_APPROVE=false et ADMIN_CHAT_ID configuré.
    setTimeout(() => decideVerification(u.id, true), 3000);
  } else if (!sent && config.adminChatId) {
    // La modération est configurée, et pourtant le selfie n'est pas parti. Le laisser « en attente »
    // condamnerait la personne à attendre sept jours une décision que personne ne peut prendre,
    // sans rien lui dire. On efface le selfie, on rend le compte à son état d'avant, et on l'annonce.
    const selfie = path.join(config.uploadsDir, `${u.id}-selfie.jpg`);
    if (fs.existsSync(selfie)) fs.unlinkSync(selfie);
    await store.updateUser(u.id, { verification: 'none', pendingGesture: null, pendingGestureAt: null, verificationSentAt: null });
    console.error(`Selfie de ${u.id} non transmis à la modération : la personne a été invitée à réessayer.`);
    return fail(res, 503, 'SELFIE_NOT_SENT', 'On n\'a pas pu envoyer ton selfie en modération. Réessaie dans quelques minutes.');
  } else if (!sent) {
    console.warn(`Selfie de ${u.id} en attente : configure BOT_TOKEN et ADMIN_CHAT_ID pour le recevoir en modération.`);
  }
  res.json({ verification: 'pending' });
});

// Langue choisie explicitement. Gardée sur le compte pour que le bot écrive dans la même langue
// que l'interface, même quand l'app est fermée. Deux lettres, rien de plus : ce n'est pas une
// donnée personnelle nouvelle au sens du profil, c'est un réglage d'affichage.
api.put('/me/lang', async (req, res) => {
  const lang = String(req.body?.lang || '').slice(0, 5).toLowerCase();
  if (!LANGUES.includes(lang)) return fail(res, 400, 'LANG_INVALID', 'Langue non prise en charge.');
  await store.updateUser(req.user.id, { lang });
  res.json({ lang });
});

api.post('/me/test-notification', async (req, res) => {
  const r = await notify(req.user.id, 'Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.', { app: config.appName }, { label: 'Ouvrir {app}', params: { screen: 'me' } }, 'test', 30 * 1000);
  const messages = {
    NO_BOT: "Le bot n'est pas configuré sur le serveur (BOT_TOKEN).",
    THROTTLED: 'Patiente 30 secondes avant un nouveau test.',
    TELEGRAM_ERROR: "Telegram a refusé l'envoi. Envoie /start au bot puis réessaie.",
    NO_USER: 'Compte introuvable.',
  };
  res.json({ sent: r.sent, message: r.sent ? `Message envoyé : ferme ${config.appName} et regarde ta conversation avec le bot.` : messages[r.reason] });
});

api.delete('/me', async (req, res) => {
  await store.deleteUser(req.user.id);
  res.json({ deleted: true });
});

// ---------- Photos : jusqu'à trois, chacune modérée avant d'être montrée ----------
const PHOTO_SLOTS = [1, 2, 3];
// Renvoie `{ photos }` quand tout s'est bien passé, sinon `{ code, message }` prêt pour fail().
// La liste vient du stockage et non de req.user : cette copie de la personne date du début de la
// requête, et l'enregistrement qu'on vient de faire ne s'y trouve pas.
async function acceptPhoto(user, n, dataUrl) {
  if (!saveJpeg(dataUrl, path.join(config.uploadsDir, `${user.id}-photo-${n}.jpg`))) {
    return { code: 'PHOTO_INVALID', message: 'Photo trop lourde ou format non pris en charge.' };
  }
  // Tests uniquement : validation automatique. En production : AUTO_APPROVE=false et ADMIN_CHAT_ID configuré.
  const photos = await store.setPhoto(user.id, n, config.autoApprove ? 'approved' : 'pending');
  if (config.autoApprove) return { photos };

  const sent = await sendPhotoToModeration(user.id, n).catch((e) => { console.warn('Envoi en modération impossible :', e.message); return false; });
  if (sent) return { photos };
  if (!config.adminChatId) {
    // Pas de modération configurée : c'est le cas d'un poste de développement, pas une panne.
    console.warn(`Photo ${n} de ${user.id} en attente : configure BOT_TOKEN et ADMIN_CHAT_ID pour la recevoir en modération.`);
    return { photos };
  }
  // Même raisonnement que pour le selfie : une photo « en attente » que personne ne peut trancher
  // reste en attente pour toujours. On retire l'emplacement plutôt que de faire semblant.
  console.error(`Photo ${n} de ${user.id} non transmise à la modération : l'emplacement a été retiré.`);
  return { code: 'PHOTO_NOT_SENT', message: 'On n\'a pas pu envoyer ta photo en modération. Réessaie dans quelques minutes.', photos: await store.removePhoto(user.id, n) };
}
const slotOf = (req) => (PHOTO_SLOTS.includes(Number(req.params.n)) ? Number(req.params.n) : null);

api.put('/me/photos/:n', limiter('photo'), async (req, res) => {
  const n = slotOf(req);
  if (!n) return fail(res, 400, 'PHOTO_SLOT', 'Trois photos au plus.');
  if (!req.user.profile) return fail(res, 400, 'PROFILE_REQUIRED', 'Crée ton profil avant d\'ajouter des photos.');
  const r = await acceptPhoto(req.user, n, req.body?.photo);
  if (r.code) return fail(res, r.code === 'PHOTO_INVALID' ? 400 : 503, r.code, r.message);
  res.json({ photos: r.photos });
});

api.delete('/me/photos/:n', async (req, res) => {
  const n = slotOf(req);
  if (!n) return fail(res, 400, 'PHOTO_SLOT', 'Trois photos au plus.');
  res.json({ photos: await store.removePhoto(req.user.id, n) });
});

// ---------- Filtres : ce que je veux voir ----------
// La tranche d'âge et la zone de recherche. L'intention vient du profil.
//
// La zone est celle où l'on veut rencontrer, pas forcément celle où l'on habite : quelqu'un qui
// déménage ou qui voyage règle sa zone avant d'arriver. Une ville nulle veut dire « tout le pays ».
// Chaque personne décide de son propre paquet : si je cherche dans tout le pays et que l'autre ne
// cherche que sa ville, je la vois sans qu'elle me voie. C'est l'usage de toutes les applications
// de rencontre, où le rayon de chacun ne s'impose qu'à lui.
const DEFAULT_FILTERS = { ageMin: 18, ageMax: 99 };
const zoneParDefaut = (u) => ({ country: u.profile?.country || config.defaultCountry, city: u.profile?.city || null });
const filtersOf = (u) => ({ ...DEFAULT_FILTERS, zone: zoneParDefaut(u), ...(u.filters || {}) });
const inAgeRange = (me, other) => { const f = filtersOf(me); return other.profile.age >= f.ageMin && other.profile.age <= f.ageMax; };

// La zone de la personne qui cherche s'applique à son seul paquet.
function dansLaZone(me, other) {
  const zone = filtersOf(me).zone || zoneParDefaut(me);
  const b = other.profile;
  if ((b.country || config.defaultCountry) !== zone.country) return false;
  if (!zone.city) return true;
  return (b.cityKey || cleVille(b.city)) === cleVille(zone.city);
}

api.put('/me/filters', async (req, res) => {
  const ageMin = Number(req.body?.ageMin), ageMax = Number(req.body?.ageMax);
  const ok = (n) => Number.isInteger(n) && n >= 18 && n <= 99;
  if (!ok(ageMin) || !ok(ageMax)) return fail(res, 400, 'FILTERS_INVALID', 'Indique des âges entre 18 et 99 ans.');
  if (ageMin > ageMax) return fail(res, 400, 'FILTERS_INVALID', "L'âge minimum doit être inférieur ou égal au maximum.");

  // Une requête sans zone ne touche pas à la zone : l'écran des filtres peut n'envoyer que l'âge.
  let zone = filtersOf(req.user).zone;
  if (req.body?.zone) {
    const z = req.body.zone;
    const country = estPays(z.country) ? String(z.country).toUpperCase() : zone.country;
    // city null ou vide : tout le pays. Sinon une ville, qui doit être lisible.
    const ville = z.city == null || z.city === '' ? null : villeAffichee(String(z.city).slice(0, 40));
    if (ville !== null && cleVille(ville).length < 2) return fail(res, 400, 'ZONE_INVALID', 'Indique une ville, ou choisis tout le pays.');
    zone = { country, city: ville };
  }

  const filters = { ageMin, ageMax, zone };
  await store.updateUser(req.user.id, { filters });
  res.json({ filters });
});

// ---------- Photos (servies uniquement aux membres vérifiés) ----------
// Une photo n'est servie aux autres qu'une fois validée ; on voit les siennes quel que soit leur état
async function servePhoto(req, res, n) {
  const target = await store.getUser(req.params.userId);
  if (!target || await store.isBlocked(req.user.id, target.id)) return fail(res, 404, 'NO_PHOTO', 'Pas de photo.');
  const own = target.id === req.user.id;
  const photo = (await store.photosOf(target)).find((x) => x.n === n && (own || x.status === 'approved'));
  const file = path.join(config.uploadsDir, `${target.id}-photo-${n}.jpg`);
  if (!photo || !fs.existsSync(file)) return fail(res, 404, 'NO_PHOTO', 'Pas de photo.');
  res.set('Cache-Control', 'private, max-age=3600').sendFile(file);
}
api.get('/photos/:userId/:n', requireApproved, async (req, res) => await servePhoto(req, res, Number(req.params.n)));
// Sans numéro : la première photo validée (adresse historique)
api.get('/photos/:userId', requireApproved, async (req, res) => {
  const target = await store.getUser(req.params.userId);
  const first = target && (await store.photosOf(target)).find((x) => x.status === 'approved');
  await servePhoto(req, res, first ? first.n : 1);
});

// ---------- Découverte ----------
// Ce qui rend deux personnes compatibles, indépendamment de l'endroit : la même intention, et la
// règle de mise en relation. La géographie est traitée à part, par dansLaZone(), parce qu'elle
// dépend de qui regarde.
function compatible(me, other) {
  const a = me.profile, b = other.profile;
  if (!a || !b || a.intent !== b.intent) return false;
  // Voir README, section Juridique : pour « Relation sérieuse », mise en relation femme/homme uniquement
  if (a.intent === 'serieux' && config.matchPolicy === 'romance_opposite' && a.gender === b.gender) return false;
  return true;
}

// Même quartier que moi ? Le quartier déclaré tient lieu de proximité, sans jamais demander la position
// Le tri se fait désormais sur la personne brute, pas sur son profil public : on lit donc u.profile.
const sameArea = (me, u) => Number(!!me.profile.area && u.profile.area === me.profile.area);

// Un écran vide ne dit rien s'il ne dit pas pourquoi. Trois situations très différentes se
// ressemblaient : personne d'autre n'est vérifié dans ta ville, tu as déjà tout vu, ou ton quota
// du jour est épuisé. On renvoie donc de quoi les distinguer et proposer le bon geste.
// Les relations d'une personne, chargées une fois par requête. La découverte doit savoir, pour
// chaque candidat, s'il est bloqué, si je l'ai déjà balayé et s'il m'a liké : poser ces questions
// une par une faisait un aller-retour vers la base par profil. On les charge en trois requêtes,
// et tous les filtres redeviennent locaux et synchrones.
async function relations(me) {
  const [bloques, envoyes, recus, matchs] = await Promise.all([
    store.blocksOf(me.id), store.swipesFrom(me.id), store.swipesTo(me.id), store.matchesOf(me.id),
  ]);
  return {
    bloque: new Set(bloques),
    monSwipe: new Map(envoyes.map((s) => [s.to, s])),
    maLike: new Map(recus.filter((x) => x.action === 'like').map((x) => [x.from, x])),
    match: new Map(matchs.map((m) => [m.users.find((x) => x !== me.id), m])),
  };
}

// Joignable : vérifié, pas moi, pas bloqué, même intention. Ce socle vaut pour tout le monde.
const joignable = (me, rel, u) => u.id !== me.id && isApproved(u) && !rel.bloque.has(u.id) && compatible(me, u);
// Candidat : joignable et dans la zone que je cherche. La zone filtre ce que JE vais voir ;
// un like reçu, lui, m'est adressé et la traverse (voir likersOf).
const candidat = (me, rel, u) => joignable(me, rel, u) && dansLaZone(me, u);

// Un écran vide ne dit rien s'il ne dit pas pourquoi. Trois situations très différentes se
// ressemblaient : personne d'autre n'est vérifié dans ta ville, tu as déjà tout vu, ou ton quota
// du jour est épuisé. On renvoie donc de quoi les distinguer et proposer le bon geste.
function vivier(me, rel, tous) {
  const compatibles = tous.filter((u) => candidat(me, rel, u));
  return {
    total: compatibles.length,
    horsTranche: compatibles.filter((u) => !inAgeRange(me, u)).length,
    vus: compatibles.filter((u) => inAgeRange(me, u) && rel.monSwipe.has(u.id)).length,
  };
}

api.get('/discover', requireApproved, async (req, res) => {
  const me = req.user;
  const remaining = Math.max(0, config.dailyProfiles - await store.swipesToday(me.id));
  const [tous, rel] = await Promise.all([store.allUsers(), relations(me)]);
  if (!remaining) return res.json({ profiles: [], remaining: 0, vivier: vivier(me, rel, tous) });
  // Le tri passe avant la mise en forme : publicProfile n'est appelé que sur les dix cartes
  // envoyées, au lieu de l'être sur tout le vivier pour en jeter la plus grande part.
  const retenus = tous
    .filter((u) => candidat(me, rel, u) && !rel.monSwipe.has(u.id) && inAgeRange(me, u))
    // Ceux qui t'ont liké, puis ton quartier
    .sort((a, b) => Number(rel.maLike.has(b.id)) - Number(rel.maLike.has(a.id)) || sameArea(me, b) - sameArea(me, a))
    .slice(0, Math.min(10, remaining));
  const profiles = await Promise.all(retenus.map(async (u) => {
    const p = await publicProfile(u);
    // Avant le match, on ne dit que « cette semaine » ou rien : la tranche fine est réservée aux matchs
    return { ...p, activity: p.activity ? 'week' : null, likedYou: rel.maLike.has(u.id) };
  }));
  res.json({ profiles, remaining, vivier: vivier(me, rel, tous) });
});

// Liste des profils compatibles, balayés ou non : la vue d'ensemble que les cartes n'offrent pas.
// Parcourir ne consomme rien ; seul un « J'aime » compte dans le quota du jour (route /swipes).
const ACTIVITY_RANK = { recent: 3, today: 2, week: 1 };
const listRank = (p) => (p.status === 'match' ? 0 : p.status ? 1 : p.likedYou ? 3 : 2);
api.get('/profiles', requireApproved, async (req, res) => {
  const me = req.user;
  const [tous, rel] = await Promise.all([store.allUsers(), relations(me)]);
  // Le rang et l'activité se calculent sur la personne brute et ses relations : le tri n'a pas
  // besoin de publicProfile, qui n'est donc appelé que sur les cinquante lignes renvoyées.
  const rang = (u) => {
    const m = rel.match.get(u.id);
    const swipe = rel.monSwipe.get(u.id);
    const status = m ? 'match' : swipe ? (swipe.action === 'like' ? 'liked' : 'passed') : null;
    const brute = activityBucket(u.lastActiveAt);
    return { m, swipe, status, activity: m ? brute : (brute ? 'week' : null), likedYou: rel.maLike.has(u.id) };
  };
  const retenus = tous
    .filter((u) => candidat(me, rel, u) && inAgeRange(me, u))
    .map((u) => ({ u, ...rang(u) }))
    // Ceux qui attendent ta réponse d'abord, puis ceux que tu n'as pas encore vus, puis les balayés,
    // et les matchs en dernier : ils sont déjà dans Messages. À égalité : ton quartier, les plus actifs, les plus récents.
    .sort((a, b) => listRank(b) - listRank(a) || sameArea(me, b.u) - sameArea(me, a.u)
      || (ACTIVITY_RANK[b.activity] || 0) - (ACTIVITY_RANK[a.activity] || 0) || b.u.createdAt - a.u.createdAt)
    .slice(0, 50);
  const profiles = await Promise.all(retenus.map(async ({ u, m, status, activity, likedYou }) => ({
    ...(await publicProfile(u)),
    activity,
    likedYou,
    status,
    matchId: m?.id || null,
  })));
  res.json({ profiles });
});

// Ceux qui ont aimé mon profil et attendent ma réponse. Un like est un signal qui m'est adressé :
// il ignore ma tranche d'âge et ma zone de recherche, sinon « tu as plu à quelqu'un » mènerait
// parfois à un écran vide.
const likersOf = (me, rel, tous) => tous
  .filter((u) => joignable(me, rel, u) && rel.maLike.has(u.id) && !rel.monSwipe.has(u.id))
  .sort((a, b) => rel.maLike.get(b.id).at - rel.maLike.get(a.id).at);

api.get('/likes', requireApproved, async (req, res) => {
  const me = req.user;
  const [tous, rel] = await Promise.all([store.allUsers(), relations(me)]);
  const profiles = await Promise.all(likersOf(me, rel, tous).slice(0, 20).map(async (u) => {
    const p = await publicProfile(u);
    return { ...p, activity: p.activity ? 'week' : null, likedYou: true, status: null, matchId: null };
  }));
  res.json({ profiles });
});

api.post('/swipes', requireApproved, limiter('swipe'), async (req, res) => {
  const me = req.user;
  const { targetId, action } = req.body || {};
  const target = await store.getUser(targetId);
  if (!target || !['like', 'pass'].includes(action) || target.id === me.id) return fail(res, 400, 'SWIPE_INVALID', 'Action impossible.');
  if (await store.swipesToday(me.id) >= config.dailyProfiles) return fail(res, 429, 'DAILY_LIMIT', "Tu as vu tous tes profils du jour. Reviens demain.");
  const previous = await store.swipeOf(me.id, target.id);
  if (!previous) await store.addSwipe(me.id, target.id, action);
  // Rattrapage depuis la liste : un « Passer » peut devenir un « J'aime ». L'inverse, non : un like
  // a pu prévenir la personne, on ne le retire pas en silence.
  else if (previous.action === 'pass' && action === 'like') await store.updateSwipe(me.id, target.id, 'like');

  if (action === 'like') {
    // Les profils de démonstration « likent » en retour pour pouvoir tester seul
    if (target.demo && target.demoLikeBack !== false && !await store.hasSwiped(target.id, me.id)) await store.addSwipe(target.id, me.id, 'like');
    if (await store.likedBy(target.id, me.id)) {
      const match = await store.createMatch(me.id, target.id);
      notify(target.id, 'Nouveau match : {nom} et toi, vous vous plaisez.', { nom: me.profile.name }, { label: 'Écrire', params: { screen: 'chat', match: match.id } });
      return res.json({ match: { id: match.id, other: await publicProfile(target) } });
    }
    // Like non réciproque : on prévient la personne sans révéler qui (au plus une fois par jour)
    // Écran Messages, pas Découvrir : qui t'a liké apparaît dans /likes, qui ignore le filtre d'âge,
    // alors que /discover l'applique. La notification envoyait donc parfois vers un écran vide.
    notify(target.id, "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.", { ville: target.profile.city, app: config.appName }, { label: 'Découvrir', params: { screen: 'matches' } }, 'likes', 24 * 3600 * 1000);
  }
  res.json({ match: null });
});

// ---------- Matchs et messages ----------
// Réponses de démo déjà programmées, pour ne pas répondre à chaque message envoyé rapidement
const demoPending = new Map();
async function loadMatch(req, res) {
  const m = await store.getMatch(req.params.id);
  if (!m || !m.users.includes(req.user.id)) { fail(res, 404, 'MATCH_NOT_FOUND', 'Discussion introuvable.'); return null; }
  const otherId = m.users.find((x) => x !== req.user.id);
  if (await store.isBlocked(req.user.id, otherId)) { fail(res, 403, 'BLOCKED', 'Cette discussion est fermée.'); return null; }
  return { m, other: await store.getUser(otherId) };
}

api.get('/matches', requireApproved, async (req, res) => {
  const me = req.user;
  const bloques = new Set(await store.blocksOf(me.id));
  const lignes = await Promise.all((await store.matchesOf(me.id)).map(async (m) => {
    const otherId = m.users.find((x) => x !== me.id);
    if (bloques.has(otherId)) return null;
    const other = await store.getUser(otherId);
    if (!other) return null;
    const dernier = (await store.messagesOf(m.id)).at(-1) || null;
    return {
      id: m.id,
      other: await publicProfile(other),
      lastMessage: dernier,
      createdAt: m.createdAt,
      unread: await store.unreadCount(m.id, me.id),
      isNew: !(await store.hasOpened(m.id, me.id)),
      // « moi » : c'est à moi de répondre, ou de commencer. « autre » : la balle est dans son camp.
      aQuiDeParler: !dernier ? 'moi' : dernier.from === me.id ? 'autre' : 'moi',
    };
  }));
  const list = lignes.filter(Boolean)
    .sort((a, b) => (b.lastMessage?.at || b.createdAt) - (a.lastMessage?.at || a.createdAt));
  res.json({ matches: list });
});

// L'app signale sa fermeture : les notifications partent alors sans attendre
api.post('/presence/leave', (req, res) => {
  store.leavePresence(req.user.id);
  res.json({ ok: true });
});

// Compteurs pour les onglets (messages non lus, nouveaux matchs)
api.get('/summary', requireApproved, async (req, res) => {
  const me = req.user;
  const [tous, rel] = await Promise.all([store.allUsers(), relations(me)]);
  let unread = 0, newMatches = 0;
  for (const m of rel.match.values()) {
    const otherId = m.users.find((x) => x !== me.id);
    if (rel.bloque.has(otherId)) continue;
    unread += await store.unreadCount(m.id, me.id);
    if (!(await store.hasOpened(m.id, me.id))) newMatches += 1;
  }
  res.json({ unread, newMatches, likes: likersOf(me, rel, tous).length });
});

api.get('/matches/:id', requireApproved, async (req, res) => {
  const r = await loadMatch(req, res);
  if (!r) return;
  store.touchPresence(req.user.id, r.m.id);
  await store.markRead(r.m.id, req.user.id);
  const after = Number(req.query.after || 0);
  // Premier chargement : tout. Interrogations suivantes : seulement les nouveaux messages.
  // Renvoyer le profil complet de l'autre personne toutes les quatre secondes coûtait environ
  // 700 Ko par heure de discussion ouverte, sans qu'aucun message n'arrive.
  const premierAppel = !req.query.suivi;
  const messages = (await store.messagesOf(r.m.id)).filter((x) => x.at > after).map((x) => ({ ...x, mine: x.from === req.user.id }));
  // L'heure d'arrivée de l'autre personne n'est jamais renvoyée : savoir qu'elle est sur place
  // depuis douze minutes est une information de filature, pas une information de rendez-vous.
  // proposedBy est l'identifiant Telegram de l'autre personne : il ne sort pas non plus, seul
  // compte de savoir si la proposition vient de soi, pour afficher « accepter » ou « annuler ».
  const dates = (await store.datesOfMatch(r.m.id)).map(({ arrivals, proposedBy, ...d }) => ({
    ...d,
    venue: venues.find((v) => v.id === d.venueId),
    proposedByMe: proposedBy === req.user.id,
    arrivedMe: !!arrivals[req.user.id],
    arrivedOther: Object.keys(arrivals).some((id) => id !== req.user.id),
  }));
  const reponse = { id: r.m.id, messages };
  if (premierAppel) Object.assign(reponse, { other: await publicProfile(r.other), dates, unlockAfter: config.contactUnlockAfter });
  // Un rendez-vous peut naître ou changer entre deux interrogations : on renvoie les rendez-vous
  // aussi quand l'un d'eux a bougé depuis le dernier appel.
  else if (dates.some((d) => (d.updatedAt || d.createdAt || 0) > after)) reponse.dates = dates;
  res.json(reponse);
});

api.post('/matches/:id/messages', requireApproved, limiter('message'), async (req, res) => {
  const r = await loadMatch(req, res);
  if (!r) return;
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return fail(res, 400, 'EMPTY', "Écris un message avant d'envoyer.");
  // Le seuil compte l'échange, pas le total : en comptant tous les messages, il suffisait d'en
  // envoyer dix tout seul pour s'autoriser à donner son numéro.
  const messages = await store.messagesOf(r.m.id);
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
      notifyAdmin(`Message bloqué (${check.categorie}) de ${req.user.profile.name} (ID ${req.user.id}) : « ${text.slice(0, 120)} »`, boutonBannir(req.user.id));
    }
    return fail(res, 422, check.code, check.message, { categorie: check.categorie, unlockAfter: config.contactUnlockAfter });
  }

  const msg = await store.addMessage(r.m.id, req.user.id, text);
  if (!store.isViewing(r.other.id, r.m.id)) {
    notify(r.other.id, "{nom} t'a écrit : « {extrait} »", { nom: req.user.profile.name, extrait: `${text.slice(0, 60)}${text.length > 60 ? '…' : ''}` }, { label: 'Répondre', params: { screen: 'chat', match: r.m.id } }, `msg:${r.m.id}`);
  }

  // Profil de démo : répond après un délai (le temps de fermer l'app pour tester la notification)
  const demoReplies = (await store.messagesOf(r.m.id)).filter((x) => x.from === r.other.id).length + (demoPending.get(r.m.id) || 0);
  if (r.other.demo && demoReplies < DEMO_REPLIES.length) {
    const me = req.user;
    demoPending.set(r.m.id, (demoPending.get(r.m.id) || 0) + 1);
    setTimeout(async () => {
      demoPending.set(r.m.id, demoPending.get(r.m.id) - 1);
      const reply = await store.addMessage(r.m.id, r.other.id, DEMO_REPLIES[demoReplies]);
      if (!store.isViewing(me.id, r.m.id)) {
        notify(me.id, "{nom} t'a écrit : « {extrait} »", { nom: r.other.profile.name, extrait: `${reply.text.slice(0, 60)}${reply.text.length > 60 ? '…' : ''}` }, { label: 'Répondre', params: { screen: 'chat', match: r.m.id } }, `msg:${r.m.id}`);
      }
    }, config.demoReplyDelayMs);
  }
  res.json({ message: { ...msg, mine: true } });
});

// ---------- Démo : quelqu'un te « like » pendant ton absence ----------
onApproved((userId) => {
  if (!config.seedDemo) return;
  setTimeout(async () => {
    const me = await store.getUser(userId);
    if (!me?.profile) return;
    // Les balayages déjà échangés se chargent en deux requêtes : le choix du profil reste local.
    const [tous, envoyes, recus] = await Promise.all([store.allUsers(), store.swipesFrom(me.id), store.swipesTo(me.id)]);
    const dejaTranche = new Set([...envoyes.map((s) => s.to), ...recus.map((s) => s.from)]);
    const demo = tous.find((u) => u.demo && compatible(me, u) && dansLaZone(me, u) && !dejaTranche.has(u.id));
    if (!demo) return;
    await store.addSwipe(demo.id, me.id, 'like');
    notify(me.id, "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.", { ville: me.profile.city, app: config.appName }, { label: 'Découvrir', params: { screen: 'matches' } }, 'likes', 24 * 3600 * 1000);
  }, config.demoLikeDelayMs);
});

// ---------- Rendez-vous ----------
api.get('/venues', requireApproved, async (req, res) => {
  const villes = new Set([cleVille(req.user.profile.city)]);
  // Les deux personnes d'une discussion peuvent être dans deux villes du même pays : on propose
  // les lieux des deux, chacun portant sa ville, pour qu'on sache où l'on va.
  if (req.query.match) {
    const m = await store.getMatch(String(req.query.match));
    const autreId = m?.users.includes(req.user.id) ? m.users.find((x) => x !== req.user.id) : null;
    const autre = autreId && await store.getUser(autreId);
    if (autre?.profile?.city) villes.add(cleVille(autre.profile.city));
  }
  const pays = req.user.profile.country || config.defaultCountry;
  const liste = venues.filter((v) => v.country === pays && villes.has(cleVille(v.city))).map(({ code, ...v }) => v);
  // partenairesDansLePays dit au client si le manque est local ou général : « aucun lieu à Kribi »
  // et « aucun lieu partenaire dans ton pays » n'appellent pas le même message.
  res.json({ venues: liste, partenairesDansLePays: venues.some((v) => v.country === pays) });
});

api.post('/matches/:id/dates', requireApproved, limiter('rendezvous'), async (req, res) => {
  const r = await loadMatch(req, res);
  if (!r) return;
  const venue = venues.find((v) => v.id === req.body?.venueId && v.country === (req.user.profile.country || config.defaultCountry));
  const slot = String(req.body?.slot || '').slice(0, 40);
  if (!venue || !slot) return fail(res, 400, 'DATE_INVALID', 'Choisis un lieu et un horaire.');
  // Le créneau est un champ libre affiché à l'autre personne : il passe par le même filtre
  // que les messages, sinon il suffisait d'y écrire un numéro pour contourner le blocage.
  const controleSlot = checkMessage(slot, 0, config.contactUnlockAfter);
  if (!controleSlot.ok) return fail(res, 422, controleSlot.code, controleSlot.message, { categorie: controleSlot.categorie, unlockAfter: config.contactUnlockAfter });
  // Un seul rendez-vous vivant par discussion : sans cette règle, « accepté » ne désigne plus rien,
  // et le check-in ne saurait pas de quel rendez-vous il parle.
  if ((await store.datesOfMatch(r.m.id)).some((x) => VIVANTS.includes(x.status))) {
    return fail(res, 409, 'DATE_EN_COURS', 'Un rendez-vous est déjà en cours. Annule-le avant d\'en proposer un autre.');
  }
  const d = await store.addDate({ matchId: r.m.id, proposedBy: req.user.id, venueId: venue.id, slot, status: 'proposed' });
  notify(r.other.id, '{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.', { nom: req.user.profile.name, lieu: venue.name, quartier: venue.area, creneau: slot }, { label: 'Voir la proposition', params: { screen: 'chat', match: r.m.id } });
  res.json({ date: { ...d, venue: { ...venue, code: undefined } } });
});

// Accepter, refuser, annuler. Jusqu'ici un rendez-vous restait « proposé » pour toujours, et
// n'importe qui pouvait confirmer son arrivée à un rendez-vous que l'autre n'avait jamais accepté.
//
//   proposé  --accepter/refuser (l'invité)--> accepté / refusé
//   proposé  --annuler (celui qui propose)--> annulé
//   accepté  --annuler (l'un ou l'autre)---> annulé
//
// Refusé et annulé sont définitifs : on repropose, on ne ressuscite pas.
const VIVANTS = ['proposed', 'accepted'];
const CHANGEMENTS = {
  accepted: { nom: 'accepté', message: '{nom} a accepté le rendez-vous : {lieu}, {creneau}.' },
  declined: { nom: 'refusé', message: '{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.' },
  cancelled: { nom: 'annulé', message: '{nom} a annulé le rendez-vous de {lieu}, {creneau}.' },
};

api.put('/dates/:id', requireApproved, limiter('rendezvous'), async (req, res) => {
  const d = await store.getDate(req.params.id);
  const m = d && await store.getMatch(d.matchId);
  if (!d || !m || !m.users.includes(req.user.id)) return fail(res, 404, 'DATE_NOT_FOUND', 'Rendez-vous introuvable.');
  const autreId = m.users.find((x) => x !== req.user.id);
  if (await store.isBlocked(req.user.id, autreId)) return fail(res, 403, 'BLOCKED', 'Ce rendez-vous est annulé.');

  const statut = String(req.body?.status || '');
  const changement = CHANGEMENTS[statut];
  if (!changement) return fail(res, 400, 'STATUS_INVALID', 'Action inconnue sur ce rendez-vous.');
  if (!VIVANTS.includes(d.status)) return fail(res, 409, 'DATE_CLOSED', 'Ce rendez-vous est déjà clos.');

  const jePropose = d.proposedBy === req.user.id;
  // Accepter ou refuser revient à la personne invitée : celle qui propose a déjà dit oui.
  if ((statut === 'accepted' || statut === 'declined') && (jePropose || d.status !== 'proposed')) {
    return fail(res, 403, 'DATE_NOT_YOURS', 'Seule la personne invitée peut accepter ou refuser.');
  }
  // Annuler : sa propre proposition tant qu'elle attend, ou un rendez-vous accepté, des deux côtés.
  // Quelqu'un doit toujours pouvoir se décommander d'une rencontre, c'est une question de sécurité.
  if (statut === 'cancelled' && d.status === 'proposed' && !jePropose) {
    return fail(res, 403, 'DATE_NOT_YOURS', 'Tu peux refuser cette proposition, pas l\'annuler.');
  }

  const maj = await store.updateDate(d.id, { status: statut, [`${statut}At`]: Date.now() });
  const venue = venues.find((v) => v.id === d.venueId);
  notify(autreId, changement.message, { nom: req.user.profile.name, lieu: venue?.name || '', creneau: d.slot },
    { label: 'Ouvrir la discussion', params: { screen: 'chat', match: m.id } });
  res.json({ date: { ...maj, arrivals: undefined, proposedBy: undefined, proposedByMe: jePropose, venue: venue && { ...venue, code: undefined } } });
});

api.post('/dates/:id/checkin', requireApproved, async (req, res) => {
  const d = await store.getDate(req.params.id);
  const m = d && await store.getMatch(d.matchId);
  if (!d || !m || !m.users.includes(req.user.id)) return fail(res, 404, 'DATE_NOT_FOUND', 'Rendez-vous introuvable.');
  // Un blocage ferme la discussion : il doit aussi fermer le rendez-vous. Sans ce contrôle,
  // quelqu'un de bloqué déclenchait encore une notification d'arrivée chez la personne protégée.
  const autreId = m.users.find((x) => x !== req.user.id);
  if (await store.isBlocked(req.user.id, autreId)) return fail(res, 403, 'BLOCKED', 'Ce rendez-vous est annulé.');
  // Le contrôle du blocage passe avant celui du statut : se protéger prime sur tout le reste.
  if (d.status !== 'accepted') return fail(res, 409, 'DATE_NOT_ACCEPTED', 'Ce rendez-vous doit d\'abord être accepté par les deux personnes.');
  const venue = venues.find((v) => v.id === d.venueId);
  if (String(req.body?.code || '').trim() !== venue.code) return fail(res, 400, 'WRONG_VENUE', `Ce code ne correspond pas à ${venue.name}. Scanne le code posé sur ta table.`, { venue: venue.name });
  await store.updateDate(d.id, { arrivals: { ...d.arrivals, [req.user.id]: Date.now() } });
  notify(autreId, '{nom} est bien arrivé(e) à {lieu}.', { nom: req.user.profile.name, lieu: venue.name }, { label: 'Ouvrir la discussion', params: { screen: 'chat', match: m.id } });
  res.json({ arrived: true, venue: { name: venue.name, perk: venue.perk } });
});

// Défaire un match. Sans notification, volontairement : prévenir quelqu'un qu'on le retire
// expose la personne qui part. La discussion disparaît des deux côtés.
api.delete('/matches/:id', requireApproved, async (req, res) => {
  const m = await store.getMatch(req.params.id);
  if (!m || !m.users.includes(req.user.id)) return fail(res, 404, 'MATCH_NOT_FOUND', 'Discussion introuvable.');
  await store.removeMatch(m.id);
  res.json({ removed: true });
});

// Bloquer sans accuser. Jusqu'ici, se débarrasser de quelqu'un passait obligatoirement par un
// signalement, donc par une accusation envoyée à la modération : beaucoup de gens ne le font pas,
// et restent exposés. Le blocage ferme la discussion, le rendez-vous et le check-in.
api.post('/blocks', requireApproved, limiter('signalement'), async (req, res) => {
  const cible = await store.getUser(req.body?.targetId);
  if (!cible || cible.id === req.user.id) return fail(res, 400, 'BLOCK_INVALID', 'Blocage impossible.');
  await store.block(req.user.id, cible.id);
  const m = await store.matchBetween(req.user.id, cible.id);
  if (m) await store.removeMatch(m.id);
  res.json({ blocked: true });
});

// ---------- Signalements ----------
api.post('/reports', requireApproved, limiter('signalement'), async (req, res) => {
  const { targetId, reason, matchId } = req.body || {};
  const target = await store.getUser(targetId);
  if (!target || target.id === req.user.id) return fail(res, 400, 'REPORT_INVALID', 'Signalement impossible.');
  await store.addReport({ from: req.user.id, targetId: target.id, reason: String(reason || 'autre').slice(0, 60), matchId: matchId || null });
  await store.block(req.user.id, target.id);
  notifyAdmin(`Signalement : ${target.profile?.name || target.id} (ID ${target.id}), motif « ${reason || 'autre'} ».`, boutonBannir(target.id));
  res.json({ reported: true });
});
