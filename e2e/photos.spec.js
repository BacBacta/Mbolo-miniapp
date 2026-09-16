// Les photos se voient partout où une personne apparaît. Aucun réglage ne les retient.
//
// L'« économie de data » a été retirée le 17 septembre 2026. Elle cachait la fiche du paquet
// derrière « Afficher la photo », puis l'avatar de la discussion, puis les visages de la liste
// Messages — et le propriétaire a signalé chacun de ces trois états comme une panne, le même
// jour. Un interrupteur dont chaque effet se lit comme un défaut n'est pas une économie ; posé
// dans le CloudStorage, il suivait en plus la personne d'un appareil à l'autre après un appui
// par mégarde. Ce que ce fichier fige : la photo est là sur la carte, dans l'en-tête de la
// discussion et dans la liste Messages, et l'onglet Profil ne propose plus rien qui la retienne.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet, actionPrincipale } from './aides.js';

test('la carte du paquet montre sa photo sans rien demander', async ({ page }) => {
  await membreVerifie(page, 'Awa');
  const carte = page.locator('.card.top .card-photo').first();
  await expect(carte).toBeVisible();
  await expect(carte.locator('img')).toBeVisible();
  await expect(page.locator('[data-action="reveal"]')).toHaveCount(0);
});

test("l'onglet Profil ne propose plus de réglage qui retienne les photos", async ({ page }) => {
  await membreVerifie(page, 'Bea');
  await onglet(page, /Profil/).click();
  await expect(page.locator('input[name="dataSaver"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/Économie de data/);
});

test('la liste Messages montre le visage de chaque discussion', async ({ page }) => {
  await membreVerifie(page, 'Coco');
  // Un « J'aime » sur un profil de démonstration est rendu : le match est immédiat.
  await onglet(page, /Découvrir/).click();
  await expect(actionPrincipale(page)).toHaveText(/J'aime/);
  await actionPrincipale(page).click();
  await expect(page.locator('main')).toContainText(/C'est un match/i, { timeout: 20_000 });
  // L'écran de match masque les onglets : on le quitte d'abord.
  await page.locator('#fallback-bar button', { hasText: /Plus tard/ }).click();
  await onglet(page, /Messages/).click();
  // La ligne de la discussion porte une vraie image, pas seulement une initiale.
  const ligne = page.locator('.list-row', { has: page.locator('.avatar') }).first();
  await expect(ligne).toBeVisible();
  await expect(ligne.locator('.avatar img')).toBeVisible({ timeout: 15_000 });
});
