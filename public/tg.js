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

export function init() {
  if (!inTelegram) return;
  W.ready();
  W.expand();
  if (supports('7.7')) W.disableVerticalSwipes(); // évite de fermer l'app en faisant défiler
  if (supports('6.1')) {
    W.setHeaderColor('secondary_bg_color');
    W.setBackgroundColor('bg_color');
  }
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
      W.MainButton.setParams({ text: main.text, is_visible: true, is_active: !main.progress });
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
        W.SecondaryButton.setParams({ text: secondary.text, is_visible: true, position: 'left' });
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
export function cloudGet(key) {
  return new Promise((resolve) => {
    if (supports('6.9')) W.CloudStorage.getItem(key, (err, v) => resolve(err ? null : v));
    else resolve(sessionStorage.getItem(key));
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
