// La bascule vers PostgreSQL : le contrôle qui dit si elle peut avoir lieu.
//
// L'import écrit « 0 importé(s) sur 5 » au milieu d'une page de texte quand il rate une table.
// Personne ne le lit ce jour-là, et ça ne se remarque qu'une fois le fichier effacé. D'où un
// contrôle qui refuse de dire que tout va bien : `scripts/etat-stockage.js`, appelé trois fois
// par `basculer-postgres.sh`, et qui sort en 1 dès qu'une table porte moins que le fichier.
//
// Le piège de ce contrôle est de crier au loup : deux tables se dédoublonnent à l'écriture, donc
// PostgreSQL porte légitimement moins de lignes que db.json n'en contient. Un contrôle qui
// s'affole là-dessus ferait renoncer à une bascule qui allait bien — c'est la moitié des tests
// ci-dessous.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { TABLES, attendu, comparer } from '../server/bascule.js';

const lancer = promisify(execFile);
const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = process.env.DATABASE_URL || '';

// ---------- Ce que le fichier contient vraiment ----------

test('chaque table est comptée là où elle est rangée dans le fichier', () => {
  const n = attendu({
    users: { 1: { id: '1' }, 2: { id: '2' } },
    swipes: [{ from: '1', to: '2', action: 'like' }],
    matches: { m1: { id: 'm1' } },
    // Les messages sont rangés par match dans le fichier, à plat dans la base.
    messages: { m1: [{ id: 'a' }, { id: 'b' }], m2: [{ id: 'c' }] },
    blocks: [{ from: '2', to: '1' }],
    reports: [{ id: 'r1' }],
    dates: { d1: { id: 'd1' } },
    events: [{ id: 'e1' }, { id: 'e2' }],
  });
  assert.deepEqual(n, { users: 2, swipes: 1, matches: 1, messages: 3, blocks: 1, reports: 1, dates: 1, events: 2 });
});

test('un fichier vide ne compte rien, et ne manque rien', () => {
  assert.deepEqual(attendu({}), { users: 0, swipes: 0, matches: 0, messages: 0, blocks: 0, reports: 0, dates: 0, events: 0 });
  assert.equal(comparer(attendu({}), {}).manquantes.length, 0);
});

// Le faux positif que ce contrôle doit éviter : `insert ... on conflict (from_id, to_id) do
// nothing` n'écrit qu'une ligne pour deux balayages de la même paire. Compter les lignes du
// fichier annoncerait une perte, et ferait annuler une bascule réussie.
test('deux balayages de la même paire ne comptent que pour un', () => {
  const n = attendu({
    swipes: [
      { from: '1', to: '2', action: 'pass', at: 1 },
      { from: '1', to: '2', action: 'like', at: 2 },
      { from: '2', to: '1', action: 'like', at: 3 },
    ],
    blocks: [{ from: '1', to: '2', at: 1 }, { from: '1', to: '2', at: 2 }],
  });
  assert.equal(n.swipes, 2, 'deux paires distinctes, quatre écritures dans le fichier');
  assert.equal(n.blocks, 1);
});

test('un même identifiant écrit deux fois ne compte que pour un', () => {
  const n = attendu({
    reports: [{ id: 'r1' }, { id: 'r1' }],
    events: [{ id: 'e1' }, { id: 'e1' }, { id: 'e2' }],
    messages: { m1: [{ id: 'a' }, { id: 'a' }] },
  });
  assert.deepEqual([n.reports, n.events, n.messages], [1, 2, 1]);
});

// ---------- Ce que la comparaison conclut ----------

test('une base qui porte autant que le fichier ne manque de rien', () => {
  const a = { users: 3, swipes: 2, matches: 1, messages: 5, blocks: 0, reports: 1, dates: 1, events: 9 };
  assert.equal(comparer(a, { ...a }).manquantes.length, 0);
});

// L'app continue de servir pendant l'import : des comptes et des messages s'ajoutent entre
// l'écriture du fichier et le contrôle. Plus que le fichier est normal ; moins ne l'est jamais.
test('une base qui a pris de l\'avance ne fait pas échouer le contrôle', () => {
  const a = { users: 3, messages: 5 };
  const { manquantes } = comparer(a, { users: 4, messages: 12 });
  assert.equal(manquantes.length, 0);
});

