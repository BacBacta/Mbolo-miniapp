// Gestes partagés par les tests de bout en bout.
//
// Hors de Telegram, l'action principale n'est pas un bouton natif mais la « barre de secours »
// que tg.js construit (#fallback-bar). Tous les écrans y passent : c'est donc par là que les
// tests cliquent, exactement comme le ferait quelqu'un dans un navigateur.
import { expect } from '@playwright/test';

let compteur = 0;
// Un identifiant neuf par test : deux tests ne doivent jamais se partager un compte, sinon
// l'ordre d'exécution deviendrait un détail dont ils dépendent.
export const nouvelIdentifiant = () => `e2e-${Date.now().toString(36)}-${compteur++}`;

export const actionPrincipale = (page) => page.locator('#fallback-bar button.main');
export const titre = (page) => page.locator('main h1, main h2').first();

// Le plus petit JPEG valide : le serveur vérifie l'en-tête, pas le contenu de l'image.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
  + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
export const sonSelfie = { name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: JPEG };

// Ouvre l'app comme le ferait un lien. Le paramètre remplace l'authentification Telegram :
// c'est ce que permet ALLOW_DEV_AUTH, et seulement hors production.
export async function ouvrir(page, id) {
  await page.goto(`/?dev_user=${id}`);
  await expect(titre(page)).toBeVisible();
}

// Les trois écrans du formulaire, dans l'ordre où on les rencontre.
export async function creerProfil(page, { prenom, age = '24', genre = /Femme/, intention = /Amitié/, ville = 'Yaoundé', quartier = 'Bastos' }) {
  await actionPrincipale(page).click();

  await expect(titre(page)).toHaveText(/Fais-toi connaître/);
  await page.locator('input[name=name]').fill(prenom);
  await page.locator('input[name=age]').fill(age);
  await page.locator('main button', { hasText: genre }).first().click();
  await actionPrincipale(page).click();

  await expect(titre(page)).toHaveText(/Ce que tu cherches/);
  await page.locator('main button', { hasText: intention }).first().click();
  await page.locator('input[name=city]').fill(ville);
  await page.locator('input[name=area]').fill(quartier);
  await actionPrincipale(page).click();

  await expect(titre(page)).toHaveText(/Ta touche personnelle/);
  await page.locator('input[name=promptA]').fill('Le poisson braisé de la rue de la Joie');
  await page.locator('input[name=languages]').fill('Français');
  await actionPrincipale(page).click();
}

// L'explication de la jauge de confiance s'ouvre une fois, juste après l'enregistrement du
// profil (P1-5). « Une fois » se retient dans le navigateur : un deuxième compte créé dans le
// même onglet ne la reverra pas. D'où le passage tolérant — le test qui vérifie qu'elle
// s'affiche, lui, est dans inscription.spec.js et n'a rien de tolérant.
export async function passerLaJauge(page) {
  await expect(titre(page)).toHaveText(/La jauge de confiance|Vérifie que c'est bien toi/);
  if (/jauge/i.test((await titre(page).textContent()) || '')) await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Vérifie que c'est bien toi/);
}

// Envoie le selfie de vérification. AUTO_APPROVE le valide tout seul après quelques secondes ;
// en production ce réglage n'existe pas, c'est un humain qui tranche.
export async function seFaireVerifier(page) {
  await passerLaJauge(page);
  // Choisir la photo ne l'envoie pas : l'aperçu s'affiche d'abord, et on peut reprendre.
  await page.locator('input[type=file][name=selfie]').setInputFiles(sonSelfie);
  await actionPrincipale(page).click();
  // La décision automatique tombe au bout de trois secondes : on attend l'écran qui suit.
  await expect(onglet(page, /Découvrir/)).toBeVisible({ timeout: 25_000 });
}

// Les onglets n'existent qu'une fois le compte vérifié : leur présence est le signal le plus sûr.
export const onglet = (page, nom) => page.locator('#tabs button, #tabs a', { hasText: nom });

// Compte complet et vérifié, prêt à rencontrer du monde.
export async function membreVerifie(page, prenom, options = {}) {
  const id = nouvelIdentifiant();
  await ouvrir(page, id);
  await creerProfil(page, { prenom, ...options });
  await seFaireVerifier(page);
  return id;
}
