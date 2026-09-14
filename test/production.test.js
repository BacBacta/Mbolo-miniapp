// Ce qui doit être vrai quand l'app tourne pour de vraies personnes.
//
// La promesse « tous les profils sont vérifiés » tient à deux réglages. AUTO_APPROVE valide les
// selfies sans que personne les regarde : pratique pour développer, mensonger en ligne.
// ADMIN_CHAT_ID désigne le groupe qui reçoit les selfies : sans lui, ils ne partent nulle part.
// Les deux ont déjà été livrés en production par fly.toml et render.yaml — d'où ce fichier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// config.js lit process.env au chargement : on le recharge avec une adresse différente pour
// obtenir une lecture neuve plutôt que celle gardée en cache par Node.
let n = 0;
const configAvec = async (env) => {
  const avant = {};
  for (const [k, v] of Object.entries(env)) {
    avant[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try {
    n += 1;
    return (await import(`../server/config.js?relecture=${n}`)).config;
  } finally {
    for (const [k, v] of Object.entries(avant)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};

test('AUTO_APPROVE ne s\'applique jamais en production', async () => {
  const dev = await configAvec({ AUTO_APPROVE: 'true', NODE_ENV: undefined });
  assert.equal(dev.autoApprove, true, 'hors production, la validation automatique reste possible');

  const prod = await configAvec({ AUTO_APPROVE: 'true', NODE_ENV: 'production' });
  assert.equal(prod.autoApprove, false, 'en production, elle est éteinte quoi que dise la variable');
  assert.equal(prod.isProd, true);
});

// Même garde que pour AUTO_APPROVE : un mode de développement ne doit pas survivre au déploiement.
test('ALLOW_DEV_AUTH ne s\'applique jamais en production', async () => {
  const dev = await configAvec({ ALLOW_DEV_AUTH: 'true', NODE_ENV: undefined });
  assert.equal(dev.allowDevAuth, true);
  const prod = await configAvec({ ALLOW_DEV_AUTH: 'true', NODE_ENV: 'production' });
  assert.equal(prod.allowDevAuth, false);
});

// Le serveur est lancé pour de vrai : un test qui lirait seulement le code ne dirait pas si le
// démarrage s'arrête vraiment, ni avec quel message.
function demarrer(env, timeout = 15000) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-prod-'));
  const r = spawnSync(process.execPath, ['server/index.js'], {
    encoding: 'utf8',
    timeout,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      BOT_TOKEN: '123456:TEST_TOKEN',
      WEBAPP_URL: 'https://exemple.test',
      SEED_DEMO: 'false',
      USE_WEBHOOK: 'false',
      PORT: '0',
      DATABASE_URL: '',
      ...env,
    },
  });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

// Même famille que la garde précédente : un secret absent ne doit pas se remplacer en silence
// par un secret jetable. Sans VENUE_SECRET, les codes des QR sont tirés au hasard à chaque
// démarrage — les feuilles posées sur les tables cesseraient d'être reconnues à chaque
// déploiement, et personne ne pourrait plus confirmer son arrivée.
test('en production avec un lieu partenaire et sans VENUE_SECRET, le serveur refuse de démarrer', () => {
  const r = demarrer({ NODE_ENV: 'production', ADMIN_CHAT_ID: '-100', SEED_DEMO: 'true', VENUE_SECRET: '' });
  assert.equal(r.code, 1, 'le démarrage s\'arrête');
  assert.match(r.sortie, /VENUE_SECRET manquant/);
  // Le message dit quoi faire, pas seulement ce qui manque (règle 11 de CLAUDE.md)
  assert.match(r.sortie, /réimprime les QR/i);
  assert.ok(!/écoute sur le port/.test(r.sortie), 'aucune requête n\'est servie');
});

// La garde ne se déclenche que s'il y a un lieu à protéger. La liste est vide aujourd'hui : une
// production sans partenariat ne doit pas se voir réclamer un secret qui ne sert à rien.
test('sans lieu partenaire, VENUE_SECRET n\'est pas réclamé', () => {
  const r = demarrer({ NODE_ENV: 'production', ADMIN_CHAT_ID: '-100', SEED_DEMO: 'false', VENUE_SECRET: '' }, 6000);
  assert.match(r.sortie, /écoute sur le port/, 'le serveur démarre et sert');
  assert.ok(!/VENUE_SECRET manquant/.test(r.sortie), 'et sans reproche');
});

test('en production sans groupe de modération, le serveur refuse de démarrer', () => {
  const r = demarrer({ NODE_ENV: 'production', ADMIN_CHAT_ID: '' });
  assert.equal(r.code, 1, 'le démarrage s\'arrête');
  assert.match(r.sortie, /ADMIN_CHAT_ID manquant/);
  // Le message dit quoi faire, pas seulement ce qui manque (règle 11 de CLAUDE.md)
  assert.match(r.sortie, /crée un groupe Telegram/i);
  assert.match(r.sortie, /\/id/);
  assert.ok(!/écoute sur le port/.test(r.sortie), 'aucune requête n\'est servie');
});

test('hors production, l\'absence de groupe de modération n\'empêche pas de développer', () => {
  const r = demarrer({ NODE_ENV: 'development', ADMIN_CHAT_ID: '' }, 6000);
  assert.match(r.sortie, /écoute sur le port/, 'le serveur démarre et sert');
  assert.ok(!/ADMIN_CHAT_ID manquant/.test(r.sortie), 'et sans reproche');
});

// Les fichiers livrés à l'hébergeur sont la dernière ligne de défense : c'est par eux que la
// validation automatique s'est retrouvée en production. Les deux formats sont lus pour de bon,
// sans regarder les commentaires : une regex lâche laisserait repasser exactement ce cas,
// puisque render.yaml écrit le réglage et sa valeur sur deux lignes.
const reglagesFly = (texte) => Object.fromEntries([...texte.matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
function reglagesRender(texte) {
  const out = {};
  let cle = null;
  for (const brute of texte.split('\n')) {
    const ligne = brute.replace(/#.*$/, '').trim();
    const k = ligne.match(/^-?\s*key:\s*(\S+)/);
    if (k) { cle = k[1]; out[cle] = ''; continue; }
    const v = ligne.match(/^value:\s*"?([^"]*)"?/);
    if (v && cle) { out[cle] = v[1].trim(); cle = null; }
  }
  return out;
}

test('les fichiers de déploiement n\'activent ni validation automatique ni profils de démo', () => {
  const fichiers = {
    'fly.toml': reglagesFly(fs.readFileSync('fly.toml', 'utf8')),
    'render.yaml': reglagesRender(fs.readFileSync('render.yaml', 'utf8')),
  };
  // Le lecteur est vérifié sur ce qu'il doit trouver : sans cela, un lecteur qui ne lit rien
  // ferait passer le test quoi que contiennent les fichiers.
  assert.equal(fichiers['fly.toml'].NODE_ENV, 'production', 'le lecteur de fly.toml lit bien');
  assert.equal(fichiers['render.yaml'].NODE_ENV, 'production', 'le lecteur de render.yaml lit bien');

  for (const [nom, reglages] of Object.entries(fichiers)) {
    assert.ok(!('AUTO_APPROVE' in reglages), `${nom} ne doit pas régler AUTO_APPROVE`);
    assert.notEqual(reglages.SEED_DEMO, 'true', `${nom} ne doit pas charger les profils de démonstration`);
  }
  // render.yaml décrit un service complet : le groupe de modération doit y être demandé.
  assert.ok('ADMIN_CHAT_ID' in fichiers['render.yaml'], 'render.yaml doit demander ADMIN_CHAT_ID');
});

// Le script s'arrête avant de construire une image que le serveur refuserait de lancer.
test('deployer-fly.sh s\'arrête tout de suite sans groupe de modération', () => {
  const r = spawnSync('bash', ['deployer-fly.sh', 'app-test', 'ams'], {
    encoding: 'utf8',
    env: { ...process.env, FLY_API_TOKEN: 'jeton-test', BOT_TOKEN: '123:TEST', ADMIN_CHAT_ID: '' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ADMIN_CHAT_ID absent/);
  assert.match(r.stderr, /\/id/);
  assert.ok(!/Compte/.test(r.stdout), 'rien n\'est tenté chez Fly');
});

// Sanité : le script reste lisible par bash, puisqu'un test le lance.
test('deployer-fly.sh est syntaxiquement valide', () => {
  execFileSync('bash', ['-n', 'deployer-fly.sh']);
});

// ---------- Les lieux partenaires ----------
//
// L'app annonce le nom d'un lieu, son quartier et son avantage (« -10 % avec Odo ») à quelqu'un
// qui va s'y rendre. Si l'établissement n'a rien signé, c'est un mensonge fait à un membre et un
// problème avec le café. La liste part donc vide, et un lieu n'y entre qu'avec un accord réel.
//
// Ce test existe parce que la tentation inverse est forte : remettre quatre lieux « pour que la
// fonction se voie » est exactement ce qui avait été fait, et personne ne l'avait relu depuis.

test("aucun lieu partenaire n'est proposé tant qu'aucun partenariat n'existe", async () => {
  const { venues } = await import('../server/config.js');
  assert.deepEqual(venues, [], "la liste part vide : un lieu n'y entre qu'avec un accord signé");
});

test('les lieux d\'exemple ne sortent qu\'avec SEED_DEMO', () => {
  const source = fs.readFileSync('server/config.js', 'utf8');
  assert.match(source, /export const venues = \[\.\.\.\(config\.seedDemo \? VENUES_DEMO : \[\]\)\]/,
    'les lieux d\'exemple doivent rester derrière SEED_DEMO');
  // Et ils ne doivent pas se faire passer pour autre chose que des exemples.
  assert.match(source, /aucun de ces établissements n'a signé/, "le code doit dire ce qu'ils sont");
});

test("l'écran d'accueil ne promet pas le QR code à qui n'aura pas de lieu partenaire", () => {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const accueil = app.slice(app.indexOf("t('Des rencontres vérifiées"), app.indexOf("t('Léger en data')"));
  assert.ok(!/lieu partenaire/.test(accueil),
    "l'accueil s'affiche avant l'inscription, partout : il ne peut pas promettre un lieu partenaire qui n'existe nulle part");
  assert.ok(!/QR code/.test(accueil), "ni la confirmation d'arrivée qui va avec");
  assert.match(accueil, /lieu public/, 'ce que l\'app tient vraiment dès le premier jour');
});

// ---------- Deux secrets ne doivent jamais porter la même valeur ----------
//
// C'est arrivé en production : ADMIN_KEY, WEB_SESSION_SECRET et BACKUP_SECRET partageaient une
// seule chaîne, et personne ne pouvait le voir depuis le code — il a fallu lire la liste des
// secrets chez l'hébergeur, où trois lignes affichaient la même empreinte.
//
// Ce qui rend la coïncidence grave : ADMIN_KEY voyage dans des URL. Le chemin du webhook
// Telegram en porte une copie (server/bot.js), donc chaque message reçu la promène dans les
// journaux de requêtes. BACKUP_SECRET, lui, déchiffre les sauvegardes — tous les profils et tous
// les messages. La sécurité du plus sensible tombait à celle du plus exposé.

test('en production, deux secrets qui partagent une valeur empêchent le démarrage', () => {
  const r = demarrer({
    NODE_ENV: 'production', ADMIN_CHAT_ID: '-100',
    ADMIN_KEY: 'la-meme-chaine', BACKUP_SECRET: 'la-meme-chaine',
  });
  assert.equal(r.code, 1, `le serveur devait refuser de démarrer :\n${r.sortie}`);
  assert.match(r.sortie, /partagent la même valeur/);
  assert.match(r.sortie, /ADMIN_KEY, BACKUP_SECRET/, 'et nommer lesquels, sinon il faut deviner');
  assert.ok(!r.sortie.includes('la-meme-chaine'),
    'la valeur partagée ne doit jamais être écrite : ce message finit dans un journal');
});

test('trois secrets partagés sont signalés ensemble, pas deux par deux', () => {
  const r = demarrer({
    NODE_ENV: 'production', ADMIN_CHAT_ID: '-100',
    ADMIN_KEY: 'x', WEB_SESSION_SECRET: 'x', BACKUP_SECRET: 'x',
  });
  assert.equal(r.code, 1);
  assert.match(r.sortie, /ADMIN_KEY, WEB_SESSION_SECRET, BACKUP_SECRET/,
    'le cas réel : un seul groupe qui dit toute la coïncidence');
});

test('des secrets distincts ne gênent personne', () => {
  const r = demarrer({
    NODE_ENV: 'production', ADMIN_CHAT_ID: '-100',
    ADMIN_KEY: 'a', WEB_SESSION_SECRET: 'b', BACKUP_SECRET: 'c', VENUE_SECRET: 'd',
  }, 6000);
  assert.ok(!/partagent la même valeur/.test(r.sortie), `rien à signaler :\n${r.sortie}`);
});

// Plusieurs secrets absents ne sont pas plusieurs secrets identiques. Ne rien poser est un choix
// légitime — le serveur tire alors une valeur au hasard, ou éteint la fonction — et bloquer là
// -dessus rendrait impossible tout déploiement qui n'utilise pas encore les lieux partenaires.
test('des secrets vides ne comptent pas comme partagés', () => {
  const r = demarrer({
    NODE_ENV: 'production', ADMIN_CHAT_ID: '-100',
    WEB_SESSION_SECRET: '', VENUE_SECRET: '', BACKUP_SECRET: '',
  }, 6000);
  assert.ok(!/partagent la même valeur/.test(r.sortie), `trois vides ne sont pas un groupe :\n${r.sortie}`);
});

// Hors production, on prévient sans bloquer : un .env de développement recopié à la va-vite ne
// met personne en danger, et refuser de démarrer ferait perdre du temps sans rien protéger.
test('hors production, le partage est signalé mais n\'empêche pas de développer', () => {
  const r = demarrer({
    NODE_ENV: 'development', ADMIN_CHAT_ID: '',
    ADMIN_KEY: 'pareil', BACKUP_SECRET: 'pareil',
  }, 6000);
  assert.match(r.sortie, /Attention : des secrets partagent/);
  assert.match(r.sortie, /refuserait de démarrer/, 'et dit ce qui se passerait en production');
  assert.match(r.sortie, /écoute sur le port/, 'mais le serveur démarre quand même');
});

// ---------- Le même contrôle, une étape plus tôt ----------
//
// Le garde-fou du démarrage a fait son travail, mais au pire endroit : sur la machine neuve,
// après le basculement, dans une boucle de redémarrage. Refuser en tombant, c'est éteindre la
// production pour la protéger. `scripts/verifier-secrets.js` lit la même chose dans la liste de
// l'hébergeur — deux valeurs identiques y donnent deux empreintes identiques — avant que
// `flyctl deploy` ne remplace quoi que ce soit.

const LISTE_FLY = (lignes) => ['NAME\tDIGEST\tCREATED AT', ...lignes].join('\n') + '\n';

const controlerSecrets = (liste) => spawnSync(process.execPath, ['scripts/verifier-secrets.js'], {
  input: liste, encoding: 'utf8',
});

test('deux secrets de même empreinte arrêtent le déploiement', () => {
  const r = controlerSecrets(LISTE_FLY([
    'ADMIN_CHAT_ID\t9f1c2d3e4a5b6c7d\t1 month ago',
    'ADMIN_KEY\tc095251a7d8ce235\t1 month ago',
    'BOT_TOKEN\t1111111122222222\t1 month ago',
    'WEB_SESSION_SECRET\tc095251a7d8ce235\t1 month ago',
  ]));
  assert.equal(r.status, 1, `le déploiement devait être refusé :\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /ADMIN_KEY, WEB_SESSION_SECRET/, 'et nommer lesquels, sinon il faut deviner');
  assert.ok(!r.stderr.includes('c095251a7d8ce235'),
    "l'empreinte n'apprend rien de plus que « ces deux-là sont pareils », et ce message est journalisé");
  assert.match(r.stderr, /BACKUP_SECRET/, 'et rappeler le seul secret qu\'on ne change pas à la légère');
});

test('des empreintes distinctes laissent le déploiement continuer', () => {
  const r = controlerSecrets(LISTE_FLY([
    'ADMIN_KEY\taaaaaaaabbbbbbbb\t1 month ago',
    'BACKUP_SECRET\tccccccccdddddddd\t1 month ago',
    'BOT_TOKEN\teeeeeeeeffffffff\t1 month ago',
    'WEB_SESSION_SECRET\t0123456789abcdef\t1 month ago',
  ]));
  assert.equal(r.status, 0, `rien à signaler :\n${r.stdout}${r.stderr}`);
});

// Ce que les quatre cas ci-dessus ne voyaient pas : la forme réelle de la liste.
//
// Trois lectures se sont cassées dessus le 14 septembre 2026, chacune refusant le déploiement
// qui remettait la production debout. flyctl dessine sa table avec tablewriter, bordures
// éteintes : une espace en tête, des cellules séparées par « │ » — le trait de dessin de boîte
// U+2502, que le faux flyctl de bascule.test.js approximait par la barre ASCII — et, parce que
// `deployer-fly.sh` pose les secrets juste avant de lire (`flyctl secrets set --stage`), le
// marqueur « * » dans la cellule du nom de chaque secret posé, « ! » pour un déploiement
// partiel. Le rendu ci-dessous est celui de `render.Table` de flyctl, obtenu en l'exécutant.
const LISTE_FLY_REELLE = (lignes) => [
  ' NAME                 │ DIGEST           │ STATUS   ',
  ...lignes.map(([nom, empreinte, statut]) => ` ${nom.padEnd(20)} │ ${empreinte.padEnd(16)} │ ${statut.padEnd(8)} `),
  '', '2 secrets staged, 1 partial deployment.',
].join('\n') + '\n';

test('la liste telle que flyctl la dessine, marqueurs compris, reste lisible', () => {
  const r = controlerSecrets(LISTE_FLY_REELLE([
    ['* BOT_TOKEN', 'eeeeeeeeffffffff', 'Staged'],
    ['* ADMIN_KEY', 'aaaaaaaabbbbbbbb', 'Staged'],
    ['! WEB_SESSION_SECRET', '0123456789abcdef', 'Partial'],
    ['BACKUP_SECRET', 'ccccccccdddddddd', 'Deployed'],
    ['ADMIN_CHAT_ID', '7777777788888888', 'Deployed'],
  ]));
  assert.equal(r.status, 0, `quatre empreintes distinctes, rien à signaler :\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /4 reconnus/, 'et les quatre comptent, marqueur compris, sans ADMIN_CHAT_ID');
});

test('un partage reste visible sous le marqueur et entre les traits', () => {
  const r = controlerSecrets(LISTE_FLY_REELLE([
    ['* ADMIN_KEY', 'c095251a7d8ce235', 'Staged'],
    ['* BOT_TOKEN', 'eeeeeeeeffffffff', 'Staged'],
    ['* BACKUP_SECRET', 'c095251a7d8ce235', 'Staged'],
  ]));
  assert.equal(r.status, 1, 'le marqueur ne doit pas rendre le partage invisible');
  assert.match(r.stderr, /ADMIN_KEY, BACKUP_SECRET/);
});

// La forme que le déploiement demande vraiment : `--json`, un tableau de { name, digest,
// status }. Une machine qui sait produire du JSON n'a pas à être lue comme un dessin.
const LISTE_FLY_JSON = (secrets) => JSON.stringify(secrets.map(([name, digest, status]) => ({ name, digest, status })), null, 4) + '\n';

test('la liste en JSON est lue en priorité', () => {
  const r = controlerSecrets(LISTE_FLY_JSON([
    ['BOT_TOKEN', 'eeeeeeeeffffffff', 'Staged'],
    ['ADMIN_KEY', 'aaaaaaaabbbbbbbb', 'Staged'],
    ['BACKUP_SECRET', 'ccccccccdddddddd', 'Deployed'],
  ]));
  assert.equal(r.status, 0, `trois empreintes distinctes :\n${r.stderr}`);
  assert.match(r.stdout, /3 reconnus/);
  const partage = controlerSecrets(LISTE_FLY_JSON([
    ['ADMIN_KEY', 'c095251a7d8ce235', 'Staged'],
    ['BOT_TOKEN', 'eeeeeeeeffffffff', 'Staged'],
    ['WEB_SESSION_SECRET', 'c095251a7d8ce235', 'Deployed'],
  ]));
  assert.equal(partage.status, 1);
  assert.match(partage.stderr, /ADMIN_KEY, WEB_SESSION_SECRET/);
});

// L'alphabet de l'empreinte n'est pas une promesse de l'hébergeur : c'est sa colonne qui la
// désigne. Une empreinte qui ne serait pas hexadécimale doit compter comme les autres.
test("l'empreinte est reconnue par sa colonne, pas par son alphabet", () => {
  const r = controlerSecrets(LISTE_FLY_REELLE([
    ['* BOT_TOKEN', 'kBOB9mXJhQY=', 'Staged'],
    ['ADMIN_KEY', 'Zz+/AbCdEf==', 'Deployed'],
  ]));
  assert.equal(r.status, 0, `deux empreintes distinctes :\n${r.stderr}`);
  assert.match(r.stdout, /2 reconnus/);
});

// Et les formes d'avant restent lues : « NOM  empreinte » séparés d'espaces (les cas ci-dessus),
// ou la barre ASCII que le faux flyctl dessinait. Le séparateur n'est plus une hypothèse.
test('les secrets fraîchement posés, marqués « * », restent lisibles quel que soit le séparateur', () => {
  const espaces = controlerSecrets(LISTE_FLY([
    '*\tADMIN_KEY\taaaaaaaabbbbbbbb\t1 minute ago',
    '*\tBOT_TOKEN\teeeeeeeeffffffff\t1 minute ago',
  ]));
  assert.equal(espaces.status, 0, `espaces :\n${espaces.stderr}`);
  const barres = controlerSecrets(' NAME | DIGEST | STATUS\n * ADMIN_KEY | aaaaaaaabbbbbbbb | Staged\n * BOT_TOKEN | eeeeeeeeffffffff | Staged\n');
  assert.equal(barres.status, 0, `barre ASCII :\n${barres.stderr}`);
});

// Quand il ne reconnaît rien, le contrôle dit ce qu'il a reçu — la forme, jamais le contenu.
// Quatre lectures se sont succédé à l'aveugle parce que la sortie de flyctl partait dans un
// tuyau sans laisser de trace ; ce diagnostic aurait réglé la question au premier essai.
test('une liste illisible décrit sa forme sans jamais montrer une empreinte', () => {
  const r = controlerSecrets(' NAME ‖ DIGEST\n ADMIN_KEY ‖ c095251a7d8ce235z ‖ Deployed\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pas su lire/);
  assert.match(r.stderr, /1 ligne|2 ligne|3 ligne/, 'et compter ce qui a été reçu');
  assert.match(r.stderr, /ADMIN_KEY/, 'les noms de variables restent lisibles : ils disent quelle colonne est laquelle');
  assert.ok(!r.stderr.includes('c095251a7d8ce235'), "l'empreinte, elle, ne sort jamais");
  assert.match(r.stderr, /<17 car\.>/, 'remplacée par sa longueur');
});

// L'identifiant du groupe de modération n'est pas un secret, et deux variables de confort qui se
// ressemblent ne mettent personne en danger. Bloquer là-dessus rendrait le contrôle insupportable,
// et un contrôle insupportable finit contourné.
test('les variables hors de la liste ne déclenchent rien', () => {
  const r = controlerSecrets(LISTE_FLY([
    'ADMIN_CHAT_ID\t7777777788888888\t1 month ago',
    'ADMIN_KEY\taaaaaaaabbbbbbbb\t1 month ago',
    'BOT_TOKEN\teeeeeeeeffffffff\t1 month ago',
    'DATABASE_URL\t7777777788888888\t1 month ago',
  ]));
  assert.equal(r.status, 0, `deux variables ordinaires ne sont pas deux secrets :\n${r.stderr}`);
});

// Le piège de tout garde-fou qui lit du texte : le jour où la sortie change de forme, il ne
// comprend plus rien — et ne rien comprendre, ici, revient à tout approuver. Un déploiement pose
// toujours au moins BOT_TOKEN et ADMIN_KEY : en reconnaître moins de deux veut dire qu'on n'a
// pas su lire, pas que tout va bien.
test('une liste illisible refuse au lieu de laisser passer', () => {
  const r = controlerSecrets('{"secrets": [{"name": "ADMIN_KEY", "digest": "c095251a"}]}\n');
  assert.equal(r.status, 1, 'un format inconnu ne doit pas valoir approbation');
  assert.match(r.stderr, /pas su lire/);
  assert.match(r.stderr, /flyctl secrets list/, 'et dire où regarder');
});

// L'ordre est tout l'intérêt : après `flyctl deploy`, ce contrôle ne servirait plus à rien
// puisque la machine serait déjà remplacée — c'est exactement la panne qu'il évite.
test('le contrôle passe avant le déploiement, pas après', () => {
  const s = fs.readFileSync('deployer-fly.sh', 'utf8');
  const controle = s.indexOf('node scripts/verifier-secrets.js');
  const deploiement = s.indexOf('flyctl deploy');
  assert.ok(controle > 0, 'deployer-fly.sh doit lancer le contrôle des secrets');
  assert.ok(deploiement > 0);
  assert.ok(controle < deploiement,
    'après le déploiement, la machine est déjà remplacée : le contrôle arriverait trop tard');
  // Et après la pose des secrets, sinon il juge les valeurs que la machine quitte.
  assert.ok(s.indexOf('flyctl secrets set --stage') < controle,
    'les empreintes à juger sont celles que la machine recevra');
});

// ---------- Le déploiement en marche, contre un faux flyctl ----------
//
// Ce que les tests de texte ne voyaient pas, et qui a éteint la production le 14 septembre 2026 :
// le secret WEB_SESSION_SECRET du dépôt GitHub portait la valeur d'ADMIN_KEY, le serveur
// refusait donc de démarrer, et chaque déploiement reposait la même paire depuis le dépôt — une
// correction à la main chez l'hébergeur ne tenait pas jusqu'au déploiement suivant. On fait donc
// tourner le script pour de bon, dans un dossier à lui (il réécrit fly.toml), avec un flyctl de
// paille qui rend en JSON les empreintes de ce qu'on vient de lui poser, et un faux curl.
const fauxDeploiement = () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'odo-deploiement-'));
  const trace = path.join(dossier, 'appels.txt');
  const outils = path.join(dossier, 'outils');
  fs.mkdirSync(outils);
  fs.mkdirSync(path.join(dossier, 'scripts'));
  fs.mkdirSync(path.join(dossier, 'server'));
  for (const f of ['fly.toml', 'deployer-fly.sh', 'scripts/verifier-secrets.js', 'server/secrets.js']) {
    fs.copyFileSync(path.join(process.cwd(), f), path.join(dossier, f));
  }
  fs.writeFileSync(path.join(outils, 'flyctl'), `#!/bin/sh
echo "$@" >> ${trace}
case "$1 $2" in
  "auth whoami") echo "test@tokens.fly.io" ;;
  "volumes list") echo "mbolo_data" ;;
  "ips list") echo '[{"Type":"v4"},{"Type":"v6"}]' ;;
  # Retient ce qu'on lui pose, pour le rendre ensuite.
  "secrets set") shift 4; for kv in "$@"; do echo "$kv" >> ${dossier}/poses.txt; done ;;
  # Le vrai flyctl rend une empreinte par secret : ici, une somme de la valeur posée.
  "secrets list") echo '['; sep=''; while IFS== read -r nom val; do
      printf '%s{"name":"%s","digest":"%s","status":"Staged"}' "$sep" "$nom" "$(printf '%s' "$val" | cksum | cut -d' ' -f1)"; sep=','; done < ${dossier}/poses.txt; echo ']' ;;
  *) : ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(outils, 'curl'), `#!/bin/sh\necho "curl $@" >> ${trace}\necho '{"ok":true}'\n`, { mode: 0o755 });
  const lancer = (env) => spawnSync('bash', ['./deployer-fly.sh', 'app-de-test', 'ams'], {
    cwd: dossier, encoding: 'utf8',
    env: { ...process.env, PATH: `${outils}:${process.env.PATH}`, FLY_API_TOKEN: 'jeton', BOT_TOKEN: 'bot-123', ADMIN_CHAT_ID: '-100', ...env },
  });
  const poses = () => Object.fromEntries(fs.readFileSync(path.join(dossier, 'poses.txt'), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
  const appels = () => fs.readFileSync(trace, 'utf8');
  return { lancer, poses, appels };
};

test('le déploiement ne pose jamais dans WEB_SESSION_SECRET une copie d\'ADMIN_KEY', () => {
  const d = fauxDeploiement();
  const r = d.lancer({ ADMIN_KEY: 'meme-valeur-partagee', WEB_SESSION_SECRET: 'meme-valeur-partagee' });
  assert.equal(r.status, 0, `le déploiement doit aboutir avec un secret tiré au hasard :\n${r.stdout}${r.stderr}`);
  const p = d.poses();
  assert.equal(p.ADMIN_KEY, 'meme-valeur-partagee', "ADMIN_KEY reste celui du dépôt : c'est l'autre qui coûte le moins à changer");
  assert.ok(p.WEB_SESSION_SECRET && p.WEB_SESSION_SECRET !== 'meme-valeur-partagee', 'WEB_SESSION_SECRET doit être une autre valeur');
  assert.ok(p.WEB_SESSION_SECRET.length >= 32, 'et une vraie valeur aléatoire, pas un mot');
  assert.match(r.stderr, /même valeur qu'un autre secret/, 'et le dire');
  assert.match(r.stderr, /dépôt GitHub/, "en nommant l'endroit à corriger");
  assert.match(d.appels(), /deploy --remote-only/, 'le contrôle des empreintes passe, et le déploiement part');
});

test('un WEB_SESSION_SECRET distinct est posé tel quel, et le contrôle lit bien le JSON de flyctl', () => {
  const d = fauxDeploiement();
  const r = d.lancer({ ADMIN_KEY: 'cle-admin-propre', WEB_SESSION_SECRET: 'cle-session-propre' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(d.poses().WEB_SESSION_SECRET, 'cle-session-propre');
  assert.ok(!/même valeur/.test(r.stderr), 'rien à signaler');
  assert.match(r.stdout, /Secrets distincts \(3 reconnus/, 'BOT_TOKEN, ADMIN_KEY et WEB_SESSION_SECRET, lus en JSON');
  assert.match(d.appels(), /secrets list --json/, 'la liste est demandée en JSON, la forme sûre');
});

// Il tourne sur le runner de déploiement, où `npm ci` n'a pas été lancé : le moindre import de
// dépendance le ferait échouer sur un module manquant, c'est-à-dire précisément au moment où on
// compte sur lui. C'est pourquoi la liste vit dans server/secrets.js et non dans config.js.
test('le contrôle des secrets ne dépend d\'aucun module installé', () => {
  // On suit la chaîne des imports, et pas seulement la première ligne du script : la version
  // précédente de ce test acceptait « ../server/config.js » — un chemin relatif, donc réputé sans
  // danger — alors que config.js charge dotenv. Le sabotage passait sans rien casser, c'est-à-dire
  // que le test ne testait rien.
  const vus = new Set();
  const externes = [];
  const suivre = (fichier) => {
    if (vus.has(fichier)) return;
    vus.add(fichier);
    const source = fs.readFileSync(fichier, 'utf8');
    for (const [, spec] of source.matchAll(/(?:from|import)\s+'([^']+)'/g)) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) { externes.push(`${path.basename(fichier)} → ${spec}`); continue; }
      suivre(path.join(path.dirname(fichier), spec));
    }
  };
  suivre('scripts/verifier-secrets.js');
  assert.deepEqual(externes, [],
    'ces modules viennent de node_modules, absent du runner au moment du contrôle');
  assert.ok(vus.has(path.join('server', 'secrets.js')),
    'et la liste des secrets reste unique : celle que le serveur lit au démarrage');
});
