// Les écrans de la vidéo : de vraies captures de l'app, pas des maquettes.
//
// Le serveur est lancé en mode développement, comme pour les tests de bout en bout : `?dev_user=`
// remplace Telegram, le selfie est validé seul, les profils de démonstration peuplent la
// découverte. Rien de tout ça n'existe en production. Le parcours est celui d'une vraie
// personne : créer un profil, se faire vérifier, aimer, matcher, écrire — et tenter une demande
// d'argent, pour montrer qu'elle est bloquée.
//
// Sortie : identite/video/captures/*.png, à la densité d'un téléphone (×3). Ces fichiers ne sont
// pas versionnés : ils se refont avec `npm run video`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..', '..');
const SORTIE = path.join(ICI, 'captures');
const PORT = Number(process.env.VIDEO_PORT || 3311);
const BASE = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SORTIE, { recursive: true });

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'odo-video-'));
const serveur = spawn(process.execPath, ['server/index.js'], {
  cwd: RACINE,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    NODE_ENV: 'development', BOT_TOKEN: '123456:VIDEO_TOKEN', WEBAPP_URL: BASE,
    ALLOW_DEV_AUTH: 'true', AUTO_APPROVE: 'true', SEED_DEMO: 'true', USE_WEBHOOK: 'false',
    ADMIN_CHAT_ID: '', DATABASE_URL: '', RATE_LIMIT: 'false',
    DEMO_REPLY_DELAY_MS: '400', DEMO_LIKE_DELAY_MS: '400',
  },
});
for (let i = 0; i < 100; i++) {
  if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, 800)); // les profils de démonstration finissent de se poser

// Les portraits : identite/video/photos/femme-1.jpg, homme-1.jpg, femme-2.jpg… Chaque fichier
// remplace la première photo d'un profil de démonstration du même genre, dans l'ordre où
// l'app les montre, et la vidéo porte alors de vrais visages. Sans ce dossier, les images de
// démonstration (dégradé et initiale) restent. Ces photos ne sont pas versionnées : elles
// doivent venir de personnes qui ont accepté d'illustrer une app de rencontres, ou d'un
// générateur d'images — jamais d'une banque d'images de vraies personnes.
const PHOTOS = path.join(ICI, 'photos');
if (fs.existsSync(PHOTOS)) {
  const { DEMO } = await import(path.join(RACINE, 'server', 'seed.js'));
  const uploads = path.join(DATA_DIR, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  const fournies = { femme: [], homme: [] };
  for (const f of fs.readdirSync(PHOTOS).sort()) { const m = /^(femme|homme)-\d+\.(jpe?g)$/i.exec(f); if (m) fournies[m[1].toLowerCase()].push(path.join(PHOTOS, f)); }
  const compte = { femme: 0, homme: 0 };
  for (const d of DEMO) {
    const liste = fournies[d.gender] || [];
    if (!liste.length || !d.photos) continue;
    fs.copyFileSync(liste[compte[d.gender] % liste.length], path.join(uploads, `${d.id}-photo-1.jpg`));
    for (const n of [1, 2, 3]) { const mini = path.join(uploads, `${d.id}-photo-${n}-mini.jpg`); if (fs.existsSync(mini)) fs.unlinkSync(mini); }
    compte[d.gender]++;
  }
  console.log(`portraits : ${compte.femme} femme(s), ${compte.homme} homme(s)`);
}

const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({
  ...devices['Pixel 5'], deviceScaleFactor: 3, colorScheme: 'dark',
  timezoneId: 'Africa/Douala', locale: 'fr-FR', baseURL: BASE,
});
const page = await ctx.newPage();
// Google Fonts n'est pas forcément joignable d'où tourne le script : les polices viennent des
// fichiers d'identite/source/fonts, servis sous les mêmes adresses pour que la CSP les accepte.
const POLICES = path.join(ICI, '..', 'source', 'fonts');
await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
  contentType: 'text/css',
  body: fs.readFileSync(path.join(POLICES, 'local2.css'), 'utf8').replaceAll('url(', 'url(https://fonts.gstatic.com/local/'),
}));
await page.route('https://fonts.gstatic.com/local/*', (route) => route.fulfill({
  contentType: 'font/woff2', body: fs.readFileSync(path.join(POLICES, path.basename(new URL(route.request().url()).pathname))),
}));
const principal = page.locator('#fallback-bar button.main');
const secondaire = page.locator('#fallback-bar button.secondary');
const titre = page.locator('main h1, main h2').first();
const onglet = (nom) => page.locator('#tabs button, #tabs a', { hasText: nom });
const capture = async (nom) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(SORTIE, `${nom}.png`) });
  console.log(`capture : ${nom}`);
};
const attendre = (loc, options) => loc.waitFor({ state: 'visible', ...options });
// Le plus petit JPEG valide : le serveur regarde l'en-tête, la décision est automatique ici.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

