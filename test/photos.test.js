// Jusqu'à trois photos, chacune validée par la modération avant d'être montrée. Refusée : supprimée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-photos-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { config } = await import('../server/config.js');
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot, decidePhoto } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const sent = [];
bot.api.sendMessage = async (chatId, text) => { sent.push({ chatId: String(chatId), text }); return {}; };

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.arrayBuffer() };
};
async function makeUser(id, name, gender) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  await store.updateUser(id, { verification: 'approved' });
}
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const file = (id, n) => path.join(DATA_DIR, 'uploads', `${id}-photo-${n}.jpg`);
const photosSeenBy = async (viewer, id) => { await passer(viewer); const p = await pid(id); return (await call(viewer, '/profiles')).body.profiles.find((x) => x.id === p)?.photos; };

// La vue Liste et le pays entier demandent un pass. Ces tests portent sur autre chose : on leur
// en donne un plutôt que de réécrire ce qu'ils éprouvent.
const passer = (id) => store.updateUser(id, { plus: { source: 'gift', depuisLe: Date.now(), finLe: Date.now() + 30 * 24 * 3600 * 1000 } });

test.after(() => server.close());

// Deux refus qu'il ne faut pas confondre, depuis que le pass ouvre six emplacements : un
// emplacement qui **n'existe pas** (400, et il n'existera jamais) et un emplacement qui existe
// mais que **cette personne** n'a pas (403, et un pass l'ouvre). Les mélanger ferait dire à
// l'app « ça n'existe pas » là où la vraie réponse est « pas encore pour toi ».
test("un emplacement inexistant est refusé, un emplacement fermé l'est autrement", async () => {
  await makeUser('7501', 'Aline', 'femme');
  assert.equal((await call('7501', '/me/photos/0', 'PUT', { photo: JPEG })).status, 400, "l'emplacement 0 n'existe pas");
  assert.equal((await call('7501', '/me/photos/7', 'PUT', { photo: JPEG })).status, 400, "ni le 7");

  const ferme = await call('7501', '/me/photos/3', 'PUT', { photo: JPEG });
  assert.equal(ferme.status, 403, "le 3 existe, mais il demande un pass");
  assert.equal(ferme.body.code, 'PASS_REQUIS');
  await passer('7501');
  assert.equal((await call('7501', '/me/photos/6', 'PUT', { photo: JPEG })).status, 200, 'et le pass va jusqu\'au sixième');
  await call('7501', '/me/photos/6', 'DELETE');

  assert.equal((await call('7501', '/me/photos/1', 'PUT', { photo: 'data:text/plain;base64,QUJD' })).status, 400);
  assert.equal((await call('7501', '/me/photos/1', 'PUT', {})).status, 400);
});

// Le palier s'applique à l'envoi, jamais à l'affichage : des comptes portent trois photos d'un
// temps où trois était la limite pour tout le monde. Les cacher aujourd'hui retirerait à
// quelqu'un ce qu'il avait, parce que la règle a changé sous lui.
test('une photo au-delà du palier reste visible, et reste supprimable', async () => {
  await makeUser('7510', 'Zoe', 'femme');
  await passer('7510');
  assert.equal((await call('7510', '/me/photos/3', 'PUT', { photo: JPEG })).status, 200);
  await store.updateUser('7510', { plus: null });

  const mien = (await call('7510', '/me')).body.photos.map((x) => x.n);
  assert.ok(mien.includes(3), "la troisième photo ne disparaît pas quand le pass s'arrête");
  assert.equal((await call('7510', '/me/photos/3', 'PUT', { photo: JPEG })).status, 403, 'on ne peut plus la remplacer');
  assert.equal((await call('7510', '/me/photos/3', 'DELETE')).status, 200, "mais on peut toujours s'en débarrasser");
});

test('une photo ajoutée attend la modération : visible pour soi, pas pour les autres', async () => {
  await makeUser('7502', 'Paul', 'homme');
  const r = await call('7501', '/me/photos/1', 'PUT', { photo: JPEG });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.photos, [{ n: 1, status: 'pending' }]);
  assert.ok(fs.existsSync(file('7501', 1)), 'le fichier est écrit');
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'pending' }], 'je vois mon attente');
  assert.deepEqual(await photosSeenBy('7502', '7501'), [], 'Paul ne voit rien');
  const p7501 = await pid('7501');
  assert.equal((await call('7502', `/photos/${p7501}/1`)).status, 404, 'Paul ne peut pas la charger');
  assert.equal((await call('7501', `/photos/${p7501}/1`)).status, 200, 'moi, si');
});

