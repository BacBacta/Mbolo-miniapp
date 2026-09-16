import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import QRCode from 'qrcode';
import { config, venues, secretsPartages, genreAuChoix, entreeLibre } from './config.js';
import { codeDuLieu } from './lieux.js';
import { store, modeStockage, pret } from './store.js';
import { api } from './routes.js';
import { setupBot, startBot, retirerSelfieDuGroupe } from './bot.js';
import { modApi, commandesModeration, creerPageModeration } from './moderation.js';
import { seedDemo } from './seed.js';
import { assetVersion, versionImports } from './assets.js';
import { precompresser, compresserJson } from './compression.js';
import { poserLeFilet } from './promesses.js';

// Avant tout le reste : une promesse rejetée sans filet doit finir dans le journal, pas arrêter
// l'app pour tout le monde (audit/09-revue-code.md, C1, C2, C5).
poserLeFilet();

// La vérification par selfie est la première promesse de l'app : « tous les profils sont vérifiés ».
// Deux réglages peuvent la vider de son sens en production. AUTO_APPROVE valide sans que personne
// regarde — il ne s'applique plus ici, config.js l'éteint. L'absence d'ADMIN_CHAT_ID, elle, ne
// s'arrange pas toute seule : les selfies ne partent nulle part, aucun modérateur ne peut trancher,
// et tout le monde reste en attente pour toujours. Mieux vaut ne pas démarrer que mentir aux
// membres ou les laisser bloqués sans le dire.
if (config.isProd && !config.adminChatId) {
  console.error([
    `ADMIN_CHAT_ID manquant alors que NODE_ENV vaut production. ${config.appName} ne démarre pas.`,
    '',
    "Sans lui, aucun selfie ne part en modération : personne ne peut être vérifié, et personne",
    "ne peut accéder aux rencontres. L'app promet que tous les profils sont vérifiés.",
    '',
    'À faire : crée un groupe Telegram, ajoute-y ton bot, envoie /id dans le groupe, puis mets',
    "la valeur obtenue dans ADMIN_CHAT_ID (secret de l'hébergeur ou du dépôt).",
  ].join('\n'));
  process.exit(1);
}

// Deux secrets qui portent la même valeur : la sécurité du plus sensible tombe à celle du plus
// exposé. Le cas s'est produit ici — ADMIN_KEY, WEB_SESSION_SECRET et BACKUP_SECRET partageaient
// une chaîne, et ADMIN_KEY voyage dans le chemin du webhook Telegram, donc dans les journaux de
// requêtes, alors que BACKUP_SECRET déchiffre tous les profils et tous les messages.
//
// Hors production, on le dit sans bloquer : un .env de développement recopié à la va-vite ne met
// personne en danger, et refuser de démarrer ferait perdre du temps sans rien protéger.
const partages = secretsPartages();
if (partages.length) {
  const groupes = partages.map((noms) => `  ${noms.join(', ')}`).join('\n');
  if (config.isProd) {
    console.error([
      `Des secrets partagent la même valeur alors que NODE_ENV vaut production. ${config.appName} ne démarre pas.`,
      '',
      groupes,
      '',
      "Chacun protège autre chose, et ils ne s'exposent pas de la même façon : ADMIN_KEY voyage",
      'dans des URL — celles des QR des lieux — tandis que BACKUP_SECRET',
      'ouvre les sauvegardes, donc tous les profils et tous les messages. Une adresse aperçue dans',
      'un journal suffirait alors à tout déchiffrer.',
      '',
      "Ils n'ont pas non plus la même durée de vie : WEB_SESSION_SECRET peut changer souvent, ça ne",
      "coûte qu'une reconnexion ; BACKUP_SECRET ne se change jamais sans garder l'ancien, sous",
      'peine de rendre illisibles toutes les copies déjà écrites.',
      '',
      "À faire : donne à chacun sa propre valeur, et garde l'ancienne de BACKUP_SECRET ailleurs",
      'avant de la remplacer.',
      'Sous PowerShell : [Convert]::ToHexString((1..32 | %{ Get-Random -Max 256 }))',
    ].join('\n'));
    process.exit(1);
  }
  console.warn(`Attention : des secrets partagent la même valeur —\n${groupes}\nEn production, le serveur refuserait de démarrer.`);
}

