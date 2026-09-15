// Ce que le pass change **à l'écran**, et ce qu'il ne doit pas y laisser paraître.
//
// Les tests unitaires disent que le serveur refuse la liste des « J'aime » sans pass et que le
// réglage de discrétion s'enregistre. Ils ne disent rien de ce qu'une personne voit : or c'est
// exactement là qu'un manque se lit comme une panne, et qu'on cherche ce qu'on a mal fait.
import { test, expect } from '@playwright/test';
import { membreVerifie, actionPrincipale, titre, onglet } from './aides.js';

test("sans pass, Messages explique la place laissée vide au lieu de la laisser vide", async ({ page }) => {
  await membreVerifie(page, 'Awa');
  await onglet(page, /Messages/).click();

  const invitation = page.locator('main button', { hasText: /Voir qui t'a aimé/ });
  await expect(invitation).toBeVisible();
  await expect(invitation).toContainText(/passent déjà devant dans ton paquet/);

  // Elle mène au pass, et le pass dit franchement qu'il n'est pas en vente : une promesse
  // affichée que rien n'honore est pire qu'une fonction absente.
  await invitation.click();
  await expect(titre(page)).toHaveText(/Plus$/);
  await expect(page.locator('main')).toContainText(/n'est pas encore en vente/);
  // Il n'annonce que ce que le serveur fait déjà : deux lignes, pas le catalogue à venir.
  await expect(page.locator('main')).toContainText(/Sans pass, tu en as 5 par jour/);
  await expect(page.locator('main')).toContainText(/Qui t'a aimé/);

  // Et le retour ramène d'où l'on vient, pas sur l'onglet Profil par défaut.
  await actionPrincipale(page).click();
  await expect(page.locator('main')).toContainText(/Tes matchs apparaîtront ici|Discussions/);
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
  // La ligne du pass est là aussi, mais l'écran « qui s'est arrêté » ne l'est pas : il demande
  // un pass, et une ligne qui mène à un 403 serait une fausse porte.
  await expect(page.locator('main')).toContainText(/Plus/);
  await expect(page.locator('main')).not.toContainText(/Se sont arrêtés sur ta fiche/);

  await interrupteur.check();
  await expect(page.locator('.toast, #toast')).toContainText(/n'apparais plus/);

  await page.goto(`/?dev_user=${id}`);
  await onglet(page, /Profil/).click();
  await expect(page.locator('input[name="discretion"]')).toBeChecked();
});
