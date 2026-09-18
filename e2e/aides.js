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
export const actionSecondaire = (page) => page.locator('#fallback-bar button.secondary');
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

  await expect(titre(page)).toHaveText(/Ta photo et ton prénom/);
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

// Les réglages vivent derrière le SettingsButton de Telegram ; hors Telegram, l'onglet Profil
// porte une ligne qui y mène (audit 15, lot 3).
export async function ouvrirLesReglages(page) {
  await onglet(page, /Profil|Анкета|Профіль/).click();
  await page.locator('.list-row[data-screen="reglages"]').click();
  await expect(titre(page)).toHaveText(/Réglages|Settings|Настройки|Налаштування/);
}

// Depuis le lot 3 de l'audit 15, ni la jauge ni la présentation vocale ne s'intercalent entre le
// profil et la découverte : profil → vérification → Découvrir. Les deux passages ci-dessous sont
// gardés tolérants — ils traversent l'écran s'il est là, et ne font rien sinon.
export async function passerLaJauge(page) {
  await expect(titre(page)).toHaveText(/La jauge de confiance|Vérifie que c'est bien toi/);
  if (/jauge/i.test((await titre(page).textContent()) || '')) await actionPrincipale(page).click();
  await expect(titre(page)).toHaveText(/Vérifie que c'est bien toi/);
}

// La présentation vocale est proposée une seule fois, juste après la vérification : c'est le
// moment où l'on a une fiche à compléter. « Plus tard » mène à la découverte, et la fiche garde
// le lien. Comme pour la jauge, le passage est tolérant — un deuxième compte créé dans le même
// onglet ne la reverra pas — et le test qui vérifie qu'elle s'affiche est dans inscription.spec.js.
export async function passerLaVoix(page) {
  const titreVoix = page.locator('main h1', { hasText: /Ta présentation vocale/ });
  // On attend le premier des deux écrans qui arrive : la proposition, ou la découverte elle-même
  // si elle a déjà été vue dans cet onglet. Une course, pas un « ou » de locators : les onglets
  // existent dans le DOM même cachés, et un « ou » choisirait l'élément caché.
  await Promise.race([
    titreVoix.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}),
    onglet(page, /Découvrir/).waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}),
  ]);
  if (await titreVoix.isVisible()) await actionSecondaire(page).click();
}

// Envoie le selfie de vérification. AUTO_APPROVE le valide tout seul après quelques secondes ;
// en production ce réglage n'existe pas, c'est un humain qui tranche.
export async function seFaireVerifier(page) {
  await passerLaJauge(page);
  // Choisir la photo ne l'envoie pas : l'aperçu s'affiche d'abord, et on peut reprendre.
  // Sous « badge » (le second serveur, e2e/badge.spec.js), l'écran porte un lien « Plus tard » ;
  // sous « gate », non. C'est ce qui dit quelle politique sert cette page.
  const badge = (await page.locator('main button', { hasText: /Plus tard/ }).count()) > 0;
  await page.locator('input[type=file][name=selfie]').setInputFiles(sonSelfie);
  await actionPrincipale(page).click();
  // La décision automatique tombe au bout de trois secondes. Sous « gate », l'écran d'attente
  // la lit et ouvre la découverte ; sous « badge », le selfie envoyé mène tout de suite à
  // Découvrir (audit 16, lot A) et une veille la lit dans les cinq secondes : on attend alors le
  // toast du bouclier, pour que le compte soit vérifié des deux côtés — serveur et écran —
  // avant que le test continue.
  await passerLaVoix(page);
  await expect(onglet(page, /Découvrir/)).toBeVisible({ timeout: 25_000 });
  if (badge) await expect(page.locator('#toast')).toContainText(/bouclier est sur ta fiche/, { timeout: 25_000 });
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
