// Le parcours d'entrée tel que la production le sert : VERIFICATION_POLICY=badge (depuis le
// 15 septembre 2026). Ce fichier est le seul lu par le projet « android-badge », contre le second
// serveur de playwright.config.js. Tout le reste de la suite tourne sous « gate ».
import { test, expect } from '@playwright/test';
import { ouvrir, creerProfil, actionPrincipale, titre, onglet, nouvelIdentifiant, sonSelfie } from './aides.js';

// Audit 16, n° 1, 2 et 11 : à la première inscription, l'étape 3 ne vend rien ; l'écran de
// vérification n'a pas de bouton natif « Plus tard » ; et le selfie envoyé mène à Découvrir,
// pas à une salle d'attente.
test("la première inscription ne vend rien, et le selfie envoyé mène droit à Découvrir", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await actionPrincipale(page).click();
  await page.locator('input[name=name]').fill('Ngo');
  await page.locator('input[name=age]').fill('24');
  await page.locator('main button', { hasText: /Femme/ }).first().click();
  await actionPrincipale(page).click();
  await page.locator('main button', { hasText: /Amitié/ }).first().click();
  await page.locator('input[name=city]').fill('Yaoundé');
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Ta touche personnelle/);
  await expect(page.locator('main')).not.toContainText(/questions sur ta fiche/);
  await page.locator('input[name=promptA]').fill('Le marché Mfoundi le samedi matin');
  await actionPrincipale(page).click();

  await expect(titre(page)).toHaveText(/Vérifie que c'est bien toi/);
  await expect(page.locator('#fallback-bar button', { hasText: /Plus tard/ })).toHaveCount(0);
  await expect(page.locator('main button', { hasText: /Plus tard/ })).toBeVisible();
  await page.locator('input[type=file][name=selfie]').setInputFiles(sonSelfie);
  await expect(actionPrincipale(page)).toHaveText(/Envoyer pour vérification/);
  await actionPrincipale(page).click();
  await expect(onglet(page, /Découvrir/)).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('main')).not.toContainText(/Vérification en cours/);
  await expect(page.locator('#toast')).toContainText(/bouclier est sur ta fiche/, { timeout: 25_000 });
});

// Audit 16, n° 2 : l'écran d'attente reste atteignable depuis l'onglet Profil, et sous « badge »
// son bouton principal ouvre la découverte. Et n° 18 : sans lieu partenaire dans la ville,
// l'écran de vérification n'annonce pas le rendez-vous.
test("sans lieu partenaire, la vérification n'annonce pas le rendez-vous ; « Plus tard » mène à Découvrir", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  // Bafoussam : aucun lieu d'exemple n'y est (ils sont à Yaoundé).
  await creerProfil(page, { prenom: 'Ada', ville: 'Bafoussam', quartier: 'Tamdja' });
  await expect(titre(page)).toHaveText(/Vérifie que c'est bien toi/);
  await expect(page.locator('main')).toContainText(/Le bouclier sur ta fiche/);
  await expect(page.locator('main')).not.toContainText(/Proposer un rendez-vous/);
  await page.locator('main button', { hasText: /Plus tard/ }).click();
  await expect(onglet(page, /Découvrir/)).toBeVisible();
  // L'onglet Profil ramène à la vérification, sans badge.
  await onglet(page, /Profil/).click();
  await expect(page.locator('main')).toContainText(/Faire vérifier mon profil/);
});

// Audit 16, n° 6 : sans badge, deux « J'aime » par jour. Le troisième n'appelle pas le serveur,
// il ouvre la feuille du quota — avec « Me faire vérifier » en premier, puisque c'est le chemin
// gratuit. Le ♥ s'éteint, mais reste un bouton. Avant, un toast disait « tu as vu tous tes
// profils », ce qui était faux deux fois.
test("sans badge, le troisième « J'aime » ouvre la feuille du quota au lieu d'un toast", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Bilkis' });
  await page.locator('main button', { hasText: /Plus tard/ }).click();
  await expect(onglet(page, /Découvrir/)).toBeVisible();
  const pastille = page.locator('.dbar .quota-pill');
  await expect(pastille).toHaveText(/2/);
  for (let i = 0; i < 2; i += 1) {
    await page.locator('.deck-actions .like').click();
    // Un profil de démonstration rend le « J'aime » : l'écran de match s'ouvre, on le quitte.
    await expect(page.locator('main')).toContainText(/C'est un match/i, { timeout: 20_000 });
    await page.locator('#fallback-bar button', { hasText: /Plus tard/ }).click();
    await expect(onglet(page, /Découvrir/)).toBeVisible();
  }
  await expect(pastille).toHaveText(/0/);
  const coeur = page.locator('.deck-actions .like');
  await expect(coeur).toHaveClass(/epuise/);
  const appels = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/swipes') && r.method() === 'POST') appels.push(r.url()); });
  await coeur.click();
  const feuille = page.locator('#feuille');
  await expect(feuille).toContainText(/Tes « J'aime » du jour sont partis/);
  await expect(feuille.locator('[data-feuille="verif"]')).toBeVisible();
  expect(appels, 'aucun appel au serveur pour un ♥ à zéro').toEqual([]);
  await feuille.locator('[data-feuille="non"]').click();
  await expect(page.locator('#toast')).not.toContainText(/tous tes profils/);
});