// Même raisonnement, pour les codes des lieux partenaires. Sans VENUE_SECRET, le secret est tiré
// au hasard à chaque démarrage : les QR imprimés et posés sur les tables cesseraient de marcher à
// chaque déploiement, et personne ne pourrait plus confirmer son arrivée. La garde ne se déclenche
// que s'il y a au moins un lieu — aujourd'hui la liste est vide, donc rien ne change.
if (config.isProd && venues.length && !config.venueSecret) {
  console.error([
    `VENUE_SECRET manquant alors que ${venues.length} lieu(x) partenaire(s) sont configurés. ${config.appName} ne démarre pas.`,
    '',
    "Sans lui, le code de chaque QR est tiré au hasard au démarrage : les feuilles déjà posées",
    'sur les tables ne seraient plus reconnues, et aucune arrivée ne pourrait être confirmée.',
    '',
    'À faire : génère un secret et mets-le dans VENUE_SECRET (secret de l\'hébergeur), puis',
    'réimprime les QR depuis /qr/<lieu>.png?key=ADMIN_KEY.',
    'Sous PowerShell : [Convert]::ToHexString((1..32 | %{ Get-Random -Max 256 }))',
  ].join('\n'));
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
// Trois mégaoctets ne servent qu'aux images : le selfie, les photos, et le profil des vieux
// clients qui joignaient la photo. Partout ailleurs, 64 Ko suffisent — et une requête anonyme
// ne peut plus faire lire trois mégaoctets par le serveur avant tout contrôle.
app.use(['/api/me/verification', '/api/me/photos', '/api/me/profile'], express.json({ limit: '3mb' }));
app.use(express.json({ limit: '64kb' }));

// En-têtes de sécurité. La politique de sécurité de contenu dit d'où chaque chose peut venir :
// les scripts du serveur et du SDK Telegram, rien en ligne — toute l'interface passe par
// innerHTML, et le jour où un champ échappe à esc(), un script injecté ne doit rien pouvoir
// exécuter ni envoyer (audit/09-revue-code.md, I8). Les styles en ligne restent permis : l'app
// en pose neuf, tous fixes, et un style ne lit pas initData. frame-ancestors autorise Telegram Web.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
].join('; ');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP,
    // Les navigateurs ne doivent plus essayer http : l'hébergeur termine le TLS, l'en-tête, lui,
    // vient d'ici. Hors production, rien — un cookie ou une page en http local resterait utilisable.
    ...(config.isProd ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}),
  });
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));
// Avant /api : la modération a sa propre porte (cookie signé, administrateur du groupe vérifié
// auprès de Telegram) et ne passe donc pas par requireAuth, qui n'accepte que des initData.
app.use('/api/mod', compresserJson, modApi);
app.use('/api', compresserJson, api);
app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route inconnue.' }));

// QR codes à imprimer pour les lieux partenaires : /qr/palmier.png?key=ADMIN_KEY
app.get('/qr/:venueId.png', async (req, res) => {
  const venue = venues.find((v) => v.id === req.params.venueId);
  const cle = String(req.query.key || '');
  const cleOk = !!config.adminKey && cle.length === config.adminKey.length && crypto.timingSafeEqual(Buffer.from(cle), Buffer.from(config.adminKey));
  if (!cleOk || !venue) return res.status(404).end();
  res.type('png').send(await QRCode.toBuffer(codeDuLieu(venue.id), { width: 600, margin: 2 }));
});

// Empreinte du contenu des fichiers du navigateur, calculée une fois au démarrage
const assetV = assetVersion(config.publicDir);
// app.js est servi à part : ses imports de tg.js et ui.js reçoivent la même empreinte
const appJs = versionImports(fs.readFileSync(path.join(config.publicDir, 'app.js'), 'utf8'), assetV);
const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';

// La page d'accueil reçoit le nom de l'app (APP_NAME) et l'empreinte avant d'être envoyée
const indexHtml = fs.readFileSync(path.join(config.publicDir, 'index.html'), 'utf8').replaceAll('__ASSET_V__', assetV);
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Le nom de l'app est fixe pendant toute l'exécution : la page finale est compressée une fois.
const envoyerIndex = precompresser(indexHtml.replaceAll('__APP_NAME__', escapeHtml(config.appName)), 'html', NO_CACHE);
const renderIndex = (req, res) => envoyerIndex(req, res);
app.get('/', renderIndex);
// Avant le catch-all : sans cette route, /moderation servirait la mini app.
app.get('/moderation', creerPageModeration(assetV));
app.get('/app.js', precompresser(appJs, 'js', IMMUTABLE));

