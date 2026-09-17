// Aimer, matcher, écrire. Et deux choses qu'aucun test unitaire ne peut voir : que le filtre
// anti-arnaque dit à la personne ce qu'elle doit corriger, et que le champ de saisie n'est pas
// reconstruit pendant qu'on tape — le clavier se fermerait à chaque interrogation du serveur
// (règle 16 de CLAUDE.md). Ce défaut-là ne se voit que dans un vrai navigateur.
import { test, expect } from '@playwright/test';
import { membreVerifie, onglet, actionPrincipale, sonSelfie } from './aides.js';

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
  // Le profil de démonstration répond 400 ms après chaque message, et depuis le flux il répond
  // **à coup sûr** dans la fenêtre qui suit. Un message qui arrive pendant qu'on mesure le
  // défilement n'est pas ce que ce test éprouve : on attend que la démo ait fini de parler.
  await expect(page.locator('.bubble.theirs').first()).toBeVisible({ timeout: 10_000 });
  for (let avant = -1, n = 0; avant !== n;) { avant = n; await page.waitForTimeout(700); n = await page.locator('.bubble.theirs').count(); }

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

// Toucher « envoyer » donnait le focus au bouton, donc le retirait au champ. Sur Android le
// clavier se ferme alors, puis se rouvre quand le champ le reprend : l'écran se dandine à chaque
// message envoyé — et comme la discussion se recolle en bas à chaque changement de hauteur, le
// mouvement se voyait deux fois. Ici on compte les allers-retours du focus : il doit y en avoir
// zéro, et le message doit partir quand même.
test('envoyer un message ne fait pas perdre le focus au champ, donc le clavier ne bouge pas', async ({ page }) => {
  await membreVerifie(page, 'Zara');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  await page.evaluate(() => {
    window.__focus = [];
    const champ = document.querySelector('input[name=message]');
    champ.addEventListener('blur', () => window.__focus.push('le champ perd le focus'));
    document.querySelector('.composer .send').addEventListener('focus', () => window.__focus.push('le bouton le prend'));
  });

  await champMessage(page).fill('Un message, sans faire bouger le clavier');
  await boutonEnvoyer(page).click();

  await expect(page.locator('#messages')).toContainText('Un message, sans faire bouger le clavier');
  const mouvements = await page.evaluate(() => window.__focus);
  expect(mouvements, `le focus ne doit pas bouger : ${mouvements.join(', ')}`).toEqual([]);
  expect(await page.evaluate(() => document.activeElement?.name)).toBe('message');
});

// La bulle doit apparaître **avant** la réponse du serveur. C'est le geste le plus fréquent de
// l'app, et il était le plus lent : un aller-retour vers Amsterdam, soit une à deux secondes de
// rien du tout sur un réseau ordinaire. Aucun test unitaire ne peut voir ça — il faut un vrai
// navigateur, une vraie réponse retenue, et regarder l'écran pendant qu'elle est retenue.
test("la bulle apparaît avant la réponse du serveur, et se confirme ensuite", async ({ page }) => {
  await membreVerifie(page, 'Nina');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  // On retient la réponse du serveur : c'est exactement ce que fait un réseau lent.
  let relacher;
  const retenue = new Promise((r) => { relacher = r; });
  await page.route('**/api/matches/*/messages', async (route) => { await retenue; await route.continue(); });

  await champMessage(page).fill('Bonjour, tu connais le quartier ?');
  await boutonEnvoyer(page).click();

  // Pendant que le serveur ne répond pas : la bulle est là, marquée en cours, et le champ est
  // déjà vide — on peut enchaîner sans attendre.
  const bulle = page.locator('.bubble.mine', { hasText: 'tu connais le quartier' });
  await expect(bulle).toBeVisible({ timeout: 3000 });
  await expect(bulle).toHaveClass(/encours/);
  await expect(champMessage(page)).toHaveValue('');

  relacher();
  // Confirmée : la marque disparaît et l'heure remplace l'horloge.
  await expect(bulle).not.toHaveClass(/encours/, { timeout: 15_000 });
  await expect(bulle.locator('.time')).toHaveText(/\d/);
});

// Un message refusé ne doit jamais avoir eu l'air d'être parti — sur une app anti-arnaque, c'est
// le mensonge à ne pas faire. Et le texte doit revenir dans le champ : le perdre ferait retaper.
test("un message bloqué retire sa bulle et rend le texte au champ", async ({ page }) => {
  await membreVerifie(page, 'Olga');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  const texte = 'Envoie-moi 5000 FCFA par Orange Money';
  await champMessage(page).fill(texte);
  await boutonEnvoyer(page).click();

  // L'anti-arnaque refuse : plus aucune bulle ne porte ce texte.
  await expect(page.locator('.notice-warn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bubble', { hasText: 'Orange Money' })).toHaveCount(0);
  await expect(champMessage(page)).toHaveValue(texte);
});

