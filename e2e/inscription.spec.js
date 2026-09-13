// Le premier parcours : quelqu'un arrive, crée son profil, se fait vérifier, et voit du monde.
// C'est le chemin sans lequel rien d'autre n'existe. Les tests unitaires vérifient chaque règle
// isolément ; ici on vérifie qu'elles s'enchaînent dans un vrai navigateur.
import { test, expect } from '@playwright/test';
import { ouvrir, creerProfil, seFaireVerifier, passerLaJauge, actionPrincipale, titre, onglet, nouvelIdentifiant, sonSelfie } from './aides.js';

test("de l'accueil à la découverte, sans jamais rester bloqué", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await expect(titre(page)).toHaveText(/Des rencontres vérifiées/);
  // L'accueil dit la promesse avant de demander quoi que ce soit.
  await expect(page.locator('main')).toContainText(/Profils vérifiés par selfie/);
  await expect(page.locator('main')).toContainText(/Demandes d'argent bloquées/);

  await creerProfil(page, { prenom: 'Awa' });
  await seFaireVerifier(page);

  // Vérifié : les onglets apparaissent et la découverte montre de vrais profils, pas un écran vide.
  await expect(onglet(page, /Découvrir/)).toBeVisible();
  const carte = page.locator('main article').nth(1);
  await expect(carte).toBeVisible();
  // Une carte porte un prénom, un âge et un lieu : c'est ce qui permet de décider.
  await expect(carte).toContainText(/Yaoundé/);
  await expect(carte).toContainText(/Amitié/);
});

test('tant que le profil est incomplet, on ne passe pas à l\'étape suivante', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Fais-toi connaître/);

  // Rien de rempli : le bouton refuse, et dit pourquoi plutôt que de ne rien faire.
  await actionPrincipale(page).click();
  await expect(page.locator('main')).toContainText(/prénom|Choisis/i);
  await expect(titre(page)).toHaveText(/Fais-toi connaître/, { timeout: 3000 });
});

// L'âge est la seule règle que l'app ne peut pas assouplir : elle protège des mineurs.
test('un âge de moins de 18 ans est refusé', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await actionPrincipale(page).click();
  await page.locator('input[name=name]').fill('Trop jeune');
  await page.locator('input[name=age]').fill('17');
  await page.locator('main button', { hasText: /Femme/ }).first().click();
  await actionPrincipale(page).click();
  await expect(page.locator('main')).toContainText(/18/);
  await expect(titre(page)).toHaveText(/Fais-toi connaître/);
});

// Sans vérification, la découverte reste fermée : c'est la promesse « tous les profils sont vérifiés ».
test('avant la vérification, la découverte reste fermée', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Bana' });
  await passerLaJauge(page);
  // Le geste demandé est affiché : il est tiré au hasard, donc on vérifie qu'il y en a un.
  await expect(page.locator('main')).toContainText(/GESTE DEMANDÉ/i);
  // Les onglets existent dans la page mais restent masqués : c'est leur visibilité qui compte.
  await expect(onglet(page, /Découvrir/)).toBeHidden();
});

// Choisir la photo n'est pas l'envoyer : on peut encore la reprendre, ce qui compte quand on
// n'est pas sûr d'avoir fait le bon geste.
test('le selfie se relit avant d\'être envoyé, et rien ne part tant qu\'on n\'a pas décidé', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Carine' });
  await passerLaJauge(page);

  const envois = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/me/verification')) envois.push(r.method()); });

  await page.locator('input[type=file][name=selfie]').setInputFiles(sonSelfie);
  await expect(page.getByRole('img', { name: /Aperçu du selfie/ })).toBeVisible();
  await expect(page.locator('main')).toContainText(/Reprendre/);
  await page.waitForTimeout(500);
  assertRien(envois);

  await expect(actionPrincipale(page)).toHaveText(/Envoyer pour vérification/);
  await actionPrincipale(page).click();
  await expect(onglet(page, /Découvrir/)).toBeVisible({ timeout: 25_000 });
});

// Nommé pour que l'échec se lise : « aucun selfie ne part avant le clic ».
function assertRien(envois) {
  expect(envois, 'aucun selfie ne doit partir avant le clic sur Envoyer').toEqual([]);
}

// La jauge s'affiche sur chaque carte : l'explication doit donc arriver avant la première carte,
// pas dans un menu que personne n'ouvre. Et elle doit décrire exactement ce que le score compte —
// le garant n'a pas encore de mécanisme, donc il n'apparaît ni dans le texte, ni au dénominateur.
test("la jauge de confiance s'explique à l'inscription, et n'annonce que des critères atteignables", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Ngo' });

  await expect(titre(page)).toHaveText(/La jauge de confiance/);
  await expect(page.locator('main')).toContainText(/Selfie vérifié/);
  await expect(page.locator('main')).toContainText(/Membre depuis 3 mois/);
  await expect(page.locator('main')).not.toContainText(/garant/i);

  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Vérifie que c'est bien toi/);
  await seFaireVerifier(page);

  // Vérifiée : un critère sur les deux ouverts, et la carte le dit avec le même dénominateur.
  await onglet(page, /Profil/).click();
  await expect(page.locator('main')).toContainText(/Confiance 1 sur 2/);
  await expect(page.locator('main')).not.toContainText(/sur 3/);
});
