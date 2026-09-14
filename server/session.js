// Sessions web signées, sans dépendance et sans table.
//
// Le cahier des charges des paiements (section 10.3) prévoit déjà un cookie signé par
// WEB_SESSION_SECRET. La modération arrive la première : elle pose le mécanisme, le chantier
// suivant s'en sert plutôt que d'en apporter un second.
//
// Le contenu est lisible par qui tient le cookie — il n'y a rien de secret dedans, seulement un
// identifiant et une date. C'est la signature qui compte : sans le secret, on ne peut pas la
// fabriquer, donc pas se faire passer pour quelqu'un.
import crypto from 'node:crypto';
import { config } from './config.js';

export const COOKIE_MODERATION = 'mod_session';

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sceau = (corps) => crypto.createHmac('sha256', config.webSessionSecret).update(corps).digest();

// Sans secret, on ne signe rien : mieux vaut ne rien délivrer que délivrer du non-signé.
export function signer(donnees, dureeSec) {
  if (!config.webSessionSecret) return null;
  const corps = b64(JSON.stringify({ ...donnees, exp: Math.floor(Date.now() / 1000) + dureeSec }));
  return `${corps}.${b64(sceau(corps))}`;
}

export function verifier(valeur) {
  if (!valeur || !config.webSessionSecret) return null;
  const [corps, signature] = String(valeur).split('.');
  if (!corps || !signature) return null;
  const attendu = sceau(corps);
  const recu = Buffer.from(signature, 'base64url');
  // Comparaison à durée constante : une comparaison ordinaire laisse deviner la signature
  // octet par octet à qui mesure le temps de réponse.
  if (recu.length !== attendu.length || !crypto.timingSafeEqual(recu, attendu)) return null;
  let donnees = null;
  try {
    donnees = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!donnees?.exp || donnees.exp * 1000 <= Date.now()) return null;
  return donnees;
}

// Express 4 sait poser un cookie mais pas en lire un : cookie-parser ferait une dépendance
// de plus pour quatre lignes, et la section 2 demande de ne pas en ajouter sans raison.
export function lireCookie(req, nom) {
  const entete = req.headers?.cookie;
  if (!entete) return null;
  for (const morceau of entete.split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0 && morceau.slice(0, i).trim() === nom) {
      // Un cookie malformé (« % » seul) fait jeter decodeURIComponent. Sans ce filet, une requête
      // anonyme sur /api/mod arrêtait le serveur (audit/09-revue-code.md, C2). Un cookie qu'on ne
      // sait pas lire est un cookie absent.
      try { return decodeURIComponent(morceau.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// secure dépend de l'environnement : en production le cookie ne doit voyager qu'en HTTPS, mais
// un navigateur refuse un cookie Secure posé en http — le mode développement serait inutilisable.
const base = () => ({ httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/' });
export const optionsCookie = (maxAgeSec) => ({ ...base(), maxAge: maxAgeSec * 1000 });
// Effacer un cookie, c'est le reposer avec les mêmes attributs et une date passée : un chemin
// ou un sameSite différent laisserait l'ancien en place, et la session survivrait.
export const effacerCookie = (res, nom) => res.clearCookie(nom, base());