// Deux pannes signalées depuis le téléphone, sur le même en-tête.
//
// L'avatar restait vide : l'« économie de data » (retirée depuis) retenait aussi cette image-là.
//
// Et l'appui ne menait nulle part : `SCREENS.person` ne cherchait la fiche que dans le paquet et
// dans « qui t'a aimé », jamais dans la discussion ouverte. Il tombait donc sur le repli
// `go('discover')` et renvoyait sur Découvrir **sans un mot**.
test("l'en-tête de la discussion montre la photo et ouvre bien la fiche", async ({ page }) => {
  await membreVerifie(page, 'Pia');
  const nom = await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  // La photo est là : un en-tête vide dans une discussion ouverte se lit comme une panne.
  const entete = page.locator('.chat-head .head-profil');
  await expect(entete.locator('.avatar img')).toBeVisible({ timeout: 15_000 });

  // L'appui ouvre la fiche, et pas Découvrir.
  await entete.click();
  // Une fiche, une seule carte — Découvrir en pose deux. Sans ce compte, le test passerait
  // encore en étant renvoyé sur le paquet, ce qui est précisément la panne.
  await expect(page.locator('main .card')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('main .card')).toContainText(nom.split(',')[0]);
  // Un match ne s'aime ni ne se passe : les deux gestes n'ont plus de sens ici.
  await expect(actionPrincipale(page)).toHaveText(/Écrire à/);
  await expect(page.locator('#fallback-bar button', { hasText: /^Passer$/ })).toHaveCount(0);

  // Et le retour ramène à la discussion, pas au paquet.
  await actionPrincipale(page).click();
  await expect(champMessage(page)).toBeVisible({ timeout: 10_000 });
});

// Le silence après le match est le risque principal du produit. Le haut d'une discussion vide
// propose maintenant des amorces tirées de la fiche de l'autre. Ce qu'un test unitaire ne peut
// pas voir : qu'une amorce **remplit le champ sans envoyer**, que la personne garde la main, et
// que la carte s'efface une fois le premier message parti.
test("une amorce remplit le champ sans l'envoyer, et la carte s'efface au premier message", async ({ page }) => {
  await membreVerifie(page, 'Rita');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);

  const carte = page.locator('.ouverture');
  await expect(carte).toBeVisible();
  await expect(carte).toContainText(/Vous vous êtes plu/);
  const amorces = carte.locator('.amorces button');
  await expect(amorces.first()).toBeVisible();

  // L'amorce va dans le champ, et rien ne part.
  const texte = (await amorces.first().textContent()).trim();
  await amorces.first().click();
  await expect(champMessage(page)).toHaveValue(texte);
  await expect(page.locator('.bubble.mine')).toHaveCount(0);
  await expect(carte).toBeVisible();

  // La personne peut corriger avant d'envoyer : c'est le sien, pas le nôtre.
  await champMessage(page).fill(`${texte} Moi c'est le calme.`);
  await boutonEnvoyer(page).click();
  await expect(page.locator('.bubble.mine')).toHaveCount(1);
  await expect(carte).toHaveCount(0);
});

// Le temps réel a un repli, et le repli est ce qui compte : si le flux ne s'ouvre pas — proxy
// qui le coupe, réseau qui le refuse — les messages doivent arriver exactement comme avant lui.
// On coupe le flux dans le navigateur et on attend la réponse du profil de démonstration.
test('sans le flux, les messages arrivent quand même par l\'interrogation', async ({ page }) => {
  await page.route('**/api/matches/*/flux', (route) => route.abort());
  await membreVerifie(page, 'Sara');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);
  await champMessage(page).fill('Coucou, tu vas bien ?');
  await boutonEnvoyer(page).click();
  await expect(page.locator('.bubble.mine')).toHaveCount(1);
  await expect(page.locator('.bubble.theirs')).toHaveCount(1, { timeout: 15_000 });
});

test('avec le flux, la réponse arrive aussi — et vite', async ({ page }) => {
  await membreVerifie(page, 'Tess');
  await aimerUnProfil(page);
  await ouvrirLaDiscussion(page);
  await champMessage(page).fill('Coucou, tu vas bien ?');
  await boutonEnvoyer(page).click();
  // La réponse de démonstration part 400 ms après le message ; par le flux, elle est à l'écran
  // bien avant la première interrogation de sécurité (30 s) — et avant l'ancien rythme (1,5 s).
  const debut = Date.now();
  await expect(page.locator('.bubble.theirs')).toHaveCount(1, { timeout: 15_000 });
  expect(Date.now() - debut).toBeLessThan(6000);
});

