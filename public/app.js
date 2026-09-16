import * as tg from './tg.js';
import { icon, toast, skeleton, attachSwipe, throwCard, dayLabel, timeLabel, isSameDay, reglerLeVerre } from './ui.js';
import { t, tn, langue, chargerLangue, LANGUES } from './i18n.js';

// ============================================================
// État et utilitaires
// ============================================================
const S = {
  me: null,
  profiles: [],
  remaining: 0,
  quota: 0,
  // D'où l'écran des pays a été ouvert, et ce qu'il doit remplir au retour.
  pays: null,
  // Ce qui est tapé dans les filtres sans être enregistré, le temps d'un aller-retour
  // vers l'écran des pays. Le DOM ne survit pas au changement d'écran, lui.
  filtresDraft: null,
  // Découvrir : « cards » (une carte à la fois) ou « list » (tous les profils compatibles)
  discoverMode: 'cards',
  people: [],
  person: null,
  likes: [],
  avatarObserver: null,
  photoUrls: {},
  voixUrls: {},
  voixEnCours: null,
  dataSaver: false,
  matches: [],
  chat: null,
  chatTimer: null,
  summaryTimer: null,
  // Est-on collé au bas de la discussion ? Mis à jour au défilement, lu quand la fenêtre change
  // de taille : on ne recolle en bas que quelqu'un qui y était.
  chatEnBas: true,
  summary: { unread: 0, newMatches: 0 },
  pendingTimer: null,
  lastMatch: null,
  selfie: null,
  gesture: null,
  form: null,
  formStep: 0,
  dateDraft: { venueId: null, slot: null },
  venues: [],
  guideOpen: false,
  screen: null,
  detachSwipe: null,
  swiped: false,
};

const app = document.getElementById('app');
// Nom de l'app injecté par le serveur (variable APP_NAME)
const APP = document.querySelector('meta[name="app-name"]')?.content || 'Odo';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// L'icône « duo » reste dans ui.js : le mode reviendra, et la retirer ferait du bruit pour rien.
const INTENT_ICONS = { amitie: 'users', serieux: 'heart' };
const QUESTIONS = {
  coin: 'Mon coin préféré',
  weekend: 'Mon week-end idéal',
  supporte: 'Je supporte',
  chanson: 'Ma chanson du moment',
  rire: 'Ce qui me fait rire',
};
// Les ordres du paquet, par clé du serveur (`options.ordres`). Les libellés vivent ici, dans
// t(), pour que le test des langues les voie ; les clés, elles, ne sont jamais montrées.
const ORDRES_LABELS = { defaut: 'Conseillé', actifs: 'Les plus actifs', nouveaux: 'Les nouveaux', proches: 'Mon quartier' };
// Retirée de l'inscription, mais gardée ici : la question est rangée sur le profil par sa clé,
// et des comptes portent encore « plat ». Sans cette ligne, leur carte afficherait « plat » en
// clair — on ne fait pas payer à quelqu'un un choix de produit qu'il n'a pas fait. Sa phrase
// reste dans les six dictionnaires pour la même raison : elle s'affiche encore.
const QUESTIONS_RETIREES = { plat: 'Mon plat du dimanche' };
const QUESTION_DEFAUT = 'coin';
// Une clé connue se traduit — qu'elle soit encore proposée ou non ; un texte libre venu d'un
// ancien profil s'affiche tel qu'il a été écrit.
const libelleQuestion = (q) => {
  const l = QUESTIONS[q] || QUESTIONS_RETIREES[q];
  return l ? t(l) : q || '';
};

const INTENT_SUBS = () => ({ amitie: t('Élargir ton cercle en ville'), serieux: t('Construire quelque chose de durable') });

// ============================================================
// Appels à l'API
// ============================================================
function devUser() {
  const q = new URLSearchParams(location.search).get('dev_user');
  if (q) sessionStorage.setItem('dev_user', q);
  return sessionStorage.getItem('dev_user');
}

function authHeaders() {
  return tg.inTelegram ? { Authorization: `tma ${tg.initData()}` } : { 'x-dev-user': devUser() || '' };
}

// Un réseau qui ne répond pas n'est pas un réseau coupé : sans délai maximal, l'app restait
// sur « Chargement… » indéfiniment au lieu de proposer de réessayer.
const DELAI_MAX_MS = 12000;

// Les messages d'erreur du serveur arrivent en français. Leur code, lui, est stable : c'est donc
// le code qui porte la traduction, et le texte du serveur ne sert que de dernier recours, pour une
// erreur ajoutée côté serveur et pas encore connue ici.
const ERREURS = () => ({
  NETWORK: t('Pas de connexion. Vérifie ton réseau et réessaie.'),
  UNAUTHORIZED: t('Ouvre {app} depuis Telegram.', { app: APP }),
  SERVER_ERROR: t('Un problème est survenu. Réessaie dans un instant.'),
  NOT_FOUND: t('Cette page n\'existe pas.'),
  TOO_LARGE: t('Image trop lourde.'),
  RATE_LIMIT: t('Tu vas trop vite. Reprends dans un instant.'),
  NAME_REQUIRED: t('Indique ton prénom.'),
  AGE_INVALID: t('{app} est réservé aux 18 ans et plus.', { app: APP }),
  GENDER_REQUIRED: t('Indique si tu es une femme ou un homme.'),
  INTENT_REQUIRED: t('Choisis ce que tu cherches.'),
  CITY_REQUIRED: t('Indique ta ville.'),
  PROMPT_REQUIRED: t('Réponds à la question pour que les autres te découvrent.'),
  PROFILE_CONTACT: t("Ton profil ne doit contenir ni numéro, ni lien, ni pseudo, ni demande d'argent."),
  DATE_NOT_ACCEPTED: t("Ce rendez-vous doit d'abord être accepté par les deux personnes."),
  DATE_EN_COURS: t("Un rendez-vous est déjà en cours. Annule-le avant d'en proposer un autre."),
  DATE_CLOSED: t('Ce rendez-vous est déjà clos.'),
  DATE_NOT_YOURS: t('Seule la personne invitée peut accepter ou refuser.'),
  STATUS_INVALID: t('Action inconnue sur ce rendez-vous.'),
  PHOTO_INVALID: t('Photo trop lourde ou format non pris en charge.'),
  PHOTO_SLOT: t('Trois photos au plus.'),
  PROFILE_REQUIRED: t('Crée ton profil avant la vérification.'),
  ALREADY_VERIFIED: t('Ton profil est déjà vérifié.'),
  GESTURE_REQUIRED: t('Demande un geste avant de prendre le selfie.'),
  GESTURE_EXPIRED: t('Ce geste a expiré. Demandes-en un nouveau et reprends le selfie.'),
  SELFIE_INVALID: t('Selfie illisible ou trop lourd. Réessaie.'),
  NOT_VERIFIED: t('Vérifie ton profil pour accéder à cette fonction.'),
  FILTERS_INVALID: t('Indique des âges entre 18 et 99 ans.'),
  ZONE_INVALID: t('Indique une ville, ou choisis tout le pays.'),
  DAILY_LIMIT: t('Tu as vu tous tes profils du jour. Reviens demain.'),
  SWIPE_INVALID: t('Action impossible.'),
  MATCH_NOT_FOUND: t('Discussion introuvable.'),
  BLOCKED: t('Cette discussion est fermée.'),
  BLOCK_INVALID: t('Blocage impossible.'),
  EMPTY: t("Écris un message avant d'envoyer."),
  DATE_INVALID: t('Choisis un lieu et un horaire.'),
  DATE_NOT_FOUND: t('Rendez-vous introuvable.'),
  REPORT_INVALID: t('Signalement impossible.'),
  NO_PHOTO: t('Pas de photo.'),
  // La modération est configurée mais injoignable : rien n'a été perdu, il faut refaire le geste.
  SELFIE_NOT_SENT: t("On n'a pas pu envoyer ton selfie en modération. Réessaie dans quelques minutes."),
  PHOTO_NOT_SENT: t("On n'a pas pu envoyer ta photo en modération. Réessaie dans quelques minutes."),
});
// Deux messages dépendent d'une valeur renvoyée par le serveur : on les compose ici.
function messageErreur(data) {
  if (data?.code === 'CONTACT_TOO_EARLY') return t('Les liens, numéros et pseudos sont débloqués après {n} messages échangés de chaque côté.', { n: data.unlockAfter ?? 10 });
  if (data?.code === 'MONEY_BLOCKED') return t("Les demandes et offres d'argent sont bloquées sur {app}. Ce message ressemble à une {categorie}. Retire le montant ou le moyen de paiement, et renvoie-le.", { app: APP, categorie: t(data.categorie || '') });
  if (data?.code === 'WRONG_VENUE') return t('Ce code ne correspond pas à {lieu}. Scanne le code posé sur ta table.', { lieu: data.venue || '' });
  return ERREURS()[data?.code] || data?.message || t('Un problème est survenu.');
}

async function api(path, { method = 'GET', body } = {}) {
  // Après la suppression du compte, plus aucun appel : chaque requête authentifiée recrée une
  // ligne côté serveur, et c'est ce qui rendait la suppression fausse dans la seconde.
  if (S.supprime) throw Object.assign(new Error(t('Ton compte et tes données ont été supprimés.')), { code: 'SUPPRIME' });
  const headers = { 'Content-Type': 'application/json', ...authHeaders() };
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), DELAI_MAX_MS);
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: stop.signal });
  } catch {
    throw Object.assign(new Error(t('Pas de connexion. Vérifie ton réseau et réessaie.')), { code: 'NETWORK' });
  } finally {
    clearTimeout(minuteur);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(messageErreur(data)), { code: data.code, status: res.status });
  return data;
}

// Les adresses blob: gardent leur image en mémoire tant qu'on ne les révoque pas : sur une longue
// session, sur un téléphone à 1 Go, ça se voit.
function oublierLesPhotos() {
  for (const url of Object.values(S.photoUrls)) URL.revokeObjectURL(url);
  S.photoUrls = {};
}

async function photoUrl(userId, n = 1) {
  const key = `${userId}/${n}`;
  if (S.photoUrls[key]) return S.photoUrls[key];
  const res = await fetch(`/api/photos/${encodeURIComponent(userId)}/${n}`, { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) return null;
  S.photoUrls[key] = URL.createObjectURL(await res.blob());
  return S.photoUrls[key];
}

// Le son n'est cherché qu'au moment où quelqu'un appuie : une présentation de 15 secondes pèse
// plus qu'un écran entier de texte, et personne ne doit la payer sans l'avoir demandée. C'est
// aussi pourquoi il n'y a jamais de lecture automatique, économie de data ou pas.
async function voixUrl(userId) {
  if (S.voixUrls[userId]) return S.voixUrls[userId];
  const res = await fetch(`/api/voix/${encodeURIComponent(userId)}`, { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) return null;
  S.voixUrls[userId] = URL.createObjectURL(await res.blob());
  return S.voixUrls[userId];
}

export const dureeLisible = (s) => `${Math.floor((Number(s) || 0) / 60)}:${String(Math.round((Number(s) || 0) % 60)).padStart(2, '0')}`;

// Un seul son à la fois : deux présentations qui se parlent dessus ne s'entendent ni l'une ni
// l'autre, et sur un forfait compté la seconde a été payée pour rien.
function arreterLaVoix() {
  if (!S.voixEnCours) return;
  S.voixEnCours.audio.pause();
  S.voixEnCours = null;
  document.querySelectorAll('[data-action="voix"]').forEach((b) => b.classList.remove('joue'));
  peindreBoutonsVoix();
}

function peindreBoutonsVoix() {
  document.querySelectorAll('[data-action="voix"]').forEach((b) => {
    const joue = S.voixEnCours?.id === b.dataset.id;
    b.classList.toggle('joue', joue);
    const label = b.querySelector('.voix-label');
    if (label) label.textContent = joue ? t('Arrêter') : t('Écouter · {duree}', { duree: b.dataset.duree });
    const ico = b.querySelector('.voix-icone');
    if (ico) ico.innerHTML = icon(joue ? 'stop' : 'play', 16);
  });
}

async function ecouterLaVoix(id) {
  if (S.voixEnCours?.id === id) return arreterLaVoix();
  arreterLaVoix();
  const bouton = document.querySelector(`[data-action="voix"][data-id="${CSS.escape(id)}"]`);
  bouton?.classList.add('charge');
  const url = await voixUrl(id);
  bouton?.classList.remove('charge');
  if (!url) return toast(t("La présentation n'a pas pu être chargée. Réessaie."));
  const audio = new Audio(url);
  audio.addEventListener('ended', arreterLaVoix);
  S.voixEnCours = { id, audio };
  peindreBoutonsVoix();
  audio.play().catch(() => { arreterLaVoix(); toast(t("La lecture n'a pas démarré. Réessaie.")); });
}

// Réduit les photos avant envoi : moins de data consommée, envoi plus fiable sur réseau lent
function compressImage(file, max = 720, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error(t('Impossible de lire cette image.')));
    img.src = url;
  });
}

// ============================================================
// Navigation
// ============================================================
// ---------- Porte ou badge : ce que la vérification décide ----------
//
// Le serveur tranche, l'interface ne garde aucune copie de la règle : `options.entreeLibre` dit
// laquelle des deux politiques tourne, et tout le reste s'en déduit.
//
//   verifie()  : un humain a regardé mon selfie et mon geste. C'est le **badge**.
//   membre()   : j'ai ma place dans l'app — onglets, découverte, messages. Sous « gate », c'est
//                le badge qui l'ouvre ; sous « badge », un profil suffit.
//
// Sous la politique par défaut les deux disent la même chose, et rien ne bouge.
const entreeLibre = () => !!S.me?.options?.entreeLibre;
const verifie = () => S.me?.verification === 'approved';
const membre = () => !!S.me?.profile && (entreeLibre() || verifie());
// Le pass. Comme au-dessus : le serveur tranche, l'interface lit et ne recopie aucune règle.
const plus = () => !!S.me?.plus?.actif;
// Le quota du jour, tel que /discover le rend. **`null` veut dire « aucun compte à tenir »** —
// c'est le contrat posé par `auClient()` côté serveur. Sans cette fonction, `!S.remaining` prend
// l'absence de limite pour une limite atteinte, et l'écran le plus ouvert devient le plus fermé.
const sansLimite = () => S.quota === null;
// Les paliers viennent du serveur (`me.limites`), jamais d'une constante recopiée ici : un nombre
// écrit des deux côtés finit par diverger, et c'est l'interface qui se met à mentir.
const limite = (nom) => S.me?.limites?.[nom];
// Les emplacements de photo à afficher : ceux que le palier ouvre, **plus ceux déjà occupés**.
// Des comptes portent trois photos d'un temps où trois était la limite pour tout le monde ; les
// faire disparaître de l'écran donnerait l'impression qu'on les a effacées, alors qu'elles sont
// toujours là et toujours montrées. On les affiche, avec leur bouton pour les retirer.
function emplacementsPhoto() {
  const ouverts = limite('photos') || 2;
  const occupes = Math.max(0, ...(S.me?.photos || []).map((x) => x.n));
  return Array.from({ length: Math.max(ouverts, occupes) }, (_, i) => i + 1);
}

const PARENT = { profile: () => (membre() ? 'me' : 'welcome'), verify: () => (membre() ? 'me' : 'profile'), match: () => 'discover', person: () => 'discover', filters: () => 'discover', chat: () => 'matches', date: () => 'chat', protection: () => (S.protection?.matchId ? 'chat' : 'discover'), langue: () => S.langueRetour || 'me', pays: () => S.pays?.retour || 'me', plus: () => S.plusRetour || 'me', vues: () => 'me', voix: () => (S.voixApresVerif ? 'discover' : 'me') };
const TAB_SCREENS = ['discover', 'matches', 'me', 'safety'];
const TABS = [['discover', 'Découvrir'], ['matches', 'Messages'], ['me', 'Profil'], ['safety', 'Sécurité']];

function go(screen, params = {}) {
  if (screen === 'settings') screen = 'me';
  // L'écran de langue s'ouvre depuis deux endroits très éloignés : l'accueil, avant toute
  // inscription, et l'onglet Profil. On retient lequel, pour y revenir — et pour que le bouton
  // retour natif ne renvoie pas vers un onglet qui n'existe pas encore.
  if (screen === 'langue' && S.screen !== 'langue') S.langueRetour = S.screen;
  // Le brouillon des filtres ne sert qu'à l'aller-retour vers l'écran des pays. Le garder plus
  // longtemps ferait ressortir, à la prochaine ouverture des filtres, des âges que personne
  // n'a réglés — et « Enregistrer » les aurait pris pour un choix.
  if (S.screen === 'filters' && screen !== 'pays') S.filtresDraft = null;
  arreterLePoll();
  clearInterval(S.pendingTimer);
  clearInterval(S.summaryTimer);
  arreterLaVoix();
  S.detachSwipe?.();
  S.detachSwipe = null;
  S.avatarObserver?.disconnect();
  tg.closingConfirmation(false);
  S.screen = screen;
  // L'écran de match renverse toute la palette : le bouton natif change de couleur **et** de
  // libellé au même instant, et Telegram Android fond alors les deux états — « J'aime » et
  // « Écrire à … » s'affichaient l'un sur l'autre. On l'efface avant la bascule, et l'écran
  // d'arrivée repose le sien sur un bouton déjà masqué. Uniquement là : masquer à chaque
  // navigation ferait clignoter la barre sur tout le reste de l'app.
  if ((screen === 'match') !== document.body.classList.contains('match-mode')) tg.setButtons(null);
  // La discussion occupe toute la hauteur de l'écran, champ de saisie fixé en bas
  document.body.classList.toggle('chat-mode', screen === 'chat');
  // Le match est un écran d'encre dans les deux thèmes : le moment signature, pas une page de l'app
  document.body.classList.toggle('match-mode', screen === 'match');
  const parent = PARENT[screen]?.();
  tg.setBack(parent ? () => go(parent, parent === 'chat' ? { id: S.chat?.id } : {}) : null);
  showTabs(screen);
  window.scrollTo(0, 0);
  SCREENS[screen](params);
  if (TAB_SCREENS.includes(screen) && membre()) {
    refreshSummary();
    S.summaryTimer = setInterval(refreshSummary, 20000);
  }
}

function render(html) {
  const back = !tg.inTelegram && window.__devBack ? `<button class="devback" data-action="dev-back">‹ ${t('Retour')}</button>` : '';
  app.innerHTML = back + html;
}

// Écran d'erreur réseau, avec le bouton principal pour réessayer
function renderError(e, retry) {
  render(`
    <div class="empty">
      <span class="glyph glyph-warn">${icon(e.code === 'NETWORK' ? 'wifi-off' : 'alert', 34)}</span>
      <h2>${e.code === 'NETWORK' ? t('Pas de connexion') : t('Un problème est survenu')}</h2>
      <p>${e.code === 'NETWORK' ? t('Vérifie ton réseau et réessaie.') : esc(e.message)}</p>
    </div>`);
  tg.setButtons(retry ? { main: { text: t('Réessayer'), onClick: retry } } : null);
}

