// Multilingue : le bot écrit dans la langue de la personne qui reçoit, et le choix se garde.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-langues-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot, notify } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { t, langueDe, LANGUES } = await import('../server/i18n.js');

const envoyes = [];
bot.api.sendMessage = async (id, text, opts) => { envoyes.push({ id, text, opts }); return {}; };

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', country: 'CM', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  store.updateUser(id, { verification: 'approved' });
}

test.after(() => server.close());

test('la traduction retombe sur le français quand la clé manque', () => {
  assert.equal(t('en', 'Découvrir'), 'Discover');
  assert.equal(t('fr', 'Découvrir'), 'Découvrir');
  assert.equal(t('en', 'Une phrase jamais traduite'), 'Une phrase jamais traduite', 'jamais un identifiant technique');
  assert.equal(t('xx', 'Découvrir'), 'Découvrir', 'une langue inconnue reste en français');
});

test('les valeurs sont remplacées dans les deux langues', () => {
  assert.equal(t('fr', 'Ouvrir {app}', { app: 'Mbolo' }), 'Ouvrir Mbolo');
  assert.equal(t('en', 'Ouvrir {app}', { app: 'Mbolo' }), 'Open Mbolo');
  assert.equal(t('en', 'Ta photo {n} est validée : les autres la voient maintenant.', { n: 2 }), 'Your photo 2 is approved: others can see it now.');
});

test('la langue vient du choix, sinon de Telegram, sinon du français', () => {
  assert.equal(langueDe({ lang: 'en', languageCode: 'fr' }), 'en', 'le choix explicite prime');
  assert.equal(langueDe({ languageCode: 'en-GB' }), 'en', 'sinon celle de Telegram');
  assert.equal(langueDe({ languageCode: 'de' }), 'fr', 'une langue non prise en charge retombe sur le français');
  assert.equal(langueDe({}), 'fr');
  assert.equal(langueDe({ lang: 'xx' }), 'fr', 'un choix invalide est ignoré');
});

test('le choix de langue se règle et se relit', async () => {
  await creer('5101', 'Awa', 'femme');
  assert.equal((await call('5101', '/me')).body.lang, null, 'aucun choix au départ');
  const r = await call('5101', '/me/lang', 'PUT', { lang: 'en' });
  assert.equal(r.status, 200);
  assert.equal((await call('5101', '/me')).body.lang, 'en');
  const mauvais = await call('5101', '/me/lang', 'PUT', { lang: 'de' });
  assert.equal(mauvais.status, 400);
  assert.equal(mauvais.body.code, 'LANG_INVALID');
  assert.equal((await call('5101', '/me')).body.lang, 'en', 'le choix valable est conservé');
});

test('le bot écrit dans la langue de la personne qui reçoit, pas de celle qui écrit', async () => {
  await creer('5102', 'Ben', 'homme');
  await call('5102', '/me/lang', 'PUT', { lang: 'en' });
  envoyes.length = 0;
  const r = await notify('5102', 'Nouveau match : {nom} et toi, vous vous plaisez.', { nom: 'Awa' }, { label: 'Écrire', params: { screen: 'me' } });
  assert.equal(r.sent, true);
  assert.equal(envoyes.at(-1).text, 'New match: Awa and you like each other.');

  await creer('5103', 'Chloé', 'femme');
  envoyes.length = 0;
  await notify('5103', 'Nouveau match : {nom} et toi, vous vous plaisez.', { nom: 'Ben' }, { label: 'Écrire', params: { screen: 'me' } });
  assert.equal(envoyes.at(-1).text, 'Nouveau match : Ben et toi, vous vous plaisez.', 'sans choix, le français');
});

test('chaque langue déclarée a bien un dictionnaire', () => {
  assert.deepEqual(LANGUES, ['fr', 'en']);
  for (const l of LANGUES) assert.equal(typeof t(l, 'Découvrir'), 'string');
});

// Le dictionnaire du navigateur est vérifié ici aussi : une clé utilisée dans l'interface et
// absente du dictionnaire passerait inaperçue jusqu'à ce qu'un anglophone tombe dessus.
test('toute clé employée par l\'interface a sa traduction anglaise', async () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const en = (await import('../public/i18n/en.js')).default;
  const cles = new Set();
  for (const m of source.matchAll(/\bt\(\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    cles.add((m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  for (const m of source.matchAll(/\btn\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    for (const g of [m[1] ?? m[2], m[3] ?? m[4]]) if (g) cles.add(g.replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  const manquantes = [...cles].filter((c) => c && !(c in en));
  assert.deepEqual(manquantes, [], `clés sans traduction anglaise : ${manquantes.join(' | ')}`);
  assert.ok(cles.size > 200, `l'interface est bien traduite en entier (${cles.size} clés)`);
});

// Une phrase oubliée hors de t() ne se voit pas en français : elle ne se voit qu'en anglais,
// et seulement par un anglophone. Ce balayage la fait tomber ici, à l'écriture.
test('aucun texte visible de l\'interface n\'échappe à la traduction', async () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const oublis = [];
  source.split('\n').forEach((ligne, i) => {
    if (ligne.trim().startsWith('//')) return;
    // Texte posé entre deux balises, sans interpolation : `<span>Nouveau</span>`.
    // Une flèche (=>) et une comparaison (a > b < c) ne sont pas des balises : la balise
    // fermante qui suit le texte commence forcément par « </ » ou par une lettre.
    for (const m of ligne.matchAll(/(?<![=!<>-])>(?!=)([^<>${}`]{2,})<(?=[a-zA-Z/])/g)) {
      const txt = m[1].trim();
      if (/[A-Za-zÀ-ÿ]{3,}/.test(txt)) oublis.push(`${i + 1} : ${txt}`);
    }
    // Attributs lus par l'utilisateur ou par un lecteur d'écran
    for (const m of ligne.matchAll(/\b(placeholder|aria-label|title|alt)="([^"$]{2,})"/g)) {
      if (/[A-Za-zÀ-ÿ]{3,}/.test(m[2])) oublis.push(`${i + 1} : ${m[1]}="${m[2]}"`);
    }
    // Libellés passés en objet, comme tg.setButtons({ main: { text: 'Enregistrer' } }) :
    // ceux-là ne traversent aucune balise, donc le balayage du HTML ne les voit pas.
    for (const m of ligne.matchAll(/\b(text|title|sub|message|label|confirmText|cancelText)\s*:\s*'([^'\\]{3,})'/g)) {
      if (/[A-Za-zÀ-ÿ]{3,}/.test(m[2])) oublis.push(`${i + 1} : ${m[1]}: '${m[2]}'`);
    }
  });
  assert.deepEqual(oublis, [], `texte non traduit dans public/app.js :\n  ${oublis.join('\n  ')}`);
});
