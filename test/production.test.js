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
