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
  await store.updateUser(id, { verification: 'approved' });
}

test.after(() => server.close());

test('la traduction retombe sur le français quand la clé manque', () => {
  assert.equal(t('en', 'Découvrir'), 'Discover');
  assert.equal(t('fr', 'Découvrir'), 'Découvrir');
  assert.equal(t('en', 'Une phrase jamais traduite'), 'Une phrase jamais traduite', 'jamais un identifiant technique');
  assert.equal(t('xx', 'Découvrir'), 'Découvrir', 'une langue inconnue reste en français');
});

test('les valeurs sont remplacées dans les deux langues', () => {
  assert.equal(t('fr', 'Ouvrir {app}', { app: 'Odo' }), 'Ouvrir Odo');
  assert.equal(t('en', 'Ouvrir {app}', { app: 'Odo' }), 'Open Odo');
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

// Le mécanisme du pluriel, éprouvé de bout en bout : c'est lui qui décide ce que voit une
// personne qui lit en russe, et il ne se voit nulle part ailleurs dans la suite.
// 1, 21 et 31 prennent la première forme ; 2 à 4 la deuxième ; 5 à 20 la troisième.
test('le pluriel russe choisit la bonne forme selon le nombre', async () => {
  globalThis.document = { documentElement: {} };
  const i18n = await import('../public/i18n.js');
  await i18n.chargerLangue('ru');
  const dit = (n) => i18n.tn('{n} restant', '{n} restants', n);
  assert.equal(dit(1), 'осталась 1 анкета');
  assert.equal(dit(3), 'осталось 3 анкеты');
  assert.equal(dit(7), 'осталось 7 анкет');
  assert.equal(dit(21), 'осталась 21 анкета', 'vingt et un revient à la première forme');
  await i18n.chargerLangue('fr');
  assert.equal(dit(3), '3 restants', 'et le français reste à deux formes');
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
  assert.deepEqual(LANGUES, ['fr', 'en', 'ru', 'uk']);
  for (const l of LANGUES) assert.equal(typeof t(l, 'Découvrir'), 'string');
});

// Les dictionnaires du navigateur, chargés une fois pour tous les tests qui suivent. Le français
// est la langue source : il n'a pas de fichier, et n'entre donc pas dans ces contrôles.
const AUTRES = ['en', 'ru', 'uk'];
const DICOS = Object.fromEntries(await Promise.all(
  AUTRES.map(async (l) => [l, (await import(`../public/i18n/${l}.js`)).default]),
));
const formes = (v) => (typeof v === 'string' ? [v] : Object.values(v));

// Le dictionnaire du navigateur est vérifié ici aussi : une clé utilisée dans l'interface et
// absente du dictionnaire passerait inaperçue jusqu'à ce qu'un anglophone tombe dessus.
test('toute clé employée par l\'interface est traduite dans chaque langue', async () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const cles = new Set();
  for (const m of source.matchAll(/\bt\(\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    cles.add((m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  for (const m of source.matchAll(/\btn\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    for (const g of [m[1] ?? m[2], m[3] ?? m[4]]) if (g) cles.add(g.replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  for (const [l, dico] of Object.entries(DICOS)) {
    const manquantes = [...cles].filter((c) => c && !(c in dico));
    assert.deepEqual(manquantes, [], `clés sans traduction ${l} : ${manquantes.join(' | ')}`);
  }
  assert.ok(cles.size > 200, `l'interface est bien traduite en entier (${cles.size} clés)`);
});

// Une variable perdue à la traduction ne se voit pas : la phrase reste lisible, mais le nombre,
// le prénom ou la ville n'y sont plus. C'est le genre d'erreur qu'on ne trouve qu'en production,
// et seulement si quelqu'un lit cette langue-là.
test('aucune traduction ne perd une variable de la phrase française', () => {
  const variables = (s) => (s.match(/\{[a-zA-Z]+\}/g) || []).sort();
  const fautes = [];
  for (const [l, dico] of Object.entries(DICOS)) {
    for (const [fr, trad] of Object.entries(dico)) {
      const attendues = variables(fr);
      for (const forme of formes(trad)) {
        if (String(variables(forme)) !== String(attendues)) fautes.push(`${l} | ${fr} → ${forme}`);
      }
    }
  }
  assert.deepEqual(fautes, [], `variables perdues ou inventées :\n  ${fautes.join('\n  ')}`);
});

// Le russe et l'ukrainien comptent en quatre formes. Une phrase comptée dont le dictionnaire
// n'en fournit que trois afficherait, pour certains nombres seulement, le français d'origine.
test('les phrases comptées couvrent toutes les formes de pluriel de leur langue', async () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const pluriels = [...source.matchAll(/\btn\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)]
    .map((m) => (m[3] ?? m[4]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  assert.ok(pluriels.length >= 2, 'la liste des phrases comptées est bien celle qu\'on croit');
  for (const [l, dico] of Object.entries(DICOS)) {
    const attendues = new Set();
    const regle = new Intl.PluralRules(l);
    for (let n = 0; n <= 120; n++) attendues.add(regle.select(n));
    for (const cle of pluriels) {
      const trad = dico[cle];
      if (attendues.size === 1 || (attendues.size === 2 && attendues.has('one') && attendues.has('other'))) continue;
      assert.equal(typeof trad, 'object', `${l} : « ${cle} » doit donner ses ${attendues.size} formes de pluriel`);
      for (const forme of attendues) {
        assert.equal(typeof trad[forme], 'string', `${l} : « ${cle} » n'a pas de forme « ${forme} »`);
      }
    }
  }
});

// Le test ci-dessus ne lit que les t('…') littéraux de app.js. Or plusieurs libellés viennent du
// **serveur** — intentions, genres, questions de compatibilité — et traversent t() sous forme de
// variable : `t(l)`. Ils échappent donc entièrement au contrôle précédent, et la première fois
// qu'on s'en aperçoit, c'est en voyant du français dans une interface anglaise.
test('les libellés envoyés par le serveur sont traduits, eux aussi', async () => {
  const { INTENTS, GENDERS, COMPAT } = await import('../server/config.js');
  const { CRITERES } = await import('../server/jauge.js');

  const libelles = [
    ...Object.values(INTENTS),
    ...Object.values(GENDERS),
    ...Object.values(COMPAT).flatMap(({ question, valeurs }) => [question, ...Object.values(valeurs)]),
    ...CRITERES.flatMap(({ titre, quoi, comment }) => [titre, quoi, comment]),
  ];
  for (const [langue, dico] of Object.entries(DICOS)) {
    const manquants = libelles.filter((l) => !(l in dico));
    assert.deepEqual(manquants, [], `libellés serveur sans traduction ${langue} : ${manquants.join(' | ')}`);
  }
  assert.ok(libelles.length >= 10, "et la liste est bien celle qu'on croit");
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
