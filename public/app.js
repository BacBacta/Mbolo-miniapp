import * as tg from './tg.js';
import { icon, toast, skeleton, attachSwipe, throwCard, dayLabel, timeLabel, isSameDay } from './ui.js';

// ============================================================
// État et utilitaires
// ============================================================
const S = {
  me: null,
  profiles: [],
  remaining: 0,
  // Découvrir : « cards » (une carte à la fois) ou « list » (tous les profils compatibles)
  discoverMode: 'cards',
  people: [],
  person: null,
  avatarObserver: null,
  revealed: {},
  photoUrls: {},
  dataSaver: false,
  matches: [],
  chat: null,
  chatTimer: null,
  summaryTimer: null,
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
const APP = document.querySelector('meta[name="app-name"]')?.content || 'Mbolo';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INTENT_ICONS = { amitie: 'users', serieux: 'heart', duo: 'duo' };
const INTENT_SUBS = { amitie: 'Élargir ton cercle en ville', serieux: 'Construire quelque chose de durable', duo: 'Rencontrer à quatre, avec un ami' };

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

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeaders() };
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('Pas de connexion. Vérifie ton réseau et réessaie.'), { code: 'NETWORK' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Un problème est survenu.'), { code: data.code, status: res.status });
  return data;
}

async function photoUrl(userId) {
  if (S.photoUrls[userId]) return S.photoUrls[userId];
  const res = await fetch(`/api/photos/${encodeURIComponent(userId)}`, { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) return null;
  S.photoUrls[userId] = URL.createObjectURL(await res.blob());
  return S.photoUrls[userId];
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
    img.onerror = () => reject(new Error('Impossible de lire cette image.'));
    img.src = url;
  });
}

// ============================================================
// Navigation
// ============================================================
const PARENT = { profile: () => (S.me?.verification === 'approved' ? 'me' : 'welcome'), verify: () => 'profile', match: () => 'discover', person: () => 'discover', chat: () => 'matches', date: () => 'chat' };
const TAB_SCREENS = ['discover', 'matches', 'me', 'safety'];
const TABS = [['discover', 'Découvrir'], ['matches', 'Messages'], ['me', 'Profil'], ['safety', 'Sécurité']];

function go(screen, params = {}) {
  if (screen === 'settings') screen = 'me';
  clearInterval(S.chatTimer);
  clearInterval(S.pendingTimer);
  clearInterval(S.summaryTimer);
  S.detachSwipe?.();
  S.detachSwipe = null;
  S.avatarObserver?.disconnect();
  tg.closingConfirmation(false);
  S.screen = screen;
  // La discussion occupe toute la hauteur de l'écran, champ de saisie fixé en bas
  document.body.classList.toggle('chat-mode', screen === 'chat');
  const parent = PARENT[screen]?.();
  tg.setBack(parent ? () => go(parent, parent === 'chat' ? { id: S.chat?.id } : {}) : null);
  showTabs(screen);
  window.scrollTo(0, 0);
  SCREENS[screen](params);
  if (TAB_SCREENS.includes(screen) && S.me?.verification === 'approved') {
    refreshSummary();
    S.summaryTimer = setInterval(refreshSummary, 20000);
  }
}

function render(html) {
  const back = !tg.inTelegram && window.__devBack ? `<button class="devback" data-action="dev-back">‹ Retour</button>` : '';
  app.innerHTML = back + html;
}

// Écran d'erreur réseau, avec le bouton principal pour réessayer
function renderError(e, retry) {
  render(`
    <div class="empty">
      <span class="glyph glyph-warn">${icon(e.code === 'NETWORK' ? 'wifi-off' : 'alert', 34)}</span>
      <h2>${e.code === 'NETWORK' ? 'Pas de connexion' : 'Un problème est survenu'}</h2>
      <p>${e.code === 'NETWORK' ? 'Vérifie ton réseau et réessaie.' : esc(e.message)}</p>
    </div>`);
  tg.setButtons(retry ? { main: { text: 'Réessayer', onClick: retry } } : null);
}

