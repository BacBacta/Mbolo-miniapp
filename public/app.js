import * as tg from './tg.js';

// ============================================================
// État et utilitaires
// ============================================================
const S = {
  me: null,
  profiles: [],
  remaining: 0,
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
  dateDraft: { venueId: null, slot: null },
  venues: [],
  guideOpen: false,
  screen: null,
};

const app = document.getElementById('app');
// Nom de l'app injecté par le serveur (variable APP_NAME)
const APP = document.querySelector('meta[name="app-name"]')?.content || 'Mbolo';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15c2.5 0 5 1.5 5 4"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  duo: '<circle cx="7" cy="8" r="2.5"/><circle cx="17" cy="8" r="2.5"/><path d="M2 19c0-2.5 2.2-4 5-4s5 1.5 5 4"/><path d="M12 19c0-2.5 2.2-4 5-4s5 1.5 5 4"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 1112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l2-3h4l2 3"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5V9z"/><path d="M17 11h2a2 2 0 010 4h-2"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0"/><path d="M5 12.5a10 10 0 0114 0"/><path d="M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6"/>',
};
const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}

// ============================================================
// Appels à l'API
// ============================================================
function devUser() {
  const q = new URLSearchParams(location.search).get('dev_user');
  if (q) sessionStorage.setItem('dev_user', q);
  return sessionStorage.getItem('dev_user');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tg.inTelegram) headers.Authorization = `tma ${tg.initData()}`;
  else if (devUser()) headers['x-dev-user'] = devUser();
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
  const headers = tg.inTelegram ? { Authorization: `tma ${tg.initData()}` } : { 'x-dev-user': devUser() || '' };
  const res = await fetch(`/api/photos/${encodeURIComponent(userId)}`, { headers }).catch(() => null);
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
    img.onerror = () => reject(new Error("Impossible de lire cette image."));
    img.src = url;
  });
}

// ============================================================
// Navigation
// ============================================================
const PARENT = { profile: () => (S.me?.verification === 'approved' ? 'me' : 'welcome'), verify: () => 'profile', match: () => 'discover', chat: () => 'matches', date: () => 'chat' };
const TAB_SCREENS = ['discover', 'matches', 'me', 'safety'];

function go(screen, params = {}) {
  if (screen === 'settings') screen = 'me';
  clearInterval(S.chatTimer);
  clearInterval(S.pendingTimer);
  clearInterval(S.summaryTimer);
  tg.closingConfirmation(false);
  S.screen = screen;
  // La discussion occupe toute la hauteur de l'écran, champ de saisie fixé en bas
  document.body.classList.toggle('chat-mode', screen === 'chat');
  const parent = PARENT[screen]?.();
  tg.setBack(parent ? () => go(parent, parent === 'chat' ? { id: S.chat?.id } : {}) : null);
  window.scrollTo(0, 0);
  SCREENS[screen](params);
  if (TAB_SCREENS.includes(screen) && S.me?.verification === 'approved') {
    refreshSummary();
    S.summaryTimer = setInterval(refreshSummary, 20000);
  }
}

function render(html) {
  const back = !tg.inTelegram && window.__devBack ? `<button class="btn-link" data-action="dev-back">‹ Retour</button>` : '';
  app.innerHTML = back + html;
}

const tabBadge = (k) => {
  const n = k === 'matches' ? S.summary.unread + S.summary.newMatches : 0;
  return n ? `<span class="tab-badge" aria-label="${n} nouveautés">${n > 9 ? '9+' : n}</span>` : '';
};

const tabs = (active) => `
  <div class="segmented tabs" role="tablist" id="tabs">
    ${[['discover', 'Découvrir'], ['matches', 'Messages'], ['me', 'Profil'], ['safety', 'Sécurité']]
      .map(([k, l]) => `<button role="tab" aria-pressed="${active === k}" data-action="tab" data-screen="${k}">${l}${tabBadge(k)}</button>`)
      .join('')}
  </div>`;

async function refreshSummary() {
  try {
    const s = await api('/summary');
    const changed = s.unread !== S.summary.unread || s.newMatches !== S.summary.newMatches;
    S.summary = s;
    const el = document.getElementById('tabs');
    if (changed && el && TAB_SCREENS.includes(S.screen)) {
      el.outerHTML = tabs(S.screen);
      if (S.screen === 'matches') SCREENS.matches({ silent: true });
    }
  } catch { /* hors ligne : on réessaiera */ }
}