// ---------- Barre d'onglets : construite une fois, hors de <main>, pour que l'indicateur glisse ----------
function buildTabs() {
  document.getElementById('tabs').setAttribute('aria-label', t('Sections'));
  document.getElementById('tabs').innerHTML =
    `<span class="tabs-ind" aria-hidden="true"></span>` +
    TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="false" data-screen="${k}">${t(l)}<span class="badge" hidden></span></button>`).join('');
}

function showTabs(screen) {
  const on = TAB_SCREENS.includes(screen) && membre();
  document.getElementById('topbar').hidden = !on;
  document.body.classList.toggle('has-tabs', on);
  if (!on) return;
  const idx = TAB_SCREENS.indexOf(screen);
  document.querySelectorAll('#tabs [role="tab"]').forEach((b, i) => b.setAttribute('aria-selected', String(i === idx)));
  document.querySelector('#tabs .tabs-ind').style.transform = `translateX(${idx * 100}%)`;
  updateTabBadges();
}

function updateTabBadges() {
  const n = S.summary.unread + S.summary.newMatches + (S.summary.likes || 0);
  const badge = document.querySelector('#tabs [data-screen="matches"] .badge');
  if (!badge) return;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.setAttribute('aria-label', `${n} nouveautés`);
  badge.hidden = !n;
}

async function refreshSummary() {
  // En arrière-plan, rien : chaque appel charge tout le monde côté serveur (dette n° 3).
  if (document.hidden) return;
  try {
    const s = await api('/summary');
    const changed = s.unread !== S.summary.unread || s.newMatches !== S.summary.newMatches || s.likes !== S.summary.likes;
    S.summary = s;
    if (changed) {
      updateTabBadges();
      if (S.screen === 'matches') SCREENS.matches({ silent: true });
    }
  } catch { /* hors ligne : on réessaiera */ }
}

// ============================================================
// Briques partagées : avatars, carte de profil, photos à la demande
// ============================================================
const avatar = (p, size = 'sm') => `<span class="avatar ${size}${p.verified ? ' verified' : ''}" data-avatar="${esc(p.id)}">${esc(p.name?.[0] || '?')}</span>`;

function loadAvatar(p, { own = false } = {}) {
  if (!p?.hasPhoto || (!own && S.dataSaver)) return;
  photoUrl(p.id, p.photos?.[0] || 1).then((url) => {
    if (!url) return;
    document.querySelectorAll(`[data-avatar="${CSS.escape(p.id)}"]`).forEach((el) => {
      if (!el.querySelector('img')) el.append(Object.assign(document.createElement('img'), { src: url, alt: '' }));
    });
  });
}

// Tranche d'activité calculée par le serveur, jamais l'heure exacte. Formulation sans accord : le genre n'est pas exposé
const ACTIVITY_LABELS = () => ({ recent: t('En ligne récemment'), today: t("En ligne aujourd'hui"), week: t('En ligne cette semaine') });

// Langue de l'interface. Telegram donne la langue du téléphone ; le choix explicite de la
// personne, quand il existe, l'emporte.
// La langue retenue : le choix explicite de la personne d'abord, sinon celle de son Telegram,
// sinon le français. Appliquée une fois au démarrage, puis à chaque changement.
function langueVoulue() {
  if (LANGUES[S.me?.lang]) return S.me.lang;
  const tgLang = String(tg.telegramUser()?.language_code || '').slice(0, 2).toLowerCase();
  return LANGUES[tgLang] ? tgLang : 'fr';
}

// ---------- Géographie ----------
// Les noms de pays ne sont jamais envoyés par le serveur : le navigateur les donne dans la langue
// de la personne à partir du code ISO. Une seule instance, gardée en mémoire.
let nomsPays = null;
function nomPays(code) {
  if (!code) return '';
  try {
    nomsPays ||= new Intl.DisplayNames([langue()], { type: 'region' });
    return nomsPays.of(code) || code;
  } catch { return code; }
}
// Liste triée pour les menus, dans la langue de la personne
function paysTries() {
  const codes = S.me?.options?.countries || [];
  const collator = new Intl.Collator(langue(), { sensitivity: 'base' });
  return codes.map((code) => ({ code, name: nomPays(code) })).sort((a, b) => collator.compare(a.name, b.name));
}
// Chercher un pays sans se soucier de la casse, des accents, ni de la ponctuation : « cote
// divoire » doit trouver « Côte d'Ivoire », « guinee bissau » « Guinée-Bissau », et « cm » le
// Cameroun par son code. Personne ne tape une apostrophe ni un tiret dans un champ de recherche.
const sansAccent = (s) => String(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  // Tout ce qui n'est ni lettre ni chiffre saute, espaces compris : « Guinée-Bissau » et
  // « guinee bissau » doivent se rejoindre, et le tiret d'un côté n'est pas l'espace de l'autre.
  .replace(/[^a-z0-9]/g, '');
const paysCherches = (liste, q) => {
  const r = sansAccent(q).trim();
  if (!r) return liste;
  // Ce qui commence par la recherche d'abord : taper « ni » doit donner le Niger avant la
  // Bosnie. Un nom qui contient la recherche ailleurs suit, il n'est pas jeté.
  const debut = [], dedans = [];
  for (const c of liste) {
    const n = sansAccent(c.name);
    if (n.startsWith(r) || sansAccent(c.code) === r) debut.push(c);
    else if (n.includes(r)) dedans.push(c);
  }
  return [...debut, ...dedans];
};

// Ce que dit la pilule de Découvrir : la ville, ou le nom du pays quand la zone couvre tout le pays.
// Aucun article : « le Cameroun », « la France » et « les Pays-Bas » ne suivent pas la même règle,
// et une table de genres pour 243 pays serait exactement la donnée de traduction qu'on évite ici.
// L'écran des filtres, lui, dit explicitement « Une ville » ou « Tout le pays ».
function zoneLabel(zone) {
  if (!zone) return '';
  return zone.city || nomPays(zone.country);
}
// Fuseau du téléphone. C'est le seul indice de localisation que l'app lit, et il ne coûte ni
// permission, ni GPS, ni requête en plus : le navigateur le connaît déjà. Le serveur le traduit
// en pays pour préremplir le menu, sans jamais le stocker.
const fuseau = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
// L'étape maximale atteinte dans le formulaire, retenue sur l'appareil et jointe à la prochaine
// ouverture. C'est la seule façon de savoir où les gens abandonnent : un POST par étape coûterait
// deux requêtes par inscription sur un forfait compté, celui-ci n'en coûte aucune.
//
// localStorage plutôt que CloudStorage, contrairement au plan : CloudStorage est asynchrone et
// attendre sa réponse retarderait le premier écran de deux secondes et demie dans le pire cas,
// sur l'appareil même qu'on vise. L'étape se lit ici de façon synchrone. Ce qu'on y perd — la
// valeur ne suit pas d'un appareil à l'autre — n'a pas de sens pour un abandon de formulaire,
// qui a lieu sur un seul appareil.
const ETAPE = 'form_step';
const JAUGE_VUE = 'jauge_vue';
const VOIX_VUE = 'voix_vue';
// D'où la personne est arrivée, le temps d'un aller-retour. Même canal que l'étape du formulaire,
// et pour la même raison : la requête existe déjà, le mot y monte sans en coûter une seconde.
//
// Il passe par localStorage et **pas seulement par la mémoire**, parce que l'inscription n'a
// presque jamais lieu à l'ouverture qui portait le lien : on clique une affiche lundi, on regarde,
// on referme, on crée son profil jeudi. Sans cette ligne, tous ces gens seraient comptés comme
// venus de nulle part, et le canal qui marche le mieux serait justement celui qu'on ne verrait pas.
const SOURCE = 'venu_de';
const local = (() => { try { return window.localStorage; } catch { return null; } })();
function noterEtape(n) {
  try { if (Number(local?.getItem(ETAPE) || 0) < n) local.setItem(ETAPE, String(n)); } catch { /* stockage refusé : on ne mesure pas, l'app marche */ }
}
const etapeEnAttente = () => { try { return Number(local?.getItem(ETAPE)) || 0; } catch { return 0; } };
const oublierEtape = () => { try { local?.removeItem(ETAPE); } catch { /* sans importance */ } };
// La première vue gagne, côté navigateur comme côté serveur : deux gardes plutôt qu'une, parce que
// celle du serveur est la seule qui compte et celle-ci évite d'écrire pour rien à chaque ouverture.
function noterSource(mot) {
  try { if (mot && !local?.getItem(SOURCE)) local.setItem(SOURCE, String(mot)); } catch { /* stockage refusé : on ne mesure pas */ }
}
const sourceEnAttente = () => { try { return local?.getItem(SOURCE) || ''; } catch { return ''; } };
const oublierSource = () => { try { local?.removeItem(SOURCE); } catch { /* sans importance */ } };
// Le mot n'est pas vérifié ici : la liste fermée vit sur le serveur (SOURCES), qui refuse ce qu'il
// ne connaît pas. La recopier ici ferait deux listes à tenir, donc un jour deux listes différentes.
// On borne seulement la forme, pour ne pas composer une adresse avec n'importe quoi.
const ME = () => {
  const e = etapeEnAttente();
  const src = sourceEnAttente();
  return `/me?tz=${encodeURIComponent(fuseau())}${e ? `&form_step=${e}` : ''}${/^[a-z]{1,16}$/.test(src) ? `&source=${src}` : ''}`;
};
// Pays deviné : celui du profil, sinon celui du fuseau, sinon celui de la configuration.
const paysDevine = () => S.me?.profile?.country || S.me?.options?.suggestedCountry || S.me?.options?.defaultCountry || 'CM';
const zoneDe = () => S.me?.filters?.zone || { country: paysDevine(), city: S.me?.profile?.city || null };
const activityChip = (p, cls = 'chip') => (ACTIVITY_LABELS()[p.activity] ? `<span class="${cls} act-${p.activity}">${ACTIVITY_LABELS()[p.activity]}</span>` : '');

// Carte de profil, partagée entre la découverte et l'aperçu de son propre profil.
// cls = 'top' (carte manipulable) ou 'next' (carte suivante, en retrait)
function profileCard(p, { own = false, cls = '' } = {}) {
  // La jauge vient du serveur avec son dénominateur : la carte ne devine plus combien de
  // critères existent, et le jour où un critère s'ajoute elle suit sans être retouchée.
  const tr = p.trust || { score: 0, total: 0, criteres: [] };
  const score = tr.score;
  // Ce qui est acquis, en clair, sur une ligne : « Selfie vérifié, membre depuis 3 mois »
  const acquis = (tr.criteres || []).filter((c) => c.ok).map((c) => t(c.titre).toLowerCase());
  if (acquis.length) acquis[0] = acquis[0].charAt(0).toUpperCase() + acquis[0].slice(1);
  return `
    <article class="card ${cls}">
      <div class="card-photo" data-photo="${esc(p.id)}"${p.photos?.length > 1 ? ' data-action="photo-nav" data-index="0"' : ''}>
        ${p.photos?.length > 1 ? `<div class="dots">${p.photos.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('')}</div>` : ''}
        <span class="initial">${esc(p.name?.[0] || '?')}</span>
        <span class="scrim"></span>
        <div class="corners">
          ${p.likedYou && !own ? `<span class="pill-glass pill-like">${icon('heart', 13, { fill: true })} ${t("T'a liké")}</span>` : p.isNew && !own ? `<span class="pill-glass">${icon('sparkles', 13)} ${t('Nouveau')}</span>` : ''}
          ${p.demo ? `<span class="tag-demo">${t('démo')}</span>` : ''}
          <span class="spacer"></span>
          ${own ? '' : `<button type="button" class="more" data-action="report-profile" data-id="${esc(p.id)}" aria-label="${t('Se protéger de ce profil')}">${icon('flag', 15)}</button>`}
        </div>
        <div class="overlay">
          <div class="name">${esc(p.name)}<span class="age">${esc(p.age)}</span>${p.verified ? `<span class="shield" title="${t('Selfie vérifié')}">${icon('shield', 18)}</span>` : ''}</div>
          <div class="line">
            ${icon('pin', 13)}<span>${esc(p.area ? `${p.area} · ${p.city}` : p.city)}${p.country && p.country !== S.me?.profile?.country ? esc(` · ${nomPays(p.country)}`) : ''}</span>
            ${!own && ACTIVITY_LABELS()[p.activity] ? `<span class="dot"></span><span class="act">${p.activity === 'week' ? t('Cette semaine') : p.activity === 'today' ? t("Aujourd'hui") : t('Récemment')}</span>` : ''}
          </div>
        </div>
        ${cls === 'top' ? `<span class="stamp like" aria-hidden="true">${t("J'aime")}</span><span class="stamp pass" aria-hidden="true">${t('Passer')}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="prompt"><span class="q">${esc(libelleQuestion(p.promptQ))}</span><span class="a">${esc(p.promptA)}</span></div>
        ${(p.extras || []).map((x) => `<div class="prompt"><span class="q">${esc(libelleQuestion(x.q))}</span><span class="a">${esc(x.a)}</span></div>`).join('')}
        ${p.compat ? `<div class="compat">${p.compat.map((c) => `<span class="chip chip-compat"><span class="q">${t(c.question)}</span><span class="a">${t(c.reponse)}</span></span>`).join('')}</div>` : ''}
        ${p.voix ? `<button type="button" class="btn btn-glass voix" data-action="voix" data-id="${esc(p.id)}" data-duree="${esc(dureeLisible(p.voix.duree))}" aria-label="${t('Écouter la présentation de {nom}', { nom: esc(p.name) })}"><span class="voix-icone">${icon('play', 16)}</span><span class="voix-label">${t('Écouter · {duree}', { duree: dureeLisible(p.voix.duree) })}</span></button>` : ''}
        <div class="facts-line">
          <span>${esc(t(p.intentLabel))}</span>
          ${p.languages ? `<span class="sep"></span><span>${t('Parle {langues}', { langues: esc(p.languages.charAt(0).toLowerCase() + p.languages.slice(1)) })}</span>` : ''}
        </div>
        <button type="button" class="trust-row" data-action="go" data-screen="jauge" aria-label="${t('Confiance {n} sur {total}', { n: score, total: tr.total })}">
          <span class="trust-pips">${(tr.criteres || []).map((c) => `<span class="${c.ok ? 'on' : ''}"></span>`).join('')}</span>
          <span class="trust-text"><strong>${t('Confiance {n} sur {total}', { n: score, total: tr.total })}</strong>${acquis.length ? ` · ${acquis.join(', ')}` : ` · ${t("Aucune vérification pour l'instant")}`}</span>
        </button>
      </div>
    </article>`;
}

// La photo d'une fiche part toujours, même en économie de data : c'est sur elle qu'on décide
// d'aimer ou de passer, et une carte grise ne se juge pas. Le réglage retient les **vignettes**
// des listes (loadAvatar), là où le coût est réel : cinquante images d'un coup contre une seule.
function loadCardPhoto(p, { own = false } = {}) {
  if (!p.hasPhoto) return;
  photoUrl(p.id, p.photos?.[0] || 1).then((url) => {
    const box = document.querySelector(`[data-photo="${CSS.escape(p.id)}"]`);
    if (!url || !box || box.querySelector('img')) return;
    const img = Object.assign(document.createElement('img'), { src: url, alt: t('Photo de {nom}', { nom: p.name }) });
    img.onload = () => img.classList.add('loaded');
    box.classList.add('has-photo');
    box.prepend(img);
    if (img.complete) img.classList.add('loaded');
  });
}

function showError(e, el = document.getElementById('form-error')) {
  tg.haptic('error');
  if (el) el.textContent = e.message;
  else toast(e.message, 'warn');
}

const listRow = ({ iconName, tile = '', title, sub = '', action = '', extra = '', trailing = 'chev' }) => `
  <${action ? `button type="button" class="list-row" data-action="${action}"${extra}` : 'div class="list-row"'}>
    <span class="tile ${tile}">${icon(iconName, 20)}</span>
    <div class="body"><div class="title">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    ${trailing === 'chev' && action ? `<span class="chev">${icon('chevron-right', 18)}</span>` : trailing === 'chev' ? '' : trailing}
  </${action ? 'button' : 'div'}>`;

// Les questions supplémentaires du formulaire. Le nombre de blocs qu'on peut **ajouter** vient du
// serveur (`limites.questions`) ; ceux qu'on porte déjà restent, même au-delà — la borne s'applique
// à l'ajout, jamais à ce qu'on a, comme pour les photos. Chaque bloc propose les questions que
// les autres n'ont pas prises : deux réponses à la même question ne diraient rien de plus.
function blocsQuestionsSupplementaires(f) {
  const extras = f.extras || [];
  const plafond = Math.max((limite('questions') || 1) - 1, extras.length);
  const total = S.me?.limites?.avecPass?.questions || 3;
  const blocs = extras.map((x, i) => {
    const prises = new Set([f.promptQ, ...extras.filter((_, j) => j !== i).map((y) => y.q)]);
    return `
      <div class="field extra" data-extra="${i}"><span class="label">${t('Une autre question')}
        <button type="button" class="btn btn-ghost btn-sm" data-action="extra-remove" data-i="${i}">${t('Retirer')}</button></span>
        <div class="chips" role="group" aria-label="${t('Une autre question')}">${Object.entries(QUESTIONS).filter(([k]) => !prises.has(k)).map(([k, l]) => `
          <button type="button" aria-pressed="${k === x.q}" data-action="question-extra" data-i="${i}" data-value="${esc(k)}">${esc(t(l))}</button>`).join('')}</div>
        <input name="extra-a-${i}" maxlength="120" value="${esc(x.a)}" placeholder="${t('Ta réponse')}">
      </div>`;
  }).join('');
  const suite = extras.length < plafond
    ? `<button type="button" class="btn btn-ghost btn-sm" data-action="extra-add">${icon('plus', 15)} ${t('Ajouter une question')}</button>`
    : extras.length < total - 1
      ? `<div class="list">${listRow({ iconName: 'lock', title: t('{n} questions sur ta fiche', { n: total }), sub: t('Avec un pass'), action: 'plus' })}</div>`
      : '';
  return blocs + suite;
}

// Changer de photo sur une carte : moitié droite, la suivante ; moitié gauche, la précédente
function photoNav(box, e) {
  const id = box.dataset.photo;
  const p = [...S.profiles, ...S.people, ...S.likes, S.person, S.lastMatch?.other, S.me?.publicProfile].find((x) => x?.id === id);
  if (!(p?.photos?.length > 1)) return;
  const i = Number(box.dataset.index || 0);
  const rect = box.getBoundingClientRect();
  const next = e.clientX - rect.left > rect.width / 2 ? (i + 1) % p.photos.length : (i - 1 + p.photos.length) % p.photos.length;
  box.dataset.index = String(next);
  box.querySelectorAll('.dots span').forEach((d, k) => d.classList.toggle('on', k === next));
  tg.haptic('select');
  photoUrl(p.id, p.photos[next]).then((url) => {
    const img = box.querySelector('img');
    if (!url || !img) return;
    img.classList.remove('loaded');
    img.src = url;
  });
}

// Complétion du profil : l'obligatoire vaut la moitié, le reste se gagne. La photo pèse le plus,
// c'est ce qui manque le plus aux cartes. Calculé ici : rien de nouveau n'est stocké.
function completion() {
  const p = S.me.profile || {};
  const items = [
    { icon: 'camera', title: t('Ajouter une photo'), sub: t('Les cartes avec photo sont bien plus regardées'), pts: 25, done: (S.me.photos || []).length > 0, step: 2 },
    { icon: 'pin', title: t('Indiquer ton quartier'), sub: t('Les profils de ton quartier passent devant'), pts: 15, done: !!p.area, step: 1 },
    { icon: 'globe', title: t('Préciser tes langues'), sub: t('Français, anglais, ewondo…'), pts: 10, done: !!p.languages, step: 2 },
  ];
  return { pct: 50 + items.filter((i) => i.done).reduce((a, i) => a + i.pts, 0), missing: items.filter((i) => !i.done) };
}

// Barre de Découvrir : ville, choix Cartes / Liste, et le quota du jour en mode cartes
function discoverBar() {
  const list = S.discoverMode === 'list';
  const f = S.me.filters || {};
  const range = f.ageMin > 18 || f.ageMax < 99 ? ` · ${f.ageMin}–${f.ageMax}` : '';
  return `
    <div class="dbar">
      <button type="button" class="pill" data-action="filters" aria-label="${t('Filtres')}">${icon('pin', 15)} ${esc(zoneLabel(zoneDe()))}${range} ${icon('sliders', 14)}</button>
      <div class="seg seg-mini" aria-label="${t('Affichage')}">
        <button type="button" data-action="mode" data-mode="cards" aria-pressed="${!list}">${icon('card', 15)} ${t('Cartes')}</button>
        <button type="button" data-action="mode" data-mode="list" aria-pressed="${list}">${icon(limite('liste') ? 'rows' : 'lock', 15)} ${t('Liste')}</button>
      </div>
      ${list || sansLimite() ? '' : `<span class="quota">${tn('{n} restant', '{n} restants', S.remaining)}</span>`}
    </div>`;
}

// Liste de tous les profils compatibles, balayés ou non. Initiales seules : les photos ne se
// chargent qu'en ouvrant un profil (économie de data).
// État d'un rendez-vous : libellé, icône, tuile, puce. « arrived » n'est pas un statut stocké,
// c'est l'arrivée confirmée par QR code sur un rendez-vous accepté.
const ETAT_RDV = () => ({
  proposed: [t('Proposé'), 'coffee', '', 'chip-accent'],
  accepted: [t('Accepté'), 'check', 'tile-ok', 'chip-ok'],
  declined: [t('Refusé'), 'x', 'tile-neutral', ''],
  cancelled: [t('Annulé'), 'x', 'tile-neutral', ''],
  arrived: [t('Arrivée confirmée'), 'check', 'tile-ok', 'chip-ok'],
});

const PERSON_STATUS = () => ({ liked: [t('Aimé'), 'chip-like'], passed: [t('Passé'), ''], match: [t('Match'), 'chip-ok'] });
async function renderPeople() {
  if (!S.people.length) {
    render(`${discoverBar()}<div class="group">${skeleton.rows(6)}</div>`);
    tg.setButtons(null);
    try {
      S.people = (await api('/profiles')).profiles;
    } catch (e) {
      return renderError(e, () => go('discover'));
    }
    if (S.screen !== 'discover' || S.discoverMode !== 'list') return;
  }
  if (!S.people.length) {
    render(`${discoverBar()}
      <div class="empty">
        <span class="glyph">${icon('users', 34)}</span>
        <h2>${t("Personne pour l'instant")}</h2>
        <p>${t('Aucun profil vérifié dans ta zone avec ton intention. Élargis ta zone depuis les filtres, ou reviens un peu plus tard.')}</p>
      </div>`);
    return tg.setButtons(null);
  }
  render(`${discoverBar()}
    <div class="group">
      <div class="list">${S.people.map((p) => {
        const st = PERSON_STATUS()[p.status];
        const act = ACTIVITY_LABELS()[p.activity];
        return `
        <button type="button" class="list-row" data-action="${p.status === 'match' ? 'open-chat' : 'person'}" data-id="${esc(p.status === 'match' ? p.matchId : p.id)}">
          ${avatar(p, 'sm')}
          <div class="body">
            <div class="title">${esc(p.name)}, ${esc(p.age)}${p.verified ? `<span class="c-ok">${icon('shield', 14)}</span>` : ''}${p.likedYou && !p.status ? `<span class="chip chip-like">${t("T'a liké")}</span>` : ''}${p.isNew && !p.status ? `<span class="chip chip-accent">${t('Nouveau')}</span>` : ''}${st ? `<span class="chip ${st[1]}">${st[0]}</span>` : ''}</div>
            <div class="sub">${esc(p.area ? `${p.area} · ` : '')}${esc(t(p.intentLabel))}${act ? ` · <span class="act act-${p.activity}">${act}</span>` : ''}</div>
          </div>
          <span class="chev">${icon('chevron-right', 18)}</span>
        </button>`;
      }).join('')}</div>
    </div>`);
  tg.setButtons(null);
  lazyAvatars();
}

// Vignettes de la liste : chargées seulement quand la ligne apparaît à l'écran, et jamais en
// économie de data (loadAvatar s'en assure). Cinquante photos d'un coup coûteraient trop cher.
function lazyAvatars() {
  S.avatarObserver?.disconnect();
  if (S.dataSaver || !('IntersectionObserver' in window)) return;
  S.avatarObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      S.avatarObserver.unobserve(e.target);
      const p = S.people.find((x) => x.id === e.target.dataset.avatar);
      if (p) loadAvatar(p);
    }
  }, { rootMargin: '120px' });
  app.querySelectorAll('.list-row .avatar[data-avatar]').forEach((el) => S.avatarObserver.observe(el));
}

