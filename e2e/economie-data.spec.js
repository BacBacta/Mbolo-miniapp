// Une carte sans visage ressemble à une panne. Elle n'en est pas une.
//
// L'économie de data cache les photos du paquet et pose un bouton « Afficher la photo ». C'est
// ce que le réglage promet, et c'est utile sur un forfait compté. Mais le 16 septembre 2026, le
// propriétaire lui-même — qui connaît l'app mieux que quiconque — a signalé les cartes grises
// comme un défaut, et a décrit le bouton comme « cliquer sur le profil » : il l'a touché sans le
// lire. Si lui ne reconnaît pas son propre réglage, un membre conclura que l'app est cassée, ou
// que personne n'a de photo.
//
// La carte doit donc dire **pourquoi** elle est grise et **où** le défaire. Aucun test unitaire
// ne peut le voir : il faut un vrai navigateur, un vrai interrupteur touché, et l'écran d'après.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet } from './aides.js';

test('la carte grise dit pourquoi elle est grise, et où le défaire', async ({ page }) => {
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

  // Le bouton était là avant ce correctif. Ce qui manquait, c'est la raison.
  await expect(carte.locator('.reveal')).toContainText(/Afficher la photo/);
  await expect(carte.locator('.reveal-why')).toContainText(/Économie de data/);
  // Et surtout : où le défaire. Sans ça, on sait que c'est voulu sans savoir quoi faire.
  await expect(carte.locator('.reveal-why')).toContainText(/Profil/);
});

test("sans économie de data, la carte ne porte ni bouton ni explication", async ({ page }) => {
  await membreVerifie(page, 'Bea');
  const carte = page.locator('.card.top .card-photo').first();
  await expect(carte).toBeVisible();
  // La raison ne doit pas s'afficher quand elle ne s'applique pas : une explication qui traîne
  // sur une carte normale ferait croire à un réglage qu'on n'a pas.
  await expect(carte.locator('.reveal-why')).toHaveCount(0);
  await expect(carte.locator('.reveal')).toHaveCount(0);
});

test("afficher la photo reste un geste, et il marche", async ({ page }) => {
  await membreVerifie(page, 'Coco');
  await onglet(page, /Profil/).click();
  await page.locator('input[name="dataSaver"]').check();
  await onglet(page, /Découvrir/).click();

  const carte = page.locator('.card.top .card-photo').first();
  await carte.locator('.reveal').click();
  // La photo demandée arrive, et l'explication disparaît avec le bouton : elle ne vaut que tant
  // qu'il y a quelque chose à expliquer.
  await expect(carte.locator('.reveal-why')).toHaveCount(0);
  await expect(carte.locator('img')).toBeVisible();
});