// Carte de profil, partagée entre la découverte et l'aperçu de son propre profil
function profileCard(p, { own = false } = {}) {
  const hidePhoto = !own && S.dataSaver && !S.revealed[p.id];
  const t = p.trust || {};
  return `
    <article class="card">
      <div class="photo" data-photo="${esc(p.id)}">
        ${p.hasPhoto && hidePhoto ? `<button class="btn" data-action="reveal" data-id="${esc(p.id)}">Afficher la photo</button>` : `<span class="initial">${esc(p.name?.[0] || '?')}</span>`}
        ${p.verified ? `<span class="badge chip chip-ok">${icon('shield', 14)} Vérifié</span>` : ''}
      </div>
      <div class="card-body">
        <div class="row"><strong style="font-size:20px">${esc(p.name)}, ${p.age}</strong><span class="spacer"></span>${p.likedYou ? '<span class="chip chip-accent">T\'a liké</span>' : ''}${p.demo ? '<span class="chip">démo</span>' : ''}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <span class="chip">${icon('pin', 14)} ${esc(p.area ? `${p.area}, ${p.city}` : p.city)}</span>
          <span class="chip chip-accent">${esc(p.intentLabel)}</span>
        </div>
        <div class="prompt"><div class="q">${esc(p.promptQ)}</div><div>${esc(p.promptA)}</div></div>
        ${p.languages ? `<p class="small muted">Parle : ${esc(p.languages)}</p>` : ''}
        <div class="trust" aria-label="Niveau de confiance">
          <div class="trust-bars"><span class="${t.selfie ? 'on' : ''}"></span><span class="${t.guarantor ? 'on' : ''}"></span><span class="${t.seniority ? 'on' : ''}"></span></div>
          <div class="trust-labels"><span class="${t.selfie ? 'on' : ''}">Selfie vérifié</span><span class="${t.guarantor ? 'on' : ''}">Un garant</span><span class="${t.seniority ? 'on' : ''}">Membre depuis 3 mois</span></div>
        </div>
        ${own ? '' : `<button class="btn-link small" data-action="report-profile" data-id="${esc(p.id)}" style="color:var(--hint)">${icon('flag', 14)} Signaler ce profil</button>`}
      </div>
    </article>`;
}

function loadCardPhoto(p, { own = false } = {}) {
  if (!p.hasPhoto || (!own && S.dataSaver && !S.revealed[p.id])) return;
  photoUrl(p.id).then((url) => {
    const box = document.querySelector(`[data-photo="${CSS.escape(p.id)}"]`);
    if (url && box) box.querySelector('.initial')?.replaceWith(Object.assign(document.createElement('img'), { src: url, alt: `Photo de ${p.name}` }));
  });
}

function showError(e, el = document.getElementById('form-error')) {
  tg.haptic('error');
  if (el) el.textContent = e.message;
  else toast(e.message);
}

