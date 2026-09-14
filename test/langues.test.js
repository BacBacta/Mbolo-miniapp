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
const { LANGUES: LANGUES_UI } = await import('../public/i18n.js');

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

// Deux listes de langues existent : celle du bot (server/i18n.js) et celle de l'interface
// (public/i18n.js). Elles doivent dire la même chose. Si le bot connaît une langue que l'interface
// ignore, la personne choisit une langue qui n'existe pas ; si l'interface en connaît une que le
// bot ignore, elle lit l'app dans sa langue et reçoit les notifications en français, sans
// comprendre pourquoi.
test('le bot et l\'interface connaissent exactement les mêmes langues', () => {
  assert.deepEqual([...LANGUES].sort(), Object.keys(LANGUES_UI).sort());
  for (const l of LANGUES) assert.equal(typeof t(l, 'Découvrir'), 'string');
  assert.ok(LANGUES.length >= 2, 'et il y en a bien plusieurs');
});

// Chaque langue doit porter son nom dans sa propre langue : quelqu'un qui ne lit pas le français
// doit reconnaître la sienne dans la liste sans avoir à la traduire.
test('chaque langue est nommée dans sa propre langue', () => {
  for (const [code, nom] of Object.entries(LANGUES_UI)) {
    assert.ok(nom && nom.length > 1, `${code} doit porter un nom lisible`);
  }
  assert.equal(LANGUES_UI.es, 'Español');
  assert.equal(LANGUES_UI.sw, 'Kiswahili');
});

// Le dictionnaire du navigateur est vérifié ici aussi : une clé utilisée dans l'interface et
// absente du dictionnaire passerait inaperçue jusqu'à ce que quelqu'un tombe dessus dans sa langue.
//
// **Toutes les langues, pas seulement l'anglais.** Le test n'en lisait qu'une : ajouter un
// dictionnaire à moitié traduit n'aurait rien fait tomber, et les trous ne se seraient vus que
// chez la personne qui lit cette langue-là — donc jamais chez nous. C'est ce qui rend vraie la
// phrase « ajouter une langue = un fichier ».
const DICOS = {};
for (const code of Object.keys(LANGUES_UI).filter((c) => c !== 'fr')) {
  DICOS[code] = (await import(`../public/i18n/${code}.js`)).default;
}

// Le balayage des t('…') d'app.js a un angle mort : plusieurs clés n'y apparaissent pas comme
// littéraux — les libellés d'onglets, ceux que le serveur envoie, ceux construits ailleurs. Retirer
// « Découvrir » d'un dictionnaire ne faisait donc rien tomber, et un dictionnaire neuf pouvait
// arriver troué sans que personne le voie.
//
// L'invariant qui n'a pas d'angle mort : **le français est la source, l'anglais en est la copie
// complète et éprouvée**. Toute autre langue doit donc porter exactement le même jeu de clés — ni
// moins (un trou), ni plus (une clé morte qu'on traîne dans cinq fichiers au lieu d'un).
test('chaque dictionnaire porte exactement les mêmes clés que l\'anglais', async () => {
  const en = (await import('../public/i18n/en.js')).default;
  const attendues = Object.keys(en).sort();
  assert.ok(attendues.length > 300, `l'anglais est bien la référence complète (${attendues.length} clés)`);

  for (const [code, dico] of Object.entries(DICOS)) {
    if (code === 'en') continue;
    const siennes = Object.keys(dico).sort();
    const manquantes = attendues.filter((c) => !(c in dico));
    const enTrop = siennes.filter((c) => !(c in en));
    assert.deepEqual(manquantes, [], `clés absentes du dictionnaire ${code} : ${manquantes.join(' | ')}`);
    assert.deepEqual(enTrop, [], `clés en trop dans ${code} (mortes ailleurs ?) : ${enTrop.join(' | ')}`);
  }
});

