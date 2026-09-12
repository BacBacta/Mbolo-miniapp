// Lance la même suite de tests contre PostgreSQL au lieu du fichier JSON.
//
// Chaque fichier de test attend une base à lui : en mode JSON il reçoit son propre DATA_DIR, ici
// il reçoit son propre schéma, recréé vide avant de commencer. Sans cela, les comptes d'un fichier
// se retrouveraient dans les listes d'un autre et les tests se gêneraient.
//
//   $env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/mbolo"; node scripts/test-pg.js
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant. Ce script teste le stockage PostgreSQL ; sans base, lance « npm test ».');
  process.exit(2);
}

const fichiers = fs.readdirSync('test').filter((f) => f.endsWith('.test.js')).sort();
const schemaDe = (f) => `t_${path.basename(f, '.test.js').replace(/[^a-z0-9]/gi, '_')}`;

const pool = new pg.Pool({ connectionString: url, max: 1 });
for (const f of fichiers) await pool.query(`drop schema if exists ${schemaDe(f)} cascade`);
await pool.end();

let echecs = 0;
for (const f of fichiers) {
  const r = spawnSync(process.execPath, ['--test', path.join('test', f)], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_SCHEMA: schemaDe(f) },
  });
  if (r.status !== 0) {
    echecs += 1;
    console.error(`Échec : ${f}`);
  }
}

console.log(echecs ? `\n${echecs} fichier(s) en échec sur ${fichiers.length}.` : `\nLes ${fichiers.length} fichiers passent sur PostgreSQL.`);
process.exit(echecs ? 1 : 0);
