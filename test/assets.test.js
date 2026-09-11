// Version des fichiers du navigateur : elle vient du contenu, couvre les modules importés,
// et laisse index.html hors cache. Sans ça, Telegram sert l'ancienne app après un déploiement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { assetVersion, versionImports, ASSET_FILES } = await import('../server/assets.js');
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function fauxPublic(contenus = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-assets-'));
  for (const f of ASSET_FILES) fs.writeFileSync(path.join(dir, f), contenus[f] ?? `contenu de ${f}`);
  return dir;
}

test('la version vient du contenu, pas du démarrage', () => {
  const a = fauxPublic();
  const b = fauxPublic();
  assert.equal(assetVersion(a), assetVersion(a), 'deux lectures du même dossier donnent la même version');
  assert.equal(assetVersion(a), assetVersion(b), 'un contenu identique donne la même version');

  // Sinon la machine, qui s'arrête et repart sans cesse, ferait retélécharger l'app à chaque réveil
  const c = fauxPublic({ 'ui.js': 'contenu de ui.js modifié' });
  assert.notEqual(assetVersion(a), assetVersion(c), 'un seul fichier modifié change la version');
});

test('chaque fichier compte dans la version', () => {
  const base = assetVersion(fauxPublic());
  for (const f of ASSET_FILES) {
    assert.notEqual(assetVersion(fauxPublic({ [f]: 'autre chose' })), base, `${f} doit compter`);
  }
});

test('les imports de app.js reçoivent la version', () => {
  const source = "import * as tg from './tg.js';\nimport { icon } from './ui.js';\n";
  const out = versionImports(source, 'abc123');
  assert.match(out, /from '\.\/tg\.js\?v=abc123'/);
  assert.match(out, /from '\.\/ui\.js\?v=abc123'/);
});

test('la réécriture touche vraiment le app.js du dépôt', () => {
  const source = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
  const out = versionImports(source, 'abc123');
  assert.notEqual(out, source, 'les imports du vrai app.js doivent être reconnus');
  // Aucun import relatif ne doit rester sans version, sinon il serait servi depuis le cache
  const restants = [...out.matchAll(/from '(\.\/[^']+)'/g)].map((m) => m[1]).filter((s) => !s.includes('?v='));
  assert.deepEqual(restants, [], `imports non versionnés : ${restants.join(', ')}`);
});

test('index.html demande bien les fichiers versionnés', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /href="\/styles\.css\?v=__ASSET_V__"/);
  assert.match(html, /src="\/app\.js\?v=__ASSET_V__"/);
  // index.html n'est jamais versionné : c'est lui qui porte les nouvelles adresses
  assert.ok(!html.includes('index.html?v='));
});