test('une table incomplète est nommée, avec ce qui lui manque', () => {
  const { lignes, manquantes } = comparer({ users: 3, events: 9 }, { users: 3, events: 0 });
  assert.equal(manquantes.length, 1);
  assert.equal(manquantes[0].table, 'events');
  assert.equal(manquantes[0].json - manquantes[0].pg, 9);
  assert.equal(lignes.length, TABLES.length, 'toutes les tables sont montrées, pas seulement les fautives');
});

// ---------- Le contrôle en vrai, contre une base ----------

const schema = `bascule_test_${Date.now().toString(36)}`;
const environnement = { ...process.env, DATABASE_URL: URL_BASE, DATABASE_SCHEMA: schema, BOT_TOKEN: '' };
const sansBase = URL_BASE ? false : 'aucune base PostgreSQL (lance npm run test:pg)';

const dbExemple = () => ({
  users: { 900: { id: '900', createdAt: 1757000000000, profile: { name: 'Awa' } } },
  swipes: [{ from: '900', to: '901', action: 'like', at: 1 }],
  matches: {},
  messages: {},
  blocks: [],
  reports: [],
  dates: {},
  events: [{ id: 'e1', u: '900', k: 'app_opened', at: 2 }, { id: 'e2', k: 'deck_empty', at: 3 }],
});

const fichierTemporaire = (contenu) => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mbolo-bascule-'));
  const fichier = path.join(dossier, 'db.json');
  fs.writeFileSync(fichier, JSON.stringify(contenu));
  return fichier;
};

test('après un import complet, le contrôle laisse passer', { skip: sansBase }, async () => {
  const fichier = fichierTemporaire(dbExemple());
  await lancer('node', ['scripts/import-json.js', fichier], { cwd: RACINE, env: environnement });

  const { stdout } = await lancer('node', ['scripts/etat-stockage.js', fichier], { cwd: RACINE, env: environnement });
  assert.match(stdout, /porte tout ce que/, 'il doit le dire, pas seulement sortir en 0');
  assert.match(stdout, /events\s+2\s+2/, 'et montrer les chiffres des deux côtés');
});

// Le cas qui justifie tout ce fichier : un import qui a laissé une table derrière lui.
// On simule le pire — les événements, seule donnée que personne ne peut reconstituer.
test('une table restée vide arrête la bascule', { skip: sansBase }, async () => {
  const fichier = fichierTemporaire(dbExemple());
  await lancer('node', ['scripts/import-json.js', fichier, '--force'], { cwd: RACINE, env: environnement });

  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: URL_BASE, options: `-c search_path=${schema}` });
  await pool.query('delete from events');
  await pool.end();

  await assert.rejects(
    () => lancer('node', ['scripts/etat-stockage.js', fichier], { cwd: RACINE, env: environnement }),
    (e) => {
      assert.equal(e.code, 1, 'il doit sortir en 1 : c\'est ce qui arrête basculer-postgres.sh');
      assert.match(e.stderr, /events \(2 de moins\)/, 'et nommer la table, avec ce qui lui manque');
      assert.match(e.stderr, /--force/, 'et dire quoi faire');
      return true;
    },
  );
});

test('sans DATABASE_URL, le contrôle ne fait pas semblant de vérifier', { skip: sansBase }, async () => {
  const fichier = fichierTemporaire(dbExemple());
  await assert.rejects(
    () => lancer('node', ['scripts/etat-stockage.js', fichier], { cwd: RACINE, env: { ...environnement, DATABASE_URL: '' } }),
    (e) => e.code === 2 && /DATABASE_URL manquant/.test(e.stderr),
  );
});

// ---------- Le script de bascule, et ce qu'il promet ----------

const script = fs.readFileSync(path.join(RACINE, 'basculer-postgres.sh'), 'utf8');
const guide = fs.readFileSync(path.join(RACINE, 'DEPLOIEMENT.md'), 'utf8');
const travail = fs.readFileSync(path.join(RACINE, '.github/workflows/postgres.yml'), 'utf8');