// Pages publiques : lisibles sans compte, hors de Telegram, et sans JavaScript. Elles vivent
// dans server/legal/ et non dans public/ parce qu'elles portent __APP_NAME__ : servies en
// fichiers statiques, elles montreraient le gabarit au lieu du nom. Même traitement que
// l'accueil — nom injecté, empreinte des fichiers, compression une fois au démarrage.
// Ces pages décrivent ce que le serveur fait, et il ne fait pas la même chose partout : sous la
// politique par défaut, personne ne dit quel genre il cherche en relation sérieuse, donc rien de
// l'orientation de personne n'existe ; sous une politique levée, ce choix est demandé, et une
// page qui promettrait le contraire mentirait. Les deux versions vivent donc dans le fichier,
// entre marqueurs, et c'est `genreAuChoix()` qui décide laquelle part — jamais les deux.
// La vérification suit la même mécanique : sous « gate » les pages promettent qu'on ne voit
// personne avant d'être vérifié, sous « badge » cette phrase est fausse et une autre la remplace.
const bloc = (html, nom, garder) => {
  const jeter = garder === 'OUVERT' ? 'FERME' : 'OUVERT';
  return html
    .replaceAll(new RegExp(`<!--SI_${nom}_${jeter}-->[\\s\\S]*?<!--/SI_${nom}_${jeter}-->`, 'g'), '')
    .replaceAll(`<!--SI_${nom}_${garder}-->`, '')
    .replaceAll(`<!--/SI_${nom}_${garder}-->`, '');
};
const selonLaPolitique = (html) => bloc(
  bloc(html, 'GENRE', genreAuChoix() ? 'OUVERT' : 'FERME'),
  'VERIF', entreeLibre() ? 'OUVERT' : 'FERME',
);

const PAGES_PUBLIQUES = { '/confidentialite': 'confidentialite.html', '/conditions': 'conditions.html' };
for (const [route, fichier] of Object.entries(PAGES_PUBLIQUES)) {
  const source = selonLaPolitique(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'legal', fichier), 'utf8'))
    .replaceAll('__ASSET_V__', assetV)
    .replaceAll('__APP_NAME__', escapeHtml(config.appName));
  app.get(route, precompresser(source, 'html', NO_CACHE));
}

// Les autres fichiers du navigateur sont compressés une fois au démarrage. Sans cela, styles.css
// partait en 39 651 octets bruts à chaque premier chargement, sur un forfait data compté.
const FICHIERS_COMPRESSES = { 'styles.css': 'css', 'tg.js': 'js', 'ui.js': 'js', 'i18n.js': 'js', 'scheme.js': 'js', 'i18n/en.js': 'js', 'i18n/ru.js': 'js', 'i18n/uk.js': 'js' };
for (const [nom, type] of Object.entries(FICHIERS_COMPRESSES)) {
  const chemin = path.join(config.publicDir, nom);
  if (!fs.existsSync(chemin)) continue;
  const source = nom.endsWith('.js') ? versionImports(fs.readFileSync(chemin, 'utf8'), assetV) : fs.readFileSync(chemin, 'utf8');
  app.get(`/${nom}`, precompresser(source, type, IMMUTABLE));
}
// Le visuel de partage en story est le seul fichier du navigateur dont l'adresse **ne porte pas
// d'empreinte** : c'est Telegram qui va la chercher, depuis un client qu'on ne contrôle pas, et
// une adresse à rallonge dans un partage se recopie mal. Il ne peut donc pas être `immutable`
// comme le reste : APP_NAME est dessiné dessus, et un renommage laisserait l'ancien nom circuler
// pendant un an. Une journée suffit à éviter de le retransférer à chaque partage.
app.get('/story.jpg', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(config.publicDir, 'story.jpg'));
});

// Les adresses portent une empreinte du contenu (?v=), donc le navigateur peut les garder
// longtemps : une nouvelle version change l'adresse. index.html, lui, n'est jamais versionné.
app.use(express.static(config.publicDir, {
  index: false,
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, file) => { if (file.endsWith('index.html')) res.set('Cache-Control', 'no-cache'); },
}));
app.get('*', renderIndex);

app.use((err, req, res, next) => {
  // Jamais l'objet entier : sur un JSON malformé, body-parser y attache le corps brut — un
  // selfie, un message — et le journal de l'hébergeur le garderait.
  console.error(`${err.type || err.name || 'Erreur'} ${err.status || ''} ${err.message || ''}`.trim(), err.type ? '' : err.stack || '');
  if (err.type === 'entity.too.large') return res.status(413).json({ code: 'TOO_LARGE', message: 'Image trop lourde.' });
  res.status(500).json({ code: 'SERVER_ERROR', message: 'Un problème est survenu. Réessaie dans un instant.' });
});