// Tranche d'âge : enregistrée côté serveur, le paquet et la liste repartent de zéro
// Changer de langue : on l'enregistre sur le compte, pour que le bot suive, puis on redessine.
async function changerLangue(code) {
  if (!LANGUES[code]) return;
  await chargerLangue(code);
  buildTabs();
  S.me.lang = code;
  // On repart d'où l'on venait. Avant l'inscription c'est l'accueil : l'onglet Profil n'existe
  // pas encore, et y envoyer quelqu'un qui n'a pas de compte le laissait sur un écran vide.
  go(S.langueRetour || 'me');
  tg.haptic('select');
  try { await api('/me/lang', { method: 'PUT', body: { lang: code } }); } catch { /* le choix vaut déjà pour cet écran */ }
}

async function saveFilters(values) {
  const form = document.getElementById('filters-form');
  // Le pays vient du brouillon : il se choisit maintenant sur un écran à nous, plus dans un
  // menu du système dont il aurait fallu relire la valeur ici.
  const zone = S.zoneDraft
    ? { country: S.zoneDraft.country, city: S.zoneDraft.city === null ? null : (form?.zoneCity?.value ?? S.zoneDraft.city) }
    : undefined;
  const v = values || {
    ageMin: Number(form?.ageMin.value), ageMax: Number(form?.ageMax.value), zone,
    gender: S.genreDraft ?? (S.me.filters?.gender || ''),
    // Le réglage n'existe que sous « badge » : ailleurs on renvoie ce qui est déjà rangé.
    verifiesSeulement: form?.verifiesSeulement ? form.verifiesSeulement.checked : !!S.me.filters?.verifiesSeulement,
    // Sans le champ à l'écran (pas de pass), on renvoie ce qui est rangé : il dort, on n'efface pas.
    langue: form?.langue ? form.langue.value.trim() : (S.me.filters?.langue || ''),
    ordre: S.ordreDraft ?? (S.me.filters?.ordre || 'defaut'),
  };
  const ok = (n) => Number.isInteger(n) && n >= 18 && n <= 99;
  if (!ok(v.ageMin) || !ok(v.ageMax)) return showError(new Error(t('Indique des âges entre 18 et 99 ans.')));
  if (v.ageMin > v.ageMax) return showError(new Error(t("L'âge minimum doit être inférieur ou égal au maximum.")));
  if (v.zone && v.zone.city !== null && String(v.zone.city).trim().length < 2) return showError(new Error(t('Indique une ville, ou choisis tout le pays.')));
  try {
    const r = await api('/me/filters', { method: 'PUT', body: v });
    S.me.filters = r.filters;
    S.zoneDraft = null;
    S.genreDraft = null;
    S.ordreDraft = null;
    S.filtresDraft = null;
    S.profiles = [];
    S.people = [];
    S.venues = [];
    tg.haptic('success');
    go('discover');
  } catch (e) {
    showError(e);
  }
}

// « J'aime » ou « Passer » depuis le détail d'un profil ouvert par la liste
async function swipePerson(action) {
  const p = S.person;
  if (!p || swiping) return;
  swiping = true;
  tg.haptic(action === 'like' ? 'medium' : 'select');
  try {
    const r = await api('/swipes', { method: 'POST', body: { targetId: p.id, action } });
    S.people = []; // la liste se rechargera avec les nouveaux statuts
    S.likes = [];
    S.profiles = S.profiles.filter((x) => x.id !== p.id); // et la carte quitte le paquet
    if (r.match) {
      S.lastMatch = r.match;
      go('match');
    } else {
      toast(action === 'like' ? t('Aimé. Tu seras prévenu en cas de match.') : t('Passé.'));
      // On revient d'où l'on vient : décider depuis Messages ou depuis la liste ne doit pas
      // éjecter vers le paquet de cartes.
      go(S.personFrom || 'discover');
    }
  } catch (e) {
    showError(e, null);
  } finally {
    swiping = false;
  }
}