test('validée, elle est montrée ; refusée, elle est supprimée et la personne prévenue', async () => {
  await decidePhoto('7501', 1, true);
  assert.deepEqual(await photosSeenBy('7502', '7501'), [1]);
  const p7501 = await pid('7501');
  assert.equal((await call('7502', `/photos/${p7501}/1`)).status, 200);
  assert.equal((await call('7502', `/photos/${p7501}`)).status, 200, 'l\'adresse historique sert la première validée');
  assert.match(sent.at(-1).text, /photo 1 est validée/);

  await call('7501', '/me/photos/2', 'PUT', { photo: JPEG });
  assert.ok(fs.existsSync(file('7501', 2)));
  await decidePhoto('7501', 2, false);
  assert.ok(!fs.existsSync(file('7501', 2)), 'le fichier refusé est effacé');
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'approved' }], 'l\'emplacement 2 a disparu');
  assert.match(sent.at(-1).text, /photo 2 a été refusée/);
  assert.match(sent.at(-1).text, /supprimée/);
});

test('une décision sur une photo déjà retirée ne recrée rien', async () => {
  await call('7501', '/me/photos/3', 'PUT', { photo: JPEG });
  await call('7501', '/me/photos/3', 'DELETE');
  await decidePhoto('7501', 3, true);
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'approved' }]);
  assert.ok(!fs.existsSync(file('7501', 3)));
});

test('retirer sa photo, être bloqué, supprimer son compte', async () => {
  const r = await call('7501', '/me/photos/1', 'DELETE');
  assert.deepEqual(r.body.photos, []);
  assert.ok(!fs.existsSync(file('7501', 1)));
  const p7501b = await pid('7501');
  await passer('7502');
  assert.equal((await call('7502', '/profiles')).body.profiles.find((p) => p.id === p7501b).hasPhoto, false);

  await call('7501', '/me/photos/1', 'PUT', { photo: JPEG });
  await decidePhoto('7501', 1, true);
  await store.block('7502', '7501');
  assert.equal((await call('7502', `/photos/${await pid('7501')}/1`)).status, 404, 'bloqué : pas de photo');

  await call('7501', '/me/photos/2', 'PUT', { photo: JPEG });
  await call('7501', '/me', 'DELETE');
  assert.ok(!fs.existsSync(file('7501', 1)) && !fs.existsSync(file('7501', 2)), 'aucun fichier orphelin');
});

test('un ancien profil à une photo devient l\'emplacement 1, déjà validé', async () => {
  await makeUser('7503', 'Marc', 'homme');
  const u = await store.getUser('7503');
  fs.writeFileSync(path.join(DATA_DIR, 'uploads', '7503-profile.jpg'), Buffer.from('jpeg'));
  // L'état d'avant les trois emplacements : hasPhoto vrai, aucune liste de photos.
  await store.updateUser('7503', { profile: { ...u.profile, hasPhoto: true }, photos: null });
  assert.deepEqual((await call('7503', '/me')).body.photos, [{ n: 1, status: 'approved' }]);
  assert.ok(fs.existsSync(file('7503', 1)) && !fs.existsSync(path.join(DATA_DIR, 'uploads', '7503-profile.jpg')), 'fichier renommé');
});

test('en test, AUTO_APPROVE valide sans attendre', async () => {
  config.autoApprove = true;
  try {
    const r = await call('7503', '/me/photos/2', 'PUT', { photo: JPEG });
    assert.deepEqual(r.body.photos, [{ n: 1, status: 'approved' }, { n: 2, status: 'approved' }]);
  } finally {
    config.autoApprove = false;
  }
});

// ---------- Miniatures : la même photo en petit, fabriquée sur le serveur ----------
// Ce que ces tests figent, dans l'ordre : la miniature existe et coûte moins que la photo ; elle
// passe par la même porte que la photo (une photo en attente n'a pas de miniature publique) ;
// elle vient **du fichier validé et jamais du client** — c'est le seul de ces tests qui protège
// une promesse de sécurité ; une photo qui ne se décode pas garde la photo entière en repli ; et
// tout part avec l'emplacement, puis avec le compte — les six emplacements, plus les trois.
const jpeg = (await import('jpeg-js')).default;
const { MINI_COTE, FLOU_COTE, fabriquerFlou } = await import('../server/photos.js');
// Un vrai JPEG de la taille que le téléphone envoie, à la couleur demandée : le 1 × 1 du haut
// ne dit rien sur la réduction.
function photoDe(couleur, largeur = 640, hauteur = 800) {
  const data = Buffer.alloc(largeur * hauteur * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = couleur[0]; data[i + 1] = couleur[1]; data[i + 2] = couleur[2]; data[i + 3] = 255; }
  return 'data:image/jpeg;base64,' + jpeg.encode({ data, width: largeur, height: hauteur }, 85).data.toString('base64');
}
const taille = (octets) => { const i = jpeg.decode(Buffer.from(octets)); return { l: i.width, h: i.height }; };
const couleurAuCentre = (octets) => { const i = jpeg.decode(Buffer.from(octets)); const o = ((i.height >> 1) * i.width + (i.width >> 1)) * 4; return [i.data[o], i.data[o + 1], i.data[o + 2]]; };
const proche = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 12);
const ROUGE = [200, 40, 40], BLEU = [40, 60, 200];

