// Le premier parcours : quelqu'un arrive, crée son profil, se fait vérifier, et voit du monde.
// C'est le chemin sans lequel rien d'autre n'existe. Les tests unitaires vérifient chaque règle
// isolément ; ici on vérifie qu'elles s'enchaînent dans un vrai navigateur.
import { test, expect } from '@playwright/test';
import { ouvrir, creerProfil, seFaireVerifier, passerLaJauge, actionPrincipale, titre, onglet, nouvelIdentifiant, sonSelfie, passerLaVoix } from './aides.js';

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
  await expect(page.locator('main')).toContainText(/Changer/);
  await page.waitForTimeout(500);
  assertRien(envois);

  await expect(actionPrincipale(page)).toHaveText(/Envoyer pour vérification/);
  await actionPrincipale(page).click();
  await passerLaVoix(page);
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

// Le selfie n'ouvre pas la caméra, et l'app ne le promet plus.
//
// `capture="user"` est une indication, et Telegram Android ne la lit pas : sa WebView construit le
// sélecteur avec `fileChooserParams.createIntent()` sans jamais appeler `isCaptureEnabled()`. La
// galerie s'ouvrait donc quel que soit le balisage — sur notre cible, un bouton « ouvrir la
// caméra » était une promesse qu'aucun code de notre côté ne pouvait tenir.
//
// Ce test fige les deux moitiés du renoncement : plus d'attribut (on ne garde pas un mécanisme
// qui ne marche pas là où ça compte), et une consigne qui dit ce qui va vraiment se passer.
test("le selfie ne promet pas la caméra : c'est la galerie qui s'ouvre", async ({ page }) => {
  await ouvrir(page, nouvelIdentifiant());
  await creerProfil(page, { prenom: 'Ada' });
  await passerLaJauge(page);

  const selfie = page.locator('input[type=file][name=selfie]');
  await expect(selfie).toHaveAttribute('accept', 'image/*');
  const force = await selfie.evaluate((el) => el.hasAttribute('capture'));
  expect(force, "`capture` ne tient pas sa promesse dans Telegram : on ne le remet pas").toBe(false);

  // Et la consigne dit quoi faire, dans l'ordre où ça se fait.
  const carte = page.locator('.gesture-card');
  await expect(carte).toContainText(/puis choisis-le ici/i);
  await expect(carte).not.toContainText(/caméra/i);
});

// Les photos du profil se choisissent dans la galerie : on pose ce qu'on a déjà. `capture` ne
// changerait rien dans Telegram — il y est ignoré — mais forcerait la caméra ailleurs (iPhone,
// navigateur), et empêcherait donc d'y mettre une photo prise l'an dernier.
// Le pays ne se choisit plus dans le menu du système. Celui d'Android est une boîte de dialogue
// grise, à sa propre typographie, **sans recherche** : atteindre le Cameroun demandait de faire
// défiler une quarantaine de pays depuis l'Afghanistan. Ce test rejoue le geste réel — chercher,
// choisir — et refuse le retour du `<select>`.
test('le pays se cherche au lieu de se faire défiler, et le clavier ne se ferme pas', async ({ page }) => {
  await ouvrir(page);
  await actionPrincipale(page).click();
  await page.locator('input[name=name]').fill('Aline');
  await page.locator('input[name=age]').fill('24');
  await page.locator('main button', { hasText: /Femme/ }).first().click();
  await actionPrincipale(page).click();

  await expect(page.locator('main select')).toHaveCount(0, { timeout: 2000 });
  await page.locator('[data-action="choisir-pays"]').click();
  await expect(titre(page)).toHaveText(/Ton pays/);

  // Le pays du fuseau est proposé en haut : le cas courant ne demande aucune recherche.
  await expect(page.locator('.eyebrow', { hasText: /Proposés/ })).toBeVisible();

  // Accents et ponctuation ignorés : personne ne tape « Côte d'Ivoire » avec son apostrophe.
  const champ = page.locator('input[name="recherche-pays"]');
  await champ.fill('cote divoire');
  await expect(page.locator('#liste-pays .list-row').first()).toContainText(/Côte d/);
  // Taper ne doit pas refaire le champ : sur Android, le clavier se refermerait à chaque
  // caractère (même cause que la règle 16 dans la discussion).
  expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).toBe('recherche-pays');

  // Une recherche sans résultat dit quoi faire, au lieu d'une liste vide.
  await champ.fill('zzzz');
  await expect(page.locator('main h2')).toHaveText(/Aucun pays ne correspond/);

  await champ.fill('cameroun');
  await page.locator('#liste-pays .list-row').first().click();
  await expect(titre(page)).toHaveText(/Ce que tu cherches/);
  await expect(page.locator('[data-action="choisir-pays"] .valeur')).toHaveText('Cameroun');
});

test('les photos du profil ne demandent pas la caméra', async ({ page }) => {
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

  // Deux emplacements sans pass — le nombre vient du serveur (`me.limites.photos`), et l'écran
  // ne doit pas en dessiner un de plus : un troisième cadre qu'on ne peut pas remplir est une
  // promesse affichée que rien n'honore.
  const photos = page.locator('input[type=file][name^=photo-]');
  await expect(photos).toHaveCount(2);
  for (let i = 0; i < 2; i += 1) {
    await expect(photos.nth(i)).not.toHaveAttribute('capture', /.*/);
  }
});