// ============================================================
// Écrans
// ============================================================
const SCREENS = {
  // L'accueil montre le produit lui-même, pas la marque : deux cartes de profil comme celles de
  // la découverte — le dégradé à initiale que l'app affiche tant qu'une photo n'est pas chargée —,
  // le bouclier du selfie vérifié, un « J'aime » tamponné, et un message qui propose un café.
  // Une rencontre en une image, sans télécharger la moindre photo (règle 15). Les prénoms et
  // les quartiers sont ceux des profils de démonstration : des noms propres, pas des phrases.
  // Le titre garde son début en clé, coupé après la virgule pour que les derniers mots portent
  // la couleur ; chaque dictionnaire coupe sa propre phrase au même endroit.
  welcome() {
    const name = tg.telegramUser()?.first_name || S.me?.firstName || '';
    const promesse = (i, texte, classe = '') => `<li class="promesse ${classe}"><span class="pictogramme">${icon(i, 20)}</span><span>${texte}</span></li>`;
    const [elle, lui] = [{ prenom: 'Carine', age: 24, lieu: 'Bastos · Yaoundé' }, { prenom: 'Landry', age: 23, lieu: 'Bastos' }];
    const carte = (p, classe) => `
          <div class="carte-demo ${classe}">
            <span class="initial">${esc(p.prenom[0])}</span>
            <span class="scrim"></span>
            <div class="haut">${classe === 'devant' ? `<span class="pill-glass pill-like">${icon('heart', 12, { fill: true })} ${t("T'a liké")}</span>` : ''}</div>
            <div class="bas">
              <div class="nom">${esc(p.prenom)}<span class="age">${p.age}</span><span class="shield">${icon('shield', 15)}</span></div>
              <div class="lieu">${icon('pin', 11)}<span>${esc(p.lieu)}</span></div>
            </div>
            ${classe === 'devant' ? `<span class="stamp like" aria-hidden="true">${t("J'aime")}</span>` : ''}
          </div>`;
    render(`
      <section class="accueil">
        <header class="accueil-tete">
          <span class="marque">${esc(APP)}</span>
          <span class="sep"></span>
          <button type="button" class="langue-chip" data-action="go" data-screen="langue" aria-label="${t('Langue')} : ${esc(LANGUES[langue()])}">
            ${icon('globe', 14)}<span>${esc(LANGUES[langue()])}</span>
          </button>
        </header>
        <div class="scene" aria-hidden="true">
          <i class="lueur lueur-or"></i><i class="lueur lueur-rose"></i>
          ${carte(lui, 'derriere')}
          ${carte(elle, 'devant')}
          <div class="message">
            <span class="avatar sm verified">${esc(elle.prenom[0])}</span>
            <span class="bulle">${t('Samedi 16 h, café de la fac ?')}</span>
          </div>
        </div>
        <p class="eyebrow">${name ? t('Salut {nom}', { nom: esc(name) }) : t('Bienvenue')}</p>
        <h1 class="display accueil-h"><span>${t('Des rencontres vérifiées,')}</span> <em>${t('face à face.')}</em></h1>
      </section>
      <ul class="promesses">
        ${promesse('shield', entreeLibre() ? t('Un bouclier vérifié par selfie sur les profils') : t('Profils vérifiés par selfie'), 'promesse-or')}
        ${promesse('ban', t("Demandes d'argent bloquées"))}
        ${promesse('coffee', t('Premier rendez-vous dans un lieu public'))}
        ${promesse('wifi', t('Léger en data'))}
      </ul>
      <footer class="accueil-pied">
        <p class="fine"><span class="tag-age">18+</span><span>${t("Réservé aux 18 ans et plus. En continuant, tu acceptes les règles de la communauté : respect, aucune demande d'argent, aucun contenu sexuel.")}</span></p>
        <p class="fine">${icon('lock', 14)}<span>${t('Connecté avec Telegram, sans mot de passe. Ton pseudo et ton numéro restent cachés aux autres.')}</span></p>
      </footer>
    `);
    tg.setButtons({ main: { text: t('Créer mon profil'), onClick: () => go('profile') } });
  },

  // Formulaire en trois étapes : identité, recherche, touche personnelle
  profile() {
    const p = S.me.profile || {};
    const f = (S.form ||= {
      name: p.name || tg.telegramUser()?.first_name || '',
      age: p.age || '',
      gender: p.gender || null,
      intent: p.intent || null,
      country: p.country || paysDevine(),
      city: p.city || '',
      area: p.area || '',
      promptQ: QUESTIONS[p.promptQ] ? p.promptQ : QUESTION_DEFAUT,
      promptA: p.promptA || '',
      // Les questions supplémentaires, telles que le serveur les rend : clé et réponse.
      extras: (p.extras || []).map((x) => ({ q: x.q, a: x.a || '' })),
      languages: p.languages || '',
      compat: { ...(p.compat || {}) },
      // Par emplacement : 'keep' (photo existante), une image encodée (nouvelle), ou null (vide ou à retirer)
      photos: Object.fromEntries(emplacementsPhoto().map((n) => [n, (S.me.photos || []).some((x) => x.n === n) ? 'keep' : null])),
    });
    const step = S.formStep;
  noterEtape(step + 1);
    const o = S.me.options;
    const titles = [p.name ? t('Modifie ton profil') : t('Fais-toi connaître'), t('Ce que tu cherches'), t('Ta touche personnelle')];
    const head = `
      <div class="step-head">
        <div class="stepper" aria-hidden="true">${[0, 1, 2].map((i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
        <p class="eyebrow">${t('Étape {n} sur 3', { n: step + 1 })}</p>
        <h1>${titles[step]}</h1>
      </div>`;
    const bodies = [
      `
      <label class="field"><span class="label">${t('Prénom')}</span><input name="name" maxlength="30" value="${esc(f.name)}" autocomplete="given-name" placeholder="${t('Ton prénom')}"></label>
      <label class="field"><span class="label">${t('Âge')}</span><input name="age" type="number" inputmode="numeric" min="18" max="99" value="${esc(f.age)}" placeholder="24"></label>
      <div class="field"><span class="label">${t('Tu es')}</span>
        <div class="seg">${Object.entries(o.genders).map(([k, l]) => `<button type="button" aria-pressed="${f.gender === k}" data-action="set" data-field="gender" data-value="${k}">${t(l)}</button>`).join('')}</div>
      </div>
      <p class="fine">${icon('lock', 14)}<span>${t('Ton prénom et ton âge sont visibles. Ton pseudo et ton numéro Telegram ne le sont jamais.')}</span></p>`,
      `
      <div class="stack">${Object.entries(o.intents).map(([k, l]) => `
        <button type="button" class="choice" aria-pressed="${f.intent === k}" data-action="set" data-field="intent" data-value="${k}">
          <span class="tile">${icon(INTENT_ICONS[k], 22)}</span>
          <div class="body"><div class="title">${t(l)}</div><div class="sub">${INTENT_SUBS()[k]}</div></div>
          <span class="check">${icon('check', 14)}</span>
        </button>`).join('')}</div>
      ${f.intent === 'serieux' ? Object.entries(o.compat || {}).map(([champ, { question, valeurs }]) => `
        <div class="field"><span class="label">${t(question)} <span class="opt">${t('facultatif')}</span></span>
          <div class="seg seg-wrap">${Object.entries(valeurs).map(([v, l]) => `
            <button type="button" aria-pressed="${f.compat[champ] === v}" data-action="set-compat" data-champ="${champ}" data-value="${v}">${t(l)}</button>`).join('')}</div>
        </div>`).join('') : ''}
      <div class="field"><span class="label">${t('Pays')}</span>
        ${ligneDeChoix('choisir-pays', nomPays(f.country) || t('Choisir'), { cible: 'profil' })}
      </div>
      <label class="field"><span class="label">${t('Ville')}</span>
        <input name="city" maxlength="40" value="${esc(f.city)}" placeholder="${esc((S.me.options.knownCities[f.country] || [])[0] || t('Ta ville'))}" autocomplete="off">
      </label>
      ${villesProposees(f.country, 'city', f.city)}
      <label class="field"><span class="label">${t('Quartier')} <span class="opt">${t('facultatif')}</span></span><input name="area" maxlength="40" value="${esc(f.area)}" placeholder="${t('Ton quartier')}"></label>
      <p class="fine">${icon('pin', 14)}<span>${t("Tu verras d'abord les profils de ta ville. Tu pourras élargir à tout le pays, ou viser une autre ville, depuis les filtres.")}</span></p>`,
      `
      <div class="field"><span class="label">${t('Tes photos')} <span class="opt">${t("jusqu'à {n}, facultatif", { n: limite('photos') || 2 })}</span></span>
        <div class="photo-slots">${emplacementsPhoto().map((n) => {
          const v = f.photos[n];
          const existing = (S.me.photos || []).find((x) => x.n === n);
          const src = v && v !== 'keep' ? v : v === 'keep' ? S.photoUrls[`${S.me.id}/${n}`] : null;
          return `
          <label class="photo-slot ${v ? 'has' : ''}" aria-label="${t('Photo {n}', { n })}">
            ${src ? `<img src="${src}" alt="">` : v === 'keep' ? '' : icon('plus', 22)}
            <span class="num">${n}</span>
            ${v ? `<button type="button" class="rm" data-action="photo-remove" data-n="${n}" aria-label="${t('Retirer la photo {n}', { n })}">${icon('x', 14)}</button>` : ''}
            ${v === 'keep' && existing?.status === 'pending' ? `<span class="chip state">${t('En attente')}</span>` : v && v !== 'keep' ? `<span class="chip state">${t('Nouvelle')}</span>` : ''}
            <input type="file" name="photo-${n}" accept="image/*" hidden>
          </label>`;
        }).join('')}</div>
        <span class="small muted">${t("Chaque photo est vérifiée avant d'être montrée aux autres. Compressée sur ton téléphone.")}</span>
      </div>
      <div class="field"><span class="label">${t('Une question sur toi')}</span>
        <div class="chips" role="group" aria-label="${t('Une question sur toi')}">${Object.entries(QUESTIONS).map(([k, l]) => `
          <button type="button" aria-pressed="${k === f.promptQ}" data-action="question" data-value="${esc(k)}">${esc(t(l))}</button>`).join('')}</div>
      </div>
      <!-- Pas de suggestion sous ce champ : elle répondait à « Mon plat du dimanche », retirée des
           questions (#74), et s'affichait donc sous « Mon coin préféré » ou « Je supporte » sans
           rapport avec ce qui était demandé. Une suggestion par question serait juste ; une
           suggestion qui ne suit pas la question est pire que pas de suggestion. -->
      <label class="field"><span class="label">${t('Ta réponse')}</span><input name="promptA" maxlength="120" value="${esc(f.promptA)}"></label>
      ${blocsQuestionsSupplementaires(f)}
      <label class="field"><span class="label">${t('Langues parlées')} <span class="opt">${t('facultatif')}</span></span><input name="languages" maxlength="60" value="${esc(f.languages)}" placeholder="${t('Français, anglais, ewondo')}"></label>
      <p class="fine">${icon('ban', 14)}<span>${t('Ni numéro, ni pseudo, ni lien dans ton profil : ils seraient refusés.')}</span></p>`,
    ];
    render(`${head}${bodies[step]}<p id="form-error" class="error" role="alert"></p>`);
    if (step === 2) emplacementsPhoto().filter((n) => f.photos[n] === 'keep' && !S.photoUrls[`${S.me.id}/${n}`]).forEach((n) => photoUrl(S.me.id, n).then((url) => {
      const slot = app.querySelector(`input[name="photo-${n}"]`)?.closest('.photo-slot');
      if (url && slot && !slot.querySelector('img')) slot.prepend(Object.assign(document.createElement('img'), { src: url, alt: '' }));
    }));
    // Retour : l'étape précédente, puis l'écran parent
    tg.setBack(step > 0 ? () => { S.formStep = step - 1; SCREENS.profile(); } : () => go(PARENT.profile()));
    tg.setButtons({ main: step < 2 ? { text: t('Continuer'), onClick: nextStep } : { text: t('Enregistrer'), onClick: saveProfile } });
  },

  // Aucune entrée fichier ne porte `capture` — ni ici, ni pour les photos — et ce n'est pas un
  // oubli. Telegram Android construit son sélecteur avec `fileChooserParams.createIntent()` et ne
  // lit jamais `isCaptureEnabled()` : l'indication est reçue puis jetée, la galerie s'ouvre quand
  // même. Un bouton « ouvrir la caméra » promettait donc ce qu'on ne peut pas tenir sur notre
  // cible. On demande à la place de prendre le selfie d'abord, puis de le choisir — ce qui est
  // vrai partout. La vérification ne repose de toute façon pas sur l'appareil qui a pris la photo,
  // mais sur le geste aléatoire, valable dix minutes et jugé par un humain.
  async verify() {
    const head = `<div class="step-head"><p class="eyebrow">${t('Vérification')}</p><h1>${t("Vérifie que c'est bien toi")}</h1></div>`;
    if (!S.gesture) {
      render(`${head}${skeleton.block(220)}`);
      tg.setButtons(null);
      try {
        S.gesture = (await api('/me/verification/start', { method: 'POST' })).gesture;
      } catch (e) {
        return renderError(e, () => go('verify'));
      }
      if (S.screen !== 'verify') return;
    }
    // Ce que la vérification donne dépend de la politique du serveur. Sous « gate », elle ouvre
    // l'app : rien avant elle. Sous « badge », l'app est déjà ouverte et elle donne le bouclier,
    // le rendez-vous et le quota entier. Annoncer la mauvaise des deux, c'est mentir.
    const gains = entreeLibre()
      ? `
      <div class="list">
        ${listRow({ iconName: 'shield', tile: 'tile-ok', title: t('Le bouclier sur ta fiche'), sub: t('Les autres voient que ton selfie a été vérifié') })}
        ${listRow({ iconName: 'coffee', title: t('Proposer un rendez-vous'), sub: t('Réservé aux profils vérifiés, des deux côtés') })}
        ${listRow({ iconName: 'heart', tile: 'tile-like', title: t('Plus de profils par jour'), sub: t('Ton quota du jour passe au maximum') })}
      </div>`
      : '';
    render(`
      ${head}
      <p class="lead">${t("Un selfie avec le geste demandé. Seule l'équipe de vérification le voit, puis il est supprimé.")}</p>
      ${gains}
      ${S.selfie ? `
        <div class="preview-wrap">
          <img class="preview" src="${S.selfie}" alt="${t('Aperçu du selfie')}">
          <label class="btn btn-glass btn-sm retake">${icon('refresh', 16)} ${t('Changer')}<input type="file" name="selfie" accept="image/*" hidden></label>
        </div>` : `
        <label class="gesture-card pressable">
          <span class="tile tile-lg">${icon('hand', 30)}</span>
          <span class="eyebrow">${t('Geste demandé')}</span>
          <span class="gesture">${esc(S.gesture)}</span>
          <span class="muted small">${t('Prends un selfie avec ce geste, puis choisis-le ici.')}</span>
          <span class="btn btn-primary">${icon('image', 18)} ${t('Choisir mon selfie')}</span>
          <input type="file" name="selfie" accept="image/*" hidden>
        </label>`}
      <div class="list">
        ${listRow({ iconName: 'lock', title: t('Jamais montré aux autres membres') })}
        ${listRow({ iconName: 'trash', title: t('Supprimé dès la décision'), tile: 'tile-neutral' })}
        ${listRow({ iconName: 'clock', title: t('En général quelques minutes'), tile: 'tile-neutral' })}
      </div>
      <p id="form-error" class="error" role="alert"></p>
    `);
    // « Plus tard » n'existe que sous « badge » : sous « gate », il n'y a nulle part où aller.
    const plusTard = entreeLibre() ? { secondary: { text: t('Plus tard'), onClick: () => go('discover') } } : {};
    tg.setButtons(S.selfie
      ? { main: { text: t('Envoyer pour vérification'), onClick: sendSelfie }, ...plusTard }
      : (entreeLibre() ? { main: { text: t('Plus tard'), onClick: () => go('discover') } } : null));
  },

  pending() {
    render(`
      <div class="empty top">
        <div class="pulse" aria-hidden="true"><span class="ring"></span><span class="ring"></span><span class="core">${icon('shield', 34)}</span></div>
        <h1>${t('Vérification en cours')}</h1>
        <p>${t("En général quelques minutes. Le bot t'écrit dans Telegram dès que c'est fait : tu peux fermer l'app.")}</p>
      </div>
      <div class="list"><div class="timeline">
        <div class="tl"><span class="dot done"></span><div><div class="t">${t('Selfie envoyé')}</div><div class="s">${t('Il sera supprimé dès la décision')}</div></div></div>
        <div class="tl"><span class="dot now"></span><div><div class="t">${t("Vérification par l'équipe")}</div><div class="s">${t('Une vraie personne regarde le geste et le visage')}</div></div></div>
        <div class="tl"><span class="dot"></span><div><div class="t">${t('Profil visible')}</div><div class="s">${t('Tu découvres les profils de ta zone')}</div></div></div>
      </div></div>
    `);
    tg.setButtons({ main: { text: t('Actualiser'), onClick: refreshStatus }, secondary: { text: t('Fermer'), onClick: tg.close } });
    S.pendingTimer = setInterval(refreshStatus, 5000);
  },

  async discover() {
    // Le mode est retenu dans CloudStorage : quelqu'un qui avait la vue Liste avant qu'elle passe
    // dans le pass, ou dont le pass vient d'expirer, la retrouverait ici et n'obtiendrait qu'un
    // 403. On revient aux cartes plutôt que de le laisser devant un écran d'erreur.
    if (S.discoverMode === 'list' && !limite('liste')) S.discoverMode = 'cards';
    if (S.discoverMode === 'list') return renderPeople();
    const dbar = discoverBar;
    if (!S.profiles.length) {
      render(`${dbar()}${skeleton.card()}`);
      tg.setButtons(null);
      try {
        const r = await api('/discover');
        S.profiles = r.profiles;
        S.remaining = r.remaining;
        S.quota = r.quota;
        S.vivier = r.vivier;
      } catch (e) {
        return renderError(e, () => go('discover'));
      }
      if (S.screen !== 'discover') return;
    }
    const p = S.profiles[0];
    const next = S.profiles[1];
    if (!p) {
      const v = S.vivier || {};
      const ville = zoneLabel(zoneDe());
      const intention = t((S.me.options?.intents || {})[S.me.profile.intent] || '');
      let titre, texte, bouton;
      if (!sansLimite() && !S.remaining) {
        titre = t('Ta limite du jour est atteinte');
        // Le nombre vient du serveur : il dépend du badge, et le recopier ici le ferait mentir.
        texte = t('Tu peux aimer {n} profils par jour. Le compteur repart à minuit. Passer un profil ne compte pas.', { n: S.quota || 0 });
        bouton = verifie() || !entreeLibre()
          ? { text: t('Voir mes messages'), onClick: () => go('matches') }
          : { text: t('Faire vérifier mon profil'), onClick: () => go('verify') };
        if (entreeLibre() && !verifie()) texte += ` ${t('Un profil vérifié en a davantage.')}`;
      } else if (!v.total) {
        titre = t("Personne d'autre dans cette zone pour l'instant");
        // La zone entre parenthèses : « à {zone} » donnait « à États-Unis ». Un article correct
        // demanderait le genre de 243 pays ; la parenthèse marche pour une ville comme pour un pays.
        // Ne rien promettre que le code ne tient pas : aucune alerte d'arrivée n'existe aujourd'hui.
        texte = t('Personne ne cherche « {intention} » dans ta zone ({zone}) pour le moment. Change de zone, reviens dans quelques jours, ou parle de {app} autour de toi.', { intention: esc(intention), zone: esc(ville), app: esc(APP) });
        bouton = { text: t('Changer de zone'), onClick: () => go('filters') };
      } else if (v.horsTranche) {
        titre = t("Tu as vu tous les profils de ta tranche d'âge");
        texte = tn("{n} profil de ta zone est en dehors de la tranche que tu as choisie. Tu peux l'élargir.", "{n} profils de ta zone sont en dehors de la tranche que tu as choisie. Tu peux l'élargir.", v.horsTranche);
        bouton = { text: t("Élargir ma tranche d'âge"), onClick: () => go('filters') };
      } else {
        titre = t('Tu as vu tous les profils du moment');
        texte = t('Reviens un peu plus tard : de nouveaux profils vérifiés arrivent chaque jour.');
        bouton = { text: t('Voir mes messages'), onClick: () => go('matches') };
      }
      // La barre reste : c'est le seul chemin vers la zone et vers la vue Liste. Sans elle,
      // l'écran qui dit « change de zone » était le seul d'où on ne pouvait pas le faire.
      render(`
        ${dbar()}
        <div class="empty">
          <span class="glyph">${icon('sparkles', 34)}</span>
          <h2>${titre}</h2>
          <p>${texte}</p>
        </div>`);
      return tg.setButtons({ main: bouton });
    }
    render(`
      ${dbar()}
      <div class="deck">${next ? profileCard(next, { cls: 'next' }) : ''}${profileCard(p, { cls: 'top' })}</div>
      ${S.swiped ? '' : `<p class="fine">${icon('hand', 14)}<span>${t('Glisse la carte vers la droite pour aimer, vers la gauche pour passer.')}</span></p>`}`);
    loadCardPhoto(p);
    S.detachSwipe = attachSwipe(app.querySelector('.deck .card.top'), { onLike: () => swipe('like'), onPass: () => swipe('pass') });
    tg.setButtons({ main: { text: t("J'aime"), onClick: () => swipe('like') }, secondary: { text: t('Passer'), onClick: () => swipe('pass') } });
  },

  filters() {
    // Le brouillon en dernier : ce qui a été tapé sans être enregistré l'emporte sur ce qui est
    // rangé, sinon aller choisir un pays remettrait les âges à leur valeur d'avant.
    const f = { ageMin: 18, ageMax: 99, gender: '', verifiesSeulement: false, langue: '', ordre: 'defaut', ...(S.me.filters || {}), ...(S.filtresDraft || {}) };
    const ordre = S.ordreDraft ?? f.ordre;
    if (S.genreDraft != null) f.gender = S.genreDraft;
    // Qui choisit le genre recherché.
    //
    // En Amitié, toujours la personne. En « Relation sérieuse », cela dépend de la politique du
    // serveur, que `options.genreAuChoix` résume : sous la politique par défaut, la mise en
    // relation est déjà femme/homme et l'écran dit la règle plutôt que d'offrir un réglage —
    // laisser choisir y reviendrait à enregistrer l'orientation de chacun (règle 5.2). Là où un
    // déploiement a levé cette politique, la règle n'existe plus et c'est la personne qui dit
    // qui elle cherche, sans quoi elle verrait des profils qu'elle n'a pas demandés.
    const monGenre = S.me.profile?.gender;
    const choisit = S.me.profile?.intent === 'amitie' || S.me.options.genreAuChoix;
    const z = S.zoneDraft || (S.zoneDraft = { ...zoneDe() });
    const toutLePays = z.city === null;
    // Pays du fuseau : proposé seulement s'il diffère de la zone en cours, sinon le bouton
    // ne ferait rien. Il ne s'applique jamais tout seul — c'est la personne qui décide.
    const ici = S.me.options.suggestedCountry;
    render(`
      <div class="step-head"><h1>${t('Qui veux-tu voir ?')}</h1><p class="lead">${t("La zone où tu veux rencontrer, et la tranche d'âge. Ton intention vient de ton profil.")}</p></div>
      <form id="filters-form" class="stack">
        <span class="eyebrow">${t('Zone de recherche')}</span>
        <div class="field"><span class="label">${t('Pays')}</span>
          ${ligneDeChoix('choisir-pays', nomPays(z.country) || t('Choisir'), { cible: 'zone' })}
        </div>
        ${ici && ici !== z.country ? `
        <button type="button" class="btn btn-ghost btn-sm" data-action="zone-ici">${icon('pin', 15)} ${t('Ma position : {pays}', { pays: esc(nomPays(ici)) })}</button>` : ''}
        <div class="seg seg-zone" aria-label="${t('Étendue')}">
          <button type="button" data-action="zone-mode" data-mode="ville" aria-pressed="${!toutLePays}">${t('Une ville')}</button>
          <button type="button" data-action="zone-mode" data-mode="pays" aria-pressed="${toutLePays && limite('paysEntier')}">${icon(limite('paysEntier') ? 'globe' : 'lock', 14)} ${t('Tout le pays')}</button>
        </div>
        ${limite('paysEntier') ? '' : `<p class="fine">${icon('info', 14)}<span>${t('Sans pass, tu vois les profils de ta ville. Un pass ouvre le pays entier.')}</span></p>`}
        ${toutLePays ? '' : `
        <label class="field"><span class="label">${t('Ville')}</span>
          <input name="zoneCity" maxlength="40" value="${esc(z.city || '')}" placeholder="${esc((S.me.options.knownCities[z.country] || [])[0] || t('Ta ville'))}" autocomplete="off">
        </label>
        ${villesProposees(z.country, 'zoneCity', z.city || '')}`}
        ${choisit ? `
        <span class="eyebrow">${t('Qui tu cherches')}</span>
        <div class="seg seg-genre" aria-label="${t('Qui tu cherches')}">
          <button type="button" data-action="genre" data-genre="" aria-pressed="${!f.gender}">${t('Tout le monde')}</button>
          ${Object.keys(S.me.options.genders).map((cle) => `
          <button type="button" data-action="genre" data-genre="${esc(cle)}" aria-pressed="${f.gender === cle}">${cle === 'femme' ? t('Femmes') : t('Hommes')}</button>`).join('')}
        </div>` : `
        <p class="fine">${icon('users', 14)}<span>${t('En relation sérieuse, {app} met en relation une femme et un homme : tu vois donc {genre}.', { app: esc(APP), genre: monGenre === 'femme' ? t('des hommes') : t('des femmes') })}</span></p>`}
        <span class="eyebrow">${t("Tranche d'âge")}</span>
        <div class="row">
          <label class="field"><span class="label">${t('De')}</span><input name="ageMin" type="number" inputmode="numeric" min="18" max="99" value="${esc(f.ageMin)}"></label>
          <label class="field"><span class="label">${t('À')}</span><input name="ageMax" type="number" inputmode="numeric" min="18" max="99" value="${esc(f.ageMax)}"></label>
        </div>
        <span class="eyebrow">${t('Ordre du paquet')}</span>
        ${limite('ordreDuPaquet') ? `
        <div class="seg seg-ordre" aria-label="${t('Ordre du paquet')}">${(S.me.options.ordres || []).map((k) => `
          <button type="button" data-action="ordre" data-ordre="${esc(k)}" aria-pressed="${k === ordre}">${t(ORDRES_LABELS[k] || k)}</button>`).join('')}</div>
        <p class="fine">${icon('info', 14)}<span>${t("Qui t'a aimé passe toujours devant, quel que soit l'ordre.")}</span></p>` : `
        <div class="list">${listRow({ iconName: 'lock', title: t("Choisir l'ordre du paquet"), sub: t('Avec un pass'), action: 'plus' })}</div>`}
        <span class="eyebrow">${t('Langue parlée')}</span>
        ${limite('filtreLangue') ? `
        <label class="field"><span class="label">${t('Ne voir que les personnes qui parlent')} <span class="opt">${t('facultatif')}</span></span>
          <input name="langue" maxlength="30" value="${esc(f.langue || '')}" placeholder="${t('Français, ewondo, anglais…')}" autocomplete="off"></label>
        <p class="fine">${icon('info', 14)}<span>${t("Ça lit ce que chacun a écrit dans « Langues parlées », mot pour mot. « Anglais » ne trouve pas « English ».")}</span></p>` : `
        <div class="list">${listRow({ iconName: 'lock', title: t('Filtrer par langue parlée'), sub: t('Avec un pass'), action: 'plus' })}</div>`}
        ${entreeLibre() ? `
        <span class="eyebrow">${t('Vérification')}</span>
        <label class="list-row">
          <span class="tile ${f.verifiesSeulement ? 'tile-ok' : ''}">${icon('shield', 20)}</span>
          <div class="body"><div class="title">${t('Profils vérifiés seulement')}</div><div class="sub">${t('Les profils au bouclier passent déjà en premier. Ici, tu ne vois qu\'eux.')}</div></div>
          <input type="checkbox" class="switch" name="verifiesSeulement" ${f.verifiesSeulement ? 'checked' : ''}>
        </label>` : ''}
        <p class="error" id="form-error"></p>
      </form>
      <p class="fine">${icon('users', 14)}<span>${t('Ta zone ne vaut que pour toi : elle décide de qui tu vois, pas de qui te voit.')}</span></p>
      <p class="fine">${icon('info', 14)}<span>${t('Les personnes qui ont aimé ton profil restent dans Messages, quels que soient leur âge et leur ville.')}</span></p>`);
    document.getElementById('filters-form').addEventListener('submit', (e) => { e.preventDefault(); saveFilters(); });
    tg.setButtons({ main: { text: t('Enregistrer'), onClick: () => saveFilters() }, secondary: { text: t('Tout voir'), onClick: () => saveFilters({ ageMin: 18, ageMax: 99, gender: '', verifiesSeulement: false, langue: '', zone: { ...zoneDe(), city: null } }) } });
  },

  person({ id }) {
    const p = S.people.find((x) => x.id === id) || S.likes.find((x) => x.id === id);
    if (!p) return go('discover');
    S.person = p;
    const note = p.status === 'liked' ? `${icon('heart', 14)}<span>${t('Tu as déjà aimé ce profil. Le bot te prévient en cas de match.')}</span>`
      : p.status === 'passed' ? `${icon('clock', 14)}<span>${t('Tu avais passé ce profil. Tu peux revenir sur ta décision.')}</span>` : '';
    render(`<div class="deck">${profileCard(p, { cls: 'top' })}</div>${note ? `<p class="fine">${note}</p>` : ''}`);
    loadCardPhoto(p);
    if (p.status === 'liked') tg.setButtons(null);
    else if (p.status === 'passed') tg.setButtons({ main: { text: t("J'aime"), onClick: () => swipePerson('like') } });
    else tg.setButtons({ main: { text: t("J'aime"), onClick: () => swipePerson('like') }, secondary: { text: t('Passer'), onClick: () => swipePerson('pass') } });
  },

  match() {
    const m = S.lastMatch;
    const me = S.me.publicProfile;
    render(`
      <div class="match-hero">
        <span class="aura" aria-hidden="true"></span>
        <p class="eyebrow">${t("C'est un match")}</p>
        <div class="pair">${avatar(me, 'xl')}<span class="spark">${icon('heart', 20, { fill: true })}</span>${avatar(m.other, 'xl')}</div>
        <h1 class="display">${t('{nom} et toi, vous vous plaisez', { nom: esc(m.other.name) })}</h1>
        <p class="lead">${t('Brise la glace avec une question sur son profil. Les liens et numéros se débloquent après quelques messages.')}</p>
      </div>`);
    loadAvatar(me, { own: true });
    loadAvatar(m.other);
    tg.haptic('success');
    tg.setButtons({ main: { text: t('Écrire à {nom}', { nom: m.other.name }), onClick: () => go('chat', { id: m.id }) }, secondary: { text: t('Plus tard'), onClick: () => go('discover') } });
  },

  async matches({ silent = false } = {}) {
    if (!silent) {
      render(`<div class="group"><span class="eyebrow">${t('Discussions')}</span>${skeleton.rows(4)}</div>`);
      tg.setButtons(null);
    }
    try {
      // Les likes reçus s'affichent ici : c'est là qu'on répond à quelqu'un. Sans pass, le
      // serveur refuse la liste — on ne la demande donc pas : une requête qu'on sait refusée
      // coûte de la data pour un 403 (règle 15). Le `catch` reste, pour le pass qui expire
      // entre deux écrans.
      const [m, l] = await Promise.all([api('/matches'), plus() ? api('/likes').catch(() => ({ profiles: [] })) : Promise.resolve({ profiles: [] })]);
      S.matches = m.matches;
      S.likes = l.profiles;
    } catch (e) {
      return renderError(e, () => go('matches'));
    }
    if (S.screen !== 'matches') return;
    // Sans pass, la bande ne disparaît pas en silence : elle dit ce qui existe et où le voir.
    // Un manque sans explication se lit comme une panne, et on cherche ce qu'on a mal fait.
    const likesStrip = S.likes.length ? `
      <div class="group"><span class="eyebrow">${t('Ont aimé ton profil')}</span>
        <div class="new-strip">${S.likes.map((p) => `<button type="button" class="new-item like-item" data-action="person" data-id="${esc(p.id)}">${avatar(p, 'md')}<span>${esc(p.name)}</span></button>`).join('')}</div>
      </div>` : plus() ? '' : `
      <div class="group"><span class="eyebrow">${t('Ont aimé ton profil')}</span>
        <div class="list">${listRow({ iconName: 'sparkles', tile: 'tile-ok', title: t("Voir qui t'a aimé"), sub: t('Ces personnes passent déjà devant dans ton paquet. Le pass les nomme.'), action: 'plus' })}</div>
      </div>`;
    if (!S.matches.length) {
      render(`${likesStrip}
        <div class="empty${likesStrip ? ' top' : ''}">
          <span class="glyph">${icon('message', 34)}</span>
          <h2>${t('Tes matchs apparaîtront ici')}</h2>
          <p>${t("Quand vous vous plaisez tous les deux, la discussion s'ouvre. Le bot te prévient, même app fermée.")}</p>
        </div>`);
      return tg.setButtons({ main: { text: t('Découvrir des profils'), onClick: () => go('discover') } });
    }
    const fresh = S.matches.filter((m) => m.isNew);
    render(`${likesStrip}
      ${fresh.length ? `
      <div class="group"><span class="eyebrow">${t('Nouveaux matchs')}</span>
        <div class="new-strip">${fresh.map((m) => `<button type="button" class="new-item" data-action="open-chat" data-id="${m.id}">${avatar(m.other, 'md')}<span>${esc(m.other.name)}</span></button>`).join('')}</div>
      </div>` : ''}
      <div class="group"><span class="eyebrow">${t('Discussions')}</span>
        <div class="list">${S.matches.map((m) => `
          <button type="button" class="list-row ${m.unread ? 'unread' : ''}" data-action="open-chat" data-id="${m.id}">
            ${avatar(m.other, 'sm')}
            <div class="body">
              <div class="title">${esc(m.other.name)}${m.other.verified ? `<span class="c-ok">${icon('shield', 14)}</span>` : ''}${m.aQuiDeParler === 'moi' && !m.unread ? `<span class="tour">${t('À toi')}</span>` : ''}</div>
              <div class="preview">${m.lastMessage ? `${m.lastMessage.mine ? t('Toi : ') : ''}${esc(m.lastMessage.text)}` : t('Nouveau match, écris le premier message')}</div>
            </div>
            ${m.unread ? `<span class="count-badge">${m.unread}</span>` : `<span class="chev">${icon('chevron-right', 18)}</span>`}
          </button>`).join('')}
        </div>
      </div>`);
    S.matches.slice(0, 8).forEach((m) => loadAvatar(m.other));
    S.likes.slice(0, 6).forEach((p) => loadAvatar(p));
    tg.setButtons(null);
  },

  async chat({ id }) {
    if (!id) return go('matches');
    render(`<div class="chat"><div class="chat-head"><span class="sk sk-avatar"></span><div class="body stack" style="gap:8px"><span class="sk sk-line w40"></span><span class="sk sk-line w60"></span></div></div>${skeleton.chat()}</div>`);
    tg.setButtons(null);
    // Un jeton par ouverture : la réponse d'une discussion quittée entre-temps ne doit pas
    // remplacer celle qu'on regarde — sinon le message suivant partait à la mauvaise personne
    // (audit/09-revue-code.md, I9). Vérifier l'écran ne suffisait pas : c'est encore « chat ».
    const jeton = (S.chatJeton = (S.chatJeton || 0) + 1);
    const perime = () => S.screen !== 'chat' || jeton !== S.chatJeton;
    try {
      const data = await api(`/matches/${encodeURIComponent(id)}`);
      if (perime()) return;
      S.chat = { id, other: data.other, messages: data.messages, dates: data.dates, unlockAfter: data.unlockAfter, notice: null, tete: null, rendus: 0, bouge: Date.now(), ecritDepuis: 0 };
    } catch (e) {
      if (perime()) return;
      return renderError(e, () => go('chat', { id }));
    }
    renderChat();
    // Le second bouton est celui qui protège vraiment au lancement : les notifications
    // automatiques dépendent d'un rendez-vous accepté dans un lieu partenaire, et il n'y en a
    // aucun. Celui-ci ne dépend de rien — il part au moment où on quitte la maison.
    tg.setButtons({
      main: { text: t('Proposer un rendez-vous'), onClick: () => go('date') },
      ...(S.me.confiance ? { secondary: { text: t('Je pars au rendez-vous'), onClick: prevenirConfiance } } : {}),
    });
    // Jamais deux minuteurs : une réponse tardive en posait un second, orphelin pour toujours.
    relancerLePoll();
  },

  async date() {
    if (!S.chat) return go('matches');
    // Le badge des deux côtés. Se retrouver en vrai est le seul moment où l'app envoie quelqu'un
    // quelque part : c'est là que le selfie regardé par un humain doit avoir eu lieu, pour l'un
    // comme pour l'autre. Le serveur refuse de toute façon (BADGE_REQUIS) ; l'écran le dit avant,
    // et propose le geste qui débloque plutôt qu'un formulaire qui finira en erreur.
    if (!verifie() || !S.chat.other.verified) {
      const moi = !verifie();
      render(`
        <div class="step-head">
          <p class="eyebrow">${t('Avec {nom}', { nom: esc(S.chat.other.name) })}</p>
          <h1>${t('Le rendez-vous demande le bouclier')}</h1>
          <p class="lead">${moi
            ? t("Fais vérifier ton profil pour proposer un rendez-vous. C'est un selfie avec un geste, regardé par une vraie personne.")
            : t("{nom} n'a pas encore fait vérifier son profil. Proposer un rendez-vous demande le bouclier des deux côtés.", { nom: esc(S.chat.other.name) })}</p>
        </div>
        <div class="notice notice-info">${icon('coffee', 18)}<span>${t("Vous pouvez convenir d'un lieu public dans la discussion, et prévenir chacun une personne de confiance.")}</span></div>`);
      return tg.setButtons(moi
        ? { main: { text: t('Faire vérifier mon profil'), onClick: () => go('verify') }, secondary: { text: t('Revenir à la discussion'), onClick: () => go('chat', { id: S.chat.id }) } }
        : { main: { text: t('Revenir à la discussion'), onClick: () => go('chat', { id: S.chat.id }) } });
    }
    if (!S.venues.length) {
      try {
        const r = await api(`/venues?match=${encodeURIComponent(S.chat.id)}`);
        S.venues = r.venues;
        S.partenairesDansLePays = r.partenairesDansLePays;
      } catch (e) { return renderError(e, () => go('date')); }
      // Revenu à la discussion pendant l'attente : ne pas la remplacer par cet écran — le champ
      // de saisie serait reconstruit sous les doigts (règle 16).
      if (S.screen !== 'date') return;
    }
    const d = S.dateDraft;
    const slots = [t("Aujourd'hui, 17 h"), t('Demain, 16 h'), t('Samedi, 11 h'), t('Dimanche, 15 h')];
    render(`
      <div class="step-head">
        <p class="eyebrow">${t('Avec {nom}', { nom: esc(S.chat.other.name) })}</p>
        <h1>${t('Proposer un rendez-vous sûr')}</h1>
        <p class="lead">${t('Uniquement dans des lieux publics partenaires, où ton arrivée est confirmée par un code.')}</p>
      </div>
      <div class="group"><span class="eyebrow">${t('Où')}</span>
        <div class="stack">${S.venues.length ? S.venues.map((v) => `
          <button type="button" class="choice" aria-pressed="${d.venueId === v.id}" data-action="venue" data-id="${v.id}">
            <span class="tile">${icon('coffee', 20)}</span>
            <div class="body"><div class="title">${esc(v.name)}</div><div class="sub">${esc(v.area)} · ${esc(v.city)} · ${esc(v.perk)}</div></div>
            <span class="check">${icon('check', 14)}</span>
          </button>`).join('') : `<div class="notice notice-warn">${icon('info', 18)}<span>${S.partenairesDansLePays
            ? t("Pas encore de lieu partenaire dans ta ville. Le rendez-vous avec confirmation d'arrivée n'est donc pas disponible ici.")
            : t("Pas encore de lieu partenaire dans ton pays. Le rendez-vous avec confirmation d'arrivée n'est donc pas disponible.")} ${t("Vous pouvez convenir d'un lieu public dans la discussion, et prévenir chacun une personne de confiance.")}</span></div>`}</div>
      </div>
      <div class="group"><span class="eyebrow">${t('Quand')}</span>
        <div class="slots">${slots.map((s) => `<button type="button" class="slot" aria-pressed="${d.slot === s}" data-action="slot" data-value="${esc(s)}">${s}</button>`).join('')}</div>
      </div>
      <div id="date-summary">${dateSummary()}</div>
      <p id="form-error" class="error" role="alert"></p>
    `);
    tg.closingConfirmation(!!(d.venueId || d.slot));
    tg.setButtons({ main: { text: t('Envoyer la proposition'), onClick: sendDate } });
  },

  // Se protéger de quelqu'un : trois gestes de gravité croissante, et six motifs de signalement.
  // Jusqu'ici, se débarrasser d'une personne passait obligatoirement par une accusation.
  protection({ id, matchId }) {
    S.protection = { id, matchId };
    const motif = (cle, texte, sous) => `
      <button type="button" class="list-row" data-action="signaler" data-motif="${cle}">
        <div class="body"><div class="title">${texte}</div><div class="sub">${sous}</div></div>
        <span class="chev">${icon('chevron-right', 18)}</span>
      </button>`;
    render(`
      <div class="step-head"><h1>${t('Te protéger de cette personne')}</h1><p class="lead">${t('Elle ne sera jamais prévenue, quel que soit ton choix.')}</p></div>
      ${matchId ? `
      <div class="group"><span class="eyebrow">${t('Sans rien signaler')}</span>
        <div class="list">
          <button type="button" class="list-row" data-action="retirer-match">
            <div class="body"><div class="title">${t('Retirer ce match')}</div><div class="sub">${t('La discussion disparaît des deux côtés. Vous ne vous reverrez pas dans les profils')}</div></div>
            <span class="chev">${icon('chevron-right', 18)}</span>
          </button>
          <button type="button" class="list-row" data-action="bloquer">
            <div class="body"><div class="title">${t('Bloquer')}</div><div class="sub">${t('Plus aucun message, aucun rendez-vous, aucune notification de sa part')}</div></div>
            <span class="chev">${icon('chevron-right', 18)}</span>
          </button>
        </div>
      </div>` : `
      <div class="group"><span class="eyebrow">${t('Sans rien signaler')}</span>
        <div class="list">
          <button type="button" class="list-row" data-action="bloquer">
            <div class="body"><div class="title">${t('Bloquer')}</div><div class="sub">${t('Ce profil ne peut plus te contacter ni apparaître')}</div></div>
            <span class="chev">${icon('chevron-right', 18)}</span>
          </button>
        </div>
      </div>`}
      <div class="group"><span class="eyebrow">${t('Signaler à la modération')}</span>
        <div class="list">
          ${motif('argent', t("Demande d'argent"), t("Elle t'a demandé ou proposé de l'argent"))}
          ${motif('chantage', t('Chantage ou menace'), t('Photos, vidéos, menaces de révéler quelque chose'))}
          ${motif('deplace', t('Comportement déplacé'), t('Insultes, propos sexuels non voulus, insistance'))}
          ${motif('usurpation', t("Ce n'est pas la bonne personne"), t('Photos volées, identité empruntée'))}
          ${motif('mineur', t('Cette personne semble mineure'), t('Le compte est bloqué et vérifié en priorité'))}
          ${motif('violence', t('Violence ou menace physique'), t("Elle t'a menacée, ou après un rendez-vous"))}
        </div>
      </div>
      <p class="fine">${icon('shield', 14)}<span>${t('Signaler bloque aussi la personne. Un modérateur regarde chaque signalement.')}</span></p>`);
    tg.setButtons(null);
  },

  // La personne de confiance. L'app ne fabrique qu'une invitation : c'est elle qui accepte, dans
  // Telegram, après avoir lu ce qu'elle recevra et ce qu'on garde d'elle. Rien n'est enregistré
  // avant son accord — un bot ne peut de toute façon pas écrire à qui ne lui a jamais parlé.
  confiance() {
    const c = S.me.confiance;
    render(`
      <div class="step-head"><h1>${t('Personne de confiance')}</h1>
        <p class="lead">${t("Quelqu'un qui sait quand tu vas à un rendez-vous, où et à quelle heure. C'est la protection la plus simple et la plus efficace.")}</p></div>
      ${c ? `
      <div class="group">
        <div class="list">
          <div class="list-row">
            <span class="tile tile-ok">${icon('shield', 20)}</span>
            <div class="body"><div class="title">${esc(c.prenom)}</div><div class="sub">${t('Prévenu quand tu pars à un rendez-vous et quand tu arrives')}</div></div>
          </div>
        </div>
        <p class="fine">${icon('lock', 14)}<span>${t("On ne lui dit jamais avec qui tu as rendez-vous, ni ce que vous vous écrivez.")}</span></p>
      </div>
      <div class="danger-zone"><button type="button" class="btn btn-danger btn-block" data-action="confiance-retirer">${t('Retirer {prenom}', { prenom: esc(c.prenom) })}</button></div>`
      : `
      <div class="list">
        ${listRow({ iconName: 'info', title: t("Elle accepte elle-même"), sub: t("Tu lui envoies un lien, elle lit ce qu'elle recevra et décide. Rien n'est enregistré avant.") })}
        ${listRow({ iconName: 'bell', title: t('Ce qu\'elle reçoit'), sub: t('Le lieu et l\'heure de ton rendez-vous, et le moment où tu arrives. Rien d\'autre.') })}
        ${listRow({ iconName: 'shield', title: t('Ce qu\'on garde d\'elle'), sub: t('Son prénom et son compte Telegram. Elle peut se retirer quand elle veut.') })}
      </div>`}
    `);
    tg.setBack(() => go('me'));
    tg.setButtons(c ? null : { main: { text: t('Envoyer une invitation'), onClick: inviterConfiance } });
  },

  // La jauge de confiance, expliquée (P1-5). Les critères viennent du serveur, les mêmes que
  // ceux que la carte affiche : un seul endroit décrit ce que la jauge mesure, donc l'explication
  // ne peut pas raconter autre chose que le score. Le garant n'y est pas et n'y sera pas (P1-6
  // abandonné) : annoncer un critère qu'on ne peut pas remplir serait promettre à vide.
  // La présentation vocale, expliquée avant le saut plutôt qu'après.
  //
  // L'enregistrement a lieu dans le bot, et pas ici : getUserMedia est inutilisable dans les mini
  // apps sur Android, qui est notre cible (voir l'en-tête de server/voix.js). Ce saut ne peut pas
  // disparaître ; ce qui peut disparaître, c'est la surprise. Cet écran dit donc les trois choses
  // qu'on a besoin de savoir avant de partir : où l'on va, quel geste faire en arrivant, et ce
  // qu'il ne faut pas dire. Avant, l'app envoyait dans une discussion sans prévenir, depuis la
  // cinquième ligne d'une liste de réglages.
  voix() {
    const v = S.me.voix;
    const apres = S.voixApresVerif;
    render(`
      <div class="step-head"><h1>${t('Ta présentation vocale')}</h1>
        <p class="lead">${t("Quinze secondes de ta voix sur ta fiche. C'est facultatif, et tu peux la retirer quand tu veux.")}</p></div>
      ${v ? `<div class="notice ${v.status === 'approved' ? 'notice-ok' : 'notice-info'}">${icon(v.status === 'approved' ? 'check' : 'clock', 18)}<span>${v.status === 'approved'
        ? t('Validée · {duree}. Les autres peuvent l\'écouter.', { duree: dureeLisible(v.duree) })
        : t("En attente : la modération l'écoute avant les autres")}</span></div>` : ''}
      <div class="list"><div class="timeline">
        <div class="tl"><span class="dot now"></span><div><div class="t">${t('Tu passes dans la discussion avec le bot')}</div><div class="s">${t('Le micro est dans Telegram, pas dans cette app')}</div></div></div>
        <div class="tl"><span class="dot"></span><div><div class="t">${t('Appuie sur le micro, en bas, et parle')}</div><div class="s">${t('Dis qui tu es et ce que tu cherches, en 15 secondes')}</div></div></div>
        <div class="tl"><span class="dot"></span><div><div class="t">${t("La modération l'écoute avant les autres")}</div><div class="s">${t('Ne donne ni numéro, ni pseudo, ni rendez-vous')}</div></div></div>
      </div></div>
      ${v ? `<div class="danger-zone"><button type="button" class="btn btn-danger btn-block" data-action="voix-retirer">${icon('trash', 18)} ${t('Retirer ma présentation vocale')}</button></div>` : ''}
    `);
    tg.setButtons({
      main: { text: v ? t('Réenregistrer') : t('Enregistrer ma présentation'), onClick: () => ouvrirLeBotVoix() },
      secondary: { text: apres ? t('Plus tard') : t('Retour'), onClick: () => { S.voixApresVerif = false; go(apres ? 'discover' : 'me'); } },
    });
  },

  // Après la suppression : un écran sans aucun appel. Hors de Telegram, close() ne ferme rien,
  // et rappeler /me aurait recréé le compte qu'on vient d'effacer.
  supprime() {
    tg.setButtons(null);
    render(`
      <div class="step-head"><h1>${t('Ton compte et tes données ont été supprimés.')}</h1>
        <p class="lead">${t('Pour recommencer, ferme {app} et rouvre-le depuis le bot.', { app: APP })}</p></div>`);
  },

  // Odo Plus : ce que le pass donne, et ce qu'il ne donne pas encore.
  //
  // L'écran n'annonce que ce qui existe **dans le serveur**. La leçon de « Sortie en duo » tient
  // en une ligne : une promesse affichée que rien n'honore est pire qu'une fonction absente, parce
  // que la personne l'a crue. Le reste du pass viendra ligne par ligne, et cet écran avec.
  //
  // Et tant qu'il n'y a pas de caisse, il le dit. Vendre est un chantier à part (P0-6) ; faire
  // semblant d'avoir un bouton d'achat en serait un mauvais résumé.
  plus() {
    const etat = S.me.plus || { actif: false };
    const fin = etat.finLe ? new Date(etat.finLe).toLocaleDateString(langue(), { dateStyle: 'long' }) : '';
    render(`
      <div class="step-head"><h1>${t('{app} Plus', { app: APP })}</h1>
        <p class="lead">${t("Le pass ne change rien à qui tu rencontres : les mêmes personnes, la même zone, les mêmes règles. Il enlève l'attente.")}</p></div>
      ${etat.actif ? `<div class="notice notice-ok">${icon('check', 18)}<span>${t('Ton pass est actif jusqu\'au {date}.', { date: fin })}</span></div>` : ''}
      <div class="list">
        ${listRow({ iconName: 'heart', tile: 'tile-like', title: t('Des « J\'aime » sans compter'), sub: S.me.quota === null ? t('Tu n\'as aucune limite en ce moment.') : t('Sans pass, tu en as {n} par jour.', { n: S.me.quota }) })}
        ${listRow({ iconName: 'sparkles', tile: 'tile-ok', title: t('Qui t\'a aimé'), sub: t('La liste, avec les fiches. Sans pass, ces personnes passent devant dans ton paquet, mais rien ne les nomme.') })}
        ${listRow({ iconName: 'rows', title: t("Se sont arrêtés sur ta fiche"), sub: t("Combien, en gros, et les cinq dernières fiches. Jamais ce qu'elles ont décidé.") })}
        ${listRow({ iconName: 'rows', title: t('La vue Liste'), sub: t('Cinquante profils d\'un coup, avec leur statut. Les mêmes personnes que dans tes cartes.') })}
        ${listRow({ iconName: 'globe', title: t('Tout le pays'), sub: t('Sans pass, tu vois les profils de ta ville.') })}
        ${listRow({ iconName: 'camera', title: t('{n} photos', { n: S.me?.limites?.avecPass?.photos || 6 }), sub: t('Sans pass, {n}.', { n: limite('photos') || 2 }) })}
        ${listRow({ iconName: 'mic', title: t('Une présentation vocale de {n} secondes', { n: S.me?.limites?.avecPass?.voixSecondes || 30 }), sub: t('Sans pass, {n} secondes.', { n: limite('voixSecondes') || 15 }) })}
        ${listRow({ iconName: 'sparkles', title: t('{n} questions sur ta fiche', { n: S.me?.limites?.avecPass?.questions || 3 }), sub: t('Sans pass, {n}.', { n: limite('questions') || 1 }) })}
        ${listRow({ iconName: 'globe', title: t('Filtrer par langue parlée'), sub: t('Ne voir que les personnes qui parlent ta langue, ou celle que tu apprends.') })}
        ${listRow({ iconName: 'sliders', title: t("L'ordre du paquet au choix"), sub: t("Conseillé, les plus actifs, les nouveaux, ou ton quartier d'abord.") })}
      </div>
      ${etat.actif ? '' : `<p class="fine">${icon('info', 14)}<span>${t("Le pass n'est pas encore en vente. Il le sera dans {app}, jamais par message.", { app: APP })}</span></p>`}`);
    tg.setBack(() => go(S.plusRetour || 'me'));
    tg.setButtons({ main: { text: t('Compris'), onClick: () => go(S.plusRetour || 'me') } });
  },

  // « Qui s'est arrêté sur ta fiche ». La règle et ses trois refus sont dans `server/vues.js` ;
  // ici il n'y a qu'un écran, et une phrase à choisir selon le palier que le serveur envoie.
  // Le serveur n'envoie **pas** de français : il envoie une forme et un nombre (règle 10).
  async vues() {
    // Aucun cache : l'écran s'ouvre rarement, et un retrait coché à la ligne du dessus doit se
    // voir au premier coup d'œil, pas au prochain démarrage.
    render(`<div class="group"><span class="eyebrow">${t("Se sont arrêtés sur ta fiche")}</span>${skeleton.rows(3)}</div>`);
    tg.setButtons(null);
    let vu;
    try { vu = await api('/vues'); } catch (e) { return renderError(e, () => go('vues')); }
    if (S.screen !== 'vues') return;
    const { discret, arrondi, profiles } = vu;
    const combien = discret ? t("Tu t'es retiré de cette liste : tu n'y apparais pas, et tu ne la vois pas non plus.")
      : arrondi.forme === 'aucune' ? t("Personne pour l'instant, sur les 30 derniers jours.")
        : arrondi.forme === 'moins' ? t('Moins de {n} personnes se sont arrêtées sur ta fiche ces 30 derniers jours.', { n: arrondi.n })
          : t('Plus de {n} personnes se sont arrêtées sur ta fiche ces 30 derniers jours.', { n: arrondi.n });
    render(`
      <div class="step-head"><h1>${t("Se sont arrêtés sur ta fiche")}</h1>
        <p class="lead">${combien}</p></div>
      ${profiles.length ? `
      <div class="group"><span class="eyebrow">${t('Les derniers')}</span>
        <div class="new-strip">${profiles.map((p) => `<button type="button" class="new-item" data-action="person" data-id="${esc(p.id)}">${avatar(p, 'md')}<span>${esc(p.name)}</span></button>`).join('')}</div>
      </div>` : ''}
      <p class="fine">${icon('lock', 14)}<span>${t("On ne montre jamais ce que ces personnes ont décidé, et jamais la liste entière : c'est ce qui empêche de deviner qui n'a pas voulu de toi.")}</span></p>`);
    profiles.forEach((p) => loadAvatar(p));
    tg.setBack(() => go('me'));
    tg.setButtons({ main: { text: t('Compris'), onClick: () => go('me') } });
  },

  jauge() {
    const tr = S.me.publicProfile?.trust || { score: 0, total: 0, criteres: [] };
    const etat = Object.fromEntries((tr.criteres || []).map((c) => [c.cle, c.ok]));
    // Où revenir : tant que le compte n'est pas vérifié, la personne est encore dans son
    // inscription et l'écran suivant est le selfie. Vérifiée, elle vient de l'onglet Profil.
    const avantVerif = S.me.verification !== 'approved';
    render(`
      <div class="step-head"><h1>${t('La jauge de confiance')}</h1>
        <p class="lead">${t("Sur chaque profil, de petites pastilles disent ce qui a été vérifié. Personne n'est noté : on montre ce qui est prouvé, et rien de plus.")}</p></div>
      <div class="list">${(S.me.options.criteres || []).map((c) => `
        <div class="list-row">
          <span class="tile ${etat[c.cle] ? 'tile-ok' : ''}">${icon(etat[c.cle] ? 'check' : 'shield', 20)}</span>
          <div class="body">
            <div class="title">${t(c.titre)}</div>
            <div class="sub">${t(c.quoi)}</div>
            <div class="sub">${etat[c.cle] ? t('Tu l\'as.') : t(c.comment)}</div>
          </div>
        </div>`).join('')}</div>
      <p class="fine">${icon('info', 14)}<span>${t("Une jauge pleine ne veut pas dire qu'une personne est sûre. Elle dit ce qui a été vérifié — le reste, c'est ton jugement, et les rendez-vous dans un lieu public.")}</span></p>`);
    tg.setBack(() => go(avantVerif ? 'verify' : 'me'));
    tg.setButtons({ main: { text: t('Compris'), onClick: () => go(avantVerif ? 'verify' : 'me') } });
  },

  // Choisir un pays parmi 243, sans passer par le menu du système.
  //
  // Le `<select>` d'Android n'est pas une liste de l'app : c'est une boîte de dialogue du
  // système, grise, à la typographie du système, qu'aucune ligne de notre CSS ne peut toucher.
  // Et surtout **elle n'a pas de recherche** : atteindre le Cameroun demandait de faire défiler
  // une quarantaine de pays depuis l'Afghanistan, sur un écran de téléphone.
  //
  // Cet écran est donc le nôtre, comme celui de la langue : une recherche, les pays probables
  // en haut, le reste par ordre alphabétique. **Pas de drapeau** : l'emoji de drapeau manque sur
  // une partie des Android, et deux lettres dans un carré valent moins qu'un nom bien posé.
  pays() {
    const { cible, courant } = S.pays || {};
    const tous = paysTries();
    // Les pays probables : celui déjà choisi, celui du fuseau du téléphone, celui de la
    // configuration. Dédoublonnés, et seulement s'ils existent dans la liste.
    const suggeres = [...new Set([courant, S.me.options.suggestedCountry, S.me.options.defaultCountry].filter(Boolean))]
      .map((code) => tous.find((c) => c.code === code)).filter(Boolean);
    render(`
      <div class="step-head">
        <h1>${cible === 'zone' ? t('Où veux-tu rencontrer ?') : t('Ton pays')}</h1>
      </div>
      <div class="recherche">
        <span class="champ">
          ${icon('search', 18)}
          <input name="recherche-pays" type="search" autocomplete="off" autocorrect="off" spellcheck="false"
                 placeholder="${t('Chercher un pays')}" aria-label="${t('Chercher un pays')}">
        </span>
      </div>
      <div id="liste-pays">${listeDesPays(tous, suggeres, courant, '')}</div>`);
    tg.setButtons(null);
  },

  // Choix de la langue. Par défaut celle de Telegram ; le choix explicite est gardé sur le
  // serveur, pour que le bot écrive lui aussi dans la bonne langue.
  langue() {
    render(`
      <div class="step-head"><h1>${t('Langue')}</h1><p class="lead">${t("L'app et les messages du bot suivent ce choix.")}</p></div>
      <div class="list">${Object.entries(LANGUES).map(([code, nom]) => `
        <button type="button" class="list-row" data-action="set-langue" data-langue="${code}">
          <div class="body"><div class="title">${esc(nom)}</div></div>
          ${code === langue() ? `<span class="c-ok">${icon('check', 18)}</span>` : `<span class="chev">${icon('chevron-right', 18)}</span>`}
        </button>`).join('')}</div>
      <p class="fine">${icon('info', 14)}<span>${t('Les profils restent écrits dans la langue de chacun : seule l\'interface change.')}</span></p>`);
    tg.setButtons(null);
  },

  safety() {
    render(`
      <div class="step-head"><h1>${t('Ta sécurité')}</h1><p class="lead">${t('Ce que {app} garantit, et quoi faire si quelque chose cloche.', { app: esc(APP) })}</p></div>
      <div class="list">
        <button type="button" class="list-row" data-action="toggle-guide" aria-expanded="${S.guideOpen}">
          <span class="tile tile-danger">${icon('alert', 20)}</span>
          <div class="body"><div class="title">${t("Quelqu'un me fait du chantage")}</div><div class="sub">${t('Que faire, étape par étape')}</div></div>
          <span class="chev acc-chev">${icon('chevron-down', 18)}</span>
        </button>
        <div class="acc ${S.guideOpen ? 'open' : ''}"><div><ol class="steps">
          <li>${t("Ne paie rien, même sous la menace : payer n'arrête presque jamais le chantage.")}</li>
          <li>${t("Garde les preuves : captures d'écran, prénom et date.")}</li>
          <li>${t('Signale et bloque le profil depuis la discussion.')}</li>
          <li>${t("Parle à une personne de confiance ou à une association d'aide aux victimes.")}</li>
        </ol></div></div>
      </div>
      <div class="group"><span class="eyebrow">${t('Nos engagements')}</span>
        <div class="list">
          ${listRow({ iconName: 'ban', tile: 'tile-ok', title: t("{app} ne te demandera jamais d'argent", { app: esc(APP) }), sub: t('Ni pour vérifier ton compte, ni pour débloquer un profil.') })}
          ${listRow({ iconName: 'coffee', title: t('Premier rendez-vous dans un lieu public'), sub: t('Préviens un proche et rentre par tes propres moyens.') })}
          ${listRow({ iconName: 'lock', title: t('Pseudo et numéro jamais montrés'), sub: t('Les contacts se débloquent seulement après quelques messages.') })}
        </div>
      </div>
      <div class="list">
        ${listRow({ iconName: 'sliders', tile: 'tile-neutral', title: t('Paramètres et confidentialité'), sub: t('Données, notifications, suppression du compte'), action: 'go', extra: ' data-screen="me"' })}
      </div>`);
    tg.setButtons(null);
  },

  me() {
    const status = { none: [t('Non vérifié'), 'chip-warn'], pending: [t('Vérification en cours'), 'chip-warn'], approved: [t('Vérifié'), 'chip-ok'], rejected: [t('Vérification refusée'), 'chip-warn'] }[S.me.verification];
    const pp = S.me.publicProfile;
    render(`
      <div class="me-head">
        ${pp ? avatar(pp, 'lg') : `<span class="avatar lg">${icon('user', 30)}</span>`}
        <div class="body">
          <div class="n">${pp ? `${esc(pp.name)}, ${esc(pp.age)}` : t('Ton profil')}</div>
          <div class="c"><span class="chip ${status[1]}">${S.me.verification === 'approved' ? icon('shield', 13) : ''}${status[0]}</span>${pp ? `<span>${icon('pin', 13)} ${esc(pp.city)}</span>` : ''}</div>
        </div>
      </div>
      ${pp && !verifie() ? `
      <div class="list">
        ${S.me.verification === 'pending'
          ? listRow({ iconName: 'clock', title: t('Vérification en cours'), sub: t("Le bot t'écrit dès que c'est fait"), action: 'go', extra: ' data-screen="pending"' })
          : listRow({ iconName: 'shield', tile: 'tile-ok', title: t('Faire vérifier mon profil'),
            sub: S.me.verification === 'rejected' ? t('Ta dernière tentative a été refusée. Tu peux recommencer.') : t('Le bouclier sur ta fiche, le rendez-vous, et plus de profils par jour'),
            action: 'go', extra: ' data-screen="verify"' })}
      </div>` : ''}
      ${pp && completion().pct < 100 ? `
      <div class="group"><span class="eyebrow">${t('Ton profil')}</span>
        <div class="completion">
          <div class="completion-head">
            <span class="ring ring-lg" style="--p: ${completion().pct}%"></span>
            <div class="body"><div class="title">${t('Complété à {pct} %', { pct: completion().pct })}</div><div class="sub">${completion().missing.length > 1 ? t('Il te manque peu de chose') : t("Plus qu'une étape")}</div></div>
          </div>
          <div class="list">${completion().missing.map((i) => listRow({ iconName: i.icon, title: i.title, sub: i.sub, action: 'edit-step', extra: ` data-step="${i.step}"`, trailing: `<span class="chip chip-accent">+${i.pts} %</span>` })).join('')}</div>
        </div>
      </div>` : ''}
      ${pp ? `
      <div class="group"><span class="eyebrow">${t('Ce que les autres voient')}</span>
        ${profileCard(pp, { own: true })}
        <p class="fine">${icon('lock', 14)}<span>${t('Ton pseudo et ton numéro Telegram ne sont jamais montrés.')}</span></p>
      </div>
      <div class="list">
        ${listRow({ iconName: 'mic', tile: S.me.voix?.status === 'approved' ? 'tile-ok' : '', title: t('Ta présentation vocale'),
          sub: S.me.voix?.status === 'approved' ? t('Validée · {duree} — les autres peuvent l\'écouter', { duree: dureeLisible(S.me.voix.duree) })
            : S.me.voix?.status === 'pending' ? t("En attente : la modération l'écoute avant les autres")
              : t('15 secondes de ta voix sur ta fiche, en option'),
          action: 'go', extra: ' data-screen="voix"' })}
      </div>` : `<div class="notice notice-info">${icon('info', 18)}<span>${t("Tu n'as pas encore de profil.")}</span></div>`}
      <div class="group"><span class="eyebrow">${t('Paramètres')}</span>
        <div class="list">
          ${listRow({ iconName: 'sparkles', tile: plus() ? 'tile-ok' : '', title: t('{app} Plus', { app: APP }),
            sub: plus() ? t('Actif jusqu\'au {date}', { date: new Date(S.me.plus.finLe).toLocaleDateString(langue(), { dateStyle: 'long' }) })
              : t('Ce que le pass enlève, et ce qu\'il ne change pas'),
            action: 'plus' })}
          ${listRow({ iconName: 'globe', title: t('Langue'), sub: LANGUES[langue()], action: 'go', extra: ` data-screen="langue"` })}
          ${listRow({ iconName: 'bell', title: t('Tester les notifications'), sub: t("Le bot t'envoie un message dans Telegram"), action: 'test-notif' })}
          <label class="list-row">
            <span class="tile">${icon('wifi', 20)}</span>
            <div class="body"><div class="title">${t('Économie de data')}</div><div class="sub">${t("Les vignettes des listes ne se chargent pas. La fiche que tu regardes garde sa photo.")}</div></div>
            <input type="checkbox" class="switch" name="dataSaver" ${S.dataSaver ? 'checked' : ''}>
          </label>
          ${plus() ? listRow({ iconName: 'rows', title: t("Se sont arrêtés sur ta fiche"), sub: t('Combien, en gros, et les cinq dernières fiches'), action: 'go', extra: ' data-screen="vues"' }) : ''}
          <label class="list-row">
            <span class="tile">${icon('lock', 20)}</span>
            <div class="body"><div class="title">${t('Rester discret')}</div><div class="sub">${t("Tu n'apparais pas dans « qui s'est arrêté sur ta fiche », et tu ne la vois pas non plus")}</div></div>
            <input type="checkbox" class="switch" name="discretion" ${S.me.discretion ? 'checked' : ''}>
          </label>
          ${listRow({ iconName: 'shield', title: t('La jauge de confiance'), sub: t('Ce que les pastilles mesurent, et comment les obtenir'), action: 'go', extra: ' data-screen="jauge"' })}
          ${listRow({ iconName: 'shield', title: t('Personne de confiance'),
            sub: S.me.confiance ? t('{prenom} est prévenu quand tu vas à un rendez-vous', { prenom: esc(S.me.confiance.prenom) }) : t("Quelqu'un qui sait où tu es quand tu vas à un rendez-vous"),
            action: 'go', extra: ' data-screen="confiance"' })}
          ${listRow({ iconName: 'heart', tile: 'tile-like', title: t('Inviter une amie ou un ami'), sub: t("Plus il y a de profils vérifiés près de toi, mieux c'est"), action: 'invite', trailing: `<span class="chev">${icon('share', 18)}</span>` })}
          ${tg.canShareToStory() ? listRow({ iconName: 'sparkles', title: t('Partager en story'), sub: t('Ton profil n\'y apparaît pas'), action: 'story', trailing: `<span class="chev">${icon('share', 18)}</span>` }) : ''}
          ${tg.canAddToHome() ? listRow({ iconName: 'home', title: t("Ajouter à l'écran d'accueil"), action: 'home' }) : ''}
        </div>
      </div>
      <div class="list">
        ${listRow({ iconName: 'shield', title: t('Confidentialité'), sub: t('Ce qu\'on sait de toi, et comment tout effacer'), action: 'page', extra: ' data-page="/confidentialite"' })}
        ${listRow({ iconName: 'info', title: t("Conditions d'utilisation"), sub: t('Les règles, en une page'), action: 'page', extra: ' data-page="/conditions"' })}
      </div>
      <div class="danger-zone"><button type="button" class="btn btn-danger btn-block" data-action="delete">${icon('trash', 18)} ${t('Supprimer mon compte et mes données')}</button></div>
    `);
    if (pp) { loadCardPhoto(pp, { own: true }); loadAvatar(pp, { own: true }); }
    tg.setButtons({ main: { text: pp ? t('Modifier mon profil') : t('Créer mon profil'), onClick: () => { S.form = null; S.formStep = 0; go('profile'); } } });
  },
};

