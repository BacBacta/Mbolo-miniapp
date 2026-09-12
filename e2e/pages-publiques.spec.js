// Les pages publiques doivent tenir debout là où l'app ne va pas : sans compte, hors de Telegram,
// et sans JavaScript. C'est la promesse qu'on fait à BotFather et à quiconque suit un lien.
import { test, expect } from '@playwright/test';

// Un contexte sans JavaScript : c'est le cas d'un très vieux navigateur, ou d'un aperçu de lien.
test.describe('sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const [chemin, attendu] of [['/confidentialite', /Politique de confidentialité/], ['/conditions', /Conditions d'utilisation/]]) {
    test(`${chemin} se lit quand même`, async ({ page }) => {
      const reponse = await page.goto(chemin);
      expect(reponse.status()).toBe(200);
      await expect(page.locator('h1')).toHaveText(attendu);
      // Le corps du texte est là, pas seulement le titre.
      expect((await page.locator('main').innerText()).length).toBeGreaterThan(1500);
      // Et la page reste lisible : du texte sur un fond, pas du texte sur du texte.
      const fond = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(fond).not.toBe('rgba(0, 0, 0, 0)');
    });
  }
});

test('les deux pages se répondent, et ramènent à l\'app', async ({ page }) => {
  await page.goto('/confidentialite');
  await page.getByRole('link', { name: /Conditions d'utilisation/ }).first().click();
  await expect(page.locator('h1')).toHaveText(/Conditions d'utilisation/);
  await page.getByRole('link', { name: /Politique de confidentialité/ }).first().click();
  await expect(page.locator('h1')).toHaveText(/Politique de confidentialité/);
});

// Ce sont des pages, pas des écrans de l'app : elles ne doivent rien exiger et rien charger d'inutile.
test('aucune de ces pages ne réclame de compte', async ({ page }) => {
  const appels = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) appels.push(r.url()); });
  await page.goto('/conditions');
  await expect(page.locator('h1')).toBeVisible();
  await page.waitForTimeout(500);
  expect(appels, 'une page publique ne doit interroger aucune API').toEqual([]);
});

// En sombre comme en clair : quelqu'un qui arrive de Telegram en thème sombre ne doit pas
// recevoir une page blanche éblouissante.
test('la page suit le thème du téléphone', async ({ browser }) => {
  const sombre = await browser.newContext({ colorScheme: 'dark' });
  const page = await sombre.newPage();
  await page.goto('/confidentialite');
  await expect(page.locator('h1')).toBeVisible();
  const scheme = await page.locator('html').getAttribute('data-scheme');
  expect(scheme).toBe('dark');
  await sombre.close();
});
