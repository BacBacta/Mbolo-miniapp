// Enveloppe autour de window.Telegram.WebApp.
// Dans Telegram : boutons, popups, vibreur et scanner natifs.
// Dans un navigateur (développement) : équivalents web simples, pour tester l'interface.

const W = window.Telegram?.WebApp;
export const inTelegram = !!(W && W.initData);
const supports = (v) => inTelegram && typeof W.isVersionAtLeast === 'function' && W.isVersionAtLeast(v);

const bar = () => document.getElementById('fallback-bar');
let mainHandler = null;
let secondaryHandler = null;
let backHandler = null;

// Expose le schéma (clair ou sombre) au CSS : <html data-scheme="dark">, pour ajuster ombres et contrastes
function applyScheme(scheme) {
  document.documentElement.dataset.scheme = scheme === 'dark' ? 'dark' : 'light';
}

// Couleur d'une variable CSS telle que le navigateur la calcule (les color-mix ne se lisent pas
// directement), en hexadécimal : c'est ce que Telegram attend pour peindre son cadre.
function resolvedColor(varName) {
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${varName})`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  let parts = c.match(/[\d.]+/g);
  if (!parts) return null;
  if (c.startsWith('color(')) parts = parts.map((x) => Math.round(Number(x) * 255)); // color(srgb r g b)
  return '#' + parts.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

// Les boutons natifs prennent les couleurs de la marque ; le cadre Telegram, celle de la page
const BRAND = { color: '#e0784f', text_color: '#141210' };
const secondaryColors = () => {
  const color = resolvedColor('--btn-secondary');
  const text_color = resolvedColor('--text');
  return color && text_color ? { color, text_color } : {};
};
function syncChrome() {
  if (!inTelegram) return;
  const bg = resolvedColor('--bg2');
  if (bg && supports('6.1')) {
    W.setHeaderColor(bg);
    W.setBackgroundColor(bg);
  }
  if (bg && supports('7.10')) W.setBottomBarColor(bg);
  W.MainButton.setParams(BRAND);
}

export function init() {
  if (!inTelegram) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', (e) => applyScheme(e.matches ? 'dark' : 'light'));
    return;
  }
  W.ready();
  W.expand();
  if (supports('7.7')) W.disableVerticalSwipes(); // évite de fermer l'app en faisant défiler
  // En-tête, fond et barre du bas prennent la couleur de la page : le cadre Telegram et l'app ne font qu'un
  applyScheme(W.colorScheme);
  syncChrome();
  W.onEvent('themeChanged', () => { applyScheme(W.colorScheme); syncChrome(); });
}

export const initData = () => (inTelegram ? W.initData : '');
export const telegramUser = () => (inTelegram ? W.initDataUnsafe?.user : null);

// Paramètres de lancement : ?screen=chat&match=... (bouton du bot) ou start_param (lien t.me)
export function launchParams() {
  const p = Object.fromEntries(new URLSearchParams(location.search));
  const sp = inTelegram ? W.initDataUnsafe?.start_param : null;
  if (sp) {
    const [screen, id] = sp.split('_');
    if (screen === 'chat' && id) Object.assign(p, { screen: 'chat', match: id });
    else if (screen === 'ref') p.ref = id;
  }
  return p;
}

// ---------- Boutons principal et secondaire ----------
// buttons = { main: { text, onClick, progress }, secondary: { text, onClick } } ; null pour tout masquer
export function setButtons(buttons = {}) {
  const { main, secondary } = buttons || {};
  const nativeSecondary = supports('7.10') && W.SecondaryButton;

  if (inTelegram) {
    if (mainHandler) W.MainButton.offClick(mainHandler);
    mainHandler = null;
    if (main) {
      mainHandler = () => main.onClick?.();
      W.MainButton.setParams({ ...BRAND, text: main.text, is_visible: true, is_active: !main.progress });
      W.MainButton.onClick(mainHandler);
      main.progress ? W.MainButton.showProgress(false) : W.MainButton.hideProgress();
    } else {
      W.MainButton.hideProgress();
      W.MainButton.hide();
    }
    if (nativeSecondary) {
      if (secondaryHandler) W.SecondaryButton.offClick(secondaryHandler);
      secondaryHandler = null;
      if (secondary) {
        secondaryHandler = () => secondary.onClick?.();
        W.SecondaryButton.setParams({ ...secondaryColors(), text: secondary.text, is_visible: true, position: 'left' });
        W.SecondaryButton.onClick(secondaryHandler);
      } else {
        W.SecondaryButton.hide();
      }
    }
  }

  // Barre de secours : tout hors Telegram, seulement le secondaire si Telegram est trop ancien
  const b = bar();
  const fbMain = inTelegram ? null : main;
  const fbSecondary = inTelegram && nativeSecondary ? null : secondary;
  b.innerHTML = '';
  if (fbSecondary) b.append(makeBtn('secondary', fbSecondary));
  if (fbMain) b.append(makeBtn('main', fbMain));
  b.hidden = !fbMain && !fbSecondary;
}

function makeBtn(cls, cfg) {
  const el = document.createElement('button');
  el.className = cls;
  el.textContent = cfg.progress ? `${cfg.text}…` : cfg.text;
  el.disabled = !!cfg.progress;
  el.addEventListener('click', () => cfg.onClick?.());
  return el;
}

// ---------- Bouton Retour (dans l'en-tête Telegram) ----------
export function setBack(fn) {
  if (!inTelegram) {
    window.__devBack = fn || null; // hors Telegram, l'app affiche son propre lien Retour
    return;
  }
  if (backHandler) W.BackButton.offClick(backHandler);
  backHandler = null;
  if (fn) {
    backHandler = () => fn();
    W.BackButton.onClick(backHandler);
    W.BackButton.show();
  } else {
    W.BackButton.hide();
  }
}

export function onSettings(fn) {
  if (supports('7.0') && W.SettingsButton) {
    W.SettingsButton.onClick(fn);
    W.SettingsButton.show();
  }
}

// ---------- Retour haptique ----------
export function haptic(kind = 'light') {
  if (!supports('6.1')) return;
  if (['error', 'success', 'warning'].includes(kind)) W.HapticFeedback.notificationOccurred(kind);
  else if (kind === 'select') W.HapticFeedback.selectionChanged();
  else W.HapticFeedback.impactOccurred(kind);
}

// ---------- Popups natives ----------
export function alert(message) {
  return new Promise((resolve) => (supports('6.2') ? W.showAlert(message, () => resolve()) : (window.alert(message), resolve())));
}

export function confirm(message) {
  return new Promise((resolve) => (supports('6.2') ? W.showConfirm(message, (ok) => resolve(ok)) : resolve(window.confirm(message))));
}

// buttons : [{ id, type: 'default'|'destructive'|'cancel'|'ok', text }]
export function popup({ title, message, buttons }) {
  return new Promise((resolve) => {
    if (supports('6.2')) W.showPopup({ title, message, buttons }, (id) => resolve(id));
    else {
      const main = buttons.find((b) => b.type !== 'cancel');
      resolve(window.confirm(`${title ? `${title}\n\n` : ''}${message}`) ? main?.id : null);
    }
  });
}

// ---------- Scanner de QR code natif ----------
export function scanQr(text) {
  return new Promise((resolve) => {
    if (supports('6.4')) {
      let done = false;
      const onClosed = () => { if (!done) resolve(null); W.offEvent('scanQrPopupClosed', onClosed); };
      W.onEvent('scanQrPopupClosed', onClosed);
      W.showScanQrPopup({ text }, (value) => { done = true; resolve(value); return true; });
    } else {
      resolve(window.prompt(`${text}\n(Hors Telegram : colle le contenu du QR code)`));
    }
  });
}

// ---------- Confirmation avant fermeture ----------
export function closingConfirmation(on) {
  if (!supports('6.2')) return;
  on ? W.enableClosingConfirmation() : W.disableClosingConfirmation();
}

// ---------- Stockage Telegram (préférences) ----------
// Telegram ne rappelle pas toujours : sans minuteur, un réglage manquant bloquait tout le
// démarrage, puisque boot() attend ces deux lectures avant d'afficher le premier écran.
const DELAI_STOCKAGE_MS = 2500;

export function cloudGet(key) {
  return new Promise((resolve) => {
    if (!supports('6.9')) return resolve(sessionStorage.getItem(key));
    const minuteur = setTimeout(() => resolve(null), DELAI_STOCKAGE_MS);
    W.CloudStorage.getItem(key, (err, v) => { clearTimeout(minuteur); resolve(err ? null : v); });
  });
}

export function cloudSet(key, value) {
  return new Promise((resolve) => {
    if (supports('6.9')) W.CloudStorage.setItem(key, value, () => resolve());
    else { sessionStorage.setItem(key, value); resolve(); }
  });
}

// ---------- Autorisation d'écrire à l'utilisateur ----------
export function requestWriteAccess() {
  return new Promise((resolve) => (supports('6.9') ? W.requestWriteAccess((ok) => resolve(ok)) : resolve(true)));
}

// ---------- Partage et raccourci ----------
export function share(url, text) {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (inTelegram) W.openTelegramLink(link);
  else window.open(link, '_blank');
}

export const canAddToHome = () => supports('8.0') && typeof W.addToHomeScreen === 'function';
export const addToHome = () => canAddToHome() && W.addToHomeScreen();

export function close() {
  if (inTelegram) W.close();
}