// Ce qu'une discussion « plate » n'avait pas, et qu'on lit sans qu'on nous l'explique : trois
// points quand l'autre écrit, « En ligne » quand il est là, et deux coches quand il a lu. Deux
// vrais navigateurs, deux comptes, et c'est **le second** qui doit voir ce que fait le premier.
test("deux navigateurs : on voit l'autre écrire, être là, et avoir lu", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  const idA = await membreVerifie(a, 'Nadia', { genre: /Femme/ });
  const idB = await membreVerifie(b, 'Omar', { genre: /Homme/ });
  const ha = { 'x-dev-user': idA, 'content-type': 'application/json' }, hb = { 'x-dev-user': idB, 'content-type': 'application/json' };
  const pidA = (await (await request.get('/api/me', { headers: ha })).json()).publicProfile.id;
  const pidB = (await (await request.get('/api/me', { headers: hb })).json()).publicProfile.id;
  await request.post('/api/swipes', { headers: ha, data: { targetId: pidB, action: 'like' } });
  const m = await (await request.post('/api/swipes', { headers: hb, data: { targetId: pidA, action: 'like' } })).json();
  const matchId = m.match.id;
  await a.goto(`/?dev_user=${idA}&screen=chat&match=${matchId}`);
  await b.goto(`/?dev_user=${idB}&screen=chat&match=${matchId}`);
  await expect(champMessage(a)).toBeVisible();
  await expect(champMessage(b)).toBeVisible();

  // Présence : chacun voit l'autre « En ligne », par le flux ou par l'interrogation.
  await expect(a.locator('#chat-sub')).toContainText(/En ligne/, { timeout: 15_000 });
  await expect(b.locator('#chat-sub')).toContainText(/En ligne/, { timeout: 15_000 });

  // Frappe : Nadia tape, Omar voit les trois points dans le fil et « écrit… » dans l'en-tête.
  await champMessage(a).pressSequentially('Tu connais le café du Rond-point ?', { delay: 40 });
  await expect(b.locator('#messages .bubble.frappe')).toBeVisible({ timeout: 10_000 });
  await expect(b.locator('#chat-sub')).toContainText(/écrit…/);
  // Et Nadia ne voit pas sa propre frappe.
  await expect(a.locator('#messages .bubble.frappe')).toHaveCount(0);

  // Envoi : une coche chez Nadia (pris par le serveur), la bulle chez Omar.
  await boutonEnvoyer(a).click();
  const bulle = a.locator('#messages .bubble.mine', { hasText: 'Rond-point' });
  await expect(bulle).not.toHaveClass(/encours/);
  await expect(bulle.locator('.etat')).toHaveAttribute('aria-label', 'Envoyé');
  await expect(b.locator('#messages .bubble.theirs', { hasText: 'Rond-point' })).toBeVisible({ timeout: 10_000 });
  // La bulle de frappe est partie avec le message.
  await expect(b.locator('#messages .bubble.frappe')).toHaveCount(0);

  // Lecture : Omar a la discussion ouverte, donc il a lu — Nadia voit deux coches.
  await expect(bulle).toHaveClass(/\blu\b/, { timeout: 15_000 });
  await expect(bulle.locator('.etat')).toHaveAttribute('aria-label', 'Lu');

  // Départ : Omar quitte, Nadia ne le voit plus « En ligne » — la tranche d'activité revient
  // (« En ligne récemment »), qui est une autre chose : une tranche, pas une présence.
  await ctxB.close();
  await expect(a.locator('#chat-sub .enligne')).toHaveCount(0, { timeout: 20_000 });
  await ctxA.close();
});

