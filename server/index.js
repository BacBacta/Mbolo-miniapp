import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { config, venues } from './config.js';
import { store, modeStockage, pret } from './store.js';
import { api } from './routes.js';
import { setupBot, startBot } from './bot.js';
import { modApi, commandesModeration, creerPageModeration } from './moderation.js';
import { seedDemo } from './seed.js';
import { assetVersion, versionImports } from './assets.js';
import { precompresser, compresserJson } from './compression.js';

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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));

// En-têtes de sécurité de base. frame-ancestors autorise l'affichage dans Telegram Web.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
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
  if (!config.adminKey || req.query.key !== config.adminKey || !venue) return res.status(404).end();
  res.type('png').send(await QRCode.toBuffer(venue.code, { width: 600, margin: 2 }));
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
const PAGES_PUBLIQUES = { '/confidentialite': 'confidentialite.html', '/conditions': 'conditions.html' };
for (const [route, fichier] of Object.entries(PAGES_PUBLIQUES)) {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'legal', fichier), 'utf8')
    .replaceAll('__ASSET_V__', assetV)
    .replaceAll('__APP_NAME__', escapeHtml(config.appName));
  app.get(route, precompresser(source, 'html', NO_CACHE));
}

// Les autres fichiers du navigateur sont compressés une fois au démarrage. Sans cela, styles.css
// partait en 39 651 octets bruts à chaque premier chargement, sur un forfait data compté.
const FICHIERS_COMPRESSES = { 'styles.css': 'css', 'tg.js': 'js', 'ui.js': 'js', 'i18n.js': 'js', 'i18n/en.js': 'js' };
for (const [nom, type] of Object.entries(FICHIERS_COMPRESSES)) {
  const chemin = path.join(config.publicDir, nom);
  if (!fs.existsSync(chemin)) continue;
  const source = nom.endsWith('.js') ? versionImports(fs.readFileSync(chemin, 'utf8'), assetV) : fs.readFileSync(chemin, 'utf8');
  app.get(`/${nom}`, precompresser(source, type, IMMUTABLE));
}
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
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ code: 'TOO_LARGE', message: 'Image trop lourde.' });
  res.status(500).json({ code: 'SERVER_ERROR', message: 'Un problème est survenu. Réessaie dans un instant.' });
});

if (config.seedDemo) seedDemo().catch((e) => console.error('Profils de démonstration non chargés :', e.message));
setupBot();
commandesModeration();

// Un selfie qu'aucun modérateur n'a tranché ne doit pas rester sur le disque indéfiniment.
// Balayage au démarrage puis toutes les six heures.
const purger = async () => {
  const n = await store.purgerVerificationsOubliees(config.verificationTtlMs);
  if (n) console.warn(`${n} vérification(s) jamais tranchée(s) purgée(s) : selfies supprimés, comptes remis en attente de vérification.`);
  // Même balayage pour les événements de mesure : une durée de conservation qu'on annonce sans
  // l'appliquer ne vaut rien. À 0, purgerEvenements ne fait rien — et rien n'a été écrit non plus.
  const e = await store.purgerEvenements();
  if (e) console.log(`${e} événement(s) de mesure purgé(s) : au-delà de ${config.eventsRetentionDays} jours.`);
};
await purger();
setInterval(purger, 6 * 3600 * 1000).unref();

app.listen(config.port, async () => {
  console.log(`${config.appName} écoute sur le port ${config.port}`);
  // Savoir où vont les données est la première question quand quelque chose ne va pas en production.
  console.log(modeStockage === 'postgres'
    ? `Stockage : PostgreSQL${config.databaseSchema ? ` (schéma ${config.databaseSchema})` : ''}, ${pret.total} migration(s) au total, ${pret.appliquees} appliquée(s) au démarrage.`
    : `Stockage : fichier JSON dans ${config.dataDir}. Une seule instance, aucune sauvegarde automatique : définis DATABASE_URL pour passer à PostgreSQL.`);
  if (!config.webAppUrl) console.warn('WEBAPP_URL absent : les boutons du bot ne pourront pas ouvrir la mini app.');
  if (config.allowDevAuth) console.warn('ALLOW_DEV_AUTH actif : réservé au développement.');
  try {
    await startBot(app);
  } catch (e) {
    console.error('Démarrage du bot impossible :', e.message);
  }
});
