// Le nom que Telegram affiche pour le bot, et pourquoi le serveur le pose lui-même.
//
// Ce nom ne vit pas dans le dépôt : il est posé à la main dans BotFather, une fois. Renommer
// l'app ne le suit donc pas — au passage de « Mbolo » à « Odo », l'app s'est renommée partout et
// la fiche du bot a gardé l'ancien nom, sans que rien dans le code puisse le voir, puisque la
// valeur n'y est pas. Le serveur l'impose maintenant à Telegram au démarrage.
//
// **Ces tests passent par la couche qui parle à Telegram, pas par des méthodes remplacées.**
// Le premier jet remplaçait `bot.api.setMyName` par une fonction qui prenait un objet — et le
// code appelait `setMyName({ name })` alors que la bibliothèque attend `setMyName(nom)`. Les
// deux se trompaient pareil, le test passait au vert, et le bot est resté « Mbolo ». Un
// transformateur grammY voit la requête telle qu'elle partirait sur le réseau : le nom de la
// méthode et sa charge utile. C'est le seul endroit où cette erreur-là devient visible.
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

// Un faux Telegram posé au bon endroit : la requête est interceptée avant de partir, et on garde
// ce qui serait parti. Rien ne touche le réseau.
function telegramQuiRepond({ nom, refuse = false }) {
  const requetes = [];
  const transformateur = async (prev, methode, charge) => {
    requetes.push({ methode, charge });
    if (methode === 'getMyName') {
      if (refuse) return { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3600' };
      return { ok: true, result: { name: nom } };
    }
    if (methode === 'setMyName') return { ok: true, result: true };
    return { ok: true, result: true };
  };
  bot.api.config.use(transformateur);
  return { requetes, retirer: () => { /* un transformateur ne se retire pas : un bot par test */ } };
}

test("un bot resté à l'ancien nom est renommé, avec la charge utile que Telegram attend", async () => {
  const { requetes } = telegramQuiRepond({ nom: 'Mbolo' });
  const r = await alignerLeNom();

  assert.equal(r.change, true, `le nom devait être posé : ${JSON.stringify(r)}`);
  assert.equal(r.avant, 'Mbolo');

  const pose = requetes.find((q) => q.methode === 'setMyName');
  assert.ok(pose, 'setMyName doit être appelé');
  // Le cœur du test : ce qui part vers Telegram. « name » doit être la chaîne elle-même.
  // Avec setMyName({ name }), on trouverait ici { name: { name: 'Odo' } }, et Telegram refuserait.
  assert.deepEqual(pose.charge, { name: 'Odo' },
    'Telegram attend name en chaîne : un objet part en erreur et le nom reste l\'ancien');
});

// Telegram limite les changements de nom. Poser le même à chaque démarrage userait ce quota pour
// rien, et le refus tomberait le jour où le changement compte vraiment.
test('un bot déjà au bon nom ne se fait pas renommer', async () => {
  const { bot: bot2, alignerLeNom: aligner2 } = await import('../server/bot.js');
  assert.equal(bot2, bot, 'même instance : le transformateur du test précédent est toujours là');
  const requetes = [];
  bot.api.config.use(async (prev, methode, charge) => {
    requetes.push(methode);
    if (methode === 'getMyName') return { ok: true, result: { name: 'Odo' } };
    return { ok: true, result: true };
  });
  const r = await aligner2();
  assert.equal(r.change, false);
  assert.ok(!requetes.includes('setMyName'), 'rien ne doit être posé');
});

// C'est de l'affichage, pas une porte d'inscription : un Telegram qui refuse ne doit pas
// empêcher le serveur de démarrer, mais il doit le dire, et dire où corriger à la main.
test('un refus de Telegram ne couche pas le démarrage, et dit quoi faire', async () => {
  bot.api.config.use(async (prev, methode) => {
    if (methode === 'getMyName') return { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3600' };
    return { ok: true, result: true };
  });
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
});

// Le nom vient d'APP_NAME, jamais d'une constante : c'est la règle 12, et c'est ce qui fait
// qu'un prochain renommage se propagera tout seul.
test("le nom posé est celui d'APP_NAME, pas une chaîne écrite dans le code", () => {
  const source = fs.readFileSync(new URL('../server/bot.js', import.meta.url), 'utf8');
  const fonction = source.slice(source.indexOf('export async function alignerLeNom'), source.indexOf('export async function sendSelfieToModeration'));
  assert.match(fonction, /setMyName\(config\.appName\)/);
  assert.ok(!/setMyName\(['"`]/.test(fonction), 'aucun nom en dur');
});
