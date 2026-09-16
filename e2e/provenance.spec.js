// La provenance, dans un vrai navigateur — parce que le piège était dans l'ordre du démarrage.
//
// `tg.launchParams()` était lu **après** le premier appel à /api/me. La toute première ouverture,
// celle qui porte justement le lien de diffusion, partait donc sans sa source, et un test serveur
// ne pouvait pas le voir : il appelle /me avec le paramètre, il le trouve, il est content.
//
// Ici on ouvre l'app comme le ferait le lien, et on regarde ce que le navigateur envoie vraiment.
import { test, expect } from '@playwright/test';
import { ouvrir, titre, nouvelIdentifiant } from './aides.js';

test("la source part dès la toute première ouverture, celle qui porte le lien", async ({ page }) => {
  const id = nouvelIdentifiant();
  const appels = [];
  page.on('request', (r) => { if (r.url().includes('/api/me')) appels.push(r.url()); });

  await page.goto(`/?dev_user=${id}&ref=campus`);
  await expect(titre(page)).toBeVisible();

  expect(appels.length).toBeGreaterThan(0);
  expect(appels[0]).toContain('source=campus');
});

test("elle est dépensée : la deuxième ouverture ne la renvoie pas", async ({ page }) => {
  const id = nouvelIdentifiant();
  await page.goto(`/?dev_user=${id}&ref=whatsapp`);
  await expect(titre(page)).toBeVisible();

  const appels = [];
  page.on('request', (r) => { if (r.url().includes('/api/me')) appels.push(r.url()); });

  // Sans le paramètre, cette fois : c'est l'ouverture ordinaire d'un compte déjà arrivé.
  await ouvrir(page, id);
  expect(appels.length).toBeGreaterThan(0);
  for (const u of appels) expect(u).not.toContain('source=');
});

test("un mot hors liste ne compose pas l'adresse", async ({ page }) => {
  const id = nouvelIdentifiant();
  const appels = [];
  page.on('request', (r) => { if (r.url().includes('/api/me')) appels.push(r.url()); });

  // La forme est bornée côté navigateur, la liste fermée côté serveur. Ni l'un ni l'autre ne doit
  // laisser un espace, un accent ou une ponctuation entrer dans une adresse d'API.
  await page.goto(`/?dev_user=${id}&ref=${encodeURIComponent('campus de Ngoa')}`);
  await expect(titre(page)).toBeVisible();

  expect(appels.length).toBeGreaterThan(0);
  for (const u of appels) expect(u).not.toContain('source=');
});