// ============================================================
// Écrans
// ============================================================
const SCREENS = {
  welcome() {
    const name = tg.telegramUser()?.first_name || S.me?.firstName || '';
    render(`
      <h1>Salut ${esc(name)}, prête ou prêt pour de vraies rencontres ?</h1>
      <div class="row notice notice-info">
        <span>${icon('lock')}</span>
        <span>Connecté avec Telegram, sans mot de passe. Ton pseudo et ton numéro restent cachés aux autres.</span>
      </div>
      <div class="stack">
        <div class="row">${icon('shield')}<span>Tous les profils vérifiés par selfie</span></div>
        <div class="row">${icon('ban')}<span>Demandes d'argent bloquées automatiquement</span></div>
        <div class="row">${icon('wifi')}<span>Mode économie de data</span></div>
      </div>
      <p class="small muted">Réservé aux 18 ans et plus. En continuant, tu acceptes les règles de la communauté : respect, aucune demande d'argent, aucun contenu sexuel.</p>
    `);
    tg.setButtons({ main: { text: 'Créer mon profil', onClick: () => go('profile') } });
  },

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
    const o = S.me.options;
    const intentIcons = { amitie: 'users', serieux: 'heart', duo: 'duo' };
    const intentSubs = { amitie: 'Élargir ton cercle en ville', serieux: 'Construire quelque chose de durable', duo: 'Rencontrer à quatre, avec un ami' };
    render(`
      <h2>Ton profil</h2>
      <label class="field">Prénom<input name="name" maxlength="30" value="${esc(f.name)}" autocomplete="given-name"></label>
      <label class="field">Âge<input name="age" type="number" inputmode="numeric" min="18" max="99" value="${esc(f.age)}" placeholder="24"></label>
      <div class="field"><span class="small muted">Tu es</span>
        <div class="segmented">${Object.entries(o.genders).map(([k, l]) => `<button type="button" aria-pressed="${f.gender === k}" data-action="set" data-field="gender" data-value="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="field"><span class="small muted">Tu cherches</span>
        <div class="stack">${Object.entries(o.intents).map(([k, l]) => `
          <button type="button" class="option" aria-pressed="${f.intent === k}" data-action="set" data-field="intent" data-value="${k}">
            <span class="icon">${icon(intentIcons[k], 22)}</span><span><span class="title">${l}</span><br><span class="sub">${intentSubs[k]}</span></span>
          </button>`).join('')}</div>
      </div>
      <label class="field">Ville<select name="city">${o.cities.map((c) => `<option ${c === f.city ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Quartier (facultatif)<input name="area" maxlength="40" value="${esc(f.area)}" placeholder="Bastos"></label>
      <label class="field">Une question sur toi
        <select name="promptQ">${['Mon plat du dimanche', 'Mon coin préféré', 'Mon week-end idéal', 'Je supporte', 'Ma chanson du moment'].map((q) => `<option ${q === f.promptQ ? 'selected' : ''}>${q}</option>`).join('')}</select>
      </label>
      <label class="field">Ta réponse<input name="promptA" maxlength="120" value="${esc(f.promptA)}" placeholder="Le ndolé plantain de ma tante"></label>
      <label class="field">Langues parlées (facultatif)<input name="languages" maxlength="60" value="${esc(f.languages)}" placeholder="Français, anglais, ewondo"></label>
      <label class="field">Photo de profil (facultative)
        <input name="photo" type="file" accept="image/*">
      </label>
      ${f.photo ? `<img class="preview" src="${f.photo}" alt="Aperçu de ta photo">` : ''}
      <p class="small muted">Ne mets ni numéro, ni pseudo, ni lien dans ton profil : ils seraient refusés.</p>
      <p id="form-error" class="error" role="alert"></p>
    `);
    tg.setButtons({ main: { text: 'Enregistrer', onClick: saveProfile } });
  },

  async verify() {
    render(`<h2>Vérifie que c'est bien toi</h2><p class="muted">Chargement du geste…</p>`);
    tg.setButtons(null);
    try {
      if (!S.gesture) S.gesture = (await api('/me/verification/start', { method: 'POST' })).gesture;
    } catch (e) {
      return render(`<h2>Vérification indisponible</h2><p class="error">${esc(e.message)}</p>`);
    }
    render(`
      <h2>Vérifie que c'est bien toi</h2>
      <p class="muted">Prends un selfie en faisant le geste demandé. Seule l'équipe de vérification le voit, et il est supprimé juste après.</p>
      <label class="camera-box">
        ${icon('camera', 28)}
        <span class="small muted">Geste demandé</span>
        <span class="gesture">${esc(S.gesture)}</span>
        <span class="btn btn-primary" style="justify-self:center;margin-top:8px">${S.selfie ? 'Reprendre le selfie' : 'Ouvrir la caméra'}</span>
        <input type="file" name="selfie" accept="image/*" capture="user" hidden>
      </label>
      ${S.selfie ? `<img class="preview" src="${S.selfie}" alt="Aperçu du selfie">` : ''}
      <p id="form-error" class="error" role="alert"></p>
    `);
    tg.setButtons(S.selfie ? { main: { text: 'Envoyer pour vérification', onClick: sendSelfie } } : null);
  },

  pending() {
    render(`
      <div class="center stack" style="justify-items:center">
        <span style="color:var(--accent)">${icon('shield', 40)}</span>
        <h2>Vérification en cours</h2>
        <p class="muted">En général quelques minutes. Le bot t'écrira dans Telegram dès que c'est fait : tu peux fermer l'app.</p>
      </div>
    `);
    tg.setButtons({ main: { text: 'Actualiser', onClick: refreshStatus }, secondary: { text: 'Fermer', onClick: tg.close } });
    S.pendingTimer = setInterval(refreshStatus, 5000);
  },

  async discover() {
    if (!S.profiles.length) {
      render(`${tabs('discover')}<p class="center muted">Recherche de profils près de toi…</p>`);
      tg.setButtons(null);
      try {
        const r = await api('/discover');
        S.profiles = r.profiles;
        S.remaining = r.remaining;
      } catch (e) {
        return render(`${tabs('discover')}<p class="center error">${esc(e.message)}</p>`);
      }
    }
    const p = S.profiles[0];
    if (!p) {
      render(`${tabs('discover')}
        <div class="center stack" style="justify-items:center">
          <h2>Tu as vu tous les profils du moment</h2>
          <p class="muted">${S.remaining ? 'Reviens un peu plus tard : de nouveaux profils vérifiés arrivent chaque jour.' : 'Ta limite du jour est atteinte. Reviens demain.'}</p>
        </div>`);
      return tg.setButtons({ main: { text: 'Voir mes messages', onClick: () => go('matches') } });
    }
    render(`${tabs('discover')}
      <div class="row small muted"><span>${icon('pin', 16)}</span><span>${esc(S.me.profile.city)}</span><span class="spacer"></span><span>${S.remaining} profils restants aujourd'hui</span></div>
      ${profileCard(p)}`);
    loadCardPhoto(p);
    tg.setButtons({ main: { text: "J'aime", onClick: () => swipe('like') }, secondary: { text: 'Passer', onClick: () => swipe('pass') } });
  },

  match() {
    const m = S.lastMatch;
    render(`
      <div class="center stack" style="justify-items:center">
        <div class="row" style="gap:0">
          <div class="avatar" style="width:76px;height:76px;font-size:30px">${esc(S.me.profile.name[0])}</div>
          <div class="avatar" style="width:76px;height:76px;font-size:30px;margin-left:-16px;border:3px solid var(--bg)">${esc(m.other.name[0])}</div>
        </div>
        <h2>${esc(m.other.name)} et toi, vous vous plaisez</h2>
        <p class="muted">Brisez la glace avec une question sur son profil. Les liens et numéros sont débloqués après quelques messages.</p>
      </div>`);
    tg.haptic('success');
    tg.setButtons({ main: { text: `Écrire à ${m.other.name}`, onClick: () => go('chat', { id: m.id }) }, secondary: { text: 'Plus tard', onClick: () => go('discover') } });
  },

  async matches({ silent = false } = {}) {
    if (!silent) {
      render(`${tabs('matches')}<p class="center muted">Chargement…</p>`);
      tg.setButtons(null);
    }
    try {
      S.matches = (await api('/matches')).matches;
    } catch (e) {
      return render(`${tabs('matches')}<p class="center error">${esc(e.message)}</p>`);
    }
    if (S.screen !== 'matches') return;
    if (!S.matches.length) {
      render(`${tabs('matches')}<div class="center stack" style="justify-items:center"><h2>Tes matchs apparaîtront ici</h2><p class="muted">Quand vous vous plaisez tous les deux, la discussion s'ouvre. Tu es prévenu(e) par le bot, même app fermée.</p></div>`);
      return tg.setButtons({ main: { text: 'Découvrir des profils', onClick: () => go('discover') } });
    }
    render(`${tabs('matches')}<div>${S.matches.map((m) => `
      <button class="list-row" data-action="open-chat" data-id="${m.id}">
        <div class="avatar" style="width:46px;height:46px;font-size:18px">${esc(m.other.name[0])}</div>
        <div style="flex:1;min-width:0">
          <div class="row"><strong>${esc(m.other.name)}</strong>${m.other.verified ? `<span style="color:var(--ok)">${icon('shield', 14)}</span>` : ''}${m.isNew ? '<span class="chip chip-accent">Nouveau</span>' : ''}</div>
          <div class="small ${m.unread ? '' : 'muted'}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${m.unread ? 'font-weight:600' : ''}">${m.lastMessage ? `${m.lastMessage.from === S.me.id ? 'Toi : ' : ''}${esc(m.lastMessage.text)}` : 'Nouveau match, écris le premier message'}</div>
        </div>
        ${m.unread ? `<span class="count-badge">${m.unread}</span>` : ''}
      </button>`).join('')}</div>`);
    tg.setButtons(null);
  },

  async chat({ id }) {
    if (!id) return go('matches');
    render(`<p class="center muted">Ouverture de la discussion…</p>`);
    tg.setButtons(null);
    try {
      const data = await api(`/matches/${id}`);
      S.chat = { id, other: data.other, messages: data.messages, dates: data.dates, unlockAfter: data.unlockAfter, notice: null };
    } catch (e) {
      return render(`<h2>Discussion indisponible</h2><p class="error">${esc(e.message)}</p>`);
    }
    renderChat();
    tg.setButtons({ main: { text: 'Proposer un rendez-vous', onClick: () => go('date') } });
    S.chatTimer = setInterval(pollChat, 4000);
  },

  async date() {
    if (!S.chat) return go('matches');
    if (!S.venues.length) {
      try { S.venues = (await api('/venues')).venues; } catch (e) { return toast(e.message); }
    }
    const d = S.dateDraft;
    const slots = ["Aujourd'hui, 17 h", 'Demain, 16 h', 'Samedi, 11 h', 'Dimanche, 15 h'];
    render(`
      <h2>Proposer un rendez-vous sûr</h2>
      <p class="muted">Uniquement dans des lieux publics partenaires, où ton arrivée est confirmée par un code.</p>
      <div class="stack">${S.venues.length ? S.venues.map((v) => `
        <button class="option" aria-pressed="${d.venueId === v.id}" data-action="venue" data-id="${v.id}">
          <span class="icon">${icon('coffee', 22)}</span><span><span class="title">${esc(v.name)}</span><br><span class="sub">${esc(v.area)}, ${esc(v.perk)}</span></span>
        </button>`).join('') : '<p class="notice notice-info">Pas encore de lieu partenaire dans ta ville.</p>'}</div>
      <div class="field"><span class="small muted">Quand ?</span>
        <div class="stack">${slots.map((s) => `<button class="option" aria-pressed="${d.slot === s}" data-action="slot" data-value="${esc(s)}"><span class="title">${s}</span></button>`).join('')}</div>
      </div>
      <p class="small muted">Conseil : préviens une personne de confiance du lieu et de l'heure.</p>
      <p id="form-error" class="error" role="alert"></p>
    `);
    tg.closingConfirmation(!!(d.venueId || d.slot));
    tg.setButtons({ main: { text: 'Envoyer la proposition', onClick: sendDate } });
  },

  safety() {
    render(`${tabs('safety')}
      <div>
        <button class="list-row" data-action="toggle-guide" aria-expanded="${S.guideOpen}">
          <span style="color:var(--danger)">${icon('alert', 22)}</span>
          <span style="flex:1"><strong>Quelqu'un me fait du chantage</strong><br><span class="small muted">Que faire, étape par étape</span></span>
        </button>
        ${S.guideOpen ? `<ol style="line-height:1.7;padding-left:22px">
          <li>Ne paie rien, même sous la menace : payer n'arrête presque jamais le chantage.</li>
          <li>Garde les preuves : captures d'écran, prénom et date.</li>
          <li>Signale et bloque le profil depuis la discussion.</li>
          <li>Parle à une personne de confiance ou à une association d'aide aux victimes.</li>
        </ol>` : ''}
        <div class="list-row"><span>${icon('ban', 22)}</span><span style="flex:1"><strong>${esc(APP)} ne te demandera jamais d'argent</strong><br><span class="small muted">Ni pour vérifier ton compte, ni pour débloquer un profil.</span></span></div>
        <div class="list-row"><span>${icon('coffee', 22)}</span><span style="flex:1"><strong>Premier rendez-vous dans un lieu public</strong><br><span class="small muted">Préviens un proche et rentre par tes propres moyens.</span></span></div>
        <button class="list-row" data-action="go" data-screen="me"><span>${icon('lock', 22)}</span><span style="flex:1"><strong>Paramètres et confidentialité</strong><br><span class="small muted">Dans l'onglet Profil : données, notifications, suppression</span></span></button>
      </div>`);
    tg.setButtons(null);
  },

  me() {
    const v = { none: 'Non vérifié', pending: 'Vérification en cours', approved: 'Vérifié', rejected: 'Vérification refusée' }[S.me.verification];
    const pp = S.me.publicProfile;
    render(`${S.me.verification === 'approved' ? tabs('me') : ''}
      <div class="row"><h2 style="flex:1">Ton profil</h2><span class="chip ${S.me.verification === 'approved' ? 'chip-ok' : ''}">${v}</span></div>
      ${pp ? `<p class="small muted">Voici ce que les autres voient. Ton pseudo et ton numéro Telegram ne sont jamais montrés.</p>${profileCard(pp, { own: true })}` : '<p class="muted">Tu n\'as pas encore de profil.</p>'}
      <h2 style="margin-top:8px">Paramètres</h2>
      <div>
        <button class="list-row" data-action="test-notif"><span>${icon('bell', 22)}</span><span style="flex:1"><strong>Tester les notifications</strong><br><span class="small muted">Le bot t'envoie un message de test dans Telegram</span></span></button>
        <label class="list-row"><span>${icon('wifi', 22)}</span><span style="flex:1"><strong>Économie de data</strong><br><span class="small muted">Photos chargées seulement si tu les demandes</span></span>
          <input type="checkbox" name="dataSaver" ${S.dataSaver ? 'checked' : ''} style="width:auto"></label>
        <button class="list-row" data-action="invite"><span>${icon('heart', 22)}</span><span style="flex:1"><strong>Inviter une amie ou un ami</strong><br><span class="small muted">Plus il y a de profils vérifiés près de toi, mieux c'est</span></span></button>
        ${tg.canAddToHome() ? `<button class="list-row" data-action="home"><span>${icon('pin', 22)}</span><span style="flex:1"><strong>Ajouter à l'écran d'accueil</strong></span></button>` : ''}
      </div>
      <button class="btn-danger" data-action="delete">Supprimer mon compte et mes données</button>
    `);
    if (pp) loadCardPhoto(pp, { own: true });
    tg.setButtons({ main: { text: pp ? 'Modifier mon profil' : 'Créer mon profil', onClick: () => { S.form = null; go('profile'); } } });
  },
};

// ============================================================
// Actions
// ============================================================
async function saveProfile() {
  const f = S.form;
  const errEl = document.getElementById('form-error');
  const age = Number(f.age);
  if (!f.name.trim()) return showError(new Error('Indique ton prénom.'), errEl);
  if (!Number.isInteger(age) || age < 18) return showError(new Error(`${APP} est réservé aux 18 ans et plus.`), errEl);
  if (!f.gender) return showError(new Error('Indique si tu es une femme ou un homme.'), errEl);
  if (!f.intent) return showError(new Error('Choisis ce que tu cherches.'), errEl);
  if (f.promptA.trim().length < 3) return showError(new Error('Réponds à la question sur toi.'), errEl);
  tg.setButtons({ main: { text: 'Enregistrement', progress: true } });
  try {
    const { profile } = await api('/me/profile', { method: 'PUT', body: { ...f, age } });
    S.form = null;
    S.me = await api('/me');
    S.photoUrls = {};
    tg.haptic('success');
    if (S.me.verification === 'approved') {
      toast('Profil mis à jour');
      go('me');
    } else {
      go('verify');
    }
  } catch (e) {
    showError(e, errEl);
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
      toast("Vérification refusée : réessaie avec le visage bien visible.");
      go('verify');
    }
  } catch { /* on réessaiera au prochain passage */ }
}