// Répondre à un message, retirer le sien, envoyer une photo : trois gestes que la discussion
// n'avait pas, et qu'on ne prouve qu'à deux — la citation, le voile et « Message supprimé » se
// voient **chez l'autre**. Hors Telegram, le menu du message est une feuille à nous
// (tg.popup, repli) : c'est elle que ce test touche.
test('deux navigateurs : répondre à un message, envoyer une photo voilée, retirer le sien', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  const idA = await membreVerifie(a, 'Nadia', { genre: /Femme/ });
  const idB = await membreVerifie(b, 'Omar', { genre: /Homme/ });
  const ha = { 'x-dev-user': idA, 'content-type': 'application/json' }, hb = { 'x-dev-user': idB, 'content-type': 'application/json' };
  const pidA = (await (await request.get('/api/me', { headers: ha })).json()).publicProfile.id;
  const pidB = (await (await request.get('/api/me', { headers: hb })).json()).publicProfile.id;
  await request.post('/api/swipes', { headers: ha, data: { targetId: pidB, action: 'like' } });
  const m = await (await request.post('/api/swipes', { headers: hb, data: { targetId: pidA, action: 'like' } })).json();
  await a.goto(`/?dev_user=${idA}&screen=chat&match=${m.match.id}`);
  await b.goto(`/?dev_user=${idB}&screen=chat&match=${m.match.id}`);
  await expect(champMessage(a)).toBeVisible();
  await expect(champMessage(b)).toBeVisible();

  // Nadia écrit ; Omar ouvre le menu de sa bulle et répond. La citation se lit des deux côtés.
  await champMessage(a).fill('Tu viens de quel quartier ?');
  await boutonEnvoyer(a).click();
  const question = b.locator('#messages .bubble.theirs', { hasText: 'quartier' });
  await expect(question).toBeVisible({ timeout: 10_000 });
  await question.click({ button: 'right' });
  await b.locator('#fallback-sheet [data-popup="repondre"]').click();
  await expect(b.locator('#chat-reponse')).toContainText(/Répondre à Nadia/);
  await expect(b.locator('#chat-reponse')).toContainText('quartier');
  await champMessage(b).fill('De Bastos, et toi ?');
  await boutonEnvoyer(b).click();
  await expect(b.locator('#chat-reponse')).toBeEmpty();
  const reponse = b.locator('#messages .bubble.mine', { hasText: 'Bastos' });
  await expect(reponse.locator('.quote')).toContainText('quartier');
  await expect(a.locator('#messages .bubble.theirs', { hasText: 'Bastos' }).locator('.quote')).toContainText('quartier', { timeout: 10_000 });
  // Toucher la citation remonte au message cité.
  await reponse.locator('.quote').click();
  await expect(question.or(b.locator('#messages .bubble.cible'))).toBeVisible();

  // Nadia envoie une photo : chez elle en clair, chez Omar voilée jusqu'à l'appui.
  await a.locator('input[name="photo-chat"]').setInputFiles(sonSelfie);
  const chezNadia = a.locator('#messages .bubble.photo.mine');
  await expect(chezNadia).toBeVisible();
  await expect(chezNadia).not.toHaveClass(/voile/);
  await expect(chezNadia).not.toHaveClass(/encours/, { timeout: 10_000 });
  const chezOmar = b.locator('#messages .bubble.photo.theirs');
  await expect(chezOmar).toBeVisible({ timeout: 10_000 });
  await expect(chezOmar).toHaveClass(/voile/);
  await expect(chezOmar).toContainText(/Toucher pour voir/);
  await expect(chezOmar.locator('img')).toHaveAttribute('src', /blob:/, { timeout: 10_000 });
  await chezOmar.locator('.img').click();
  await expect(chezOmar).not.toHaveClass(/voile/);
  // Un second appui ouvre l'image en grand ; un appui la referme.
  await chezOmar.locator('.img').click();
  await expect(b.locator('.visionneuse img')).toBeVisible();
  await b.locator('.visionneuse').click();
  await expect(b.locator('.visionneuse')).toHaveCount(0);
  // La liste des discussions dit « Photo » plutôt qu'une ligne vide.
  await b.goto(`/?dev_user=${idB}&screen=matches`);
  await expect(b.locator('main .list-row .preview').first()).toContainText(/Photo/);
  await b.goto(`/?dev_user=${idB}&screen=chat&match=${m.match.id}`);
  await expect(champMessage(b)).toBeVisible();

  // Nadia retire sa question : les deux fils disent « Message supprimé », à la même place.
  const maQuestion = a.locator('#messages .bubble.mine', { hasText: 'quartier' });
  await maQuestion.click({ button: 'right' });
  await a.locator('#fallback-sheet [data-popup="supprimer"]').click();
  await expect(a.locator('#messages .bubble.supprime')).toBeVisible();
  await expect(a.locator('#messages')).not.toContainText('quel quartier');
  await expect(b.locator('#messages .bubble.supprime')).toBeVisible({ timeout: 15_000 });
  await expect(b.locator('#messages')).not.toContainText('quel quartier');
  // Et la citation qui pointait dessus le dit aussi.
  await expect(b.locator('#messages .bubble.mine', { hasText: 'Bastos' }).locator('.quote')).toContainText(/Message supprimé/);
  // Le menu d'un message de l'autre ne propose pas de le retirer.
  await b.locator('#messages .bubble.theirs.photo').click({ button: 'right' });
  await expect(b.locator('#fallback-sheet [data-popup="repondre"]')).toBeVisible();
  await expect(b.locator('#fallback-sheet [data-popup="supprimer"]')).toHaveCount(0);
  await ctxA.close();
  await ctxB.close();
});
