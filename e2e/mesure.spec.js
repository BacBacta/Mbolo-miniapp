// L'étape du formulaire : la moitié navigateur de la mesure, que rien d'autre ne couvre.
//
// Le pari du plan est qu'elle ne coûte aucune requête : l'appareil retient l'étape atteinte et la
// joint à la prochaine ouverture, celle qui a lieu de toute façon. Un test serveur ne peut pas le
// prouver — il faudrait qu'il abandonne un formulaire puis revienne, ce qui n'a de sens que dans
// un vrai navigateur.
import { test, expect } from '@playwright/test';
import { ouvrir, actionPrincipale, titre, nouvelIdentifiant } from './aides.js';

test("abandonner le formulaire à l'étape 2, revenir, et l'étape est partie avec l'ouverture", async ({ page }) => {
  const id = nouvelIdentifiant();
  await ouvrir(page, id);
  await actionPrincipale(page).click();

  // On remplit la première étape et on passe à la seconde, puis on s'arrête là.
  await expect(titre(page)).toHaveText(/Fais-toi connaître/);
  await page.locator('input[name=name]').fill('Awa');
  await page.locator('input[name=age]').fill('24');
  await page.locator('main button', { hasText: /Femme/ }).first().click();
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Ce que tu cherches/);

  // On compte les requêtes : le pari est qu'aucune n'a été ajoutée pour dire l'étape.
  const appels = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) appels.push(r.url()); });

  await page.reload();
  await expect(titre(page)).toBeVisible();

  const me = appels.filter((u) => u.includes('/api/me'));
  expect(me.length, "l'ouverture ne fait qu'un appel à /me").toBe(1);
  expect(me[0], "et l'étape voyage dedans, sans requête à elle").toContain('form_step=2');
  expect(appels.filter((u) => u.includes('form_step') && !u.includes('/api/me')).length,
    'aucune requête dédiée à la mesure').toBe(0);
});

test("une fois reçue, l'étape ne repart pas à chaque ouverture", async ({ page }) => {
  const id = nouvelIdentifiant();
  await ouvrir(page, id);
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Fais-toi connaître/);

  await page.reload();
  await expect(titre(page)).toBeVisible();

  const appels = [];
  page.on('request', (r) => { if (r.url().includes('/api/me')) appels.push(r.url()); });
  await page.reload();
  await expect(titre(page)).toBeVisible();

  expect(appels.length).toBe(1);
  expect(appels[0], "l'étape a déjà été dite : elle ne se redit pas").not.toContain('form_step');
});