let swiping = false;
async function swipe(action) {
  const p = S.profiles[0];
  if (!p || swiping) return;
  swiping = true;
  tg.haptic(action === 'like' ? 'medium' : 'select');
  try {
    const r = await api('/swipes', { method: 'POST', body: { targetId: p.id, action } });
    S.profiles.shift();
    S.remaining = Math.max(0, S.remaining - 1);
    if (r.match) {
      S.lastMatch = r.match;
      go('match');
    } else {
      go('discover');
    }
  } catch (e) {
    showError(e);
  } finally {
    swiping = false;
  }
}

function chatBody(c) {
  const dateCards = c.dates.map((d) => `
    <div class="notice ${d.arrivedMe ? 'notice-ok' : 'notice-info'}">
      <strong>Rendez-vous : ${esc(d.venue?.name)}, ${esc(d.venue?.area)}</strong><br>${esc(d.slot)}
      ${d.arrivedMe ? '<br>Arrivée confirmée. Bon rendez-vous.' : `<br><button class="btn btn-primary" style="margin-top:8px" data-action="checkin" data-id="${d.id}">Je suis arrivé(e) : scanner le code</button>`}
    </div>`).join('');
  const time = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const msgs = c.messages.length
    ? c.messages.map((m) => `<div class="bubble ${m.mine ? 'mine' : 'theirs'}">${esc(m.text)}<span class="time">${time(m.at)}</span></div>`).join('')
    : `<p class="system">Commence par une question sur son profil. Les liens et numéros sont débloqués après ${c.unlockAfter} messages.</p>`;
  return `${dateCards}<div class="spacer"></div>${msgs}`;
}