// Une variable perdue à la traduction ne se voit pas : la phrase reste lisible, mais le nombre,
// le prénom ou la ville n'y sont plus. C'est le genre d'erreur qu'on ne trouve qu'en production,
// et seulement si quelqu'un lit cette langue-là.
test('aucune traduction ne perd une variable de la phrase française', () => {
  const variables = (s) => (s.match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');
  const formes = (v) => (typeof v === 'string' ? [v] : Object.values(v));
  const fautes = [];
  for (const [code, dico] of Object.entries(DICOS)) {
    for (const [fr, trad] of Object.entries(dico)) {
      for (const forme of formes(trad)) {
        if (variables(forme) !== variables(fr)) fautes.push(`${code} | ${fr} → ${forme}`);
      }
    }
  }
  assert.deepEqual(fautes, [], `variables perdues ou inventées :\n  ${fautes.join('\n  ')}`);
});

// Le russe et l'ukrainien comptent en quatre formes, là où les cinq autres langues n'en ont que
// deux. Une phrase comptée dont le dictionnaire n'en fournit que trois afficherait, pour certains
// nombres seulement, le français d'origine.
test('les phrases comptées couvrent toutes les formes de pluriel de leur langue', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const pluriels = [...source.matchAll(/\btn\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)]
    .map((m) => (m[3] ?? m[4]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  assert.ok(pluriels.length >= 2, "la liste des phrases comptées est bien celle qu'on croit");
  for (const [code, dico] of Object.entries(DICOS)) {
    const attendues = new Set();
    const regle = new Intl.PluralRules(code);
    for (let n = 0; n <= 120; n++) attendues.add(regle.select(n));
    // Une langue à deux formes se contente d'une chaîne : c'est le cas de cinq des sept.
    if (attendues.size <= 2) continue;
    for (const cle of pluriels) {
      const trad = dico[cle];
      assert.equal(typeof trad, 'object', `${code} : « ${cle} » doit donner ses ${attendues.size} formes`);
      for (const forme of attendues) {
        assert.equal(typeof trad[forme], 'string', `${code} : « ${cle} » n'a pas de forme « ${forme} »`);
      }
    }
  }
});

// Le mécanisme du pluriel, éprouvé de bout en bout : c'est lui qui décide ce que voit une
// personne qui lit en russe, et il ne se voit nulle part ailleurs dans la suite.
// 1, 21 et 31 prennent la première forme ; 2 à 4 la deuxième ; 5 à 20 la troisième.
// public/i18n.js est un module de navigateur : chargerLangue pose la langue sur <html> et, pour
// le cyrillique, ajoute la feuille de style de la police de titrage. On lui donne la plus petite
// surface de DOM qui lui suffit, plutôt que d'assouplir le module pour les tests. La fabrique
// rend la liste des éléments ajoutés à <head> : c'est là que se lit ce qui a été téléchargé.
function fauxDocument() {
  const head = [];
  globalThis.document = {
    documentElement: {},
    head: { append: (n) => head.push(n) },
    getElementById: (id) => head.find((n) => n.id === id) || null,
    createElement: () => ({}),
  };
  return head;
}

test('le pluriel russe choisit la bonne forme selon le nombre', async () => {
  fauxDocument();
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


test('toute clé employée par l\'interface est traduite dans chaque langue', async () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const cles = new Set();
  for (const m of source.matchAll(/\bt\(\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    cles.add((m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  for (const m of source.matchAll(/\btn\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    for (const g of [m[1] ?? m[2], m[3] ?? m[4]]) if (g) cles.add(g.replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  assert.ok(cles.size > 200, `l'interface est bien traduite en entier (${cles.size} clés)`);
  for (const [code, dico] of Object.entries(DICOS)) {
    const manquantes = [...cles].filter((c) => c && !(c in dico));
    assert.deepEqual(manquantes, [], `clés sans traduction ${code} : ${manquantes.join(' | ')}`);
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
  for (const [code, dico] of Object.entries(DICOS)) {
    const manquants = libelles.filter((l) => !(l in dico));
    assert.deepEqual(manquants, [], `libellés serveur sans traduction ${code} : ${manquants.join(' | ')}`);
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

// Fraunces est latine : elle n'a pas un seul glyphe cyrillique. Sans police de titrage de
// secours, tout titre en russe ou en ukrainien tombe sur Georgia pendant que le corps reste en
// Manrope — deux dessins de lettres dans la même phrase. Playfair Display comble le trou.
//
// Mais elle ne doit partir que chez qui la verra. La règle 15 n'est pas une préférence ici :
// la cible est un forfait data limité, et une police de titrage se paie en dizaines de
// kilo-octets qu'une personne qui lit en français n'a aucune raison de porter.
test('la police cyrillique ne part que chez les langues qui en ont besoin', async () => {
  const head = fauxDocument();
  const i18n = await import('../public/i18n.js');

  for (const code of ['fr', 'en', 'es', 'pt', 'sw']) {
    await i18n.chargerLangue(code);
    assert.equal(head.length, 0, `${code} ne doit télécharger aucune police en plus`);
  }

  await i18n.chargerLangue('ru');
  assert.equal(head.length, 1, 'le russe charge la police de titrage cyrillique');
  assert.match(head[0].href, /Playfair\+Display/);

  await i18n.chargerLangue('uk');
  assert.equal(head.length, 1, "l'ukrainien réutilise la même : une fois, pas une par langue");
  await i18n.chargerLangue('fr');
});
