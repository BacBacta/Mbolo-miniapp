// Dit ce que porte PostgreSQL, et si le fichier JSON y a bien été repris en entier.
//
//   $env:DATABASE_URL="postgres://..."; node scripts/etat-stockage.js "data/db.json"
//
// Se lance trois fois pendant une bascule : après l'import pour vérifier qu'il est complet, avant
// d'échanger DATABASE_URL pour ne pas basculer sur du vide, et après pour s'assurer que la
// production lit bien la bonne base. `basculer-postgres.sh` l'appelle aux trois moments.
//
// Sort en 1 si une table porte moins de lignes que le fichier : c'est la seule sortie qui doit
// arrêter une bascule. Sans ce contrôle, un import qui écrit « 0 importé(s) sur 5 » au milieu
// d'une page de texte passe inaperçu, et ne se remarque qu'une fois le fichier effacé.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from '../server/config.js';
import { TABLES, attendu, comparer } from '../server/bascule.js';

const source = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(config.dataDir, 'db.json');

if (!config.databaseUrl) {
  console.error('DATABASE_URL manquant : il n\'y a aucune base à lire.');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: /\bsslmode=(require|prefer)\b/.test(config.databaseUrl) ? { rejectUnauthorized: false } : false,
  max: 1,
  ...(config.databaseSchema ? { options: `-c search_path=${config.databaseSchema}` } : {}),
});

const reels = {};
for (const table of TABLES) {
  // Les tables viennent de TABLES, jamais d'une saisie : rien d'extérieur n'entre dans ce texte.
  const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from ${table}`);
  reels[table] = n;
}
await pool.end();

const colonne = (v, large) => String(v).padStart(large);

// Sans fichier de départ — après la bascule, une fois le db.json archivé — il n'y a rien à
// comparer. On montre alors ce que la base porte, sans prétendre vérifier quoi que ce soit.
if (!fs.existsSync(source)) {
  console.log(`${source} est absent : voici seulement ce que porte la base.\n`);
  for (const table of TABLES) console.log(`${table.padEnd(10)} ${colonne(reels[table], 8)}`);
  process.exit(0);
}

const { lignes, manquantes } = comparer(attendu(JSON.parse(fs.readFileSync(source, 'utf8'))), reels);

console.log(`${'table'.padEnd(10)} ${'fichier'.padStart(8)} ${'base'.padStart(8)}`);
for (const l of lignes) {
  console.log(`${l.table.padEnd(10)} ${colonne(l.json, 8)} ${colonne(l.pg, 8)}${l.pg < l.json ? '   manque' : ''}`);
}

if (manquantes.length) {
  console.error(`\n${manquantes.length} table(s) incomplète(s) : ${manquantes.map((l) => `${l.table} (${l.json - l.pg} de moins)`).join(', ')}.`);
  console.error(`Relance l'import — il n'écrase rien : node scripts/import-json.js ${source} --force`);
  process.exit(1);
}

console.log(`\nLa base porte tout ce que ${source} contenait.`);
