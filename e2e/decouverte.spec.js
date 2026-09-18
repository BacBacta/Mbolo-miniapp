// La découverte photo d'abord (audit/15, lot 1) : la carte remplit l'écran, la fiche s'ouvre d'un
// appui, les gestes sont trois boutons ronds — et « revenir » remet la carte qu'on vient de
// passer. Le mode Liste sans pass ouvre une feuille, pas un écran.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet } from './aides.js';

test('la carte remplit l\'écran, la fiche s\'ouvre au chevron, et revenir remet la carte passée', async ({ page }) => {
  await membreVerifie(page, 'Awa');
  await onglet(page, /Découvrir/).click();
  const carte = page.locator('.deck .card.top');
  await expect(carte).toBeVisible();
  // Pas de corps sous le pli : la question est sur la photo, et la carte tient dans la fenêtre.
  await expect(carte.locator('.card-body')).toHaveCount(0);
  await expect(carte.locator('.overlay .apercu')).toBeVisible();
  const boite = await carte.boundingBox();
  const fenetre = page.viewportSize();
  expect(boite.y + boite.height).toBeLessThanOrEqual(fenetre.height);
  const nom = (await carte.locator('.overlay .name').innerText()).split('\n')[0].trim();

  // Le chevron ouvre la fiche entière, avec son corps ; le retour revient au paquet.
  await carte.locator('.fiche-btn').click();
  await expect(page.locator('main .card .card-body')).toBeVisible();
  await expect(page.locator('main')).toContainText(nom);
  await page.locator('.devback').click();
  await expect(page.locator('.deck .card.top')).toBeVisible();

  // Passer avec le bouton rond : la carte suivante arrive, et « revenir » s'allume.
  await expect(page.locator('.deck-actions .retour')).toBeDisabled();
  await page.locator('.deck-actions .passer').click();
  await expect(page.locator('.deck .card.top .overlay .name')).not.toContainText(nom);
  await expect(page.locator('.deck-actions .retour')).toBeEnabled();
  await page.locator('.deck-actions .retour').click();
  await expect(page.locator('.deck .card.top .overlay .name')).toContainText(nom);
  await expect(page.locator('.deck-actions .retour')).toBeDisabled();
});

test('sans pass, le mode Liste ouvre une feuille, et le pass seulement si on le demande', async ({ page }) => {
  await membreVerifie(page, 'Bana');
  await onglet(page, /Découvrir/).click();
  await expect(page.locator('.deck .card.top')).toBeVisible();
  await page.locator('[data-action="mode"][data-mode="list"]').click();
  const feuille = page.locator('#feuille');
  await expect(feuille).toBeVisible();
  await expect(feuille).toContainText(/vue Liste/);
  // La carte est toujours là derrière : rien n'a navigué.
  await expect(page.locator('.deck .card.top')).toBeVisible();
  await feuille.locator('[data-feuille="non"]').click();
  await expect(feuille).toHaveCount(0);
  await page.locator('[data-action="mode"][data-mode="list"]').click();
  await page.locator('#feuille [data-feuille="pass"]').click();
  await expect(page.locator('main')).toContainText(/Odo Plus|Plus/);
  await expect(page.locator('.offre').first()).toBeVisible();
});
