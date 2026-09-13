// Le choix de la langue, vu depuis l'écran.
//
// Les tests unitaires vérifient que les dictionnaires sont complets ; ils ne disent rien de ce
// qu'on voit. Or une langue peut être traduite de bout en bout et rester invisible : il suffit
// qu'elle manque à la liste que l'écran parcourt, ou que le dictionnaire ne se charge pas.
// Ce test-là passe par l'écran, et il échouerait dans les deux cas.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet } from './aides.js';

// La ligne est désignée par l'écran qu'elle ouvre, pas par son libellé : une fois la langue
// changée, ce libellé n'est plus « Langue » mais « Язык », et un test écrit en français ne
// retrouverait plus son chemin — exactement comme la personne qui vient de changer de langue.
const ligneLangue = (page) => page.locator('.list-row[data-screen="langue"]');

test('les quatre langues sont proposées, et le choix change vraiment l’interface', async ({ page }) => {
  await membreVerifie(page, 'Awa');

  await onglet(page, /Profil/).click();
  await ligneLangue(page).click();

  await expect(page.locator('main h1')).toHaveText('Langue');
  const proposees = page.locator('.list .list-row .title');
  await expect(proposees).toHaveText(['Français', 'English', 'Русский', 'Українська']);

  // Le russe : l'interface doit changer tout de suite, pas au rechargement suivant.
  await page.locator('.list-row', { hasText: 'Русский' }).click();
  await expect(page.locator('#tabs')).toContainText('Анкета');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  // Et le choix tient : on rouvre l'écran, la langue courante est cochée.
  await onglet(page, /Анкета/).click();
  await ligneLangue(page).click();
  await expect(page.locator('.list-row', { hasText: 'Русский' }).locator('.c-ok')).toBeVisible();

  // L'ukrainien, puis le retour au français : aucune langue n'est un aller simple.
  await page.locator('.list-row', { hasText: 'Українська' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await onglet(page, /Анкета|Профіль|Profil/).click();
  await ligneLangue(page).click();
  await page.locator('.list-row', { hasText: 'Français' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#tabs')).toContainText('Profil');
});
