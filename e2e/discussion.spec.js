// Aimer, matcher, écrire. Et deux choses qu'aucun test unitaire ne peut voir : que le filtre
// anti-arnaque dit à la personne ce qu'elle doit corriger, et que le champ de saisie n'est pas
// reconstruit pendant qu'on tape — le clavier se fermerait à chaque interrogation du serveur
// (règle 16 de CLAUDE.md). Ce défaut-là ne se voit que dans un vrai navigateur.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet, actionPrincipale } from './aides.js';

// Aime le premier profil de démonstration : ils rendent le « J'aime », donc le match est immédiat.
async function aimerUnProfil(page) {
  await onglet(page, /Découvrir/).click();
  const carte = page.locator('main article').nth(1);
  await expect(carte).toBeVisible();
  const nom = (await carte.innerText()).split('\n')[0];
  // « J'aime » est l'action principale de l'écran, pas un bouton dans la carte : les marques
  // « J'aime » et « Passer » qu'on voit sur la carte sont les tampons du geste de balayage.
  await expect(actionPrincipale(page)).toHaveText(/J'aime/);
  await actionPrincipale(page).click();
  return nom;
}

const champMessage = (page) => page.locator('input[name=message]');
const boutonEnvoyer = (page) => page.locator('button.send');

// Après un match, l'écran propose d'écrire tout de suite : c'est le chemin que suit une personne.
async function ouvrirLaDiscussion(page) {
  await expect(page.locator('main')).toContainText(/C'est un match/i, { timeout: 20_000 });
  await page.locator('#fallback-bar button', { hasText: /Écrire à/ }).click();
  await expect(champMessage(page)).toBeVisible({ timeout: 15_000 });
}

test('un « J\'aime » rendu ouvre un match, et la discussion s\'ouvre dessus', async ({ page }) => {
  await membreVerifie(page, 'Awa');
  const nom = await aimerUnProfil(page);

  // L'écran de match est le moment fort du produit : il est annoncé, et nomme la personne.
  await expect(page.locator('main')).toContainText(/C'est un match/i, { timeout: 20_000 });
  await expect(page.locator('main')).toContainText(nom);

  // On est dans la discussion : un champ pour écrire, et de quoi envoyer.
  await ouvrirLaDiscussion(page);
  await expect(boutonEnvoyer(page)).toBeVisible();

  // Un message part et s'affiche : c'est le bout du parcours.
  await champMessage(page).fill('Salut, tu connais Le Palmier ?');
  await boutonEnvoyer(page).click();
  await expect(page.locator('#messages')).toContainText('Salut, tu connais Le Palmier ?');
});

test('une demande d\'argent est refusée, et l\'app dit quoi corriger', async ({ page }) => {
  await membreVerifie(page, 'Bana');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  const champ = champMessage(page);
  await champ.fill('envoie 5000 par orange money au 677123456');
  await boutonEnvoyer(page).click();

  // Le refus nomme ce qui l'a déclenché : sans cela, on ne sait pas quoi retirer.
  await expect(page.locator('main')).toContainText(/argent|moyen de paiement/i, { timeout: 10_000 });
  // Et le message n'est pas parti.
  await expect(page.locator('#messages')).not.toContainText('677123456');
});

// Règle 16 : le champ de saisie ne doit jamais être reconstruit pendant la frappe. La discussion
// interroge le serveur toutes les 4 s ; si ce rafraîchissement refaisait l'écran, le clavier se
// fermerait au milieu d'un mot.
//
// Attention au piège : attendre passivement ne prouve rien, parce que sans nouveau message le
// rafraîchissement ne touche pas au DOM. Il faut donc qu'un message arrive VRAIMENT pendant qu'on
// tape — d'où le message envoyé d'abord, auquel le profil de démonstration répond tout seul.
test('un message qui arrive pendant la frappe ne ferme pas le clavier', async ({ page }) => {
  await membreVerifie(page, 'Carine');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  const champ = champMessage(page);
  // Le profil de démonstration répondra à celui-ci pendant qu'on écrit le suivant.
  await champ.fill('Salut, tu es de quel quartier ?');
  await boutonEnvoyer(page).click();
  await expect(page.locator('#messages')).toContainText('tu es de quel quartier');

  await champ.click();
  await champ.type('je suis en train d\'écrire', { delay: 15 });
  // On marque l'élément : s'il est remplacé, la marque disparaît avec lui.
  await champ.evaluate((el) => { el.dataset.temoin = 'avant'; });

  // La réponse arrive et s'affiche : le rafraîchissement a bien eu lieu, il y a donc quelque
  // chose à vérifier. Sans cette attente, le test passerait même si l'écran était refait.
  await expect(page.locator('#messages')).toContainText(/\?|\w{6,}/, { timeout: 25_000 });
  await expect
    .poll(async () => (await page.locator('#messages .msg, #messages > *').count()), { timeout: 25_000 })
    .toBeGreaterThan(1);

  await expect(champ).toHaveAttribute('data-temoin', 'avant');
  await expect(champ).toHaveValue('je suis en train d\'écrire');
  await expect(champ).toBeFocused();
});

// Le clavier qui s'ouvre réduit la fenêtre : la zone des messages rétrécit, mais sa position de
// défilement ne bouge pas, et le message qu'on vient d'envoyer passe sous le champ de saisie.
// Il fallait défiler pour le revoir — au moment précis où l'on écrit la suite.
//
// Playwright ne sait pas ouvrir un clavier ; il sait rétrécir la fenêtre, et c'est exactement ce
// que le clavier fait au document : visualViewport change de taille, --tg-viewport-height suit.
test('le dernier message reste visible quand le clavier réduit la fenêtre', async ({ page }) => {
  const grand = page.viewportSize();
  await membreVerifie(page, 'Yolande');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  // De quoi remplir l'écran : sans historique, tout tient et le défaut ne se voit pas.
  for (const texte of ['Salut', 'Tu es de quel quartier ?', 'Moi je suis à Bastos', 'Et toi tu fais quoi le samedi ?', 'On pourrait se croiser au marché']) {
    await champMessage(page).fill(texte);
    await boutonEnvoyer(page).click();
    await expect(page.locator('#messages')).toContainText(texte);
  }

  const dernierVisible = async () => page.evaluate(() => {
    const box = document.getElementById('messages');
    const bulles = box.querySelectorAll('.bubble');
    const derniere = bulles[bulles.length - 1].getBoundingClientRect();
    const cadre = box.getBoundingClientRect();
    // Deux pixels de tolérance : les arrondis de mise en page ne sont pas un défaut.
    return { visible: derniere.bottom <= cadre.bottom + 2 && derniere.top >= cadre.top - 2, manque: Math.round(derniere.bottom - cadre.bottom) };
  });

  const avant = await dernierVisible();
  expect(avant.visible, `avant le clavier, le dernier message doit être visible (${avant.manque} px dessous)`).toBe(true);

  // Le clavier prend un peu plus de la moitié de la hauteur : c'est ce que fait un clavier Android.
  await page.setViewportSize({ width: grand.width, height: Math.round(grand.height * 0.45) });
  await page.waitForTimeout(400);

  const apres = await dernierVisible();
  expect(apres.visible, `le clavier ouvert, le dernier message doit rester visible (${apres.manque} px sous le cadre)`).toBe(true);

  // Et quelqu'un qui remonte l'historique ne doit pas être ramené de force en bas.
  await page.locator('#messages').evaluate((box) => { box.scrollTop = 0; });
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: grand.width, height: grand.height });
  await page.waitForTimeout(400);
  expect(await page.locator('#messages').evaluate((box) => box.scrollTop)).toBeLessThan(120);
});
