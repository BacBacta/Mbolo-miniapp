// Ce que le pass change **à l'écran**, et ce qu'il ne doit pas y laisser paraître.
//
// Les tests unitaires disent que le serveur refuse la liste des « J'aime » sans pass et que le
// réglage de discrétion s'enregistre. Ils ne disent rien de ce qu'une personne voit : or c'est
// exactement là qu'un manque se lit comme une panne, et qu'on cherche ce qu'on a mal fait.
import { test, expect } from '@playwright/test';
import { membreVerifie, actionPrincipale, actionSecondaire, titre, onglet } from './aides.js';

test("sans pass, Messages explique la place laissée vide, et la porte mène à une caisse", async ({ page }) => {
  await membreVerifie(page, 'Awa');
  await onglet(page, /Messages/).click();

  const invitation = page.locator('main button', { hasText: /Voir qui t'a aimé/ });
  await expect(invitation).toBeVisible();
  await expect(invitation).toContainText(/passent déjà devant dans ton paquet/);

  // Elle mène au pass : une promesse, un prix, un bouton qui paie. Pas un catalogue, pas un
  // « bientôt » — c'est la refonte du 17 septembre 2026.
  await invitation.click();
  await expect(titre(page)).toHaveText(/Vois qui t'a aimé/);
  const main = page.locator('main');
  // La phrase d'accroche suit la porte par laquelle on est entré.
  await expect(main).toContainText(/Le pass te dit qui/);
  // Trois durées, comme des forfaits ; la durée conseillée est marquée et présélectionnée.
  const offres = page.locator('.offre');
  await expect(offres).toHaveCount(3);
  await expect(main).toContainText(/Le plus choisi/);
  await expect(page.locator('.offre[aria-checked="true"]')).toContainText(/30 jours/);
  await expect(actionPrincipale(page)).toHaveText(/Prendre 30 jours · 299 ⭐/);
  // Choisir une autre durée change le bouton sans rien recharger.
  await offres.filter({ hasText: /7 jours/ }).click();
  await expect(actionPrincipale(page)).toHaveText(/Prendre 7 jours · 99 ⭐/);
  // Ce que le pass ouvre tient en cinq lignes, et la règle qui compte est écrite : pas de reconduction.
  await expect(main).toContainText(/5 par jour sans le pass/);
  await expect(main).toContainText(/Aucune reconduction/);
  await expect(main).not.toContainText(/pas encore en vente/);

  // Et le retour ramène d'où l'on vient, pas sur l'onglet Profil par défaut.
  await actionSecondaire(page).click();
  await expect(main).toContainText(/Tes matchs apparaîtront ici|Discussions/);
});

// « Rester discret » n'est pas réservé au pass, et ne le sera jamais : on ne vend pas le droit
// de ne pas être montré. Le réglage doit donc être là pour quelqu'un qui n'a rien payé — et il
// doit survivre au rechargement, sinon il ne protège de rien.
test('le réglage de discrétion est offert à tout le monde, et il tient', async ({ page }) => {
  const id = await membreVerifie(page, 'Bea');
  await onglet(page, /Profil/).click();

  const interrupteur = page.locator('input[name="discretion"]');
  await expect(interrupteur).toBeVisible();
  await expect(interrupteur).not.toBeChecked();
  // La ligne du pass est là, et celle de « qui s'est arrêté » aussi : sans pass, l'écran montre
  // le nombre et des aperçus floutés, jamais un 403 — une ligne qui mène à une erreur serait une
  // fausse porte.
  await expect(page.locator('main')).toContainText(/Plus/);
  await page.locator('main button', { hasText: /Se sont arrêtés sur ta fiche/ }).click();
  await expect(titre(page)).toHaveText(/Se sont arrêtés sur ta fiche/);
  // Un profil de démonstration a pu s'y arrêter entre-temps : le nombre varie, la règle non.
  await expect(page.locator('main')).toContainText(/Personne pour l'instant|se sont arrêtées sur ta fiche/);
  await expect(page.locator('main')).not.toContainText(/PASS_REQUIS|pass pour/);
  await actionPrincipale(page).click();

  await interrupteur.check();
  await expect(page.locator('.toast, #toast')).toContainText(/n'apparais plus/);

  await page.goto(`/?dev_user=${id}`);
  await onglet(page, /Profil/).click();
  await expect(page.locator('input[name="discretion"]')).toBeChecked();
});