// Ce qui remplace un `<select>` : une ligne de l'app, à la taille et au rayon d'un champ, qui
// ouvre un écran à nous. Le menu du système n'était ni de notre typographie, ni de nos couleurs,
// ni traduisible, ni cherchable — et c'est cette dernière absence qui coûtait le plus cher.
const ligneDeChoix = (action, valeur, data = {}) => `
  <button type="button" class="select-row" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}>
    <span class="valeur">${esc(valeur)}</span>
    ${icon('chevron-down', 18)}
  </button>`;

// Les villes connues d'un pays, en pastilles visibles d'un coup — jamais un `<datalist>`.
// Le menu que le navigateur en tire est, comme un `<select>`, une **boîte du système** : sur la
// WebView de Telegram Android il se dessine par-dessus l'écran, sans fond et à sa propre
// typographie, par-dessus les champs et jusque sur le clavier. Aucune ligne de styles.css ne
// pouvait l'atteindre. Ces villes se comptent sur les doigts : elles ne se cachent donc pas
// derrière un appui, exactement comme les questions du profil (`.chips`).
const villesProposees = (pays, champ, valeur) => {
  const villes = S.me.options.knownCities[pays] || [];
  if (!villes.length) return '';
  return `
    <div class="chips chips-villes" role="group" aria-label="${t('Villes connues')}">${villes.map((v) => `
      <button type="button" aria-pressed="${v === valeur}" data-action="ville" data-champ="${esc(champ)}" data-value="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
};