test('la miniature est un carré bien plus léger, servi par ?mini=1', async () => {
  await makeUser('7601', 'Nadia', 'femme');
  await makeUser('7602', 'Omar', 'homme');
  assert.equal((await call('7601', '/me/photos/1', 'PUT', { photo: photoDe(ROUGE) })).status, 200);
  await decidePhoto('7601', 1, true);
  const p = await pid('7601');
  const entiere = await call('7602', `/photos/${p}/1`);
  const mini = await call('7602', `/photos/${p}/1?mini=1`);
  assert.equal(entiere.status, 200);
  assert.equal(mini.status, 200);
  assert.deepEqual(taille(entiere.body), { l: 640, h: 800 });
  assert.deepEqual(taille(mini.body), { l: MINI_COTE, h: MINI_COTE }, 'un carré, rogné au centre');
  assert.ok(mini.body.byteLength * 5 < entiere.body.byteLength, `la miniature (${mini.body.byteLength} o) doit coûter bien moins que la photo (${entiere.body.byteLength} o)`);
  assert.ok(proche(couleurAuCentre(mini.body), ROUGE), 'c\'est bien la même image');
  assert.ok(fs.existsSync(file('7601', 1).replace('.jpg', '-mini.jpg')), 'écrite une fois, à l\'envoi');
});

// L'aperçu flouté : dix pixels de côté, fait sur le serveur. C'est ce qu'une personne sans pass
// voit de qui l'a aimée. Il doit garder la couleur (on reconnaît « quelqu'un »), perdre tout le
// reste, et n'ouvrir aucune porte : la réponse de /likes ne porte ni identifiant ni adresse.
test("l'aperçu flouté est dix pixels de côté, de la bonne couleur, et il part en data: sans identifiant", async () => {
  await makeUser('7621', 'Rose', 'femme');
  await makeUser('7622', 'Sami', 'homme');
  assert.equal((await call('7622', '/me/photos/1', 'PUT', { photo: photoDe(BLEU) })).status, 200);
  await decidePhoto('7622', 1, true);
  // La fabrique seule, sur la miniature.
  const flou = fabriquerFlou(fs.readFileSync(file('7622', 1)));
  assert.deepEqual(taille(flou), { l: FLOU_COTE, h: FLOU_COTE });
  assert.ok(flou.byteLength < 1200, `dix pixels de côté ne pèsent presque rien (${flou.byteLength} o)`);
  assert.ok(proche(couleurAuCentre(flou), BLEU), 'la couleur reste, le reste part');
  // Par la route : Sami aime Rose, Rose n'a pas de pass, elle reçoit une tache bleue en data:.
  assert.equal((await call('7622', '/swipes', 'POST', { targetId: await pid('7621'), action: 'like' })).status, 200);
  const r = await call('7621', '/likes');
  assert.equal(r.status, 200);
  assert.equal(r.body.flou, true);
  assert.equal(r.body.apercus.length, 1);
  assert.match(r.body.apercus[0], /^data:image\/jpeg;base64,/);
  const octets = Buffer.from(r.body.apercus[0].split(',')[1], 'base64');
  assert.deepEqual(taille(octets), { l: FLOU_COTE, h: FLOU_COTE });
  assert.ok(proche(couleurAuCentre(octets), BLEU));
  const brut = JSON.stringify(r.body);
  assert.ok(!brut.includes(await pid('7622')) && !brut.includes('/photos/'), "ni l'identifiant ni l'adresse de la photo : rien à redemander en clair");
});

test('la miniature passe par la même porte que la photo', async () => {
  await call('7601', '/me/photos/2', 'PUT', { photo: photoDe(BLEU) });
  const p = await pid('7601');
  assert.equal((await call('7601', `/photos/${p}/2?mini=1`)).status, 200, 'la sienne, même en attente');
  assert.equal((await call('7602', `/photos/${p}/2?mini=1`)).status, 404, 'en attente : personne d\'autre');
  await decidePhoto('7601', 2, true);
  assert.equal((await call('7602', `/photos/${p}/2?mini=1`)).status, 200);
  await makeUser('7605', 'Yann', 'homme');
  assert.equal((await call('7605', `/photos/${p}/2?mini=1`)).status, 200);
  await store.block('7605', '7601');
  assert.equal((await call('7605', `/photos/${p}/2?mini=1`)).status, 404, 'bloqué : pas de miniature non plus');
});