if (config.seedDemo) seedDemo().catch((e) => console.error('Profils de démonstration non chargés :', e.message));
setupBot();
commandesModeration();

// Un selfie qu'aucun modérateur n'a tranché ne doit pas rester sur le disque indéfiniment.
// Balayage au démarrage puis toutes les six heures.
const purger = async () => {
  try {
    await purgerVraiment();
  } catch (e) {
    // Une base injoignable à l'heure du balayage ne doit pas coucher le serveur : on réessaie
    // dans six heures, et la requête suivante dira si la base est vraiment partie.
    console.error(`Balayage impossible, prochain essai dans six heures : ${e.message}`);
  }
};
const purgerVraiment = async () => {
  const purges = await store.purgerVerificationsOubliees(config.verificationTtlMs);
  // Le disque ne suffit pas : la photo était aussi dans le groupe, avec un bouton « Valider »
  // encore vivant (audit/09-revue-code.md, I5).
  for (const p of purges) await retirerSelfieDuGroupe(p.verifMessageId, `Selfie jamais tranché en ${Math.round(config.verificationTtlMs / 86400000)} jours (ID ${p.id}) : retiré, la personne pourra recommencer.`);
  if (purges.length) console.warn(`${purges.length} vérification(s) jamais tranchée(s) purgée(s) : selfies supprimés, du disque et du groupe, comptes remis en attente de vérification.`);
  // Même balayage pour les événements de mesure : une durée de conservation qu'on annonce sans
  // l'appliquer ne vaut rien. À 0, purgerEvenements ne fait rien — et rien n'a été écrit non plus.
  const e = await store.purgerEvenements();
  if (e) console.log(`${e} événement(s) de mesure purgé(s) : au-delà de ${config.eventsRetentionDays} jours.`);
  // Les compteurs de limitation de débit vivent désormais dans le stockage, pour que deux
  // instances comptent ensemble. Sans purge, ils y laisseraient une ligne par compte et par
  // action, pour toujours.
  await store.purgerLimites();
  await store.purgerPresence();
};
await purger();
setInterval(purger, 6 * 3600 * 1000).unref();

// Arrêt propre : l'hébergeur arrête la machine dès qu'elle est inactive, et Node sortait aussitôt.
// Le fichier JSON perdait sa dernière écriture différée, et PostgreSQL gardait des connexions
// mortes. On ferme le serveur, on vide ce qui attend, on rend les connexions — dix secondes au plus.
let serveur = null;
function arreter(signal) {
  console.log(`${signal} reçu : arrêt propre.`);
  serveur?.close();
  Promise.resolve(store.arreter?.()).catch(() => {}).finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));

serveur = app.listen(config.port, async () => {
  console.log(`${config.appName} écoute sur le port ${config.port}`);
  // Savoir où vont les données est la première question quand quelque chose ne va pas en production.
  console.log(modeStockage === 'postgres'
    ? `Stockage : PostgreSQL${config.databaseSchema ? ` (schéma ${config.databaseSchema})` : ''}, ${pret.total} migration(s) au total, ${pret.appliquees} appliquée(s) au démarrage.`
    : `Stockage : fichier JSON dans ${config.dataDir}. Une seule instance, aucune sauvegarde automatique : définis DATABASE_URL pour passer à PostgreSQL.`);
  // En production, un fichier unique sans sauvegarde n'est plus seulement un inconfort : il porte
  // désormais des horodatages d'entonnoir et des événements de mesure, et ceux-là ne se
  // reconstituent pas. Le serveur démarre quand même — refuser casserait une production qui
  // tourne — mais il le dit à chaque démarrage, là où l'exploitant regarde.
  if (config.isProd && modeStockage !== 'postgres') {
    console.warn([
      'Attention : en production sur un fichier JSON.',
      "Une seule machine possible, aucune sauvegarde automatique, et si le volume est perdu tout l'est —",
      'y compris les chiffres de la mesure, qui ne se reconstituent pas.',
      'À faire : créer une base, poser DATABASE_URL, puis « node scripts/import-json.js ». Voir DEPLOIEMENT.md.',
    ].join('\n'));
  }
  if (!config.webAppUrl) console.warn('WEBAPP_URL absent : les boutons du bot ne pourront pas ouvrir la mini app.');
  if (config.allowDevAuth) console.warn('ALLOW_DEV_AUTH actif : réservé au développement.');
  try {
    await startBot(app);
  } catch (e) {
    console.error('Démarrage du bot impossible :', e.message);
  }
});
