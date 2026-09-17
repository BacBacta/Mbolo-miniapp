// Rend la vidéo : `npm run video`.
//
// Deux temps. D'abord captures.mjs photographie les vrais écrans de l'app (sauf --sans-captures,
// pour retoucher le montage sans relancer le serveur). Puis video.html est ouvert dans Chromium à
// 540 × 960 en ×2, et chaque image est demandée à l'instant voulu — rendre(t) place toutes les
// animations à t — puis envoyée à ffmpeg sans passer par le disque. Trente images par seconde,
// H.264, le format que Telegram lit partout, en ligne et en story.
//
// ffmpeg n'est pas une dépendance du projet : il se cherche sur la machine (FFMPEG, puis le
// PATH). Sous Windows : `winget install Gyan.FFmpeg`, puis rouvrir le terminal.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const IPS = 30;
const SORTIE = path.join(ICI, 'odo-presentation.mp4');
const AFFICHE = path.join(ICI, 'affiche.jpg');
const args = process.argv.slice(2);

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error(`ffmpeg introuvable (${ffmpeg}). Installe-le, ou donne son chemin dans FFMPEG.`);
  process.exit(1);
}

if (!args.includes('--sans-captures')) {
  const r = spawnSync(process.execPath, [path.join(ICI, 'captures.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
// La bande-son : synthétisée par son.mjs, ou fournie par --son=chemin (mp3, m4a, wav).
const sonFourni = args.find((a) => a.startsWith('--son='))?.split('=')[1];
const SON = sonFourni ? path.resolve(sonFourni) : path.join(ICI, 'son.wav');
if (!sonFourni) {
  const r = spawnSync(process.execPath, [path.join(ICI, 'son.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
for (const f of ['verification', 'decouvrir', 'match', 'bloque']) {
  if (!fs.existsSync(path.join(ICI, 'captures', `${f}.png`))) { console.error(`capture manquante : ${f}.png`); process.exit(1); }
}

const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`file://${ICI}/video.html`);
// Le nom de l'app est posé au rendu, depuis APP_NAME (règle 12).
await page.evaluate((nom) => { document.querySelectorAll('.titre').forEach((e) => { if (e.textContent.includes('__APP_NAME__')) e.textContent = e.textContent.replaceAll('__APP_NAME__', nom); }); }, process.env.APP_NAME || 'Odo');
await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))]));
const duree = await page.evaluate(() => window.DUREE);
const images = Math.round((duree / 1000) * IPS);
// Une image seule, pour vérifier une scène : --image=12.5 (en secondes).
const seule = args.find((a) => a.startsWith('--image='));
if (seule) {
  await page.evaluate((t) => window.rendre(t), Number(seule.split('=')[1]) * 1000);
  const out = path.join(ICI, 'image.png');
  await page.screenshot({ path: out });
  console.log(out);
  await navigateur.close();
  process.exit(0);
}

const enc = spawn(ffmpeg, [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(IPS), '-i', '-',
  '-i', SON,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
  // AAC à 256 kb/s (moins d'overshoot sur les crêtes), et la piste la plus courte des deux borne la vidéo : un son plus long
  // que les images ne laisserait pas un écran noir derrière.
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest',
  '-movflags', '+faststart', '-r', String(IPS), SORTIE,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const fini = new Promise((res, rej) => enc.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg : code ${code}`)))));

const t0 = Date.now();
for (let i = 0; i < images; i++) {
  await page.evaluate((t) => window.rendre(t), (i * 1000) / IPS);
  // JPEG à 96 pour la capture : le PNG coûtait trois fois plus cher à encoder, pour une différence
  // que le H.264 efface derrière.
  const image = await page.screenshot({ type: 'jpeg', quality: 96 });
  if (!enc.stdin.write(image)) await new Promise((r) => enc.stdin.once('drain', r));
  // L'affiche : l'image de fin, pour la vignette du message Telegram.
  if (i === Math.round(((duree - 2200) / 1000) * IPS)) await page.screenshot({ path: AFFICHE, type: 'jpeg', quality: 92 });
  if (i % IPS === 0) process.stdout.write(`\r${Math.round(i / IPS)} s / ${Math.round(duree / 1000)} s`);
}
enc.stdin.end();
await fini;
await navigateur.close();
const mo = (fs.statSync(SORTIE).size / 1e6).toFixed(1);
console.log(`\n${SORTIE} : ${images} images, ${mo} Mo, rendu en ${Math.round((Date.now() - t0) / 1000)} s`);