test('les trois étapes du script sont celles que le guide documente', () => {
  for (const etape of ['preparer', 'basculer', 'verifier']) {
    assert.match(script, new RegExp(`\\b${etape}\\b`), `le script doit connaître l'étape ${etape}`);
    assert.ok(guide.includes(`basculer-postgres.sh ${etape}`), `le guide doit montrer l'étape ${etape}`);
  }
});

test('le travail GitHub et la ligne de commande lancent le même script', () => {
  assert.match(travail, /\.\/basculer-postgres\.sh/, 'une seule logique à maintenir, comme pour le déploiement');
});

// Créer une base demande des droits que le déploiement n'a pas besoin d'avoir. Un second secret
// permet de ne les donner qu'ici, et de le supprimer une fois la bascule faite — au lieu
// d'élargir pour toujours le jeton qui sert à chaque mise en ligne.
test('la bascule prend le jeton d\'organisation s\'il existe, sans forcer à élargir l\'autre', () => {
  assert.match(travail, /secrets\.FLY_ORG_TOKEN \|\| secrets\.FLY_API_TOKEN/,
    'le travail doit préférer FLY_ORG_TOKEN, et retomber sur FLY_API_TOKEN');
  const deploiement = fs.readFileSync(path.join(RACINE, '.github/workflows/deploy-fly.yml'), 'utf8');
  assert.ok(!deploiement.includes('FLY_ORG_TOKEN'),
    'le déploiement, lui, garde son jeton limité à l\'app');
});

// La chaîne de connexion porte le mot de passe de la base. Le journal d'un travail GitHub se lit
// sans droits particuliers : elle ne doit jamais y arriver, même par une ligne de mise au point.
test('le script n\'affiche jamais la chaîne de connexion', () => {
  const lignes = script.split('\n').filter((l) => !l.trim().startsWith('#'));
  for (const ligne of lignes) {
    // Ce qui compte est ce qui part vers la sortie, pas ce que la ligne teste avant :
    // `[ -n "$URL" ] || echo "..."` ne montre rien. On ne lit donc que l'après-echo.
    const affiche = ligne.split(/\b(?:echo|printf)\b/).slice(1).join(' ');
    if (/\$(URL|\{URL)/.test(affiche)) {
      // Seule exception : la consigne qui demande justement à GitHub de la masquer.
      assert.match(ligne, /add-mask/, `cette ligne afficherait la chaîne de connexion : ${ligne.trim()}`);
    }
  }
  assert.match(script, /add-mask/, 'et sous GitHub Actions, elle doit être masquée');
});

// Les deux moteurs ne se pilotent pas pareil — une base gérée par Fly se désigne par un
// identifiant et s'attache avec « mpg attach » — mais ils doivent aboutir au même endroit : la
// base attachée sous le nom que le serveur ignore. Le premier jet créait la base gérée puis
// s'arrêtait en renvoyant à la ligne de commande : la bascule en deux clics n'existait que pour
// le moteur non géré.
test('les deux moteurs attachent sous le nom ignoré, sans étape manuelle', () => {
  // Les commentaires citent ces commandes eux aussi : on ne lit que le code.
  const code = script.split('\n').filter((l) => !l.trim().startsWith('#'));
  for (const commande of ['flyctl mpg attach', 'flyctl postgres attach']) {
    const ligne = code.find((l) => l.includes(commande));
    assert.ok(ligne, `le script doit savoir attacher avec « ${commande} »`);
    assert.match(ligne, /--variable-name "\$FUTUR"/, `${commande} doit poser le nom ignoré`);
  }
  assert.ok(!/Relance ensuite cette étape/.test(script), 'aucun moteur ne doit demander de relancer à la main');
});

// Une coupure pendant l'import laisse la base créée et attachée. Relancer l'étape doit reprendre
// là où elle s'est arrêtée — surtout pas créer une seconde base, facturée, à côté de la bonne.
test('relancer la préparation ne crée pas une seconde base', () => {
  const preparer = script.slice(script.indexOf('if [ "$ETAPE" = preparer ]'), script.indexOf('= basculer ]'));
  const garde = preparer.indexOf('secret_present "$FUTUR"');
  const creation = preparer.indexOf('creer_la_base\n');
  assert.ok(garde >= 0 && creation >= 0, 'la garde et la création doivent être dans l\'étape preparer');
  assert.ok(garde < creation, 'la garde doit venir avant la création, sinon une relance facture une base de plus');
});

// Le serveur ne lit que DATABASE_URL. Tant que la base est attachée sous un autre nom, il
// continue de servir le fichier JSON : c'est ce qui évite la fenêtre où la production tourne
// sur une base vide. Si ce nom devenait DATABASE_URL, la préparation basculerait toute seule.
test('la base est préparée sous un nom que le serveur ne lit pas', () => {
  assert.match(script, /FUTUR=DATABASE_URL_FUTURE/);
  const config = fs.readFileSync(path.join(RACINE, 'server/config.js'), 'utf8');
  assert.ok(!config.includes('DATABASE_URL_FUTURE'), 'le serveur ne doit pas connaître ce nom');
  assert.match(script, /--variable-name "\$FUTUR"/, "l'attachement doit poser ce nom-là");
});

// ---------- Le script en marche, contre un faux flyctl ----------
//
// Les deux défauts qui ont fait échouer la première bascule réelle n'étaient visibles ni à la
// lecture du script ni dans les tests de texte : « mpg list » écrit une phrase en clair quand il
// n'y a aucune base — même avec --json — et un jeton de déploiement ne voit aucune organisation,
// ce que Fly annonce par « Organization not found », qu'on lit comme un nom mal orthographié.
// On fait donc tourner le script pour de bon, avec un flyctl de paille qui rejoue ces réponses.

const fauxFlyctl = (orgs, secretsEnPlus = '') => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mbolo-flyctl-'));
  const trace = path.join(dossier, 'appels.txt');
  fs.writeFileSync(path.join(dossier, 'flyctl'), `#!/bin/sh
echo "$@" >> ${trace}
SECRETS_EN_PLUS='${secretsEnPlus}'
case "$1 $2" in
  "orgs list") echo '${orgs}' ;;
  # La vraie réponse de Fly quand l'organisation n'a aucune base gérée : du texte, pas du JSON.
  "mpg list") echo "No managed postgres clusters found in organization personal" ;;
  "secrets list") printf ' NAME      | DIGEST | STATUS\n BOT_TOKEN | abc    | Deployed\n%s' "$SECRETS_EN_PLUS" ;;
  # La machine ne voit rien : c'est exactement le cas d'un secret posé mais pas encore appliqué.
  "ssh console") : ;;
  *) : ;;
esac
`, { mode: 0o755 });
  return { dossier, trace };
};