test('la miniature vient du fichier validé, jamais du client', async () => {
  await makeUser('7603', 'Paul', 'homme');
  await makeUser('7604', 'Rose', 'femme');
  // Un client qui enverrait sa propre miniature : la photo validée est rouge, la « miniature »
  // envoyée est bleue. Ce que les listes montrent doit être rouge.
  assert.equal((await call('7603', '/me/photos/1', 'PUT', { photo: photoDe(ROUGE), mini: photoDe(BLEU, 160, 160) })).status, 200);
  await decidePhoto('7603', 1, true);
  const mini = await call('7604', `/photos/${await pid('7603')}/1?mini=1`);
  assert.equal(mini.status, 200);
  assert.ok(proche(couleurAuCentre(mini.body), ROUGE), 'la miniature montre ce que la modération a vu');
});

test('une nouvelle photo dans le même emplacement emporte l\'ancienne miniature', async () => {
  const p = await pid('7603');
  assert.equal((await call('7603', '/me/photos/1', 'PUT', { photo: photoDe(BLEU) })).status, 200);
  await decidePhoto('7603', 1, true);
  const mini = await call('7604', `/photos/${p}/1?mini=1`);
  assert.ok(proche(couleurAuCentre(mini.body), BLEU), 'la liste ne montre pas la photo d\'avant à côté de la fiche d\'après');
});

test('une photo qui ne se décode pas garde la photo entière en repli', async () => {
  // Le serveur ne vérifie pas le contenu à l'envoi, seulement le préfixe et le poids : ces octets
  // passent, et la miniature ne peut pas en être tirée. La liste reçoit alors la photo telle
  // quelle, et aucune erreur.
  const bruit = 'data:image/jpeg;base64,' + Buffer.from('pas un jpeg, et pas près de l\'être').toString('base64');
  assert.equal((await call('7603', '/me/photos/2', 'PUT', { photo: bruit })).status, 200);
  await decidePhoto('7603', 2, true);
  const p = await pid('7603');
  const r = await call('7604', `/photos/${p}/2?mini=1`);
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.body).toString(), 'pas un jpeg, et pas près de l\'être');
  assert.ok(!fs.existsSync(file('7603', 2).replace('.jpg', '-mini.jpg')), 'rien d\'écrit pour une miniature impossible');
});

test('une photo d\'avant les miniatures en reçoit une à la première demande', async () => {
  // Les photos envoyées avant ce chantier — et celles des profils de démonstration — n'ont pas
  // de miniature sur le disque. La première liste qui la demande la fabrique.
  fs.writeFileSync(file('7601', 3), Buffer.from(photoDe(BLEU).split(',')[1], 'base64'));
  await store.setPhoto('7601', 3, 'approved');
  assert.ok(!fs.existsSync(file('7601', 3).replace('.jpg', '-mini.jpg')));
  const r = await call('7602', `/photos/${await pid('7601')}/3?mini=1`);
  assert.equal(r.status, 200);
  assert.deepEqual(taille(r.body), { l: MINI_COTE, h: MINI_COTE });
  assert.ok(fs.existsSync(file('7601', 3).replace('.jpg', '-mini.jpg')), 'et la garde pour la fois d\'après');
});

test('l\'emplacement vidé emporte sa miniature ; le compte supprimé, les six', async () => {
  await call('7601', '/me/photos/3', 'DELETE');
  assert.ok(!fs.existsSync(file('7601', 3)) && !fs.existsSync(file('7601', 3).replace('.jpg', '-mini.jpg')), 'les deux fichiers partent ensemble');

  await passer('7601');
  for (const n of [3, 4, 5, 6]) assert.equal((await call('7601', `/me/photos/${n}`, 'PUT', { photo: photoDe(ROUGE) })).status, 200, `emplacement ${n}`);
  const avant = fs.readdirSync(path.join(DATA_DIR, 'uploads')).filter((f) => f.startsWith('7601-'));
  assert.equal(avant.length, 12, `six photos et six miniatures avant la suppression (${avant.join(', ')})`);
  await call('7601', '/me', 'DELETE');
  const apres = fs.readdirSync(path.join(DATA_DIR, 'uploads')).filter((f) => f.startsWith('7601-'));
  assert.deepEqual(apres, [], 'aucun fichier orphelin : les emplacements 4 à 6 survivaient à la suppression du compte');
});
