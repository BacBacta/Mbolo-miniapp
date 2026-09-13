import { chromium } from '@playwright/test';
const D = process.argv[2] || new URL('.', import.meta.url).pathname;
const shots = JSON.parse(process.argv[3] || JSON.stringify([
  ['avatar.html', 1024, 1024, 1, '../odo-photo-1024.png'],
  ['accueil-fr.html', 640, 360, 1, '../odo-accueil-fr-640x360.png'],
  ['accueil-fr.html', 640, 360, 2, '../odo-accueil-fr-1280x720.png'],
  ['accueil-en.html', 640, 360, 1, '../odo-accueil-en-640x360.png'],
  ['accueil-en.html', 640, 360, 2, '../odo-accueil-en-1280x720.png'],
]));
const b = await chromium.launch();
for (const [f, w, h, dpr, out] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.goto(`file://${D}/${f}`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: `${D}/${out}`, type: 'png' });
  await ctx.close();
}
await b.close(); console.log('rendu');