// Une pastille remplit le champ **sans refaire l'écran** : reconstruire l'input fermerait le
// clavier, même cause que la recherche de pays et que la règle 16. On rejoue l'événement que
// les gestionnaires écoutent déjà plutôt que de recopier ici ce qu'ils font.
function poserLaVille(champ, valeur) {
  const input = app.querySelector(`input[name="${champ}"]`);
  if (!input) return;
  input.value = valeur;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  app.querySelectorAll(`.chips-villes button[data-champ="${champ}"]`)
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === valeur)));
}

// Les lignes de la liste des pays, et la liste entière. Deux fonctions parce que la recherche
// ne redessine que la liste : refaire le champ pendant la frappe fermerait le clavier — même
// cause que la règle 16 dans la discussion.
const lignesDePays = (liste, courant) => liste.map((c) => `
  <button type="button" class="list-row" data-action="pays-choisi" data-code="${esc(c.code)}">
    <div class="body"><div class="title">${esc(c.name)}</div></div>
    ${c.code === courant ? `<span class="c-ok">${icon('check', 18)}</span>` : ''}
  </button>`).join('');

function listeDesPays(tous, suggeres, courant, q) {
  const trouves = paysCherches(tous, q);
  if (!trouves.length) {
    return `
      <div class="empty">
        <span class="glyph">${icon('search', 30)}</span>
        <h2>${t('Aucun pays ne correspond')}</h2>
        <p>${t('Vérifie l\'orthographe, ou fais défiler la liste.')}</p>
      </div>`;
  }
  // Pendant une recherche, les suggestions n'ont plus de sens : on répond à la question posée.
  const enTete = q.trim() || !suggeres.length ? '' : `
    <span class="eyebrow">${t('Proposés')}</span>
    <div class="list list-simple">${lignesDePays(suggeres, courant)}</div>`;
  return `${enTete}
    <span class="eyebrow">${q.trim() ? tn('{n} pays trouvé', '{n} pays trouvés', trouves.length) : t('Tous les pays')}</span>
    <div class="list list-simple">${lignesDePays(trouves, courant)}</div>`;
}

// Quitter l'écran des filtres pour choisir un pays ne doit rien faire perdre. La zone et le genre
// ont déjà leur brouillon ; l'âge et « vérifiés seulement » vivaient dans le DOM, et le DOM
// disparaît au changement d'écran. On les met de côté avant de partir.
function garderLesFiltres() {
  const form = document.getElementById('filters-form');
  if (!form) return;
  S.filtresDraft = {
    ageMin: form.ageMin?.value,
    ageMax: form.ageMax?.value,
    ...(form.langue ? { langue: form.langue.value } : {}),
    ...(form.verifiesSeulement ? { verifiesSeulement: form.verifiesSeulement.checked } : {}),
  };
}

function dateSummary() {
  const d = S.dateDraft;
  const v = S.venues.find((x) => x.id === d.venueId);
  if (v && d.slot) return `<div class="notice notice-ok">${icon('calendar', 18)}<span><strong>${esc(v.name)}</strong>, ${esc(d.slot)}. ${t("Préviens une personne de confiance du lieu et de l'heure.")}</span></div>`;
  return `<p class="fine">${icon('info', 14)}<span>${t("Conseil : préviens une personne de confiance du lieu et de l'heure.")}</span></p>`;
}

// ============================================================
// Actions
// ============================================================
// Vérifie les champs d'une étape du profil ; renvoie le message d'erreur ou null
function stepError(step) {
  const f = S.form;
  const age = Number(f.age);
  if (step === 0) {
    if (!f.name.trim()) return t('Indique ton prénom.');
    if (!String(f.age).trim()) return t('Indique ton âge.');
    if (!Number.isInteger(age) || age > 99) return t('Indique ton âge en chiffres, entre 18 et 99.');
    if (age < 18) return t('{app} est réservé aux 18 ans et plus.', { app: APP });
    if (!f.gender) return t('Indique si tu es une femme ou un homme.');
  }
  if (step === 1 && !f.intent) return t('Choisis ce que tu cherches.');
  if (step === 2 && f.promptA.trim().length < 3) return t('Réponds à la question sur toi.');
  if (step === 2 && (f.extras || []).some((x) => x.a.trim().length < 3)) return t('Réponds à chaque question que tu as choisie, ou retire-la.');
  return null;
}

// Prévenir maintenant. Le message ne nomme pas l'autre personne : elle n'a jamais accepté que
// son prénom parte chez quelqu'un qu'elle ne connaît pas.
async function prevenirConfiance() {
  if (!S.chat?.id) return;
  const prenom = S.me.confiance?.prenom || '';
  if (!await tg.confirm(t('Prévenir {prenom} que tu pars à un rendez-vous maintenant ?', { prenom }))) return;
  try {
    await api(`/matches/${encodeURIComponent(S.chat.id)}/prevenir`, { method: 'POST' });
    tg.haptic('success');
    toast(t('{prenom} est prévenu', { prenom }));
  } catch (e) { showError(e); }
}

// L'invitation part par le partage de Telegram : la personne l'ouvre, le bot lui explique, elle
// accepte. L'app n'enregistre rien tant qu'elle n'a pas répondu.
async function inviterConfiance() {
  try {
    const { lien } = await api('/me/confiance/invitation', { method: 'POST' });
    tg.share(lien, t("Je te choisis comme personne de confiance sur {app}. Ouvre ce lien, tu verras ce que ça veut dire avant d'accepter.", { app: APP }));
    toast(t("Invitation prête. Envoie-la à la personne que tu choisis."));
  } catch (e) { showError(e); }
}

function nextStep() {
  const err = stepError(S.formStep);
  if (err) return showError(new Error(err));
  tg.haptic('select');
  S.formStep += 1;
  SCREENS.profile();
}

async function saveProfile() {
  for (let s = 0; s < 3; s += 1) {
    const err = stepError(s);
    if (err) {
      if (S.formStep !== s) { S.formStep = s; SCREENS.profile(); }
      return showError(new Error(err));
    }
  }
  const f = S.form;
  tg.setButtons({ main: { text: t('Enregistrement'), progress: true } });
  try {
    const { photos, ...fields } = f;
    await api('/me/profile', { method: 'PUT', body: { ...fields, age: Number(f.age) } });
    // Emplacements : une nouvelle image part en modération, un emplacement vidé est supprimé
    for (const n of emplacementsPhoto()) {
      const v = photos[n];
      const existed = (S.me.photos || []).some((x) => x.n === n);
      if (v && v !== 'keep') await api(`/me/photos/${n}`, { method: 'PUT', body: { photo: v } });
      else if (!v && existed) await api(`/me/photos/${n}`, { method: 'DELETE' });
    }
    S.form = null;
    S.formStep = 0;
    S.me = await api(ME());
    oublierLesPhotos();
    tg.haptic('success');
    if (verifie()) {
      toast(t('Profil mis à jour'), 'ok');
      go('me');
    } else if (!local?.getItem(JAUGE_VUE)) {
      // Une seule fois, à l'inscription : la jauge s'affiche partout, autant dire tout de suite
      // ce qu'elle mesure. Retenu dans le navigateur — aucune requête de plus.
      try { local.setItem(JAUGE_VUE, '1'); } catch { /* navigation privée : tant pis, on la remontrera */ }
      go('jauge');
    } else {
      go('verify');
    }
  } catch (e) {
    showError(e);
    tg.setButtons({ main: { text: t('Enregistrer'), onClick: saveProfile } });
  }
}

async function sendSelfie() {
  tg.setButtons({ main: { text: t('Envoi du selfie'), progress: true } });
  try {
    await api('/me/verification', { method: 'POST', body: { selfie: S.selfie } });
    S.selfie = null;
    S.gesture = null;
    S.me.verification = 'pending';
    // Autorise le bot à écrire à l'utilisateur (utile s'il a ouvert l'app par un lien sans démarrer le bot)
    await tg.requestWriteAccess();
    go('pending');
  } catch (e) {
    showError(e);
    tg.setButtons({ main: { text: t('Envoyer pour vérification'), onClick: sendSelfie } });
  }
}

async function refreshStatus() {
  try {
    const me = await api(ME());
    S.me = me;
    if (verifie()) {
      tg.haptic('success');
      // Une seule fois, au moment où le compte vient d'être vérifié : c'est là qu'on a une fiche
      // à compléter et l'envie de s'en servir. Retenu dans le navigateur, comme la jauge — aucune
      // requête de plus. Passer outre mène à la découverte, et la fiche garde le lien.
      if (!me.voix && !local?.getItem(VOIX_VUE)) {
        try { local.setItem(VOIX_VUE, '1'); } catch { /* navigation privée : on la remontrera */ }
        S.voixApresVerif = true;
        return go('voix');
      }
      go('discover');
    } else if (me.verification === 'rejected') {
      toast(t('Vérification refusée : réessaie avec le visage bien visible.'), 'warn');
      go('verify');
    }
  } catch { /* on réessaiera au prochain passage */ }
}

