import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { config, venues } from './config.js';
import { api } from './routes.js';
import { setupBot, startBot } from './bot.js';
import { seedDemo } from './seed.js';
import { assetVersion, versionImports } from './assets.js';

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
app.use('/api', api);
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

// La page d'accueil reçoit le nom de l'app (APP_NAME) et l'empreinte avant d'être envoyée
const indexHtml = fs.readFileSync(path.join(config.publicDir, 'index.html'), 'utf8').replaceAll('__ASSET_V__', assetV);
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const renderIndex = (req, res) => res.type('html').set('Cache-Control', 'no-cache').send(indexHtml.replaceAll('__APP_NAME__', escapeHtml(config.appName)));
app.get('/', renderIndex);
app.get('/app.js', (req, res) => res.type('js').set('Cache-Control', IMMUTABLE).send(appJs));
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

if (config.seedDemo) seedDemo();
setupBot();

app.listen(config.port, async () => {
  console.log(`${config.appName} écoute sur le port ${config.port}`);
  if (!config.webAppUrl) console.warn('WEBAPP_URL absent : les boutons du bot ne pourront pas ouvrir la mini app.');
  if (config.allowDevAuth) console.warn('ALLOW_DEV_AUTH actif : réservé au développement.');
  try {
    await startBot(app);
  } catch (e) {
    console.error('Démarrage du bot impossible :', e.message);
  }
});
