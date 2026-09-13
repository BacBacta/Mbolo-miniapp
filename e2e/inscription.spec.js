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
// le garant est abandonné (P1-6), donc il n'apparaît ni dans le texte, ni au dénominateur.
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

// La langue vivait au fond de l'onglet Profil, donc derrière l'inscription et la vérification.
// Quelqu'un dont le Telegram est dans une langue qu'on ne connaît pas voyait du français et
// n'avait aucun moyen d'en changer — il devait comprendre la page pour trouver le réglage qui la
// lui aurait rendue lisible. Elle se choisit maintenant depuis l'accueil, avant tout engagement.
test("la langue se choisit dès l'accueil, avant de créer quoi que ce soit", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await expect(titre(page)).toHaveText(/Des rencontres vérifiées/);

  // Le sélecteur est sur le premier écran, et annonce la langue en cours.
  const chip = page.locator('.langue-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Français');

  await chip.click();
  await expect(titre(page)).toHaveText(/Langue|Language/);
  await page.locator('main button', { hasText: 'English' }).click();

  // On revient à l'accueil — pas dans l'onglet Profil, qui n'existe pas encore — et il est traduit.
  await expect(titre(page)).toHaveText(/Verified people, face to face/);
  await expect(page.locator('.langue-chip')).toContainText('English');

  // Et le choix tient pendant l'inscription : c'est tout l'intérêt de le proposer si tôt.
  await actionPrincipale(page).click();
  await expect(titre(page)).not.toHaveText(/Fais-toi connaître/);
});

// Le selfie doit ouvrir la caméra, pas la galerie. C'est `capture="user"` qui le demande — mais
// cette indication n'est appliquée qu'à une entrée **rendue** : `hidden`, donc `display: none`,
// la faisait ignorer par plusieurs WebView Android, dont celle de Telegram qui est notre cible.
// L'entrée reste donc dans le flux, invisible et large d'un pixel, activée par son label.
//
// Ce test garde le balisage ; il ne peut pas garantir le comportement de Telegram, qui reste libre
// d'ignorer l'indication. Il empêche seulement qu'on reperde l'attribut, ou qu'on remette `hidden`.
test('le selfie demande la caméra, et son entrée reste rendue pour que ce soit entendu', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Ada' });
  await passerLaJauge(page);

  const selfie = page.locator('input[type=file][name=selfie]');
  await expect(selfie).toHaveAttribute('capture', 'user');
  await expect(selfie).toHaveAttribute('accept', 'image/*');

  // Pas `hidden` : styles.css en fait un display:none, et une entrée non rendue perd l'indication.
  const display = await selfie.evaluate((el) => getComputedStyle(el).display);
  expect(display, "l'entrée du selfie ne doit pas être display:none").not.toBe('none');
  // Et elle reste invisible : c'est le label qui se touche, pas elle.
  const visible = await selfie.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return Number(s.opacity) > 0 && r.width > 2 && r.height > 2;
  });
  expect(visible, "l'entrée ne doit pas se voir : c'est le label qui se touche").toBe(false);
});

// Les photos du profil, elles, doivent bien ouvrir la galerie : on choisit parmi ce qu'on a déjà.
// Leur mettre `capture` forcerait la caméra et rendrait impossible de poser une photo existante.
test('les photos du profil ne forcent pas la caméra', async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Fais-toi connaître/);
  await page.locator('input[name=name]').fill('Ada');
  await page.locator('input[name=age]').fill('24');
  await page.locator('main button', { hasText: /Femme/ }).first().click();
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Ce que tu cherches/);
  await page.locator('main button', { hasText: /Amitié/ }).first().click();
  await page.locator('input[name=city]').fill('Yaoundé');
  await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Ta touche personnelle/);

  const photos = page.locator('input[type=file][name^=photo-]');
  await expect(photos).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    await expect(photos.nth(i)).not.toHaveAttribute('capture', /.*/);
  }
});