try {
  await page.goto(`/?dev_user=video-${Date.now().toString(36)}`);
  await attendre(titre);
  // Deux retouches de tournage, et rien d'autre : le compte de développement s'appelle
  // « Testeur », et les profils de démonstration portent une pastille « démo » — vraie dans
  // l'app, mais une vidéo montre le produit, pas le mode de test.
  await page.addStyleTag({ content: '.tag-demo { display: none !important; }' });
  await page.evaluate((mot) => { const e = document.querySelector('main .eyebrow'); if (e) e.textContent = mot; }, 'Bienvenue');
  await capture('accueil');

  // Le profil, en trois écrans.
  await principal.click();
  await attendre(page.locator('input[name=name]'));
  await page.locator('input[name=name]').fill('Nadia');
  await page.locator('input[name=age]').fill('24');
  await page.locator('main button', { hasText: /Femme/ }).first().click();
  await principal.click();
  await attendre(page.locator('input[name=city]'));
  await page.locator('main button', { hasText: /Relation sérieuse/ }).first().click();
  await page.locator('input[name=city]').fill('Yaoundé');
  await page.locator('input[name=area]').fill('Bastos');
  await principal.click();
  await attendre(page.locator('input[name=promptA]'));
  await page.locator('input[name=promptA]').fill('Un café à Bastos, le samedi matin');
  await page.locator('input[name=languages]').fill('Français, anglais');
  await principal.click();

  // La jauge de confiance s'explique une fois, puis le selfie.
  const suite = page.locator('main h1', { hasText: /jauge de confiance|Vérifie que c'est bien toi/ });
  await attendre(suite);
  if (/jauge/i.test((await suite.textContent()) || '')) await principal.click();
  await page.locator('input[type=file][name=selfie]').waitFor({ state: 'attached' });
  await capture('verification');
  await page.locator('input[type=file][name=selfie]').setInputFiles({ name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await principal.click();
  // La décision automatique tombe après trois secondes, puis la présentation vocale est proposée.
  const voix = page.locator('main h1', { hasText: /présentation vocale/i });
  await Promise.race([attendre(voix, { timeout: 25_000 }).catch(() => {}), attendre(onglet(/Découvrir/), { timeout: 25_000 }).catch(() => {})]);
  if (await voix.isVisible()) await secondaire.click();
  await attendre(onglet(/Découvrir/), { timeout: 25_000 });

  // Le paquet : la carte du dessus porte le bouclier d'un profil vérifié.
  await onglet(/Découvrir/).click();
  await attendre(page.locator('.card.top'));
  await attendre(page.locator('.card.top .card-photo img').first(), { timeout: 15_000 }).catch(() => {});
  await capture('decouvrir');

  // Un « J'aime » sur un profil de démonstration est rendu : le match est immédiat.
  await principal.click();
  await page.locator('main', { hasText: /C'est un match/i }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  await capture('match');

  // La discussion, vide : la carte d'ouverture et ses amorces.
  await page.locator('#fallback-bar button', { hasText: /Écrire à/ }).first().click();
  await attendre(page.locator('#messages'));
  await attendre(page.locator('.ouverture')).catch(() => {});
  await page.waitForTimeout(600);
  await capture('discussion');

  // Une demande d'argent : la bulle part, puis revient dans le champ avec l'explication.
  await page.locator('.composer input[name=message]').fill('Envoie-moi 5 000 F pour le taxi');
  await page.locator('.composer button.send').click();
  await page.waitForTimeout(700);
  await capture('bloque');

  // La fiche de l'autre, depuis l'en-tête.
  await page.locator('.chat-head .head-profil').click();
  await page.waitForTimeout(800);
  await capture('fiche');
} catch (e) {
  await page.screenshot({ path: path.join(SORTIE, 'erreur.png') }).catch(() => {});
  throw e;
} finally {
  await navigateur.close();
  serveur.kill();
}
console.log(`captures dans ${SORTIE}`);
