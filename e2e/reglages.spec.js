// Le lot 3 de l'audit 15 : les réglages derrière une porte à eux, en groupes ; l'onglet Profil
// réduit à l'essentiel ; et une ligne de Messages qui se balaie vers la gauche pour retirer un
// match. Un vrai navigateur seul voit les groupes dans l'ordre, le geste, et la confirmation.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet, titre, ouvrirLesReglages, actionPrincipale } from './aides.js';

test("l'onglet Profil garde l'essentiel, et les réglages sont en quatre groupes derrière leur porte", async ({ page }) => {
  await membreVerifie(page, 'Nadia');
  await onglet(page, /Profil/).click();
  const main = page.locator('main');
  // L'essentiel : la fiche telle que les autres la voient, la voix, et la porte des réglages.
  await expect(main).toContainText(/Ce que les autres voient/);
  await expect(page.locator('.list-row[data-screen="voix"]')).toBeVisible();
  await expect(page.locator('button[data-action="delete"]')).toHaveCount(0);
  await expect(page.locator('.list-row[data-screen="langue"]')).toHaveCount(0);

  await ouvrirLesReglages(page);
  await expect(page.locator('main .group .eyebrow')).toHaveText([/Compte/, /Sécurité/, /Plus/, /Faire connaître/]);
  await expect(page.locator('button[data-action="delete"]')).toBeVisible();
  // Ce qui s'ouvre depuis les réglages y revient : la jauge, puis Retour.
  await page.locator('.list-row[data-screen="jauge"]').click();
  await expect(titre(page)).toHaveText(/La jauge de confiance/);
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Réglages/);
  await page.locator('.devback').click();
  await expect(main).toContainText(/Ce que les autres voient/);
});

test('une ligne de Messages balayée vers la gauche propose de retirer le match, et le retire', async ({ page }) => {
  await membreVerifie(page, 'Olga');
  // Un match avec un profil de démonstration, qui rend le « J'aime ».
  await onglet(page, /Découvrir/).click();
  await expect(page.locator('.deck .card.top')).toBeVisible();
  await page.locator('.deck-actions .like').click();
  await expect(page.locator('main')).toContainText(/C'est un match/i, { timeout: 20_000 });
  // L'écran de match n'a pas d'onglets : « Plus tard » ramène à Découvrir, et les onglets avec.
  await page.locator('#fallback-bar button', { hasText: /Plus tard/ }).click();
  await onglet(page, /Messages/).click();
  // La liste se dessine deux fois — ce qu'on avait déjà vu, puis la réponse du serveur — et le
  // second dessin remplace les lignes : on attend qu'il soit passé avant de toucher à l'une d'elles.
  await page.waitForLoadState('networkidle');
  const rangee = page.locator('.row-swipe').first();
  const ligne = rangee.locator('.list-row');
  await expect(ligne).toBeVisible();
  const boite = await ligne.boundingBox();
  // Le geste : un glissement franc vers la gauche, à la souris (les événements pointeur sont les
  // mêmes qu'au doigt).
  await page.mouse.move(boite.x + boite.width - 40, boite.y + boite.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) await page.mouse.move(boite.x + boite.width - 40 - i * 20, boite.y + boite.height / 2);
  await page.mouse.up();
  await expect(rangee).toHaveClass(/ouverte/);
  // Un appui sur la ligne ouverte la referme au lieu d'ouvrir la discussion.
  await ligne.click();
  await expect(rangee).not.toHaveClass(/ouverte/);
  await expect(page.locator('input[name=message]')).toHaveCount(0);
  // La ligne finit de revenir en place avant le second geste.
  await expect(ligne).toHaveCSS('transform', 'none');
  // Rouvre, puis « Retirer » : la confirmation, et la ligne disparaît.
  await page.mouse.move(boite.x + boite.width - 40, boite.y + boite.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) await page.mouse.move(boite.x + boite.width - 40 - i * 20, boite.y + boite.height / 2);
  await page.mouse.up();
  await expect(rangee).toHaveClass(/ouverte/);
  await rangee.locator('.row-action').click();
  // La confirmation est le popup natif — hors Telegram, la feuille de secours de tg.js.
  await expect(page.locator('#fallback-sheet')).toBeVisible();
  await page.locator('#fallback-sheet button', { hasText: /^Retirer$/ }).click();
  await expect(page.locator('main')).toContainText(/Tes matchs apparaîtront ici|Match retiré/, { timeout: 10_000 });
  await expect(page.locator('.row-swipe')).toHaveCount(0);
});