const preparer = (dossier, env = {}) => lancer('./basculer-postgres.sh', ['preparer', 'mbolo-miniapp', 'mbolo-db', 'ams'], {
  cwd: RACINE,
  env: { ...process.env, PATH: `${dossier}:${process.env.PATH}`, FLY_API_TOKEN: 'jeton-de-test', ...env },
});

// Un jeton de déploiement suffit à `flyctl deploy`, et c'est celui qu'on a sous la main. Il ne
// peut pas créer de base — mieux vaut le dire avant, que le découvrir à mi-chemin.
test('un jeton qui ne voit aucune organisation arrête tout, sans rien créer', async () => {
  const { dossier, trace } = fauxFlyctl('{}');
  await assert.rejects(() => preparer(dossier), (e) => {
    assert.equal(e.code, 1);
    assert.match(e.stderr, /ne voit aucune organisation/);
    assert.match(e.stderr, /jeton de déploiement/, 'et dire de quel jeton il s\'agit');
    assert.match(e.stderr, /Rien n'a été créé/, 'et rassurer sur ce qui s\'est passé');
    return true;
  });
  const appels = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8') : '';
  assert.ok(!/mpg create/.test(appels), 'aucune base ne doit être créée quand le jeton ne peut pas');
});

// « mpg list --json » ne renvoie pas toujours du JSON. Le premier jet passait sa phrase à jq, qui
// répondait « parse error » — lu comme une panne alors qu'il n'y avait simplement aucune base.
test('une liste de bases vide n\'est pas prise pour une panne', async () => {
  const { dossier } = fauxFlyctl('{"personal":"Bacta"}');
  await assert.rejects(() => preparer(dossier), (e) => {
    assert.ok(!/parse error/.test(e.stderr + e.stdout), `jq ne doit pas s'étrangler :\n${e.stderr}`);
    assert.match(e.stderr, /Aucune base nommée mbolo-db/, 'il doit conclure qu\'il n\'y en a pas');
    assert.match(e.stdout, /Organisation : personal/, 'et avoir résolu l\'organisation du jeton');
    return true;
  });
});

