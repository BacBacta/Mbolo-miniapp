// Primitives d'interface : icônes, toast, squelettes de chargement, geste de balayage, formats.
// Aucune dépendance, aucun appel réseau, aucun accès au SDK Telegram (réservé à tg.js).

// ---------- Icônes : traits de 24 px, héritent de la couleur du texte ----------
const PATHS = {
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15c2.5 0 5 1.5 5 4"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  duo: '<circle cx="7" cy="8" r="2.5"/><circle cx="17" cy="8" r="2.5"/><path d="M2 19c0-2.5 2.2-4 5-4s5 1.5 5 4"/><path d="M12 19c0-2.5 2.2-4 5-4s5 1.5 5 4"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 1112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l2-3h4l2 3"/>',
  play: '<path d="M8 5.5l10 6.5-10 6.5z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0"/><path d="M12 18v3"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5V9z"/><path d="M17 11h2a2 2 0 010 4h-2"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0"/><path d="M5 12.5a10 10 0 0114 0"/><path d="M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/>',
  'wifi-off': '<path d="M2 9a15 15 0 0120 0"/><path d="M5 12.5a10 10 0 0114 0"/><path d="M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/><path d="M3 3l18 18"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-8-8-4 19-6z"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z"/>',
  share: '<path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M12 15V4M8 8l4-4 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  refresh: '<path d="M20 12a8 8 0 01-14.5 4.6M4 12a8 8 0 0114.5-4.6"/><path d="M20 4v4h-4M4 20v-4h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  hand: '<path d="M7 11V6a1.5 1.5 0 013 0v5M10 11V4.5a1.5 1.5 0 013 0V11M13 11V6a1.5 1.5 0 013 0v7M16 11V8a1.5 1.5 0 013 0v6a7 7 0 01-7 7h-1a7 7 0 01-6-3.5L3 12.8a1.5 1.5 0 012.5-1.6L7 13"/>',
  message: '<path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4V6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

// icon('heart', 16) ; icon('heart', 16, { fill: true }) pour une version pleine
export const icon = (name, size = 20, { fill = false } = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// Le verre : flouter, ou renoncer
// ============================================================
// Le flou d'arrière-plan coûte cher à dessiner. styles.css sait déjà y renoncer quand le
// navigateur ne sait pas flouter, ou quand la personne demande moins de transparence. Restait le
// cas qu'aucune règle CSS ne distingue : un téléphone qui sait flouter mais le rend lentement.
//
// On ne le devine donc pas, on le constate. Deux signaux, et une décision qu'on retient : la
// mesure d'une seule session est bruitée, l'appareil de quelqu'un, lui, ne change pas.

export const MEMOIRE_FAIBLE_GIO = 2;      // navigator.deviceMemory : 0.25, 0.5, 1, 2, 4, 8…
export const IMAGE_LENTE_MS = 32;         // au-delà, on est sous 31 images par seconde

// Décide à partir de ce qu'on sait de l'appareil et, si elle a eu lieu, de la mesure.
// Pure et sans DOM : c'est elle que les tests interrogent.
export function verreOpaque({ memoire = null, imageMedianeMs = null } = {}) {
  // Un appareil qui annonce deux gigaoctets ou moins n'a pas besoin qu'on mesure : le flou
  // plein écran y est un mauvais calcul, même s'il finit par s'afficher.
  if (typeof memoire === 'number' && memoire > 0 && memoire <= MEMOIRE_FAIBLE_GIO) return true;
  // Sinon, seule une mesure franchement mauvaise tranche. Le seuil est volontairement bas :
  // rendre l'app opaque à tort est pire que garder un flou un peu coûteux.
  if (typeof imageMedianeMs === 'number' && imageMedianeMs > IMAGE_LENTE_MS) return true;
  return false;
}

// Durée entre deux images, mesurée pendant que l'app dessine vraiment quelque chose. Mesurer au
// repos ne dirait rien : sans travail à faire, le navigateur ralentit lui-même les images.
export function mesurerImages(combien = 40) {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return resolve(null);
    const durees = [];
    let precedent = null;
    const tic = (maintenant) => {
      if (precedent !== null) durees.push(maintenant - precedent);
      precedent = maintenant;
      if (durees.length < combien) return requestAnimationFrame(tic);
      durees.sort((a, b) => a - b);
      resolve(durees[Math.floor(durees.length / 2)]);
    };
    requestAnimationFrame(tic);
  });
}

const CLE_VERRE = 'verre-v1';

// Applique la décision d'abord, mesure ensuite. L'ordre compte : une décision déjà prise doit
// s'appliquer avant le premier dessin, sinon on repaye le flou une fois à chaque ouverture.
//
// Tout ce que la fonction touche au-dehors se remplace : c'est ce qui la rend vérifiable sans
// navigateur, et ce qui évite d'avoir à bricoler les globales dans un test.
export async function reglerLeVerre({
  racine = document.documentElement,
  stockage = (() => { try { return window.localStorage; } catch { return null; } })(),
  memoire = (typeof navigator !== 'undefined' ? navigator.deviceMemory : null) ?? null,
  mesurer = mesurerImages,
} = {}) {
  const poser = (opaque) => racine.setAttribute('data-verre', opaque ? 'opaque' : 'flou');
  const retenir = (opaque) => { try { stockage?.setItem(CLE_VERRE, opaque ? 'opaque' : 'flou'); } catch { /* navigation privée : on remesurera */ } };

  let retenu = null;
  try { retenu = stockage?.getItem(CLE_VERRE); } catch { /* idem */ }
  if (retenu === 'opaque' || retenu === 'flou') { poser(retenu === 'opaque'); return retenu === 'opaque'; }

  // La mémoire annoncée suffit à trancher : inutile de faire ramer l'appareil pour le constater.
  if (verreOpaque({ memoire })) { poser(true); retenir(true); return true; }

  const imageMedianeMs = await mesurer();
  const opaque = verreOpaque({ memoire, imageMedianeMs });
  poser(opaque);
  retenir(opaque);
  return opaque;
}

