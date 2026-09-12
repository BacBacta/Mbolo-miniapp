// Le repli du flou vu depuis le navigateur : la décision doit atteindre les pixels, pas seulement
// poser un attribut. On lit donc le style calculé d'une surface de verre, pas le DOM.
//
// La barre d'action n'existe que sur un écran qui propose une action : on ouvre donc l'app comme
// une personne le ferait, avec un compte.
import { test, expect } from '@playwright/test';
import { nouvelIdentifiant, actionPrincipale } from './aides.js';

const verre = (page) => page.locator('#fallback-bar');

const style = (page) => verre(page).evaluate((el) => {
  const s = getComputedStyle(el);
  return { flou: s.backdropFilter || s.webkitBackdropFilter || 'none', fond: s.backgroundColor };
});

// Remplace la mémoire annoncée avant que l'app ne se charge : Playwright ne sait pas la régler.
const annoncerMemoire = (page, gio) => page.addInitScript(([g]) => {
  Object.defineProperty(navigator, 'deviceMemory', { get: () => g, configurable: true });
}, [gio]);

async function ouvrirAvecBarre(page) {
  await page.goto(`/?dev_user=${nouvelIdentifiant()}`);
  await expect(actionPrincipale(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-verre', /flou|opaque/, { timeout: 20_000 });
}

test('sur une machine confortable, le verre reste flouté', async ({ page }) => {
  await annoncerMemoire(page, 8);
  await ouvrirAvecBarre(page);
  await expect(page.locator('html')).toHaveAttribute('data-verre', 'flou');
  expect((await style(page)).flou).toContain('blur');
});

test('un appareil qui annonce peu de mémoire reçoit un fond opaque, pas un flou', async ({ page }) => {
  await annoncerMemoire(page, 1);
  await ouvrirAvecBarre(page);
  await expect(page.locator('html')).toHaveAttribute('data-verre', 'opaque');

  const { flou, fond } = await style(page);
  expect(flou, 'le navigateur ne doit plus flouter').toBe('none');
  // Et la surface reste franchement opaque, donc lisible : c'est tout l'intérêt du repli.
  expect(fond, 'le fond de secours doit être opaque').not.toContain('rgba');
});

// La décision est retenue : la mesure d'une seule session est bruitée, l'appareil ne change pas.
test('la décision survit au rechargement, même si l\'appareil se dit meilleur', async ({ page }) => {
  await annoncerMemoire(page, 1);
  await ouvrirAvecBarre(page);
  await expect(page.locator('html')).toHaveAttribute('data-verre', 'opaque');
  expect(await page.evaluate(() => localStorage.getItem('verre-v1'))).toBe('opaque');

  await annoncerMemoire(page, 8);
  await page.reload();
  await expect(actionPrincipale(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-verre', 'opaque');
  expect((await style(page)).flou).toBe('none');
});
