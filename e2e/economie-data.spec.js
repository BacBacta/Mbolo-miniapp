// Une carte sans visage ressemble à une panne — et elle empêche de décider.
//
// L'économie de data cachait les photos du paquet derrière un bouton « Afficher la photo ».
// Deux constats l'ont fait tomber. Le premier, le 16 septembre 2026 : le propriétaire lui-même,
// qui connaît l'app mieux que quiconque, a signalé les cartes grises comme un défaut, puis a
// répondu que l'utilisateur doit pouvoir choisir **sans** appuyer sur « Afficher ». Le second se
// lit dans le code : la découverte ne charge que la carte du dessus, une image par balayage. Le
// réglage coûtait donc la décision — le geste qui fait toute l'app — pour une seule photo.
//
// Il retient désormais les **vignettes des listes**, là où cinquante images partent d'un coup.
// La fiche qu'on regarde garde sa photo, réglage activé ou non. Seul un vrai navigateur voit
// l'interrupteur touché puis l'écran d'après.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet } from './aides.js';

test("la carte garde sa photo, économie de data activée", async ({ page }) => {
  await membreVerifie(page, 'Awa');

  // On active l'économie de data comme le ferait quelqu'un : l'interrupteur de l'onglet Profil.
  await onglet(page, /Profil/).click();
  const interrupteur = page.locator('input[name="dataSaver"]');
  await expect(interrupteur).toBeVisible();
  await interrupteur.check();
  await expect(page.locator('.toast, #toast')).toContainText(/Économie de data activée/);

  await onglet(page, /Découvrir/).click();
  const carte = page.locator('.card.top .card-photo').first();
  await expect(carte).toBeVisible();

  // Ce qui compte : la photo est là, sans rien demander. C'est sur elle qu'on décide.
  await expect(carte.locator('img')).toBeVisible();
  // Et le bouton qui la cachait n'existe plus nulle part.
  await expect(page.locator('[data-action="reveal"]')).toHaveCount(0);
});

test("sans économie de data non plus, rien ne s'interpose devant la photo", async ({ page }) => {
  await membreVerifie(page, 'Bea');
  const carte = page.locator('.card.top .card-photo').first();
  await expect(carte).toBeVisible();
  await expect(carte.locator('img')).toBeVisible();
  await expect(page.locator('[data-action="reveal"]')).toHaveCount(0);
});

test("le réglage dit ce qu'il retient vraiment", async ({ page }) => {
  await membreVerifie(page, 'Coco');
  await onglet(page, /Profil/).click();
  // Un réglage qui promet « photos chargées seulement si tu les demandes » alors que la fiche
  // garde la sienne mentirait. La ligne nomme les vignettes, et dit ce qui ne change pas.
  const ligne = page.locator('.list-row', { has: page.locator('input[name="dataSaver"]') });
  await expect(ligne).toContainText(/vignettes/i);
  await expect(ligne).toContainText(/garde sa photo/i);
});