let swiping = false;
// La carte part sur le côté pendant que le serveur enregistre le choix ; elle revient en cas d'erreur
async function swipe(action) {
  const p = S.profiles[0];
  if (!p || swiping) return;
  swiping = true;
  S.swiped = true;
  tg.haptic(action === 'like' ? 'medium' : 'select');
  const card = app.querySelector('.deck .card.top');
  try {
    const [r] = await Promise.all([
      api('/swipes', { method: 'POST', body: { targetId: p.id, action } }),
      throwCard(card, action === 'like' ? 1 : -1),
    ]);
    S.profiles.shift();
    if (!sansLimite()) S.remaining = Math.max(0, S.remaining - 1);
    S.people = []; // les statuts de la liste ont changé
    if (r.match) {
      S.lastMatch = r.match;
      go('match');
    } else {
      go('discover');
    }
  } catch (e) {
    if (card) {
      card.classList.remove('throw');
      card.classList.add('settle');
      card.style.transform = '';
      card.querySelectorAll('.stamp').forEach((s) => (s.style.opacity = 0));
    }
    showError(e);
  } finally {
    swiping = false;
  }
}

// ---------- Discussion ----------
function chatTete(c) {
  const dateCards = c.dates.map((d) => {
    const clos = d.status === 'declined' || d.status === 'cancelled';
    const etat = ETAT_RDV()[d.arrivedMe ? 'arrived' : d.status] || ETAT_RDV().proposed;
    // Qui peut faire quoi : la personne invitée accepte ou refuse, celle qui propose annule sa
    // proposition, et une fois le rendez-vous accepté chacun peut se décommander.
    const aRepondre = d.status === 'proposed' && !d.proposedByMe;
    const peutAnnuler = d.status === 'accepted' || (d.status === 'proposed' && d.proposedByMe);
    return `
    <div class="datecard ${d.arrivedMe ? 'ok' : ''}${clos ? ' clos' : ''}">
      <div class="head">
        <span class="tile ${etat[2]}">${icon(etat[1], 20)}</span>
        <div class="body"><div class="v">${esc(d.venue?.name)}</div><div class="w">${esc(d.venue?.area)} · ${esc(d.slot)}</div></div>
        <span class="chip ${etat[3]}">${etat[0]}</span>
      </div>
      ${d.arrivedOther && !clos ? `<p class="fine">${icon('check', 14)}<span>${t("L'autre personne est arrivée.")}</span></p>` : ''}
      ${d.status === 'proposed' && d.proposedByMe ? `<p class="fine">${icon('clock', 14)}<span>${t('En attente de sa réponse.')}</span></p>` : ''}
      ${aRepondre ? `<div class="row">
        <button type="button" class="btn btn-tint btn-sm" data-action="rdv" data-status="declined" data-id="${d.id}">${t('Refuser')}</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="rdv" data-status="accepted" data-id="${d.id}">${t('Accepter')}</button>
      </div>` : ''}
      ${d.status === 'accepted' && !d.arrivedMe ? `<button type="button" class="btn btn-primary btn-sm" data-action="checkin" data-id="${d.id}">${icon('qr', 16)} ${t('Je suis arrivé(e) : scanner le code')}</button>` : ''}
      ${peutAnnuler ? `<button type="button" class="btn btn-ghost btn-sm" data-action="rdv" data-status="cancelled" data-id="${d.id}">${t('Annuler le rendez-vous')}</button>` : ''}
    </div>`;
  }).join('');

  return `${dateCards}<div class="spacer"></div>${barreDeDeblocage(c)}`;
}

// **La barre compte l'échange, pas le total.** Le serveur débloque sur `Math.min(les miens, les
// siens)` — c'est ce que dit déjà le message d'erreur, « échangés de chaque côté » — alors que
// la barre additionnait tout le fil. Trois messages dont un seul de l'autre personne
// s'affichaient « 3/10 » pour un échange réel de 1 : la barre promettait le déblocage jusqu'à
// dix fois trop tôt, et la promesse tombait au moment d'écrire le numéro.
const echangeDe = (c) => Math.min(
  c.messages.filter((m) => m.mine).length,
  c.messages.filter((m) => !m.mine).length,
);

function barreDeDeblocage(c) {
  const n = Math.min(echangeDe(c), c.unlockAfter);
  if (n >= c.unlockAfter) return '';
  return `
    <div class="unlock">
      <div class="head"><span>${t('Liens et numéros débloqués à {n} messages', { n: c.unlockAfter })}</span><strong id="unlock-n">${n}/${c.unlockAfter}</strong></div>
      <div class="track"><div class="fill" id="unlock-fill" style="width:${Math.round((100 * n) / c.unlockAfter)}%"></div></div>
    </div>`;
}

// Les bulles, à partir de l'indice demandé. `depuis` sert au rendu par ajout : le fil ne se
// refait plus à chaque message, on lui ajoute ce qui manque. Le regroupement lit le message
// précédent, y compris quand il est déjà à l'écran — d'où l'indice plutôt qu'une sous-liste.
function chatBulles(c, depuis = 0, { neuves = false } = {}) {
  if (!c.messages.length) return `<p class="system">${t('Commence par une question sur son profil. Ton pseudo et ton numéro Telegram restent masqués.')}</p>`;
  let out = '';
  for (let i = depuis; i < c.messages.length; i += 1) {
    const m = c.messages[i];
    const prev = i ? c.messages[i - 1] : null;
    if (!prev || !isSameDay(prev.at, m.at)) out += `<span class="day">${dayLabel(m.at, t, langue())}</span>`;
    // Messages groupés : même auteur, moins de trois minutes d'écart
    const cont = prev && prev.mine === m.mine && isSameDay(prev.at, m.at) && m.at - prev.at < 3 * 60000;
    const classes = ['bubble', m.mine ? 'mine' : 'theirs', cont ? 'cont' : 'gap'];
    if (m.enCours) classes.push('encours');
    if (neuves) classes.push('neuve');
    out += `<div class="${classes.join(' ')}"${m.tmp ? ` data-tmp="${esc(m.tmp)}"` : ''}>${esc(m.text)}<span class="time">${m.enCours ? icon('clock', 11) : timeLabel(m.at, langue())}</span></div>`;
  }
  return out;
}

// Structure fixe : en-tête en haut, messages défilants au milieu, champ de saisie en bas.
// On ne reconstruit jamais le champ de saisie, pour ne pas fermer le clavier.
function renderChat() {
  const c = S.chat;
  render(`
    <div class="chat">
      <div class="chat-head">
        <button type="button" class="head-profil" data-action="person" data-id="${esc(c.other.id)}" aria-label="${t('Voir le profil de {nom}', { nom: esc(c.other.name) })}">
          ${avatar(c.other, 'sm')}
          <div class="body">
            <div class="name">${esc(c.other.name)}, ${esc(c.other.age)}${c.other.verified ? `<span class="ok">${icon('shield', 15)}</span>` : ''}</div>
            <div class="sub">${ACTIVITY_LABELS()[c.other.activity] ? activityChip(c.other, 'act') : `${icon('lock', 12)} ${t('Pseudos et numéros masqués')}`}</div>
          </div>
        </button>
        <button type="button" class="icon-btn" data-action="report-chat" aria-label="${t('Se protéger')}">${icon('flag', 18)}</button>
      </div>
      <div class="messages" id="messages"></div>
      <div id="chat-frappe" class="chat-frappe" aria-live="polite"></div>
      <div id="chat-notice" class="chat-notice"></div>
      <form class="composer" data-action="send">
        <input name="message" autocomplete="off" maxlength="1000" placeholder="${t('Écris ton message')}" aria-label="${t('Message')}" enterkeyhint="send">
        <button type="submit" class="send" aria-label="${t('Envoyer')}" disabled>${icon('send', 20)}</button>
      </form>
    </div>
  `);
  loadAvatar(c.other);
  // #messages est reconstruit à chaque ouverture : l'écouteur suit le nouvel élément.
  document.getElementById('messages').addEventListener('scroll', () => {
    S.chatEnBas = enBas(document.getElementById('messages'));
  }, { passive: true });
  // Toucher « envoyer » donnait le focus au bouton, donc le retirait au champ : sur Android le
  // clavier se ferme, puis se rouvre quand le champ le reprend — l'écran se dandine à chaque
  // message. On empêche le déplacement du focus au moment du geste : le clavier ne bouge plus,
  // et le clic part quand même. Le clavier physique n'est pas concerné (Tab donne le focus
  // normalement, et Entrée envoie déjà).
  for (const geste of ['pointerdown', 'mousedown']) {
    document.querySelector('.composer .send').addEventListener(geste, (e) => e.preventDefault());
  }
  updateChat({ scroll: true });
}

// **Le fil s'allonge au lieu de se refaire.** Reconstruire tout `#messages` à chaque message
// interdisait l'animation d'entrée — le DOM était neuf à chaque fois, donc rien n'« arrivait » —
// et effaçait une sélection de texte en cours. On ajoute donc les bulles qui manquent, et on
// retombe sur la reconstruction complète dès que la tête a bougé (une carte de rendez-vous, le
// franchissement du seuil) ou que le fil n'est plus celui qu'on croyait : un chemin rapide qui
// se trompe coûte plus cher que la lenteur qu'il évite.
function updateChat({ scroll = false } = {}) {
  const box = document.getElementById('messages');
  if (!box || !S.chat) return;
  const nearBottom = enBas(box);
  const tete = chatTete(S.chat);
  const peutAjouter = tete === S.chat.tete && S.chat.rendus >= 0 && S.chat.rendus <= S.chat.messages.length
    && box.childElementCount > 0;
  if (peutAjouter) {
    if (S.chat.rendus < S.chat.messages.length) {
      // Le premier message remplace la phrase d'accueil, qui n'est pas une bulle.
      if (!S.chat.rendus) box.querySelector('.system')?.remove();
      box.insertAdjacentHTML('beforeend', chatBulles(S.chat, S.chat.rendus, { neuves: true }));
    }
  } else {
    box.innerHTML = tete + chatBulles(S.chat, 0);
  }
  S.chat.tete = tete;
  S.chat.rendus = S.chat.messages.length;
  majBarreDeDeblocage();
  document.getElementById('chat-notice').innerHTML = S.chat.notice ? `<div class="notice notice-warn" role="alert">${icon('alert', 18)}<span>${esc(S.chat.notice)}</span></div>` : '';
  if (scroll || nearBottom) collerEnBas({ force: true });
}

// La barre bouge à chaque message : la retoucher en place évite de refaire la tête, donc de
// refaire tout le fil, pour deux nombres.
function majBarreDeDeblocage() {
  const n = Math.min(echangeDe(S.chat), S.chat.unlockAfter);
  const compte = document.getElementById('unlock-n');
  const fill = document.getElementById('unlock-fill');
  if (!compte || !fill) return;
  // Seuil atteint : la barre disparaît, et la tête change — la prochaine mise à jour reconstruit.
  if (n >= S.chat.unlockAfter) { compte.closest('.unlock')?.remove(); S.chat.tete = null; return; }
  compte.textContent = `${n}/${S.chat.unlockAfter}`;
  fill.style.width = `${Math.round((100 * n) / S.chat.unlockAfter)}%`;
}

const enBas = (box) => box.scrollHeight - box.scrollTop - box.clientHeight < 120;

// Le clavier réduit la fenêtre : la zone des messages rétrécit, mais sa position de défilement ne
// bouge pas. Le message qu'on vient d'envoyer passe alors sous le champ de saisie, et il faut
// défiler pour le revoir — c'est le premier geste de toute discussion, et il était cassé.
//
// On ne recolle que quelqu'un qui était déjà en bas : remonter l'historique pendant que l'autre
// écrit ne doit pas se faire annuler. Et on le fait deux fois, maintenant et à l'image suivante :
// quand l'événement arrive, la fenêtre a changé de taille mais la mise en page pas toujours.
function collerEnBas({ force = false } = {}) {
  const box = document.getElementById('messages');
  if (!box || S.screen !== 'chat') return;
  if (!force && !S.chatEnBas) return;
  box.scrollTop = box.scrollHeight;
  S.chatEnBas = true;
  requestAnimationFrame(() => {
    const encore = document.getElementById('messages');
    if (encore && S.screen === 'chat' && S.chatEnBas) encore.scrollTop = encore.scrollHeight;
  });
}
// Le clavier anime sa hauteur : l'événement part plusieurs fois par ouverture, parfois sans que
// la hauteur bouge. On ne recolle que sur un vrai changement — faire défiler pour rien se voit.
let hauteurConnue = 0;
tg.onViewport(() => {
  const h = Math.round(window.visualViewport?.height || window.innerHeight);
  if (h === hauteurConnue) return;
  hauteurConnue = h;
  collerEnBas();
});

// **Une discussion vivante et une discussion oubliée n'ont pas besoin du même rythme.** Quatre
// secondes fixes, c'était deux secondes d'attente en moyenne sur chaque réponse — au moment
// précis où l'on se répond — et quinze requêtes par minute sur un écran que plus personne ne
// regarde. Les paliers partent du dernier mouvement du fil : [depuis, délai].
const RYTHMES = [[30_000, 1500], [180_000, 4000], [Infinity, 10_000]];

function delaiDuPoll() {
  // Tant que l'autre personne écrit, son message est imminent : on reste au rythme rapide.
  if (S.chat?.ecritDepuis && Date.now() - S.chat.ecritDepuis < 10_000) return RYTHMES[0][1];
  // Et tant que **moi** j'écris : c'est cette interrogation-là qui porte le mot à l'autre, donc
  // au rythme lent il apprendrait dix secondes trop tard que quelqu'un lui répond.
  if ((document.querySelector('.composer input[name="message"]')?.value || '').trim()) return RYTHMES[0][1];
  const depuis = Date.now() - (S.chat?.bouge || 0);
  return RYTHMES.find(([seuil]) => depuis < seuil)[1];
}

function arreterLePoll() { clearTimeout(S.chatTimer); S.chatTimer = null; }

function relancerLePoll({ tout_de_suite = false } = {}) {
  arreterLePoll();
  S.chatTimer = setTimeout(pollChat, tout_de_suite ? 250 : delaiDuPoll());
}

async function pollChat() {
  if (S.screen !== 'chat' || !S.chat) return arreterLePoll();
  // En arrière-plan on ne demande rien, mais on garde le rendez-vous : revenir doit rattraper.
  if (document.hidden) return relancerLePoll();
  // **Jamais l'horodatage d'un message provisoire** : il vient de l'horloge du téléphone, qui
  // peut être en avance sur celle du serveur — `after` sauterait alors de vrais messages.
  const last = S.chat.messages.filter((m) => !m.enCours).at(-1)?.at || 0;
  // Dire qu'on écrit ne coûte **aucune requête de plus** : le mot voyage dans l'interrogation qui
  // partait déjà. Rien n'est stocké — la frappe vit en mémoire sur le serveur et meurt avec lui.
  const jEcris = (document.querySelector('.composer input[name="message"]')?.value || '').trim() ? '&ecrit=1' : '';
  try {
    // suivi=1 : le serveur sait que le profil de l'autre personne est déjà chargé et ne le
    // renvoie plus. Il ne renvoie les rendez-vous que si l'un d'eux a bougé.
    const data = await api(`/matches/${encodeURIComponent(S.chat.id)}?after=${last}&suivi=1${jEcris}`);
    if (S.screen !== 'chat' || !S.chat) return arreterLePoll();
    const dates = data.dates ?? S.chat.dates;
    const datesChanged = data.dates && JSON.stringify(data.dates) !== JSON.stringify(S.chat.dates);
    if (data.messages.length || datesChanged) {
      S.chat.messages.push(...data.messages);
      S.chat.dates = dates;
      if (datesChanged) S.chat.tete = null;
      S.chat.bouge = Date.now();
      updateChat();
      if (data.messages.some((m) => !m.mine)) tg.haptic('light');
    }
    S.chat.ecritDepuis = data.ecrit ? Date.now() : 0;
    montrerLaFrappe();
  } catch (e) {
    // Match défait par l'autre, ou blocage : l'écran restait ouvert et interrogeait pour rien.
    if (e.code === 'MATCH_NOT_FOUND' || e.code === 'BLOCKED') {
      arreterLePoll();
      toast(e.message);
      return go('matches');
    }
    /* sinon, réseau instable : le prochain essai suit le rythme en cours */
  }
  relancerLePoll();
}

// « … est en train d'écrire », posé sous le fil et jamais dans le fil : une ligne qui apparaît et
// disparaît au milieu des bulles ferait sauter la lecture. Elle ne pousse la discussion vers le
// haut que si l'on était déjà en bas.
function montrerLaFrappe() {
  const zone = document.getElementById('chat-frappe');
  if (!zone) return;
  const actif = !!S.chat.ecritDepuis;
  if (actif === (zone.childElementCount > 0)) return;
  const enBasAvant = enBas(document.getElementById('messages'));
  zone.innerHTML = actif
    ? `<div class="frappe"><span class="pts"><i></i><i></i><i></i></span>${t('{nom} écrit…', { nom: esc(S.chat.other.name) })}</div>`
    : '';
  if (enBasAvant) collerEnBas({ force: true });
}

// **La bulle part avant le serveur.** Attendre l'aller-retour, c'est une à deux secondes de rien
// du tout sur un réseau ordinaire — appui, champ figé, puis la bulle —, et c'est là que la
// discussion paraissait lente : le geste le plus fréquent de l'app était le plus lent.
//
// Elle ne ment pas pour autant. Tant que le serveur n'a pas répondu, elle porte une horloge et
// reste pâle, parce que **le message peut être refusé** — par l'anti-arnaque (`MONEY_BLOCKED`,
// `CONTACT_TOO_EARLY`) ou par la limite de vingt par minute. Un refus la retire et **rend le
// texte au champ** : le laisser à l'écran ferait croire qu'il est parti, le perdre ferait retaper.
let provisoires = 0;

async function sendMessage(input) {
  const text = input.value.trim();
  if (!text) return;
  const button = input.nextElementSibling;
  const brouillon = { tmp: `t${++provisoires}`, text, mine: true, at: Date.now(), enCours: true };
  S.chat.messages.push(brouillon);
  S.chat.bouge = Date.now();
  S.chat.notice = null;
  input.value = '';
  button.disabled = true;
  tg.haptic('light');
  updateChat({ scroll: true });
  try {
    const { message } = await api(`/matches/${encodeURIComponent(S.chat.id)}/messages`, { method: 'POST', body: { text } });
    // L'heure du serveur remplace celle du téléphone, et la bulle se pose sans que rien ne bouge
    // autour : deux écritures dans le DOM valent mieux qu'un fil reconstruit.
    // La marque est relue **avant** d'être effacée, et depuis le brouillon : deux envois rapprochés
    // ont deux marques, et `provisoires` a déjà avancé.
    const marque = brouillon.tmp;
    Object.assign(brouillon, message, { enCours: false, tmp: null });
    const bulle = document.querySelector(`[data-tmp="${CSS.escape(marque)}"]`);
    if (bulle) {
      bulle.classList.remove('encours');
      bulle.removeAttribute('data-tmp');
      bulle.querySelector('.time').textContent = timeLabel(brouillon.at, langue());
    } else { S.chat.tete = null; updateChat(); }
    // On regarde tout de suite s'il y a une réponse : c'est juste après avoir écrit qu'elle vient.
    relancerLePoll({ tout_de_suite: true });
  } catch (e) {
    const i = S.chat.messages.indexOf(brouillon);
    if (i >= 0) S.chat.messages.splice(i, 1);
    S.chat.tete = null;
    tg.haptic(e.code === 'MONEY_BLOCKED' ? 'warning' : 'error');
    S.chat.notice = e.code === 'MONEY_BLOCKED' ? `${e.message} ${t('Reformule sans montant ni moyen de paiement.')}` : e.message;
    if (!input.value.trim()) input.value = text;
    updateChat({ scroll: true });
  } finally {
    button.disabled = !input.value.trim();
    input.focus();
  }
}

async function sendDate() {
  const d = S.dateDraft;
  if (!d.venueId || !d.slot) return showError(new Error(t('Choisis un lieu et un horaire.')));
  tg.setButtons({ main: { text: t('Envoi'), progress: true } });
  try {
    await api(`/matches/${encodeURIComponent(S.chat.id)}/dates`, { method: 'POST', body: d });
    S.dateDraft = { venueId: null, slot: null };
    tg.closingConfirmation(false);
    tg.haptic('success');
    await tg.alert(t('Proposition envoyée à {nom}. Le jour J, scanne le code posé sur ta table pour confirmer ton arrivée.', { nom: S.chat.other.name }));
    go('chat', { id: S.chat.id });
  } catch (e) {
    showError(e);
    tg.setButtons({ main: { text: t('Envoyer la proposition'), onClick: sendDate } });
  }
}

// Accepter, refuser ou annuler un rendez-vous. Une annulation se confirme : c'est le seul des
// trois gestes qui défait quelque chose que les deux personnes avaient accordé.
async function repondreRdv(id, status) {
  if (status === 'cancelled' && !(await tg.confirm(t('Annuler ce rendez-vous ? La personne en sera prévenue.')))) return;
  try {
    const r = await api(`/dates/${encodeURIComponent(id)}`, { method: 'PUT', body: { status } });
    tg.haptic(status === 'accepted' ? 'success' : 'light');
    S.chat.dates = S.chat.dates.map((d) => (d.id === id ? { ...d, ...r.date } : d));
    updateChat();
    toast(status === 'accepted' ? t('Rendez-vous accepté. On se voit là-bas.') : status === 'declined' ? t('Proposition refusée. La personne est prévenue.') : t('Rendez-vous annulé.'), status === 'accepted' ? 'ok' : '');
  } catch (e) {
    showError(e);
  }
}