// Fly affiche un secret posé mais pas encore appliqué préfixé d'une étoile, avec le statut
// « Staged ». Le premier jet ne reconnaissait pas cette forme : après un attachement réussi, il
// concluait « l'attachement n'a pas posé DATABASE_URL_FUTURE » et s'arrêtait — la base créée,
// attachée, facturée, et l'import jamais lancé. C'est exactement ce qui est arrivé.
const STAGED = ' * DATABASE_URL_FUTURE | def | Staged\\n';

test('un secret posé mais pas encore appliqué compte comme posé', async () => {
  const { dossier, trace } = fauxFlyctl('{"personal":"Bacta"}', STAGED);
  await assert.rejects(() => preparer(dossier), (e) => {
    // L'absence du message d'échec ne prouve rien — il faut qu'il ait reconnu la préparation.
    assert.match(e.stdout, /Base déjà préparée/, `le secret « Staged » doit compter comme posé :\n${e.stdout}`);
    assert.ok(!/n'a pas posé/.test(e.stderr), "l'attachement ne doit pas être déclaré raté");
    return true;
  });
  const appels = fs.readFileSync(trace, 'utf8');
  assert.ok(!/postgres create|mpg create/.test(appels), 'et la base ne doit surtout pas être recréée');
});

// Un secret en attente existe côté Fly, mais la machine tourne encore sans lui : l'import y
// lirait une variable vide et croirait qu'aucune base ne lui est donnée.
test('un secret que la machine ne voit pas est appliqué avant l\'import', async () => {
  const { dossier, trace } = fauxFlyctl('{"personal":"Bacta"}', STAGED);
  await assert.rejects(() => preparer(dossier), (e) => {
    assert.match(e.stderr, /ne voit toujours pas/, "et le dire quand le déploiement n'a pas suffi");
    return true;
  });
  const appels = fs.readFileSync(trace, 'utf8');
  assert.match(appels, /secrets deploy/, 'les secrets en attente doivent être déployés');
  assert.ok(!/import-json/.test(appels), "et l'import ne doit pas partir sur une variable vide");
});

// La machine de l'app s'éteint quand personne ne s'en sert (auto_stop_machines). « ssh console »
// répond alors « has no started VMs », et tout ce que la bascule fait à distance — import,
// contrôle, relecture du secret — échoue sans raison lisible. Le script la réveille d'abord,
// par une requête, comme le ferait un visiteur.
test('la machine est réveillée avant toute commande à distance', async () => {
  const { dossier, trace } = fauxFlyctl('{"personal":"Bacta"}', ' DATABASE_URL | abc | Deployed\n');
  // Un faux curl, pour voir dans quel ordre les deux sont appelés.
  fs.writeFileSync(path.join(dossier, 'curl'), `#!/bin/sh\necho "curl $@" >> ${trace}\n`, { mode: 0o755 });

  // « verifier » ne fait que lire, et passe par le même chemin que l'import.
  await lancer('./basculer-postgres.sh', ['verifier', 'mbolo-miniapp', 'mbolo-pg'], {
    cwd: RACINE,
    env: { ...process.env, PATH: `${dossier}:${process.env.PATH}`, FLY_API_TOKEN: 'jeton-de-test' },
  });

  const appels = fs.readFileSync(trace, 'utf8');
  const reveil = appels.indexOf('/health');
  const commande = appels.indexOf('ssh console');
  assert.ok(reveil >= 0, 'la machine doit être réveillée par une requête');
  assert.ok(commande >= 0, 'et la commande à distance doit bien partir');
  assert.ok(reveil < commande, 'le réveil doit précéder la commande, sinon « has no started VMs »');
});