// ---------- Barre d'onglets : construite une fois, hors de <main>, pour que l'indicateur glisse ----------
function buildTabs() {
  document.getElementById('tabs').innerHTML =
    `<span class="tabs-ind" aria-hidden="true"></span>` +
    TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="false" data-screen="${k}">${l}<span class="badge" hidden></span></button>`).join('');
}

function showTabs(screen) {
  const on = TAB_SCREENS.includes(screen) && S.me?.verification === 'approved';
  document.getElementById('topbar').hidden = !on;
  document.body.classList.toggle('has-tabs', on);
  if (!on) return;
  const idx = TAB_SCREENS.indexOf(screen);
  document.querySelectorAll('#tabs [role="tab"]').forEach((b, i) => b.setAttribute('aria-selected', String(i === idx)));
  document.querySelector('#tabs .tabs-ind').style.transform = `translateX(${idx * 100}%)`;
  updateTabBadges();
}

function updateTabBadges() {
  const n = S.summary.unread + S.summary.newMatches;
  const badge = document.querySelector('#tabs [data-screen="matches"] .badge');
  if (!badge) return;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.setAttribute('aria-label', `${n} nouveautés`);
  badge.hidden = !n;
}

async function refreshSummary() {
  try {
    const s = await api('/summary');
    const changed = s.unread !== S.summary.unread || s.newMatches !== S.summary.newMatches;
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
const avatar = (p, size = 'sm') => `<span class="avatar ${size}" data-avatar="${esc(p.id)}">${esc(p.name?.[0] || '?')}</span>`;

function loadAvatar(p, { own = false } = {}) {
  if (!p?.hasPhoto || (!own && S.dataSaver)) return;
  photoUrl(p.id).then((url) => {
    if (!url) return;
    document.querySelectorAll(`[data-avatar="${CSS.escape(p.id)}"]`).forEach((el) => {
      if (!el.querySelector('img')) el.append(Object.assign(document.createElement('img'), { src: url, alt: '' }));
    });
  });
}

// Tranche d'activité calculée par le serveur, jamais l'heure exacte. Formulation sans accord : le genre n'est pas exposé
const ACTIVITY_LABELS = { recent: 'En ligne récemment', today: "En ligne aujourd'hui", week: 'En ligne cette semaine' };
const activityChip = (p, cls = 'chip') => (ACTIVITY_LABELS[p.activity] ? `<span class="${cls} act-${p.activity}">${ACTIVITY_LABELS[p.activity]}</span>` : '');

// Carte de profil, partagée entre la découverte et l'aperçu de son propre profil.
// cls = 'top' (carte manipulable) ou 'next' (carte suivante, en retrait)
function profileCard(p, { own = false, cls = '' } = {}) {
  const hidePhoto = !own && S.dataSaver && !S.revealed[p.id];
  const t = p.trust || {};
  const score = [t.selfie, t.guarantor, t.seniority].filter(Boolean).length;
  const trustItem = (on, label) => `<span class="${on ? 'on' : ''}">${icon(on ? 'check' : 'clock', 12)}${label}</span>`;
  return `
    <article class="card ${cls}">
      <div class="card-photo" data-photo="${esc(p.id)}">
        <span class="initial">${esc(p.name?.[0] || '?')}</span>
        <span class="scrim"></span>
        ${p.hasPhoto && hidePhoto ? `<button type="button" class="btn btn-glass reveal" data-action="reveal" data-id="${esc(p.id)}">${icon('image', 18)} Afficher la photo</button>` : ''}
        <div class="corners">
          ${p.verified ? `<span class="pill-glass pill-verified">${icon('shield', 14)} Vérifié</span>` : ''}
          ${p.isNew && !own ? `<span class="pill-glass">${icon('sparkles', 13)} Nouveau</span>` : ''}
          ${p.likedYou ? `<span class="pill-glass pill-like">${icon('heart', 14, { fill: true })} T'a liké</span>` : ''}
          ${p.demo ? '<span class="pill-glass">démo</span>' : ''}
          ${own ? '' : activityChip(p, 'pill-glass')}
        </div>
        <div class="overlay">
          <div class="name">${esc(p.name)}<span class="age">${esc(p.age)}</span></div>
          <div class="meta">
            <span class="pill-glass">${icon('pin', 13)} ${esc(p.area ? `${p.area}, ${p.city}` : p.city)}</span>
            <span class="pill-glass">${icon(INTENT_ICONS[p.intent] || 'users', 13)} ${esc(p.intentLabel)}</span>
          </div>
        </div>
        ${cls === 'top' ? `<span class="stamp like" aria-hidden="true">J'aime</span><span class="stamp pass" aria-hidden="true">Passer</span>` : ''}
      </div>
      <div class="card-body">
        <div class="prompt"><span class="q">${esc(p.promptQ)}</span><span class="a">${esc(p.promptA)}</span></div>
        ${p.languages ? `<p class="lang">${icon('globe', 14)} Parle ${esc(p.languages)}</p>` : ''}
        <div class="trust" aria-label="Niveau de confiance ${score} sur 3">
          <div class="trust-head"><span class="eyebrow">Confiance</span><span class="score">${score}/3</span></div>
          <div class="trust-bars"><span class="${t.selfie ? 'on' : ''}"></span><span class="${t.guarantor ? 'on' : ''}"></span><span class="${t.seniority ? 'on' : ''}"></span></div>
          <div class="trust-labels">${trustItem(t.selfie, 'Selfie vérifié')}${trustItem(t.guarantor, 'Un garant')}${trustItem(t.seniority, 'Membre depuis 3 mois')}</div>
        </div>
        ${own ? '' : `<button type="button" class="btn btn-ghost btn-sm report" data-action="report-profile" data-id="${esc(p.id)}">${icon('flag', 14)} Signaler ce profil</button>`}
      </div>
    </article>`;
}

function loadCardPhoto(p, { own = false } = {}) {
  if (!p.hasPhoto || (!own && S.dataSaver && !S.revealed[p.id])) return;
  photoUrl(p.id).then((url) => {
    const box = document.querySelector(`[data-photo="${CSS.escape(p.id)}"]`);
    if (!url || !box || box.querySelector('img')) return;
    const img = Object.assign(document.createElement('img'), { src: url, alt: `Photo de ${p.name}` });
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

// Barre de Découvrir : ville, choix Cartes / Liste, et le quota du jour en mode cartes
function discoverBar() {
  const list = S.discoverMode === 'list';
  return `
    <div class="dbar">
      <span class="pill">${icon('pin', 15)} ${esc(S.me.profile.city)}</span>
      <div class="seg seg-mini" aria-label="Affichage">
        <button type="button" data-action="mode" data-mode="cards" aria-pressed="${!list}">${icon('card', 15)} Cartes</button>
        <button type="button" data-action="mode" data-mode="list" aria-pressed="${list}">${icon('rows', 15)} Liste</button>
      </div>
      ${list ? '' : `<span class="quota">${S.remaining} ${S.remaining > 1 ? 'restants' : 'restant'}</span>`}
    </div>`;
}

// Liste de tous les profils compatibles, balayés ou non. Initiales seules : les photos ne se
// chargent qu'en ouvrant un profil (économie de data).
const PERSON_STATUS = { liked: ['Aimé', 'chip-like'], passed: ['Passé', ''], match: ['Match', 'chip-ok'] };
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
        <h2>Personne pour l'instant</h2>
        <p>Aucun profil vérifié à ${esc(S.me.profile.city)} avec ton intention. Reviens un peu plus tard.</p>
      </div>`);
    return tg.setButtons(null);
  }
  render(`${discoverBar()}
    <div class="group">
      <div class="list">${S.people.map((p) => {
        const st = PERSON_STATUS[p.status];
        const act = ACTIVITY_LABELS[p.activity];
        return `
        <button type="button" class="list-row" data-action="${p.status === 'match' ? 'open-chat' : 'person'}" data-id="${esc(p.status === 'match' ? p.matchId : p.id)}">
          ${avatar(p, 'sm')}
          <div class="body">
            <div class="title">${esc(p.name)}, ${esc(p.age)}${p.verified ? `<span class="c-ok">${icon('shield', 14)}</span>` : ''}${p.likedYou && !p.status ? `<span class="chip chip-like">T'a liké</span>` : ''}${p.isNew && !p.status ? '<span class="chip chip-accent">Nouveau</span>' : ''}${st ? `<span class="chip ${st[1]}">${st[0]}</span>` : ''}</div>
            <div class="sub">${esc(p.area ? `${p.area} · ` : '')}${esc(p.intentLabel)}${act ? ` · <span class="act act-${p.activity}">${act}</span>` : ''}</div>
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

// « J'aime » ou « Passer » depuis le détail d'un profil ouvert par la liste
async function swipePerson(action) {
  const p = S.person;
  if (!p || swiping) return;
  swiping = true;
  tg.haptic(action === 'like' ? 'medium' : 'select');
  try {
    const r = await api('/swipes', { method: 'POST', body: { targetId: p.id, action } });
    S.people = []; // la liste se rechargera avec les nouveaux statuts
    S.profiles = S.profiles.filter((x) => x.id !== p.id); // et la carte quitte le paquet
    if (r.match) {
      S.lastMatch = r.match;
      go('match');
    } else {
      toast(action === 'like' ? 'Aimé. Tu seras prévenu en cas de match.' : 'Passé.');
      go('discover');
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
  welcome() {
    const name = tg.telegramUser()?.first_name || S.me?.firstName || '';
    const prop = (i, t, s, tile = '') => `<div class="prop"><span class="tile ${tile}">${icon(i, 20)}</span><div><div class="t">${t}</div><div class="s">${s}</div></div></div>`;
    render(`
      <section class="hero">
        <span class="orb orb-1"></span><span class="orb orb-2"></span>
        <p class="eyebrow">${name ? `Salut ${esc(name)}` : 'Bienvenue'}</p>
        <h1 class="display">Des rencontres vérifiées, face à face.</h1>
        <p class="lead">Des personnes réelles, des lieux publics, aucune demande d'argent. ${esc(APP)} est fait pour se rencontrer pour de vrai.</p>
      </section>
      <div class="props">
        ${prop('shield', 'Profils vérifiés par selfie', 'Chaque membre a prouvé qu\'il est une vraie personne', 'tile-ok')}
        ${prop('ban', 'Demandes d\'argent bloquées', 'Automatiquement, dans chaque discussion', 'tile-danger')}
        ${prop('coffee', 'Premier rendez-vous dans un lieu partenaire', 'Arrivée confirmée par QR code')}
        ${prop('wifi', 'Léger en data', 'Photos chargées seulement si tu le demandes', 'tile-neutral')}
      </div>
      <p class="fine">${icon('lock', 14)}<span>Connecté avec Telegram, sans mot de passe. Ton pseudo et ton numéro restent cachés aux autres.</span></p>
      <p class="fine">${icon('info', 14)}<span>Réservé aux 18 ans et plus. En continuant, tu acceptes les règles de la communauté : respect, aucune demande d'argent, aucun contenu sexuel.</span></p>
    `);
    tg.setButtons({ main: { text: 'Créer mon profil', onClick: () => go('profile') } });
  },

  // Formulaire en trois étapes : identité, recherche, touche personnelle
  profile() {
    const p = S.me.profile || {};
    const f = (S.form ||= {
      name: p.name || tg.telegramUser()?.first_name || '',
      age: p.age || '',
      gender: p.gender || null,
      intent: p.intent || null,
      city: p.city || 'Yaoundé',
      area: p.area || '',
      promptQ: p.promptQ || 'Mon plat du dimanche',
      promptA: p.promptA || '',
      languages: p.languages || '',
      photo: null,
    });
    const step = S.formStep;
    const o = S.me.options;
    const titles = [p.name ? 'Modifie ton profil' : 'Fais-toi connaître', 'Ce que tu cherches', 'Ta touche personnelle'];
    const head = `
      <div class="step-head">
        <div class="stepper" aria-hidden="true">${[0, 1, 2].map((i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
        <p class="eyebrow">Étape ${step + 1} sur 3</p>
        <h1>${titles[step]}</h1>
      </div>`;
    const select = (name, options, current) => `
      <span class="select-wrap"><select name="${name}">${options.map((c) => `<option ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${icon('chevron-down', 18)}</span>`;
    const bodies = [
      `
      <label class="field"><span class="label">Prénom</span><input name="name" maxlength="30" value="${esc(f.name)}" autocomplete="given-name" placeholder="Ton prénom"></label>
      <label class="field"><span class="label">Âge</span><input name="age" type="number" inputmode="numeric" min="18" max="99" value="${esc(f.age)}" placeholder="24"></label>
      <div class="field"><span class="label">Tu es</span>
        <div class="seg">${Object.entries(o.genders).map(([k, l]) => `<button type="button" aria-pressed="${f.gender === k}" data-action="set" data-field="gender" data-value="${k}">${l}</button>`).join('')}</div>
      </div>
      <p class="fine">${icon('lock', 14)}<span>Ton prénom et ton âge sont visibles. Ton pseudo et ton numéro Telegram ne le sont jamais.</span></p>`,
      `
      <div class="stack">${Object.entries(o.intents).map(([k, l]) => `
        <button type="button" class="choice" aria-pressed="${f.intent === k}" data-action="set" data-field="intent" data-value="${k}">
          <span class="tile">${icon(INTENT_ICONS[k], 22)}</span>
          <div class="body"><div class="title">${l}</div><div class="sub">${INTENT_SUBS[k]}</div></div>
          <span class="check">${icon('check', 14)}</span>
        </button>`).join('')}</div>
      <label class="field"><span class="label">Ville</span>${select('city', o.cities, f.city)}</label>
      <label class="field"><span class="label">Quartier <span class="opt">facultatif</span></span><input name="area" maxlength="40" value="${esc(f.area)}" placeholder="Bastos"></label>`,
      `
      <div class="avatar-picker">
        <label class="avatar-big" aria-label="Choisir une photo de profil">
          ${f.photo ? `<img src="${f.photo}" alt="Aperçu de ta photo">` : icon('user', 44)}
          <span class="cam">${icon('camera', 18)}</span>
          <input type="file" name="photo" accept="image/*" hidden>
        </label>
        <span class="small muted">${f.photo ? 'Appuie pour changer de photo' : 'Photo facultative, compressée sur ton téléphone'}</span>
      </div>
      <label class="field"><span class="label">Une question sur toi</span>${select('promptQ', ['Mon plat du dimanche', 'Mon coin préféré', 'Mon week-end idéal', 'Je supporte', 'Ma chanson du moment'], f.promptQ)}</label>
      <label class="field"><span class="label">Ta réponse</span><input name="promptA" maxlength="120" value="${esc(f.promptA)}" placeholder="Le ndolé plantain de ma tante"></label>
      <label class="field"><span class="label">Langues parlées <span class="opt">facultatif</span></span><input name="languages" maxlength="60" value="${esc(f.languages)}" placeholder="Français, anglais, ewondo"></label>
      <p class="fine">${icon('ban', 14)}<span>Ni numéro, ni pseudo, ni lien dans ton profil : ils seraient refusés.</span></p>`,
    ];
    render(`${head}${bodies[step]}<p id="form-error" class="error" role="alert"></p>`);
    // Retour : l'étape précédente, puis l'écran parent
    tg.setBack(step > 0 ? () => { S.formStep = step - 1; SCREENS.profile(); } : () => go(PARENT.profile()));
    tg.setButtons({ main: step < 2 ? { text: 'Continuer', onClick: nextStep } : { text: 'Enregistrer', onClick: saveProfile } });
  },

  async verify() {
    const head = `<div class="step-head"><p class="eyebrow">Vérification</p><h1>Vérifie que c'est bien toi</h1></div>`;
    if (!S.gesture) {
      render(`${head}${skeleton.block(220)}`);
      tg.setButtons(null);
      try {
        S.gesture = (await api('/me/verification/start', { method: 'POST' })).gesture;
      } catch (e) {
        return renderError(e, () => go('verify'));
      }
    }
    render(`
      ${head}
      <p class="lead">Un selfie avec le geste demandé. Seule l'équipe de vérification le voit, puis il est supprimé.</p>
      ${S.selfie ? `
        <div class="preview-wrap">
          <img class="preview" src="${S.selfie}" alt="Aperçu du selfie">
          <label class="btn btn-glass btn-sm retake">${icon('refresh', 16)} Reprendre<input type="file" name="selfie" accept="image/*" capture="user" hidden></label>
        </div>` : `
        <label class="gesture-card pressable">
          <span class="tile tile-lg">${icon('hand', 30)}</span>
          <span class="eyebrow">Geste demandé</span>
          <span class="gesture">${esc(S.gesture)}</span>
          <span class="btn btn-primary">${icon('camera', 18)} Ouvrir la caméra</span>
          <input type="file" name="selfie" accept="image/*" capture="user" hidden>
        </label>`}
      <div class="list">
        ${listRow({ iconName: 'lock', title: 'Jamais montré aux autres membres' })}
        ${listRow({ iconName: 'trash', title: 'Supprimé dès la décision', tile: 'tile-neutral' })}
        ${listRow({ iconName: 'clock', title: 'En général quelques minutes', tile: 'tile-neutral' })}
      </div>
      <p id="form-error" class="error" role="alert"></p>
    `);
    tg.setButtons(S.selfie ? { main: { text: 'Envoyer pour vérification', onClick: sendSelfie } } : null);
  },

  pending() {
    render(`
      <div class="empty top">
        <div class="pulse" aria-hidden="true"><span class="ring"></span><span class="ring"></span><span class="core">${icon('shield', 34)}</span></div>
        <h1>Vérification en cours</h1>
        <p>En général quelques minutes. Le bot t'écrit dans Telegram dès que c'est fait : tu peux fermer l'app.</p>
      </div>
      <div class="list"><div class="timeline">
        <div class="tl"><span class="dot done"></span><div><div class="t">Selfie envoyé</div><div class="s">Il sera supprimé dès la décision</div></div></div>
        <div class="tl"><span class="dot now"></span><div><div class="t">Vérification par l'équipe</div><div class="s">Une vraie personne regarde le geste et le visage</div></div></div>
        <div class="tl"><span class="dot"></span><div><div class="t">Profil visible</div><div class="s">Tu découvres les profils de ta ville</div></div></div>
      </div></div>
    `);
    tg.setButtons({ main: { text: 'Actualiser', onClick: refreshStatus }, secondary: { text: 'Fermer', onClick: tg.close } });
    S.pendingTimer = setInterval(refreshStatus, 5000);
  },

  async discover() {
    if (S.discoverMode === 'list') return renderPeople();
    const dbar = discoverBar;
    if (!S.profiles.length) {
      render(`${dbar()}${skeleton.card()}`);
      tg.setButtons(null);
      try {
        const r = await api('/discover');
        S.profiles = r.profiles;
        S.remaining = r.remaining;
      } catch (e) {
        return renderError(e, () => go('discover'));
      }
      if (S.screen !== 'discover') return;
    }
    const p = S.profiles[0];
    const next = S.profiles[1];
    if (!p) {
      render(`
        <div class="empty">
          <span class="glyph">${icon('sparkles', 34)}</span>
          <h2>Tu as vu tous les profils du moment</h2>
          <p>${S.remaining ? 'Reviens un peu plus tard : de nouveaux profils vérifiés arrivent chaque jour.' : 'Ta limite du jour est atteinte. Reviens demain.'}</p>
        </div>`);
      return tg.setButtons({ main: { text: 'Voir mes messages', onClick: () => go('matches') } });
    }
    render(`
      ${dbar()}
      <div class="deck">${next ? profileCard(next, { cls: 'next' }) : ''}${profileCard(p, { cls: 'top' })}</div>
      ${S.swiped ? '' : `<p class="fine">${icon('hand', 14)}<span>Glisse la carte vers la droite pour aimer, vers la gauche pour passer.</span></p>`}`);
    loadCardPhoto(p);
    S.detachSwipe = attachSwipe(app.querySelector('.deck .card.top'), { onLike: () => swipe('like'), onPass: () => swipe('pass') });
    tg.setButtons({ main: { text: "J'aime", onClick: () => swipe('like') }, secondary: { text: 'Passer', onClick: () => swipe('pass') } });
  },

  person({ id }) {
    const p = S.people.find((x) => x.id === id);
    if (!p) return go('discover');
    S.person = p;
    const note = p.status === 'liked' ? `${icon('heart', 14)}<span>Tu as déjà aimé ce profil. Le bot te prévient en cas de match.</span>`
      : p.status === 'passed' ? `${icon('clock', 14)}<span>Tu avais passé ce profil. Tu peux revenir sur ta décision.</span>` : '';
    render(`<div class="deck">${profileCard(p, { cls: 'top' })}</div>${note ? `<p class="fine">${note}</p>` : ''}`);
    loadCardPhoto(p);
    if (p.status === 'liked') tg.setButtons(null);
    else if (p.status === 'passed') tg.setButtons({ main: { text: "J'aime", onClick: () => swipePerson('like') } });
    else tg.setButtons({ main: { text: "J'aime", onClick: () => swipePerson('like') }, secondary: { text: 'Passer', onClick: () => swipePerson('pass') } });
  },

  match() {
    const m = S.lastMatch;
    const me = S.me.publicProfile;
    render(`
      <div class="match-hero">
        <span class="orb orb-1"></span>
        <p class="eyebrow">C'est un match</p>
        <div class="pair">${avatar(me, 'xl')}<span class="spark">${icon('heart', 20, { fill: true })}</span>${avatar(m.other, 'xl')}</div>
        <h1 class="display">${esc(m.other.name)} et toi, vous vous plaisez</h1>
        <p class="lead">Brise la glace avec une question sur son profil. Les liens et numéros se débloquent après quelques messages.</p>
      </div>`);
    loadAvatar(me, { own: true });
    loadAvatar(m.other);
    tg.haptic('success');
    tg.setButtons({ main: { text: `Écrire à ${m.other.name}`, onClick: () => go('chat', { id: m.id }) }, secondary: { text: 'Plus tard', onClick: () => go('discover') } });
  },

  async matches({ silent = false } = {}) {
    if (!silent) {
      render(`<div class="group"><span class="eyebrow">Discussions</span>${skeleton.rows(4)}</div>`);
      tg.setButtons(null);
    }
    try {
      S.matches = (await api('/matches')).matches;
    } catch (e) {
      return renderError(e, () => go('matches'));
    }
    if (S.screen !== 'matches') return;
    if (!S.matches.length) {
      render(`
        <div class="empty">
          <span class="glyph">${icon('message', 34)}</span>
          <h2>Tes matchs apparaîtront ici</h2>
          <p>Quand vous vous plaisez tous les deux, la discussion s'ouvre. Le bot te prévient, même app fermée.</p>
        </div>`);
      return tg.setButtons({ main: { text: 'Découvrir des profils', onClick: () => go('discover') } });
    }
    const fresh = S.matches.filter((m) => m.isNew);
    render(`
      ${fresh.length ? `
      <div class="group"><span class="eyebrow">Nouveaux matchs</span>
        <div class="new-strip">${fresh.map((m) => `<button type="button" class="new-item" data-action="open-chat" data-id="${m.id}">${avatar(m.other, 'md')}<span>${esc(m.other.name)}</span></button>`).join('')}</div>
      </div>` : ''}
      <div class="group"><span class="eyebrow">Discussions</span>
        <div class="list">${S.matches.map((m) => `
          <button type="button" class="list-row ${m.unread ? 'unread' : ''}" data-action="open-chat" data-id="${m.id}">
            ${avatar(m.other, 'sm')}
            <div class="body">
              <div class="title">${esc(m.other.name)}${m.other.verified ? `<span class="c-ok">${icon('shield', 14)}</span>` : ''}${m.isNew ? '<span class="chip chip-accent">Nouveau</span>' : ''}${activityChip(m.other)}</div>
              <div class="preview">${m.lastMessage ? `${m.lastMessage.from === S.me.id ? 'Toi : ' : ''}${esc(m.lastMessage.text)}` : 'Nouveau match, écris le premier message'}</div>
            </div>
            ${m.unread ? `<span class="count-badge">${m.unread}</span>` : `<span class="chev">${icon('chevron-right', 18)}</span>`}
          </button>`).join('')}
        </div>
      </div>`);
    S.matches.slice(0, 8).forEach((m) => loadAvatar(m.other));
    tg.setButtons(null);
  },

  async chat({ id }) {
    if (!id) return go('matches');
    render(`<div class="chat"><div class="chat-head"><span class="sk sk-avatar"></span><div class="body stack" style="gap:8px"><span class="sk sk-line w40"></span><span class="sk sk-line w60"></span></div></div>${skeleton.chat()}</div>`);
    tg.setButtons(null);
    try {
      const data = await api(`/matches/${id}`);
      S.chat = { id, other: data.other, messages: data.messages, dates: data.dates, unlockAfter: data.unlockAfter, notice: null };
    } catch (e) {
      return renderError(e, () => go('chat', { id }));
    }
    if (S.screen !== 'chat') return;
    renderChat();
    tg.setButtons({ main: { text: 'Proposer un rendez-vous', onClick: () => go('date') } });
    S.chatTimer = setInterval(pollChat, 4000);
  },

  async date() {
    if (!S.chat) return go('matches');
    if (!S.venues.length) {
      try { S.venues = (await api('/venues')).venues; } catch (e) { return renderError(e, () => go('date')); }
    }
    const d = S.dateDraft;
    const slots = ["Aujourd'hui, 17 h", 'Demain, 16 h', 'Samedi, 11 h', 'Dimanche, 15 h'];
    render(`
      <div class="step-head">
        <p class="eyebrow">Avec ${esc(S.chat.other.name)}</p>
        <h1>Proposer un rendez-vous sûr</h1>
        <p class="lead">Uniquement dans des lieux publics partenaires, où ton arrivée est confirmée par un code.</p>
      </div>
      <div class="group"><span class="eyebrow">Où</span>
        <div class="stack">${S.venues.length ? S.venues.map((v) => `
          <button type="button" class="choice" aria-pressed="${d.venueId === v.id}" data-action="venue" data-id="${v.id}">
            <span class="tile">${icon('coffee', 20)}</span>
            <div class="body"><div class="title">${esc(v.name)}</div><div class="sub">${esc(v.area)} · ${esc(v.perk)}</div></div>
            <span class="check">${icon('check', 14)}</span>
          </button>`).join('') : `<div class="notice notice-info">${icon('info', 18)}<span>Pas encore de lieu partenaire dans ta ville.</span></div>`}</div>
      </div>
      <div class="group"><span class="eyebrow">Quand</span>
        <div class="slots">${slots.map((s) => `<button type="button" class="slot" aria-pressed="${d.slot === s}" data-action="slot" data-value="${esc(s)}">${s}</button>`).join('')}</div>
      </div>
      <div id="date-summary">${dateSummary()}</div>
      <p id="form-error" class="error" role="alert"></p>
    `);
    tg.closingConfirmation(!!(d.venueId || d.slot));
    tg.setButtons({ main: { text: 'Envoyer la proposition', onClick: sendDate } });
  },

  safety() {
    render(`
      <div class="step-head"><h1>Ta sécurité</h1><p class="lead">Ce que ${esc(APP)} garantit, et quoi faire si quelque chose cloche.</p></div>
      <div class="list">
        <button type="button" class="list-row" data-action="toggle-guide" aria-expanded="${S.guideOpen}">
          <span class="tile tile-danger">${icon('alert', 20)}</span>
          <div class="body"><div class="title">Quelqu'un me fait du chantage</div><div class="sub">Que faire, étape par étape</div></div>
          <span class="chev acc-chev">${icon('chevron-down', 18)}</span>
        </button>
        <div class="acc ${S.guideOpen ? 'open' : ''}"><div><ol class="steps">
          <li>Ne paie rien, même sous la menace : payer n'arrête presque jamais le chantage.</li>
          <li>Garde les preuves : captures d'écran, prénom et date.</li>
          <li>Signale et bloque le profil depuis la discussion.</li>
          <li>Parle à une personne de confiance ou à une association d'aide aux victimes.</li>
        </ol></div></div>
      </div>
      <div class="group"><span class="eyebrow">Nos engagements</span>
        <div class="list">
          ${listRow({ iconName: 'ban', tile: 'tile-ok', title: `${esc(APP)} ne te demandera jamais d'argent`, sub: 'Ni pour vérifier ton compte, ni pour débloquer un profil.' })}
          ${listRow({ iconName: 'coffee', title: 'Premier rendez-vous dans un lieu public', sub: 'Préviens un proche et rentre par tes propres moyens.' })}
          ${listRow({ iconName: 'lock', title: 'Pseudo et numéro jamais montrés', sub: 'Les contacts se débloquent seulement après quelques messages.' })}
        </div>
      </div>
      <div class="list">
        ${listRow({ iconName: 'sliders', tile: 'tile-neutral', title: 'Paramètres et confidentialité', sub: 'Données, notifications, suppression du compte', action: 'go', extra: ' data-screen="me"' })}
      </div>`);
    tg.setButtons(null);
  },

  me() {
    const status = { none: ['Non vérifié', 'chip-warn'], pending: ['Vérification en cours', 'chip-warn'], approved: ['Vérifié', 'chip-ok'], rejected: ['Vérification refusée', 'chip-warn'] }[S.me.verification];
    const pp = S.me.publicProfile;
    render(`
      <div class="me-head">
        ${pp ? avatar(pp, 'lg') : `<span class="avatar lg">${icon('user', 30)}</span>`}
        <div class="body">
          <div class="n">${pp ? `${esc(pp.name)}, ${esc(pp.age)}` : 'Ton profil'}</div>
          <div class="c"><span class="chip ${status[1]}">${S.me.verification === 'approved' ? icon('shield', 13) : ''}${status[0]}</span>${pp ? `<span>${icon('pin', 13)} ${esc(pp.city)}</span>` : ''}</div>
        </div>
      </div>
      ${pp ? `
      <div class="group"><span class="eyebrow">Ce que les autres voient</span>
        ${profileCard(pp, { own: true })}
        <p class="fine">${icon('lock', 14)}<span>Ton pseudo et ton numéro Telegram ne sont jamais montrés.</span></p>
      </div>` : `<div class="notice notice-info">${icon('info', 18)}<span>Tu n'as pas encore de profil.</span></div>`}
      <div class="group"><span class="eyebrow">Paramètres</span>
        <div class="list">
          ${listRow({ iconName: 'bell', title: 'Tester les notifications', sub: "Le bot t'envoie un message dans Telegram", action: 'test-notif' })}
          <label class="list-row">
            <span class="tile">${icon('wifi', 20)}</span>
            <div class="body"><div class="title">Économie de data</div><div class="sub">Photos chargées seulement si tu les demandes</div></div>
            <input type="checkbox" class="switch" name="dataSaver" ${S.dataSaver ? 'checked' : ''}>
          </label>
          ${listRow({ iconName: 'heart', tile: 'tile-like', title: 'Inviter une amie ou un ami', sub: 'Plus il y a de profils vérifiés près de toi, mieux c\'est', action: 'invite', trailing: `<span class="chev">${icon('share', 18)}</span>` })}
          ${tg.canAddToHome() ? listRow({ iconName: 'home', title: "Ajouter à l'écran d'accueil", action: 'home' }) : ''}
        </div>
      </div>
      <div class="danger-zone"><button type="button" class="btn btn-danger btn-block" data-action="delete">${icon('trash', 18)} Supprimer mon compte et mes données</button></div>
    `);
    if (pp) { loadCardPhoto(pp, { own: true }); loadAvatar(pp, { own: true }); }
    tg.setButtons({ main: { text: pp ? 'Modifier mon profil' : 'Créer mon profil', onClick: () => { S.form = null; S.formStep = 0; go('profile'); } } });
  },
};

function dateSummary() {
  const d = S.dateDraft;
  const v = S.venues.find((x) => x.id === d.venueId);
  if (v && d.slot) return `<div class="notice notice-ok">${icon('calendar', 18)}<span><strong>${esc(v.name)}</strong>, ${esc(d.slot)}. Préviens une personne de confiance du lieu et de l'heure.</span></div>`;
  return `<p class="fine">${icon('info', 14)}<span>Conseil : préviens une personne de confiance du lieu et de l'heure.</span></p>`;
}

// ============================================================
// Actions
// ============================================================
// Vérifie les champs d'une étape du profil ; renvoie le message d'erreur ou null
function stepError(step) {
  const f = S.form;
  const age = Number(f.age);
  if (step === 0) {
    if (!f.name.trim()) return 'Indique ton prénom.';
    if (!Number.isInteger(age) || age < 18) return `${APP} est réservé aux 18 ans et plus.`;
    if (!f.gender) return 'Indique si tu es une femme ou un homme.';
  }
  if (step === 1 && !f.intent) return 'Choisis ce que tu cherches.';
  if (step === 2 && f.promptA.trim().length < 3) return 'Réponds à la question sur toi.';
  return null;
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
  tg.setButtons({ main: { text: 'Enregistrement', progress: true } });
  try {
    await api('/me/profile', { method: 'PUT', body: { ...f, age: Number(f.age) } });
    S.form = null;
    S.formStep = 0;
    S.me = await api('/me');
    S.photoUrls = {};
    tg.haptic('success');
    if (S.me.verification === 'approved') {
      toast('Profil mis à jour', 'ok');
      go('me');
    } else {
      go('verify');
    }
  } catch (e) {
    showError(e);
    tg.setButtons({ main: { text: 'Enregistrer', onClick: saveProfile } });
  }
}

async function sendSelfie() {
  tg.setButtons({ main: { text: 'Envoi du selfie', progress: true } });
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
    tg.setButtons({ main: { text: 'Envoyer pour vérification', onClick: sendSelfie } });
  }
}

async function refreshStatus() {
  try {
    const me = await api('/me');
    S.me = me;
    if (me.verification === 'approved') {
      tg.haptic('success');
      go('discover');
    } else if (me.verification === 'rejected') {
      toast('Vérification refusée : réessaie avec le visage bien visible.', 'warn');
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
    S.remaining = Math.max(0, S.remaining - 1);
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
function chatBody(c) {
  const dateCards = c.dates.map((d) => `
    <div class="datecard ${d.arrivedMe ? 'ok' : ''}">
      <div class="head">
        <span class="tile ${d.arrivedMe ? 'tile-ok' : ''}">${icon(d.arrivedMe ? 'check' : 'coffee', 20)}</span>
        <div class="body"><div class="v">${esc(d.venue?.name)}</div><div class="w">${esc(d.venue?.area)} · ${esc(d.slot)}</div></div>
        <span class="chip ${d.arrivedMe ? 'chip-ok' : 'chip-accent'}">${d.arrivedMe ? 'Arrivée confirmée' : 'Proposé'}</span>
      </div>
      ${d.arrivedMe ? '' : `<button type="button" class="btn btn-primary btn-sm" data-action="checkin" data-id="${d.id}">${icon('qr', 16)} Je suis arrivé(e) : scanner le code</button>`}
    </div>`).join('');

  let msgs = '';
  if (!c.messages.length) {
    msgs = `<p class="system">Commence par une question sur son profil.</p>`;
  } else {
    let prev = null;
    msgs = c.messages.map((m) => {
      let out = '';
      if (!prev || !isSameDay(prev.at, m.at)) out += `<span class="day">${dayLabel(m.at)}</span>`;
      // Messages groupés : même auteur, moins de trois minutes d'écart
      const cont = prev && prev.mine === m.mine && isSameDay(prev.at, m.at) && m.at - prev.at < 3 * 60000;
      out += `<div class="bubble ${m.mine ? 'mine' : 'theirs'} ${cont ? 'cont' : 'gap'}">${esc(m.text)}<span class="time">${timeLabel(m.at)}</span></div>`;
      prev = m;
      return out;
    }).join('');
  }
  const n = Math.min(c.messages.length, c.unlockAfter);
  const unlock = n >= c.unlockAfter ? '' : `
    <div class="unlock">
      <div class="head"><span>Liens et numéros débloqués à ${c.unlockAfter} messages</span><strong>${n}/${c.unlockAfter}</strong></div>
      <div class="track"><div class="fill" style="width:${Math.round((100 * n) / c.unlockAfter)}%"></div></div>
    </div>`;
  return `${dateCards}<div class="spacer"></div>${unlock}${msgs}`;
}

// Structure fixe : en-tête en haut, messages défilants au milieu, champ de saisie en bas.
// On ne reconstruit jamais le champ de saisie, pour ne pas fermer le clavier.
function renderChat() {
  const c = S.chat;
  render(`
    <div class="chat">
      <div class="chat-head">
        ${avatar(c.other, 'sm')}
        <div class="body">
          <div class="name">${esc(c.other.name)}, ${esc(c.other.age)}${c.other.verified ? `<span class="ok">${icon('shield', 15)}</span>` : ''}</div>
          <div class="sub">${ACTIVITY_LABELS[c.other.activity] ? `${activityChip(c.other, 'act')}<span aria-hidden="true">·</span>` : ''}${icon('lock', 12)} Pseudos et numéros masqués</div>
        </div>
        <button type="button" class="icon-btn" data-action="report-chat" aria-label="Signaler">${icon('flag', 18)}</button>
      </div>
      <div class="messages" id="messages">${chatBody(c)}</div>
      <div id="chat-notice" class="chat-notice"></div>
      <form class="composer" data-action="send">
        <input name="message" autocomplete="off" maxlength="1000" placeholder="Écris ton message" aria-label="Message" enterkeyhint="send">
        <button type="submit" class="send" aria-label="Envoyer" disabled>${icon('send', 20)}</button>
      </form>
    </div>
  `);
  loadAvatar(c.other);
  updateChat({ scroll: true });
}

function updateChat({ scroll = false } = {}) {
  const box = document.getElementById('messages');
  if (!box || !S.chat) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.innerHTML = chatBody(S.chat);
  document.getElementById('chat-notice').innerHTML = S.chat.notice ? `<div class="notice notice-warn" role="alert">${icon('alert', 18)}<span>${esc(S.chat.notice)}</span></div>` : '';
  if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
}

async function pollChat() {
  if (S.screen !== 'chat' || !S.chat || document.hidden) return;
  const last = S.chat.messages.at(-1)?.at || 0;
  try {
    const data = await api(`/matches/${S.chat.id}?after=${last}`);
    const datesChanged = JSON.stringify(data.dates) !== JSON.stringify(S.chat.dates);
    if (data.messages.length || datesChanged) {
      S.chat.messages.push(...data.messages);
      S.chat.dates = data.dates;
      updateChat();
      if (data.messages.some((m) => !m.mine)) tg.haptic('light');
    }
  } catch { /* réseau instable : prochain essai dans 4 secondes */ }
}

async function sendMessage(input) {
  const text = input.value.trim();
  if (!text) return;
  const button = input.nextElementSibling;
  button.disabled = true;
  try {
    const { message } = await api(`/matches/${S.chat.id}/messages`, { method: 'POST', body: { text } });
    S.chat.messages.push(message);
    S.chat.notice = null;
    input.value = '';
    updateChat({ scroll: true });
  } catch (e) {
    tg.haptic(e.code === 'MONEY_BLOCKED' ? 'warning' : 'error');
    S.chat.notice = e.code === 'MONEY_BLOCKED' ? `${e.message} Reformule sans montant ni moyen de paiement.` : e.message;
    updateChat({ scroll: true });
  } finally {
    button.disabled = !input.value.trim();
    input.focus();
  }
}

async function sendDate() {
  const d = S.dateDraft;
  if (!d.venueId || !d.slot) return showError(new Error('Choisis un lieu et un horaire.'));
  tg.setButtons({ main: { text: 'Envoi', progress: true } });
  try {
    await api(`/matches/${S.chat.id}/dates`, { method: 'POST', body: d });
    S.dateDraft = { venueId: null, slot: null };
    tg.closingConfirmation(false);
    tg.haptic('success');
    await tg.alert(`Proposition envoyée à ${S.chat.other.name}. Le jour J, scanne le code posé sur ta table pour confirmer ton arrivée.`);
    go('chat', { id: S.chat.id });
  } catch (e) {
    showError(e);
    tg.setButtons({ main: { text: 'Envoyer la proposition', onClick: sendDate } });
  }
}

async function checkin(dateId) {
  const code = await tg.scanQr('Scanne le code posé sur ta table');
  if (!code) return;
  try {
    const r = await api(`/dates/${dateId}/checkin`, { method: 'POST', body: { code } });
    tg.haptic('success');
    await tg.alert(`Bien arrivé(e) à ${r.venue.name}. ${r.venue.perk}. ${S.chat.other.name} a été prévenu(e).`);
    go('chat', { id: S.chat.id });
  } catch (e) {
    tg.haptic('error');
    tg.alert(e.message);
  }
}

async function report(targetId, matchId) {
  const id = await tg.popup({
    title: 'Signaler et bloquer',
    message: "La personne ne saura pas que tu l'as signalée. Un modérateur vérifie sous 24 h.",
    buttons: [
      { id: 'money', type: 'destructive', text: "Demande d'argent" },
      { id: 'behavior', type: 'destructive', text: 'Comportement déplacé' },
      { id: 'cancel', type: 'cancel' },
    ],
  });
  if (!id || id === 'cancel') return;
  try {
    await api('/reports', { method: 'POST', body: { targetId, reason: id, matchId } });
    tg.haptic('success');
    toast('Signalement envoyé. Ce profil ne peut plus te contacter.', 'ok');
    S.profiles = S.profiles.filter((p) => p.id !== targetId);
    go(matchId ? 'matches' : 'discover');
  } catch (e) {
    showError(e);
  }
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
    case 'reveal': S.revealed[el.dataset.id] = true; SCREENS.discover(); break;
    case 'report-profile': report(el.dataset.id); break;
    case 'report-chat': report(S.chat.other.id, S.chat.id); break;
    case 'open-chat': go('chat', { id: el.dataset.id }); break;
    case 'person': go('person', { id: el.dataset.id }); break;
    case 'mode':
      tg.haptic('select');
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
    case 'toggle-guide':
      S.guideOpen = !S.guideOpen;
      el.setAttribute('aria-expanded', String(S.guideOpen));
      el.nextElementSibling.classList.toggle('open', S.guideOpen);
      break;
    case 'invite': {
      const url = S.me.botUsername ? `https://t.me/${S.me.botUsername}` : location.origin;
      tg.share(url, `Je t'invite sur ${APP} : des rencontres avec des profils vérifiés, sans arnaques.`);
      break;
    }
    case 'home': tg.addToHome(); break;
    case 'test-notif': {
      try {
        const r = await api('/me/test-notification', { method: 'POST' });
        tg.haptic(r.sent ? 'success' : 'warning');
        await tg.alert(r.message);
      } catch (err) { showError(err); }
      break;
    }
    case 'delete': {
      const ok = await tg.confirm('Supprimer définitivement ton compte, ton profil, tes matchs et tes messages ?');
      if (!ok) return;
      try {
        await api('/me', { method: 'DELETE' });
        await tg.alert('Ton compte et tes données ont été supprimés.');
        tg.close();
        S.me = await api('/me');
        go('welcome');
      } catch (err) { showError(err); }
      break;
    }
  }
});

app.addEventListener('input', (e) => {
  const { name, value } = e.target;
  if (S.screen === 'profile' && S.form && name in S.form && name !== 'photo') {
    S.form[name] = value;
    const err = document.getElementById('form-error');
    if (err) err.textContent = '';
  } else if (S.screen === 'chat' && name === 'message') {
    // Le bouton Envoyer ne s'active qu'avec du texte ; le champ lui-même n'est jamais reconstruit
    const send = e.target.nextElementSibling;
    if (send) send.disabled = !value.trim();
  }
});

app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'photo' && t.files?.[0]) {
    try { S.form.photo = await compressImage(t.files[0]); SCREENS.profile(); } catch (err) { showError(err); }
  } else if (t.name === 'selfie' && t.files?.[0]) {
    try { S.selfie = await compressImage(t.files[0], 900, 0.85); SCREENS.verify(); } catch (err) { showError(err); }
  } else if (t.name === 'city' && S.form) {
    S.form.city = t.value;
  } else if (t.name === 'promptQ' && S.form) {
    S.form.promptQ = t.value;
  } else if (t.name === 'dataSaver') {
    S.dataSaver = t.checked;
    await tg.cloudSet('data_saver', t.checked ? '1' : '0');
    toast(t.checked ? 'Économie de data activée' : 'Économie de data désactivée', 'ok');
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
  if (!S.me) return;
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
async function boot() {
  tg.init();
  buildTabs();
  try {
    S.me = await api('/me');
  } catch (e) {
    tg.setButtons(null);
    return render(`
      <div class="empty">
        <span class="glyph">${icon('lock', 34)}</span>
        <h2>Ouvre ${esc(APP)} depuis Telegram</h2>
        <p>${esc(e.message)}</p>
        <p class="small">Cherche le bot ${esc(APP)} dans Telegram, envoie /start, puis appuie sur « Ouvrir ${esc(APP)} ».</p>
      </div>`);
  }
  S.dataSaver = (await tg.cloudGet('data_saver')) === '1';
  S.discoverMode = (await tg.cloudGet('discover_mode')) === 'list' ? 'list' : 'cards';
  tg.onSettings(() => go('me'));

  const params = tg.launchParams();
  const approved = S.me.verification === 'approved';
  if (!S.me.profile) return go('welcome');
  if (params.screen === 'verify' || S.me.verification === 'none' || S.me.verification === 'rejected') return go('verify');
  if (S.me.verification === 'pending') return go('pending');
  if (approved && params.screen === 'chat' && params.match) return go('chat', { id: params.match });
  if (approved && params.screen === 'matches') return go('matches');
  if (approved && params.screen === 'me') return go('me');
  go('discover');
}

boot();