// Structure fixe : en-tête en haut, messages défilants au milieu, champ de saisie en bas.
// On ne reconstruit jamais le champ de saisie, pour ne pas fermer le clavier.
function renderChat() {
  const c = S.chat;
  render(`
    <div class="chat">
      <div class="row chat-head">
        <div class="avatar" style="width:40px;height:40px">${esc(c.other.name[0])}</div>
        <div style="flex:1;min-width:0"><strong>${esc(c.other.name)}, ${c.other.age}</strong><br><span class="small muted">Pseudos Telegram masqués des deux côtés</span></div>
        <button class="btn-link small" data-action="report-chat" aria-label="Signaler" style="color:var(--hint)">${icon('flag', 18)}</button>
      </div>
      <div class="messages" id="messages">${chatBody(c)}</div>
      <div id="chat-notice"></div>
      <form class="composer" data-action="send">
        <input name="message" autocomplete="off" maxlength="1000" placeholder="Écris ton message" aria-label="Message">
        <button type="submit">Envoyer</button>
      </form>
    </div>
  `);
  updateChat({ scroll: true });
}

function updateChat({ scroll = false } = {}) {
  const box = document.getElementById('messages');
  if (!box || !S.chat) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.innerHTML = chatBody(S.chat);
  document.getElementById('chat-notice').innerHTML = S.chat.notice ? `<div class="notice notice-warn" role="alert">${esc(S.chat.notice)}</div>` : '';
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
    button.disabled = false;
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
    toast('Signalement envoyé. Ce profil ne peut plus te contacter.');
    S.profiles = S.profiles.filter((p) => p.id !== targetId);
    go(matchId ? 'matches' : 'discover');
  } catch (e) {
    showError(e);
  }
}

