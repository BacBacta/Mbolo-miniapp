// « Supprimer mon compte » ne doit rien laisser repartir vers le serveur : l'app rappelait /me
// aussitôt, le minuteur de /summary continuait, et chaque appel authentifié recréait le compte
// (audit/09-revue-code.md, I3). Ce test compte les requêtes après la suppression.
import { test, expect } from '@playwright/test';
import { membreVerifie, ouvrirLesReglages } from './aides.js';

test('après la suppression, plus aucune requête ne part, et l\'écran le dit', async ({ page }) => {
  test.setTimeout(90_000);
  await membreVerifie(page, 'Yasmine');
  await ouvrirLesReglages(page);
  const bouton = page.locator('button[data-action="delete"]');
  await bouton.scrollIntoViewIfNeeded();

  const requetes = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) requetes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  page.on('dialog', (d) => d.accept());
  await bouton.click();

  await expect(page.locator('main h1')).toHaveText(/supprimés/, { timeout: 15_000 });
  await expect(page.locator('main')).toContainText(/rouvre-le depuis le bot/);
  // Le minuteur de /summary tournait toutes les 20 s : on attend plus que ça.
  await page.waitForTimeout(22_000);
  const apres = requetes.filter((r) => r !== 'DELETE /api/me');
  expect(apres, `requêtes parties après la suppression : ${apres.join(', ')}`).toEqual([]);
});
