// Le nom que Telegram affiche pour le bot, et pourquoi le serveur le pose lui-même.
//
// Ce nom ne vit pas dans le dépôt : il est posé à la main dans BotFather, une fois. Renommer
// l'app ne le suit donc pas — au passage de « Mbolo » à « Odo », l'app s'est renommée partout et
// la fiche du bot a gardé l'ancien nom pendant des jours, sans que rien dans le code puisse le
// voir, puisque la valeur n'y est pas. Le serveur l'impose maintenant à Telegram au démarrage.
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

// Un faux Telegram : ce qu'il rend, et ce qu'on lui a demandé.
function fauxTelegram({ nom, refuse = false }) {
  const appels = [];
  bot.api.getMyName = async () => {
    appels.push('get');
    if (refuse) throw Object.assign(new Error('Too Many Requests'), { description: 'Too Many Requests: retry after 3600' });
    return { name: nom };
  };
  bot.api.setMyName = async ({ name }) => { appels.push(`set:${name}`); return true; };
  return appels;
}

test("un bot resté à l'ancien nom est renommé", async () => {
  const appels = fauxTelegram({ nom: 'Mbolo' });
  const r = await alignerLeNom();
  assert.equal(r.change, true);
  assert.equal(r.avant, 'Mbolo');
  assert.deepEqual(appels, ['get', 'set:Odo'], "le nom doit être posé, et lu d'abord");
});

// Telegram limite les changements de nom. Poser le même à chaque démarrage userait ce quota pour
// rien, et le refus tomberait le jour où le changement compte vraiment.
test('un bot déjà au bon nom ne se fait pas renommer', async () => {
  const appels = fauxTelegram({ nom: 'Odo' });
  const r = await alignerLeNom();
  assert.equal(r.change, false);
  assert.deepEqual(appels, ['get'], 'rien ne doit être posé');
});

// C'est de l'affichage, pas une porte d'inscription : un Telegram qui refuse ne doit pas
// empêcher le serveur de démarrer, mais il doit le dire, et dire où corriger à la main.
test('un refus de Telegram ne couche pas le démarrage, et dit quoi faire', async () => {
  fauxTelegram({ nom: 'Mbolo', refuse: true });
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
  assert.match(fonction, /setMyName\(\{ name: config\.appName \}\)/);
  assert.ok(!/setMyName\(\{ name: ['"`]/.test(fonction), 'aucun nom en dur');
});
