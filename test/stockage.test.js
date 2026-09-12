// Les deux stockages derrière la même interface (P0-2), et le script d'import.
//
// Le reste de la suite passe sur l'un ou sur l'autre selon DATABASE_URL — c'est là que se joue
// la vraie vérification : les mêmes 110 tests, deux fois. Ce fichier couvre ce qui n'appartient
// à aucun autre : le choix du stockage, et la reprise de db.json vers PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-stockage-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.SEED_DEMO = 'false';

const { store, modeStockage } = await import('../server/store.js');
// Le stockage fichier sert de référence : c'est lui qui définit l'interface que tout le serveur
// appelle. Il s'importe sans rien installer, quel que soit le mode actif.
const { store: reference } = await import('../server/store.json.js');

// Sans DATABASE_URL, l'app tourne sur un fichier : c'est ce qui la rend installable en une commande.
test('le stockage suit DATABASE_URL, sans que le reste de l\'app le sache', () => {
  assert.equal(modeStockage, process.env.DATABASE_URL ? 'postgres' : 'json');
  // Aucune méthode en moins ni en plus d'un stockage à l'autre : c'est toute la promesse de
  // store.js. Une méthode ajoutée d'un seul côté ferait planter l'app dans l'autre mode, et
  // seulement en production si c'est le mode PostgreSQL qui a été oublié.
  assert.deepEqual(Object.keys(store).sort(), Object.keys(reference).sort());
  // Les trois méthodes de présence sont les seules à rester synchrones, des deux côtés.
  const synchrones = Object.keys(store).filter((nom) => store[nom].constructor.name !== 'AsyncFunction');
  assert.deepEqual(synchrones.sort(), ['isViewing', 'leavePresence', 'touchPresence']);
});

// Un compte écrit puis relu doit revenir identique, horodatage compris : c'est la promesse
// minimale d'un stockage, et celle qui s'est cassée la première en passant au jsonb.
test('ce qui est écrit revient tel quel, date d\'inscription comprise', async () => {
  await store.upsertTelegramUser({ id: '8801', first_name: 'Awa', language_code: 'fr' });
  const jadis = Date.now() - 30 * 86400e3;
  await store.updateUser('8801', { createdAt: jadis, profile: { name: 'Awa', age: 24, city: 'Yaoundé' } });
  const u = await store.getUser('8801');
  assert.equal(u.createdAt, jadis, 'la date d\'inscription se réécrit');
  assert.equal(u.profile.city, 'Yaoundé');
  assert.equal(u.firstName, 'Awa', 'le reste du compte survit à la modification partielle');
});

// Le script d'import n'a de sens qu'avec une base d'arrivée : sans elle, il n'y a rien à vérifier.
test('l\'import reprend db.json sans rien inventer ni dupliquer', { skip: !process.env.DATABASE_URL && 'DATABASE_URL absent' }, async () => {
  const source = path.join(DATA_DIR, 'import.json');
  const db = {
    users: {
      '8901': { id: '8901', firstName: 'Bana', createdAt: 1700000000000, verification: 'approved', profile: { name: 'Bana', age: 22, city: 'Douala' } },
      '8902': { id: '8902', firstName: 'Cyrille', createdAt: 1700000001000, verification: 'approved', profile: { name: 'Cyrille', age: 27, city: 'Douala' } },
    },
    swipes: [{ from: '8901', to: '8902', action: 'like', at: 1700000002000 }],
    matches: { mx: { id: 'mx', key: '8901:8902', users: ['8901', '8902'], createdAt: 1700000003000, readAt: { 8902: 1700000004000 } } },
    messages: { mx: [{ id: 'msg1', from: '8901', text: 'Salut', at: 1700000005000 }] },
    blocks: [], reports: [], dates: { dx: { id: 'dx', matchId: 'mx', venueId: 'palmier', slot: 'samedi 15h', status: 'proposed' } },
  };
  fs.writeFileSync(source, JSON.stringify(db));

  const lancer = (...args) => execFileSync(process.execPath, ['scripts/import-json.js', source, ...args], { encoding: 'utf8', env: process.env });
  // La base porte déjà le compte du test précédent : réimporter par-dessus une base vivante
  // demande de le dire. C'est le garde-fou qui évite d'écraser la production avec une sauvegarde.
  assert.throws(() => lancer(), /contient déjà/);
  assert.match(lancer('--force'), /Comptes : 2 importé/);

  const u = await store.getUser('8901');
  assert.equal(u.createdAt, 1700000000000, 'la date d\'inscription est reprise, pas refaite');
  assert.equal(u.profile.city, 'Douala');
  const m = await store.getMatch('mx');
  assert.deepEqual(m.users.sort(), ['8901', '8902']);
  assert.equal((await store.messagesOf('mx'))[0].text, 'Salut');
  assert.equal(await store.hasOpened('mx', '8902'), true, 'les horodatages de lecture suivent');
  assert.equal((await store.datesOfMatch('mx'))[0].slot, 'samedi 15h');
  assert.equal((await store.swipeOf('8901', '8902')).action, 'like');

  // Relancer ne doit ni refuser en silence ni créer de doublon : la reprise après coupure en dépend.
  assert.match(lancer('--force'), /Comptes : 0 importé\(s\) sur 2/);
  assert.equal((await store.allUsers()).filter((x) => x.id === '8901').length, 1);
});