// ---------- Toast : message bref en bas de l'écran ----------
let toastTimer;
export function toast(msg, kind = 'info') {
  const el = document.getElementById('toast');
  const name = { ok: 'check', warn: 'alert', info: 'info' }[kind] || 'info';
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(name, 18)}<span></span>`;
  el.querySelector('span').textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}

// ---------- Squelettes : la forme de l'écran s'affiche pendant le chargement ----------
export const skeleton = {
  card: () => `
    <div class="sk-card" aria-hidden="true">
      <div class="sk sk-photo"></div>
      <div class="sk-body"><div class="sk sk-line w60"></div><div class="sk sk-line w80"></div><div class="sk sk-line w40"></div></div>
    </div>`,
  rows: (n = 4) => `
    <div class="list" aria-hidden="true">${Array.from({ length: n }, () => `
      <div class="list-row"><div class="sk sk-avatar"></div><div class="body stack" style="gap:8px"><div class="sk sk-line w40"></div><div class="sk sk-line w80"></div></div></div>`).join('')}
    </div>`,
  chat: () => `
    <div class="messages" aria-hidden="true" style="justify-content:flex-end">
      <div class="sk sk-line w60" style="height:40px;border-radius:18px;align-self:flex-start"></div>
      <div class="sk sk-line w40" style="height:40px;border-radius:18px;align-self:flex-end"></div>
      <div class="sk sk-line w80" style="height:56px;border-radius:18px;align-self:flex-start"></div>
    </div>`,
  block: (h = 160) => `<div class="sk sk-block" style="height:${h}px" aria-hidden="true"></div>`,
};

// ---------- Geste de balayage sur la carte du haut ----------
// Le défilement vertical reste natif (touch-action: pan-y) ; on ne capte que l'horizontal.
// Renvoie une fonction qui détache le geste.
export function attachSwipe(card, { onLike, onPass, threshold = 0.32 } = {}) {
  if (!card) return () => {};
  const stampLike = card.querySelector('.stamp.like');
  const stampPass = card.querySelector('.stamp.pass');
  let startX = 0, startY = 0, dx = 0, dy = 0, active = false, startT = 0, captured = false;

  const setTransform = () => {
    const rot = dx / 18;
    card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${rot}deg)`;
    const k = Math.min(1, Math.abs(dx) / (card.offsetWidth * threshold));
    if (stampLike) stampLike.style.opacity = dx > 0 ? k : 0;
    if (stampPass) stampPass.style.opacity = dx < 0 ? k : 0;
  };

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button, a, input, label')) return;
    active = true; captured = false; startX = e.clientX; startY = e.clientY; dx = dy = 0; startT = Date.now();
    card.classList.remove('settle');
    card.classList.add('dragging');
  };
  const move = (e) => {
    if (!active) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    // Le pointeur n'est capturé qu'une fois le geste engagé : un simple toucher reste un clic,
    // reçu par ce qu'on a touché (changer de photo, par exemple)
    if (!captured && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { captured = true; card.setPointerCapture?.(e.pointerId); }
    setTransform();
  };
  const up = () => {
    if (!active) return;
    active = false;
    card.classList.remove('dragging');
    const speed = Math.abs(dx) / Math.max(1, Date.now() - startT);
    const decided = Math.abs(dx) > card.offsetWidth * threshold || (speed > 0.7 && Math.abs(dx) > 40);
    if (decided) {
      (dx > 0 ? onLike : onPass)?.();
    } else {
      card.classList.add('settle');
      card.style.transform = '';
      if (stampLike) stampLike.style.opacity = 0;
      if (stampPass) stampPass.style.opacity = 0;
    }
  };

  card.addEventListener('pointerdown', down);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
  return () => {
    card.removeEventListener('pointerdown', down);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', up);
  };
}

// Fait sortir la carte du haut vers la droite (like) ou la gauche (pass), puis résout.
export function throwCard(card, dir = 1) {
  return new Promise((resolve) => {
    if (!card || prefersReducedMotion()) return resolve();
    const stamp = card.querySelector(dir > 0 ? '.stamp.like' : '.stamp.pass');
    if (stamp) stamp.style.opacity = 1;
    card.classList.remove('dragging', 'settle');
    card.classList.add('throw');
    card.style.transform = `translate(${dir * (window.innerWidth + 160)}px, -20px) rotate(${dir * 22}deg)`;
    setTimeout(resolve, 320);
  });
}

// ---------- Formats de date pour la discussion ----------
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Aujourd'hui";
  if (sameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
export const timeLabel = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const isSameDay = (a, b) => sameDay(new Date(a), new Date(b));
