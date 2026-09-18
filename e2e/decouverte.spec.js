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

  // Le chevron ouvre la fiche en blocs (lot 2) : la photo de tête, puis la question dans sa
  // propre carte, puis les faits et la confiance ; le retour revient au paquet.
  await carte.locator('.fiche-btn').click();
  const fiche = page.locator('main .fiche');
  await expect(fiche.locator('.bloc-question').first()).toBeVisible();
  await expect(fiche.locator('.bloc-faits')).toHaveCount(1);
  await expect(fiche.locator('.bloc-confiance .trust-row')).toHaveCount(1);
  await expect(fiche).toContainText(nom);
  // Les photos après la première sont des blocs à part, chargés en apparaissant — jamais un
  // carrousel sur la photo de tête, et jamais tout d'un coup.
  await expect(fiche.locator('.card-photo[data-action="photo-nav"]')).toHaveCount(0);
  const autres = fiche.locator('[data-photo-bloc]');
  if (await autres.count()) {
    const dernier = autres.last();
    await dernier.scrollIntoViewIfNeeded();
    await expect(dernier.locator('img.loaded')).toBeVisible({ timeout: 15_000 });
  }
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

// Le « J'aime » sur une réponse (lot 2, seconde moitié) : depuis la fiche, chaque réponse porte un
// cœur ; il ouvre une feuille avec un mot facultatif ; rien ne part sans « Envoyer ». Le profil de
// démonstration rend le « J'aime », donc c'est un match — et le mot est le premier message du fil,
// de mon côté. Un vrai navigateur seul voit la feuille, le champ et le clavier.
test("aimer une réponse avec un mot ouvre un match dont le mot est le premier message", async ({ page }) => {
  await membreVerifie(page, 'Cléa');
  await onglet(page, /Découvrir/).click();
  const carte = page.locator('.deck .card.top');
  await expect(carte).toBeVisible();
  const nom = (await carte.locator('.overlay .name').innerText()).split('\n')[0].trim();
  await carte.locator('.fiche-btn').click();
  const fiche = page.locator('main .fiche');
  const coeur = fiche.locator('.bloc-question .coeur').first();
  await expect(coeur).toBeVisible();
  await coeur.click();
  const feuille = page.locator('#feuille');
  await expect(feuille).toBeVisible();
  await expect(feuille.locator('h2')).toHaveText(/Aimer sa réponse/);
  const champ = feuille.locator('input[name="feuille-champ"]');
  await expect(champ).toHaveAttribute('maxlength', '60');
  // Annuler ne fait rien : la fiche est toujours là, sans « J'aime ».
  await feuille.locator('[data-feuille="non"]').click();
  await expect(feuille).toHaveCount(0);
  await expect(fiche).toBeVisible();
  await coeur.click();
  await page.locator('#feuille input[name="feuille-champ"]').fill('Moi aussi, tous les dimanches');
  await page.locator('#feuille [data-feuille="aimer"]').click();
  // Le profil de démonstration rend le « J'aime » : match, puis la discussion.
  await expect(page.locator('main')).toContainText(/C'est un match/i, { timeout: 20_000 });
  await expect(page.locator('main')).toContainText(nom);
  await page.locator('#fallback-bar button', { hasText: /Écrire à/ }).click();
  const premiere = page.locator('#messages .bubble').first();
  await expect(premiere).toBeVisible({ timeout: 15_000 });
  await expect(premiere).toHaveClass(/mine/);
  await expect(premiere).toContainText('Moi aussi, tous les dimanches');
});

// La pastille « ♥ n » de la barre ne se comprend pas seule : un appui ouvre une feuille qui dit où
// en est le compteur et ce qui l'ouvre, et « D'accord » la referme sans rien changer.
test("la pastille du quota ouvre une feuille qui explique le compteur", async ({ page }) => {
  await membreVerifie(page, 'Awa');
  await onglet(page, /Découvrir/).click();
  const pastille = page.locator('.dbar .quota-pill');
  await expect(pastille).toBeVisible();
  const reste = (await pastille.innerText()).trim();
  await pastille.click();
  const feuille = page.locator('#feuille');
  await expect(feuille).toContainText(/Tes « J'aime » du jour/);
  await expect(feuille).toContainText(new RegExp(`Il t'en reste ${reste} sur \\d+`));
  await expect(feuille).toContainText(/passer une carte ne coûte rien/);
  // Vérifiée, la personne n'a pas besoin du badge : la feuille propose le pass, pas le selfie.
  await expect(feuille.locator('[data-feuille="verif"]')).toHaveCount(0);
  await feuille.locator('[data-feuille="non"]').click();
  await expect(feuille).toBeHidden();
  // Rien n'a bougé : le compteur affiche le même nombre.
  await expect(pastille).toHaveText(reste);
});