// ============================================================
// Délégation des événements
// ============================================================
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const { action } = el.dataset;
  switch (action) {
    case 'dev-back': window.__devBack?.(); break;
    case 'tab': tg.haptic('select'); go(el.dataset.screen); break;
    case 'go': go(el.dataset.screen); break;
    case 'set':
      tg.haptic('select');
      S.form[el.dataset.field] = el.dataset.value;
      el.parentElement.querySelectorAll('[data-action="set"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      break;
    case 'reveal': S.revealed[el.dataset.id] = true; SCREENS.discover(); break;
    case 'report-profile': report(el.dataset.id); break;
    case 'report-chat': report(S.chat.other.id, S.chat.id); break;
    case 'open-chat': go('chat', { id: el.dataset.id }); break;
    case 'venue': tg.haptic('select'); S.dateDraft.venueId = el.dataset.id; SCREENS.date(); break;
    case 'slot': tg.haptic('select'); S.dateDraft.slot = el.dataset.value; SCREENS.date(); break;
    case 'checkin': checkin(el.dataset.id); break;
    case 'toggle-guide': S.guideOpen = !S.guideOpen; SCREENS.safety(); break;
    case 'edit-profile': S.form = null; go('profile'); break;
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
    toast(t.checked ? 'Économie de data activée' : 'Économie de data désactivée');
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
  const headers = tg.inTelegram ? { Authorization: `tma ${tg.initData()}` } : { 'x-dev-user': devUser() || '' };
  fetch('/api/presence/leave', { method: 'POST', headers, keepalive: true }).catch(() => {});
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
  try {
    S.me = await api('/me');
  } catch (e) {
    tg.setButtons(null);
    return render(`
      <div class="center stack">
        <h2>Ouvre ${esc(APP)} depuis Telegram</h2>
        <p class="muted">${esc(e.message)}</p>
        <p class="small muted">Cherche le bot ${esc(APP)} dans Telegram, envoie /start, puis appuie sur « Ouvrir ${esc(APP)} ».</p>
      </div>`);
  }
  S.dataSaver = (await tg.cloudGet('data_saver')) === '1';
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