async function checkin(dateId) {
  const code = await tg.scanQr(t('Scanne le code posé sur ta table'));
  if (!code) return;
  try {
    const r = await api(`/dates/${encodeURIComponent(dateId)}/checkin`, { method: 'POST', body: { code } });
    tg.haptic('success');
    await tg.alert(`Bien arrivé(e) à ${r.venue.name}. ${r.venue.perk}. ${S.chat.other.name} a été prévenu(e).`);
    go('chat', { id: S.chat.id });
  } catch (e) {
    tg.haptic('error');
    tg.alert(e.message);
  }
}

// Après n'importe lequel des trois gestes, on quitte l'endroit où la personne était visible.
function apresProtection(message) {
  const { id, matchId } = S.protection || {};
  tg.haptic('success');
  toast(message, 'ok');
  S.profiles = S.profiles.filter((p) => p.id !== id);
  S.people = []; S.likes = []; S.matches = [];
  S.chat = null;
  S.protection = null;
  go(matchId ? 'matches' : 'discover');
}

async function signaler(motif) {
  const { id, matchId } = S.protection || {};
  if (!id) return;
  try {
    await api('/reports', { method: 'POST', body: { targetId: id, reason: motif, matchId } });
    apresProtection(t('Signalement envoyé. Ce profil ne peut plus te contacter.'));
  } catch (e) { showError(e); }
}

async function bloquer() {
  const { id } = S.protection || {};
  if (!id) return;
  try {
    await api('/blocks', { method: 'POST', body: { targetId: id } });
    apresProtection(t('Bloqué. Cette personne ne peut plus te contacter.'));
  } catch (e) { showError(e); }
}

// Le saut vers le bot. Le rappel du geste part avant l'ouverture : une fois dans la discussion,
// c'est Telegram qui a la main et l'app n'affiche plus rien.
function ouvrirLeBotVoix() {
  tg.haptic('light');
  if (!S.me?.botUsername) return toast(t("Le bot n'est pas joignable pour l'instant."));
  toast(t('Appuie sur le micro, en bas de la discussion'));
  // Un lien t.me passe par openTelegramLink : openLink ouvrirait un navigateur sur la page web
  // de t.me, par-dessus la mini app — ce qui se voit comme un écran figé sur Android.
  tg.openTelegramLink(`https://t.me/${S.me.botUsername}?start=voix`);
}

async function retirerMatch() {
  const { matchId } = S.protection || {};
  if (!matchId) return;
  const reponse = await tg.popup({
    title: t('Retirer ce match'),
    message: t("La discussion disparaît des deux côtés, sans que la personne soit prévenue. C'est définitif."),
    buttons: [{ id: 'ok', type: 'destructive', text: t('Retirer') }, { id: 'cancel', type: 'cancel' }],
  });
  if (reponse !== 'ok') return;
  try {
    await api(`/matches/${encodeURIComponent(matchId)}`, { method: 'DELETE' });
    apresProtection(t('Match retiré.'));
  } catch (e) { showError(e); }
}

// ============================================================
// Délégation des événements
// ============================================================
document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-screen]');
  if (!b || b.getAttribute('aria-selected') === 'true') return;
  tg.haptic('select');
  go(b.dataset.screen);
});

// Met à jour l'état "sélectionné" d'un groupe de boutons sans reconstruire l'écran
const pressOnly = (el, selector) => el.parentElement.querySelectorAll(selector).forEach((b) => b.setAttribute('aria-pressed', String(b === el)));

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const { action } = el.dataset;
  switch (action) {
    case 'dev-back': window.__devBack?.(); break;
    case 'go': go(el.dataset.screen); break;
    case 'set':
      tg.haptic('select');
      S.form[el.dataset.field] = el.dataset.value;
      pressOnly(el, '[data-action="set"]');
      document.getElementById('form-error').textContent = '';
      break;
    // Retoucher la réponse déjà choisie l'efface : ne pas répondre est une réponse, et il faut
    // pouvoir y revenir sans recommencer son profil.
    case 'set-compat': {
      tg.haptic('select');
      const { champ, value } = el.dataset;
      if (S.form.compat[champ] === value) delete S.form.compat[champ];
      else S.form.compat[champ] = value;
      SCREENS.profile();
      break;
    }
    case 'voix': tg.haptic('light'); ecouterLaVoix(el.dataset.id); break;
    // Le pass s'ouvre de plusieurs endroits : on retient d'où, pour que le retour ramène là.
    case 'plus': S.plusRetour = S.screen; go('plus'); break;
    // L'enregistrement se fait dans Telegram, pas ici : le micro n'est pas accessible depuis une
    // mini app sur Android. On ouvre donc la discussion avec le bot, qui explique la marche à suivre.
    case 'genre':
      tg.haptic('light');
      // Redessiner l'écran repart de l'état, pas du DOM : sans cette ligne, changer de genre
      // effaçait une tranche d'âge tapée juste avant.
      garderLesFiltres();
      S.genreDraft = el.dataset.genre || '';
      SCREENS.filters();
      break;
    case 'voix-retirer': {
      if (!await tg.confirm(t('Retirer ta présentation vocale ? Les autres ne l\'entendront plus.'))) break;
      try {
        await api('/me/voix', { method: 'DELETE' });
        S.me.voix = null;
        toast(t('Présentation vocale retirée'), 'ok');
        SCREENS.voix();
      } catch (e) { showError(e); }
      break;
    }
    case 'ville': poserLaVille(el.dataset.champ, el.dataset.value); tg.haptic('select'); break;
    case 'report-profile': go('protection', { id: el.dataset.id }); break;
    case 'report-chat': go('protection', { id: S.chat.other.id, matchId: S.chat.id }); break;
    case 'signaler': signaler(el.dataset.motif); break;
    case 'bloquer': bloquer(); break;
    case 'retirer-match': retirerMatch(); break;
    case 'open-chat': go('chat', { id: el.dataset.id }); break;
    case 'person': S.personFrom = S.screen; go('person', { id: el.dataset.id }); break;
    case 'filters': go('filters'); break;
    case 'edit-step': S.form = null; S.formStep = Number(el.dataset.step); go('profile'); break;
    case 'photo-nav': photoNav(el, e); break;
    case 'set-langue': await changerLangue(el.dataset.langue); break;
    // Ouvrir l'écran des pays. On retient d'où l'on vient et ce qui est déjà choisi : l'écran
    // n'a pas à deviner, et le bouton retour de Telegram ramène au bon endroit.
    case 'choisir-pays': {
      const cible = el.dataset.cible;
      if (cible === 'zone') {
        garderLesFiltres();
        S.pays = { cible, courant: (S.zoneDraft || zoneDe()).country, retour: 'filters' };
      } else {
        S.pays = { cible, courant: S.form?.country || '', retour: 'profile' };
      }
      go('pays');
      break;
    }
    case 'pays-choisi': {
      const code = el.dataset.code;
      tg.haptic('select');
      if (S.pays?.cible === 'zone') {
        // Le fuseau donne le pays, jamais la ville : changer de pays rouvre sur tout le pays.
        // Garder l'ancienne ville serait pire — elle appartient au pays qu'on vient de quitter.
        if (code !== (S.zoneDraft || zoneDe()).country) S.zoneDraft = { country: code, city: null };
        go('filters');
      } else if (S.form) {
        if (code !== S.form.country) { S.form.country = code; S.form.city = ''; }
        go('profile');
      } else {
        go('me');
      }
      break;
    }
    case 'question':
      tg.haptic('select');
      S.form.promptQ = el.dataset.value;
      pressOnly(el, '[data-action="question"]');
      break;
    case 'question-extra':
      tg.haptic('select');
      S.form.extras[Number(el.dataset.i)].q = el.dataset.value;
      pressOnly(el, '[data-action="question-extra"]');
      break;
    // Ajouter ou retirer un bloc redessine l'écran : l'état est dans S.form, tenu à jour à
    // chaque frappe, donc rien de tapé ailleurs ne se perd — même raison que set-compat.
    case 'extra-add': {
      tg.haptic('select');
      const prises = new Set([S.form.promptQ, ...S.form.extras.map((x) => x.q)]);
      const libre = Object.keys(QUESTIONS).find((k) => !prises.has(k));
      if (libre) S.form.extras.push({ q: libre, a: '' });
      SCREENS.profile();
      break;
    }
    case 'extra-remove': tg.haptic('select'); S.form.extras.splice(Number(el.dataset.i), 1); SCREENS.profile(); break;
    case 'ordre':
      tg.haptic('light');
      garderLesFiltres();
      S.ordreDraft = el.dataset.ordre;
      SCREENS.filters();
      break;
    case 'zone-mode':
      garderLesFiltres();
      // « Tout le pays » demande un pass : on emmène à l'écran qui l'explique, sans toucher au
      // réglage. Le serveur l'ignorerait de toute façon, et un bouton qui s'enfonce sans rien
      // changer est pire qu'un bouton qui dit pourquoi.
      if (el.dataset.mode === 'pays' && !limite('paysEntier')) { S.plusRetour = 'filters'; go('plus'); break; }
      S.zoneDraft = { ...(S.zoneDraft || zoneDe()), city: el.dataset.mode === 'pays' ? null : (S.zoneDraft?.city || S.me.profile.city || '') };
      SCREENS.filters();
      break;
    // Le fuseau donne le pays, jamais la ville : on ouvre donc sur tout le pays, et la personne
    // resserre sur une ville si elle veut. Garder l'ancienne ville serait pire : elle
    // appartient au pays qu'on vient de quitter.
    case 'zone-ici':
      tg.haptic('select');
      garderLesFiltres();
      S.zoneDraft = { country: S.me.options.suggestedCountry, city: null };
      SCREENS.filters();
      break;
    case 'photo-remove': e.preventDefault(); S.form.photos[el.dataset.n] = null; SCREENS.profile(); break;
    case 'mode':
      tg.haptic('select');
      // Sans pass, la vue Liste mène à l'écran du pass plutôt qu'à un 403 muet — et le mode
      // retenu ne bascule pas, sinon on reviendrait sur Découvrir coincé dans une vue fermée.
      if (el.dataset.mode === 'list' && !limite('liste')) { S.plusRetour = 'discover'; go('plus'); break; }
      S.discoverMode = el.dataset.mode;
      tg.cloudSet('discover_mode', el.dataset.mode);
      SCREENS.discover();
      break;
    case 'venue':
    case 'slot':
      tg.haptic('select');
      if (action === 'venue') S.dateDraft.venueId = el.dataset.id; else S.dateDraft.slot = el.dataset.value;
      pressOnly(el, `[data-action="${action}"]`);
      document.getElementById('date-summary').innerHTML = dateSummary();
      document.getElementById('form-error').textContent = '';
      tg.closingConfirmation(true);
      break;
    case 'checkin': checkin(el.dataset.id); break;
    case 'rdv': await repondreRdv(el.dataset.id, el.dataset.status); break;
    case 'toggle-guide':
      S.guideOpen = !S.guideOpen;
      el.setAttribute('aria-expanded', String(S.guideOpen));
      el.nextElementSibling.classList.toggle('open', S.guideOpen);
      break;
    case 'confiance-retirer': {
      if (!await tg.confirm(t('Retirer {prenom} ? Elle ou il ne recevra plus rien, et sera prévenu.', { prenom: S.me.confiance?.prenom || '' }))) break;
      try {
        await api('/me/confiance', { method: 'DELETE' });
        S.me.confiance = null;
        toast(t('Retiré'));
        SCREENS.confiance();
      } catch (e) { showError(e); }
      break;
    }
    case 'invite': {
      // `startapp` et pas `start` : seul le premier remplit start_param dans la mini app, donc seul
      // le premier permet de savoir que l'arrivée vient d'un partage. Il demande que la mini app
      // soit déclarée dans BotFather (/newapp) ; sans ça le lien ouvre simplement le bot, ce qui
      // marche — on perd l'attribution, pas l'invitation.
      //
      // `ref_membre` dit « quelqu'un a partagé l'app ». Pas qui : voir SOURCES dans config.js.
      const url = S.me.botUsername ? `https://t.me/${S.me.botUsername}?startapp=ref_membre` : location.origin;
      tg.share(url, t("Je t'invite sur {app} : des rencontres avec des profils vérifiés, sans arnaques.", { app: APP }));
      break;
    }
    // La story ne montre que la marque : pas de photo, pas de prénom, rien du profil. Publier
    // qu'on cherche quelqu'un se choisit ; publier à quoi on ressemble en le faisant, non.
    case 'story': {
      const lien = S.me.botUsername ? `https://t.me/${S.me.botUsername}?startapp=ref_story` : location.origin;
      tg.shareToStory('/story.jpg', t("Des rencontres vérifiées sur {app}, sans arnaques.", { app: APP }), { url: lien, name: APP });
      break;
    }
    case 'home': tg.addToHome(); break;
    // Les pages publiques sortent de la mini app : elles se lisent sans compte, et on ne
    // reconstruit pas un navigateur à l'intérieur de l'app pour deux documents.
    case 'page': tg.openLink(el.dataset.page); break;
    case 'test-notif': {
      try {
        const r = await api('/me/test-notification', { method: 'POST' });
        tg.haptic(r.sent ? 'success' : 'warning');
        await tg.alert(r.message);
      } catch (err) { showError(err); }
      break;
    }
    case 'delete': {
      const ok = await tg.confirm(t('Supprimer définitivement ton compte, ton profil, tes matchs et tes messages ?'));
      if (!ok) return;
      try {
        // Le minuteur de /summary et le signal de fermeture partaient encore après la suppression,
        // et chacun recréait le compte. Plus rien ne part : ni maintenant, ni à la fermeture.
        clearInterval(S.summaryTimer);
        await api('/me', { method: 'DELETE' });
        S.supprime = true;
        S.me = null;
        await tg.alert(t('Ton compte et tes données ont été supprimés.'));
        tg.close();
        go('supprime');
      } catch (err) { showError(err); }
      break;
    }
  }
});

app.addEventListener('input', (e) => {
  const { name, value } = e.target;
  const extra = /^extra-a-(\d)$/.exec(name || '');
  if (S.screen === 'profile' && S.form && extra && S.form.extras[Number(extra[1])]) {
    S.form.extras[Number(extra[1])].a = value;
  } else if (S.screen === 'profile' && S.form && name in S.form && name !== 'photo') {
    S.form[name] = value;
    const err = document.getElementById('form-error');
    if (err) err.textContent = '';
  } else if (S.screen === 'pays' && name === 'recherche-pays') {
    // **Seule la liste est reconstruite.** Refaire le champ à chaque caractère fermerait le
    // clavier sur Android — exactement la cause de la règle 16 dans la discussion.
    const liste = document.getElementById('liste-pays');
    const tous = paysTries();
    const suggeres = [...new Set([S.pays?.courant, S.me.options.suggestedCountry, S.me.options.defaultCountry].filter(Boolean))]
      .map((code) => tous.find((c) => c.code === code)).filter(Boolean);
    if (liste) liste.innerHTML = listeDesPays(tous, suggeres, S.pays?.courant, value);
  } else if (S.screen === 'chat' && name === 'message') {
    // Le bouton Envoyer ne s'active qu'avec du texte ; le champ lui-même n'est jamais reconstruit
    const send = e.target.nextElementSibling;
    if (send) send.disabled = !value.trim();
  }
});

// `el`, et surtout pas `t` : la cible s'appelait `t` ici, ce qui masquait la fonction de
// traduction dans tout le corps du gestionnaire. Le toast de l'économie de data appelait donc
// l'élément du DOM comme une fonction et jetait « t is not a function » — le réglage s'appliquait
// bien, mais sans un mot à l'écran, et avec une promesse rejetée derrière.
app.addEventListener('change', async (e) => {
  const el = e.target;
  if (/^photo-[1-6]$/.test(el.name) && el.files?.[0]) {
    try { S.form.photos[el.name.slice(-1)] = await compressImage(el.files[0]); SCREENS.profile(); } catch (err) { showError(err); }
  } else if (el.name === 'selfie' && el.files?.[0]) {
    try { S.selfie = await compressImage(el.files[0], 900, 0.85); SCREENS.verify(); } catch (err) { showError(err); }
  } else if (el.name === 'zoneCity' && S.zoneDraft) {
    S.zoneDraft.city = el.value;
  } else if (el.name === 'dataSaver') {
    S.dataSaver = el.checked;
    await tg.cloudSet('data_saver', el.checked ? '1' : '0');
    toast(el.checked ? t('Économie de data activée') : t('Économie de data désactivée'), 'ok');
  } else if (el.name === 'discretion') {
    // Le réglage part au serveur tout de suite : c'est un retrait, il ne doit pas attendre un
    // autre geste. S'il échoue, l'interrupteur revient où il était — sinon il mentirait.
    const veut = el.checked;
    try {
      await api('/me/discretion', { method: 'PUT', body: { discret: veut } });
      S.me.discretion = veut;
      toast(veut ? t('Tu n\'apparais plus dans « qui s\'est arrêté sur ta fiche »') : t('Tu apparais de nouveau'), 'ok');
    } catch (err) {
      el.checked = !veut;
      showError(err);
    }
  }
});

app.addEventListener('submit', (e) => {
  if (e.target.dataset.action === 'send') {
    e.preventDefault();
    sendMessage(e.target.querySelector('input[name="message"]'));
  }
});

// Quand l'app passe en arrière-plan ou se ferme, on prévient le serveur pour que les notifications partent tout de suite
function leavePresence() {
  if (!S.me || S.supprime) return;
  fetch('/api/presence/leave', { method: 'POST', headers: authHeaders(), keepalive: true }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) leavePresence();
  else if (S.screen === 'chat') pollChat();
  else if (TAB_SCREENS.includes(S.screen)) refreshSummary();
});
window.addEventListener('pagehide', leavePresence);

// ============================================================
// Démarrage
// ============================================================
// Les polices sont demandées en media="print" pour ne pas bloquer le premier écran, puis
// basculées en « all » ici. C'était un onload en ligne : la politique de sécurité de contenu
// n'en veut aucun.
for (const lien of document.querySelectorAll('link[data-differe]')) lien.media = 'all';

async function boot() {
  tg.init();
  // La provenance se note **avant** le premier appel, et c'est tout l'intérêt de ces deux lignes :
  // les paramètres de lancement étaient lus plus bas, après api(ME()), donc la toute première
  // ouverture — celle qui porte justement le lien de diffusion — partait sans sa source.
  noterSource(tg.launchParams().ref);
  // Le flou d'arrière-plan est coupé si l'appareil le rend mal. Sans await : la décision retenue
  // s'applique tout de suite, la mesure se poursuit pendant que l'app se charge.
  reglerLeVerre();
  // La langue de Telegram permet déjà de traduire l'écran d'erreur si /api/me échoue
  await chargerLangue(langueVoulue());
  buildTabs();
  try {
    S.me = await api(ME());
    // Reçue : on l'oublie, sinon la même étape repartirait à chaque ouverture. La provenance part
    // avec elle : le serveur l'a rangée ou l'a refusée, dans les deux cas elle est dépensée.
    oublierEtape();
    oublierSource();
  } catch (e) {
    // 401 : la personne n'est pas passée par Telegram, il faut lui dire par où entrer.
    // Réseau ou serveur : c'est passager, il faut un bouton Réessayer, pas un écran figé.
    if (e.status === 401) {
      tg.setButtons(null);
      return render(`
        <div class="empty">
          <span class="glyph">${icon('lock', 34)}</span>
          <h2>${t('Ouvre {app} depuis Telegram', { app: esc(APP) })}</h2>
          <p class="small">${t('Cherche le bot {app} dans Telegram, envoie /start, puis appuie sur « Ouvrir {app} ».', { app: esc(APP) })}</p>
        </div>`);
    }
    return renderError(e, boot);
  }
  // Le compte porte peut-être un choix de langue explicite, qui l'emporte sur celle de Telegram
  if (langueVoulue() !== langue()) { await chargerLangue(langueVoulue()); buildTabs(); }
  S.dataSaver = (await tg.cloudGet('data_saver')) === '1';
  S.discoverMode = (await tg.cloudGet('discover_mode')) === 'list' ? 'list' : 'cards';
  tg.onSettings(() => go('me'));

  const params = tg.launchParams();
  if (!S.me.profile) return go('welcome');
  // Sous « gate », la vérification est le seul chemin : tant qu'elle n'a pas abouti, l'app n'a
  // qu'un écran à montrer. Sous « badge », elle est une étape parmi d'autres, et l'app s'ouvre
  // dès qu'il y a un profil — c'est là toute la différence entre les deux politiques.
  if (!membre()) return go(S.me.verification === 'pending' ? 'pending' : 'verify');
  // Les paramètres de lancement viennent de l'adresse ou de start_param, sans vérification :
  // un écran de vérification sur un compte vérifié bouclait sur une erreur, et un identifiant de
  // discussion libre composait un chemin d'API. On ne prend que ce qui a la bonne forme.
  if (params.screen === 'verify' && !verifie()) return go(S.me.verification === 'pending' ? 'pending' : 'verify');
  if (params.screen === 'chat' && /^[a-f0-9]{16}$/.test(params.match || '')) return go('chat', { id: params.match });
  if (params.screen === 'matches') return go('matches');
  if (params.screen === 'me') return go('me');
  go('discover');
}

boot();
