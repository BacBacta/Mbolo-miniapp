#!/usr/bin/env node
// Écrit une sauvegarde chiffrée de la base, et fait le ménage dans les anciennes.
//
//   DATABASE_URL=... BACKUP_SECRET=... node scripts/sauvegarde.js [dossier] [--garder N]
//
// Se lance depuis la machine déployée, là où DATABASE_URL est déjà renseignée et où la base est
// joignable : un PostgreSQL Fly non géré vit sur le réseau privé de l'organisation, pas sur
// l'internet public. C'est le même chemin que scripts/import-json.js.
import fs from 'node:fs';
import path from 'node:path';
import { chiffrer, lireTout, compter } from '../server/sauvegarde.js';

const args = process.argv.slice(2);
const option = (nom, defaut) => { const i = args.indexOf(nom); return i === -1 ? defaut : args[i + 1]; };
const dossier = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--garder') || process.env.BACKUP_DIR || '/data/sauvegardes';
const garder = Math.max(1, Number(option('--garder', process.env.BACKUP_KEEP || 14)));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante : il n\'y a rien à sauvegarder. Ce script ne lit que PostgreSQL ;');
  console.error('sur un stockage fichier, la sauvegarde est la copie de DATA_DIR/db.json.');
  process.exit(1);
}
if (!process.env.BACKUP_SECRET) {
  console.error('BACKUP_SECRET manquant. La sauvegarde contient tous les messages et tous les profils :');
  console.error('elle ne s\'écrit pas en clair.');
  console.error('');
  console.error('Génère un secret et pose-le chez l\'hébergeur, puis garde-le ailleurs que sur la machine :');
  console.error('  flyctl secrets set BACKUP_SECRET="$(openssl rand -hex 32)" --app <ton-app>');
  console.error('Sans ce secret, aucune sauvegarde ne se relit. Le perdre, c\'est perdre les copies.');
  process.exit(1);
}

const { pool } = await import('../server/store.pg.js');

const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
const fichier = path.join(dossier, `mbolo-${horodatage}.sauvegarde`);

try {
  fs.mkdirSync(dossier, { recursive: true });
  const contenu = await lireTout(pool);
  const octets = await chiffrer(contenu, process.env.BACKUP_SECRET);
  // Écriture atomique : une sauvegarde interrompue à mi-chemin ressemblerait à une sauvegarde.
  const provisoire = `${fichier}.partiel`;
  fs.writeFileSync(provisoire, octets, { mode: 0o600 });
  fs.renameSync(provisoire, fichier);

  const lignes = compter(contenu);
  const total = Object.values(lignes).reduce((a, b) => a + b, 0);
  console.log(`Sauvegarde écrite : ${fichier}`);
  console.log(`${total} ligne(s) — ${Object.entries(lignes).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  console.log(`${(octets.length / 1024).toFixed(1)} Ko chiffrés.`);
  if (!total) console.warn('Attention : la base est vide. Ce n\'est normal que sur une installation neuve.');

  // Rotation. On ne garde que les N plus récentes : un volume plein est une panne, et une panne de
  // volume emporte aussi la production.
  const anciennes = fs.readdirSync(dossier)
    .filter((f) => f.endsWith('.sauvegarde'))
    .sort()
    .slice(0, -garder);
  for (const f of anciennes) fs.unlinkSync(path.join(dossier, f));
  // Un .partiel laissé par un plantage n'est pas une sauvegarde : il ne doit pas s'accumuler.
  for (const f of fs.readdirSync(dossier)) if (f.endsWith('.partiel') && f !== path.basename(provisoire)) fs.unlinkSync(path.join(dossier, f));
  if (anciennes.length) console.log(`${anciennes.length} sauvegarde(s) plus ancienne(s) supprimée(s), ${garder} gardée(s).`);
} finally {
  await pool.end();
}
