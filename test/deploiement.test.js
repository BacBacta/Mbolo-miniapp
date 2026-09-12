// Le déploiement (P0-9) : ce que l'image Docker embarque, et ce que le guide promet.
//
// On ne peut pas construire l'image dans la suite de tests, et un COPY oublié ne se voit qu'au
// déploiement — quand la machine redémarre en boucle. On reconstitue donc le contenu de l'image
// dans un dossier à part, en suivant les COPY du Dockerfile, et on y démarre le serveur pour de
// vrai. Un fichier que le Dockerfile n'emporte pas manquera ici exactement comme là-bas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = fs.readFileSync(path.join(RACINE, 'Dockerfile'), 'utf8');

// Les chemins que le Dockerfile copie dans /app, dans l'ordre où il les copie.
const copies = [...dockerfile.matchAll(/^COPY\s+(.+?)\s+\.\/?(\S*)$/gm)]
  .flatMap((m) => m[1].split(/\s+/).map((source) => ({ source, cible: m[2] || source })))
  .filter((c) => !c.source.startsWith('/') && !c.cible.startsWith('/'));

test('le Dockerfile emporte le serveur, l\'interface et les scripts d\'exploitation', () => {
  const sources = copies.map((c) => c.source);
  for (const attendu of ['server', 'public', 'scripts', 'package.json', 'package-lock.json']) {
    assert.ok(sources.includes(attendu), `le Dockerfile doit copier ${attendu}`);
  }
});

// .dockerignore l'emporte sur COPY : un dossier copié mais ignoré n'arrive jamais dans l'image.
test('.dockerignore n\'exclut rien de ce que le Dockerfile copie', () => {
  const regles = fs.readFileSync(path.join(RACINE, '.dockerignore'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  for (const { source } of copies) {
    assert.ok(!regles.includes(source), `.dockerignore exclut ${source}, que le Dockerfile copie`);
  }
});

const portLibre = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// Reconstitue /app : uniquement ce que le Dockerfile copie, plus node_modules (npm ci dans l'image).
function fabriquerImage() {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-image-'));
  for (const { source, cible } of copies) {
    const depuis = path.join(RACINE, source);
    if (!fs.existsSync(depuis)) continue;
    fs.cpSync(depuis, path.join(app, cible), { recursive: true });
  }
  // L'image fait « npm ci --omit=dev » ; ici on prête les modules déjà installés.
  fs.symlinkSync(path.join(RACINE, 'node_modules'), path.join(app, 'node_modules'));
  return app;
}

test('le serveur démarre et sert avec le seul contenu de l\'image', async (t) => {
  const app = fabriquerImage();
  const port = await portLibre();
  const serveur = spawn(process.execPath, ['server/index.js'], {
    cwd: app,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: path.join(app, 'data'),
      NODE_ENV: 'production',
      BOT_TOKEN: '123456:TEST_TOKEN',
      // En production le serveur exige un groupe de modération : l'image doit pouvoir démarrer
      // dans les conditions réelles, pas dans un mode allégé.
      ADMIN_CHAT_ID: '-1001234567890',
      WEBAPP_URL: `http://127.0.0.1:${port}`,
      USE_WEBHOOK: 'false',
      SEED_DEMO: 'false',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let journal = '';
  serveur.stdout.on('data', (d) => { journal += d; });
  serveur.stderr.on('data', (d) => { journal += d; });
  t.after(() => { serveur.kill(); fs.rmSync(app, { recursive: true, force: true }); });

  const base = `http://127.0.0.1:${port}`;
  let debout = false;
  for (let i = 0; i < 100 && !debout; i += 1) {
    try { debout = (await fetch(`${base}/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(debout, `le serveur n'a pas démarré avec le contenu de l'image :\n${journal}`);

  // Les trois choses que l'image doit savoir servir, chacune depuis un dossier différent.
  assert.equal((await fetch(`${base}/`)).status, 200, 'la page d\'accueil (public/index.html)');
  assert.equal((await fetch(`${base}/styles.css`)).status, 200, 'la feuille de style (public/)');
  assert.equal((await fetch(`${base}/confidentialite`)).status, 200, 'les pages publiques (server/legal/)');

  // Et le script d'import doit être là : le guide de déploiement dit de le lancer depuis la machine.
  assert.ok(fs.existsSync(path.join(app, 'scripts', 'import-json.js')), 'scripts/import-json.js manque dans l\'image');

  // Ce serveur tourne en production sans DATABASE_URL : c'est exactement le cas où un fichier
  // unique sans sauvegarde porte des chiffres qui ne se reconstituent pas. Il démarre — refuser
  // casserait une production qui tourne — mais il doit le dire, là où l'exploitant regarde.
  assert.match(journal, /en production sur un fichier JSON/,
    `le serveur devrait signaler le stockage fichier en production :\n${journal}`);
  assert.match(journal, /DATABASE_URL/, 'et dire quoi faire, pas seulement que ça ne va pas');
});


// ---------- Le guide de déploiement ----------
//
// DEPLOIEMENT.md cite des lignes que le serveur écrit dans son journal, et s'en sert comme preuve
// que tout est branché : « tu dois y lire ceci ». Le jour où le message change, le guide envoie
// chercher une phrase qui n'existe plus — et fait douter de son déploiement quelqu'un dont le
// déploiement va bien. On vérifie donc que chaque citation se trouve vraiment dans le code.
const guide = fs.readFileSync(path.join(RACINE, 'DEPLOIEMENT.md'), 'utf8');
const source = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

test('les messages que le guide dit de chercher existent dans le code', () => {
  const citations = [
    ['Modération : les selfies et les photos partent vers', 'server/bot.js'],
    ['Groupe de modération injoignable', 'server/bot.js'],
    ['Stockage : PostgreSQL', 'server/index.js'],
    ['Attention : en production sur un fichier JSON.', 'server/index.js'],
    ['ADMIN_CHAT_ID absent', 'deployer-fly.sh'],
  ];
  for (const [phrase, fichier] of citations) {
    assert.ok(guide.includes(phrase), `le guide devrait citer « ${phrase} »`);
    assert.ok(source(fichier).includes(phrase), `« ${phrase} » est cité par le guide mais absent de ${fichier}`);
  }
});

// Le guide s'adresse à quelqu'un sous Windows (voir CLAUDE.md) : `curl` y est un alias
// d'Invoke-WebRequest, qui n'accepte ni -o ni -w. Une commande copiée telle quelle échouerait.
test('les commandes PowerShell du guide sont du PowerShell', () => {
  const blocs = [...guide.matchAll(/```powershell\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocs.length > 0, 'le guide doit contenir des commandes');
  for (const bloc of blocs) {
    assert.ok(!/\bcurl\b/.test(bloc), "curl n'est pas du PowerShell : utilise Invoke-RestMethod ou Invoke-WebRequest");
    assert.ok(!/\bexport\s+\w+=/.test(bloc), 'export n\'est pas du PowerShell : utilise $env:NOM = "valeur"');
  }
});

// Les variables que le guide présente comme obligatoires doivent exister pour de bon.
test("le guide n'invente pas de variables", () => {
  for (const nom of ['BOT_TOKEN', 'ADMIN_CHAT_ID', 'WEBAPP_URL', 'USE_WEBHOOK', 'NODE_ENV']) {
    assert.ok(guide.includes(nom), `le guide doit parler de ${nom}`);
    assert.ok(source('.env.example').includes(nom) || nom === 'NODE_ENV',
      `${nom} est cité par le guide mais absent de .env.example`);
  }
});
