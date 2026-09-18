// Deux réglages qu'on ne voit qu'à l'écran : le genre recherché, et la présentation vocale.
//
// Les tests unitaires disent que le filtre trie bien et que le genre n'est pas rangé en
// « Relation sérieuse ». Ils ne disent rien de ce qu'on voit, et c'est précisément le reproche
// d'où vient ce chantier : le choix du genre n'existait nulle part à l'écran, et la présentation
// vocale était la cinquième ligne d'une liste de réglages.
import { test, expect } from '@playwright/test';
import { ouvrir, creerProfil, seFaireVerifier, passerLaJauge, actionPrincipale, actionSecondaire, titre, onglet, nouvelIdentifiant, sonSelfie } from './aides.js';

const ouvrirLesFiltres = async (page) => {
  await onglet(page, /Découvrir/).click();
  await page.locator('[data-action="filters"]').first().click();
  await expect(titre(page)).toHaveText(/Qui veux-tu voir/);
};

test('en amitié, le genre recherché se choisit sur l\'écran des filtres', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Awa', intention: /Amitié/ });
  await seFaireVerifier(page);
  await ouvrirLesFiltres(page);

  const segment = page.locator('.seg-genre');
  await expect(segment).toBeVisible();
  await expect(segment.locator('button')).toHaveText(['Tout le monde', 'Femmes', 'Hommes']);
  await expect(segment.locator('button[aria-pressed="true"]')).toHaveText('Tout le monde');

  // Le choix se voit tout de suite, et survit à l'enregistrement : sinon on ne sait pas s'il a pris.
  await segment.locator('button', { hasText: 'Femmes' }).click();
  await expect(segment.locator('button[aria-pressed="true"]')).toHaveText('Femmes');
  await actionPrincipale(page).click();
  await expect(onglet(page, /Découvrir/)).toBeVisible();
  await ouvrirLesFiltres(page);
  await expect(page.locator('.seg-genre button[aria-pressed="true"]')).toHaveText('Femmes');
});

// En « Relation sérieuse », la mise en relation est déjà décidée (une femme et un homme). Laisser
// choisir y reviendrait à enregistrer l'orientation de chacun — règle 5.2 et MATCH_POLICY. L'écran
// doit donc dire la règle, et surtout ne pas offrir le réglage.
test("en relation sérieuse, l'écran dit la règle au lieu d'offrir le choix", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Bea', intention: /Relation sérieuse/ });
  await seFaireVerifier(page);
  await ouvrirLesFiltres(page);

  await expect(page.locator('.seg-genre')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('main')).toContainText(/met en relation une femme et un homme/);
  await expect(page.locator('main')).toContainText(/tu vois donc des hommes/);
});

// La présentation vocale : elle ne s'intercale plus entre la vérification et le premier visage
// (audit 15, constat A) ; elle attend dans l'onglet Profil, sous la fiche, et l'écran dit le
// geste à faire avant le saut vers le bot.
test("la présentation vocale ne s'impose plus après la vérification, et attend sur la fiche", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Carine' });
  await passerLaJauge(page);
  await page.locator('input[type=file][name=selfie]').setInputFiles(sonSelfie);
  await actionPrincipale(page).click();

  // Droit à la découverte.
  await expect(onglet(page, /Découvrir/)).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('main')).not.toContainText(/Ta présentation vocale/);

  // La fiche garde le chemin, et l'écran dit le geste à faire avant de quitter l'app.
  await onglet(page, /Profil/).click();
  const ligne = page.locator('.list-row[data-screen="voix"]');
  await expect(ligne).toBeVisible();
  await ligne.click();
  await expect(titre(page)).toHaveText(/Ta présentation vocale/);
  await expect(page.locator('main')).toContainText(/Appuie sur le micro/);
  await expect(page.locator('main')).toContainText(/Le micro est dans Telegram/);
  await actionSecondaire(page).click();
  await expect(page.locator('.list-row[data-screen="voix"]')).toBeVisible();
});
