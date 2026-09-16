import { chromium } from '@playwright/test';
const D = process.argv[2] || new URL('.', import.meta.url).pathname;
const shots = JSON.parse(process.argv[3] || JSON.stringify([
  ['avatar.html', 1024, 1024, 1, '../odo-photo-1024.png'],
  ['accueil-fr.html', 640, 360, 1, '../odo-accueil-fr-640x360.png'],
  ['accueil-fr.html', 640, 360, 2, '../odo-accueil-fr-1280x720.png'],
  ['accueil-en.html', 640, 360, 1, '../odo-accueil-en-640x360.png'],
  ['accueil-en.html', 640, 360, 2, '../odo-accueil-en-1280x720.png'],
  // Le seul visuel qui sorte d'ici vers le navigateur : Telegram réclame une image joignable par
  // son adresse pour un partage en story. 540 × 960 en ×2 donne les 1080 × 1920 attendus.
  ['story.html', 540, 960, 2, '../../public/story.jpg'],
]));
const b = await chromium.launch();
for (const [f, w, h, dpr, out] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.goto(`file://${D}/${f}`);
  // Le nom de l'app n'est pas écrit dans le gabarit (règle 12) : il est posé au rendu, depuis
  // APP_NAME, pour qu'un renommage se rattrape en relançant le script au lieu de se retoucher.
  await p.evaluate((nom) => { document.body.innerHTML = document.body.innerHTML.replaceAll('__APP_NAME__', nom); }, process.env.APP_NAME || 'Odo');
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  // JPEG pour la story : le dégradé et le grain font un PNG d'un mégaoctet, que Telegram irait
  // chercher à chaque partage. Le type suit l'extension, les visuels BotFather restent en PNG.
  const jpeg = out.endsWith('.jpg');
  await p.screenshot({ path: `${D}/${out}`, type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: 92 } : {}) });
  await ctx.close();
}
await b.close(); console.log('rendu');
