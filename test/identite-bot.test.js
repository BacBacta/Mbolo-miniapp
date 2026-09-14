// Le nom que Telegram affiche pour le bot, et pourquoi le serveur le pose lui-même.
//
// Ce nom ne vit pas dans le dépôt : il est posé à la main dans BotFather. Renommer l'app ne le
// suit donc pas — au passage de « Mbolo » à « Odo », l'app s'est renommée partout et la fiche du
// bot a gardé l'ancien nom, sans que rien dans le code puisse le voir.
//
// **Deux erreurs ont été faites avant d'arriver ici, et les deux sont figées plus bas.**
//
// La première : `setMyName({ name })` au lieu de `setMyName(nom)`. Le test d'alors remplaçait la
// méthode de grammY par une fausse qui prenait un objet ; le code et le test se trompaient
// pareil, le vert ne prouvait rien. D'où le transformateur : il voit la requête telle qu'elle
// partirait sur le réseau, méthode et charge utile, et c'est le seul endroit où l'accord avec la
// bibliothèque se vérifie vraiment.
//
// La seconde : il n'y a pas un nom, il y en a huit. Telegram garde un nom par défaut et un nom
// dédié par langue, et le dédié masque le défaut. La fiche publique affichait « Odo » — c'est le
// défaut — pendant qu'un téléphone en français continuait d'afficher « Mbolo ».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-identite-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.APP_NAME = 'Odo';

const { bot, alignerLeNom } = await import('../server/bot.js');
const { LANGUES } = await import('../server/i18n.js');

// Un faux Telegram posé là où la requête se sérialise : rien ne touche le réseau, et on garde ce
// qui serait parti. `noms` décrit ce que Telegram détient : la clé 'defaut', et une clé par
// langue ayant un nom dédié. Une langue absente n'a pas de nom dédié, donc Telegram rend le
// défaut — c'est exactement ce que fait l'API.
function telegramQuiDetient(noms, { refuse = false } = {}) {
  const requetes = [];
  bot.api.config.use(async (prev, methode, charge) => {
    requetes.push({ methode, charge });
    if (refuse) return { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3600' };
    if (methode === 'getMyName') {
      const langue = charge?.language_code;
      return { ok: true, result: { name: (langue ? noms[langue] : undefined) ?? noms.defaut } };
    }
    if (methode === 'setMyName') {
      const langue = charge?.language_code;
      if (!langue) noms.defaut = charge.name;
      else if (charge.name === '') delete noms[langue];
      else noms[langue] = charge.name;
      return { ok: true, result: true };
    }
    return { ok: true, result: true };
  });
  return requetes;
}

test('le nom par défaut est posé, avec la charge utile que Telegram attend', async () => {
  const noms = { defaut: 'Mbolo' };
  const requetes = telegramQuiDetient(noms);
  const r = await alignerLeNom();

  assert.equal(r.ok, true, JSON.stringify(r));
  const pose = requetes.find((q) => q.methode === 'setMyName' && !q.charge?.language_code);
  assert.ok(pose, 'le défaut doit être posé');
  // Le cœur du test : ce qui part vers Telegram. Avec setMyName({ name }), on trouverait ici
  // { name: { name: 'Odo' } }, Telegram refuserait, et le nom resterait l'ancien.
  assert.deepEqual(pose.charge, { name: 'Odo' }, 'Telegram attend name en chaîne, pas un objet');
  assert.equal(noms.defaut, 'Odo');
});

// Le cas qui a fait échouer la correction précédente : le défaut était bon, un nom dédié ne
// l'était pas, et c'est lui que voyait la personne.
test("un nom dédié à une langue, resté à l'ancien nom, est retiré", async () => {
  const noms = { defaut: 'Odo', fr: 'Mbolo' };
  const requetes = telegramQuiDetient(noms);
  const r = await alignerLeNom();

  assert.equal(r.change, true, 'il y avait bien quelque chose à corriger');
  const retrait = requetes.find((q) => q.methode === 'setMyName' && q.charge?.language_code === 'fr');
  assert.ok(retrait, 'le nom dédié au français doit être touché');
  // Une chaîne vide retire le nom dédié : tout le monde retombe sur le défaut, et une langue
  // ajoutée demain n'aura rien à rattraper.
  assert.deepEqual(retrait.charge, { name: '', language_code: 'fr' });
  assert.ok(!('fr' in noms), 'plus de nom dédié au français');
  assert.ok(!requetes.some((q) => q.methode === 'setMyName' && !q.charge?.language_code),
    "le défaut était déjà bon : il ne doit pas être reposé");
});

// Toutes les langues de l'app sont regardées, pas seulement celle du serveur : une seule oubliée,
// et les gens qui lisent dans cette langue gardent l'ancien nom sans que personne le sache.
test("chaque langue de l'app est vérifiée", async () => {
  const noms = { defaut: 'Odo' };
  const requetes = telegramQuiDetient(noms);
  await alignerLeNom();

  const lues = requetes.filter((q) => q.methode === 'getMyName' && q.charge?.language_code).map((q) => q.charge.language_code);
  assert.deepEqual(lues, LANGUES, 'les sept langues doivent être lues');
  assert.ok(!requetes.some((q) => q.methode === 'setMyName'),
    "tout était déjà aligné : rien ne doit être écrit, Telegram limite les renommages");
});

// C'est de l'affichage, pas une porte d'inscription : un Telegram qui refuse ne doit pas empêcher
// le serveur de démarrer, mais il doit le dire, et dire où corriger à la main.
test('un refus de Telegram ne couche pas le démarrage, et dit quoi faire', async () => {
  telegramQuiDetient({ defaut: 'Mbolo' }, { refuse: true });
  const avertissements = [];
  const vrai = console.warn;
  console.warn = (m) => avertissements.push(String(m));
  try {
    const r = await alignerLeNom();
    assert.equal(r.ok, false);
    assert.equal(r.raison, 'REFUSE');
  } finally {
    console.warn = vrai;
  }
  const dit = avertissements.join('\n');
  assert.match(dit, /BotFather/, 'le journal doit dire où corriger à la main');
  assert.match(dit, /Odo/, 'et avec quel nom');
  assert.match(dit, /langue/, 'et rappeler que chaque langue a son nom');
});

// Le nom vient d'APP_NAME, jamais d'une constante : c'est la règle 12, et c'est ce qui fait qu'un
// prochain renommage se propagera tout seul.
test("le nom posé est celui d'APP_NAME, pas une chaîne écrite dans le code", () => {
  const source = fs.readFileSync(new URL('../server/bot.js', import.meta.url), 'utf8');
  const fonction = source.slice(source.indexOf('export async function alignerLeNom'), source.indexOf('export async function sendSelfieToModeration'));
  assert.match(fonction, /const nomVoulu = config\.appName;/);
  assert.ok(!/setMyName\(['"`][A-Za-z]/.test(fonction), 'aucun nom en dur');
});
