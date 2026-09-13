#!/usr/bin/env node
// Remet une sauvegarde dans une base. C'est la moitié du travail qu'on oublie de faire, et la
// seule qui compte le jour où on en a besoin.
//
//   DATABASE_URL=... BACKUP_SECRET=... node scripts/restaurer.js <fichier> [--ecraser]
//
// Sans --ecraser, le script refuse une base qui porte déjà des lignes. Restaurer par-dessus une
// production vivante, c'est transformer une sauvegarde en second incident : on écrase ce qui a été
// écrit depuis la copie, et personne ne s'en aperçoit avant longtemps.
import fs from 'node:fs';
import { dechiffrer, compter, nomSur } from '../server/sauvegarde.js';
import { TABLES } from '../server/bascule.js';

const args = process.argv.slice(2);
const fichier = args.find((a) => !a.startsWith('--'));
const ecraser = args.includes('--ecraser');

if (!fichier) {
  console.error('Usage : node scripts/restaurer.js <fichier.sauvegarde> [--ecraser]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL manquante : aucune base où restaurer.'); process.exit(1); }
if (!process.env.BACKUP_SECRET) { console.error('BACKUP_SECRET manquant : la sauvegarde ne peut pas être lue sans lui.'); process.exit(1); }

const { pool } = await import('../server/store.pg.js');

try {
  const sauvegarde = await dechiffrer(fs.readFileSync(fichier), process.env.BACKUP_SECRET);
  const lignes = compter(sauvegarde);
  console.log(`Sauvegarde du ${sauvegarde.faiteLe} : ${Object.entries(lignes).map(([t, n]) => `${t} ${n}`).join(', ')}`);

  // Ce qu'il y a déjà en face. On le dit avant d'agir : un opérateur qui restaure est rarement
  // reposé, et le chiffre qu'il doit voir est celui qu'il s'apprête à écraser.
  const presentes = {};
  for (const table of TABLES) {
    presentes[table] = Number((await pool.query(`select count(*)::int as n from ${nomSur(table)}`)).rows[0].n);
  }
  const dejaLa = Object.values(presentes).reduce((a, b) => a + b, 0);
  if (dejaLa && !ecraser) {
    console.error(`\nLa base porte déjà ${dejaLa} ligne(s) : ${Object.entries(presentes).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ')}`);
    console.error('Restaurer par-dessus effacerait tout ce qui a été écrit depuis la sauvegarde.');
    console.error('Si c\'est bien ce que tu veux, relance avec --ecraser.');
    process.exit(1);
  }

  // Tout ou rien : une restauration à moitié faite laisse une base que personne ne sait lire.
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const table of [...TABLES].reverse()) await client.query(`delete from ${nomSur(table)}`);
    for (const table of TABLES) {
      const rows = sauvegarde.tables?.[table] || [];
      if (!rows.length) continue;
      const colonnes = Object.keys(rows[0]);
      const listeCol = colonnes.map((c) => `"${c}"`).join(', ');
      // Par paquets : une seule requête de dix mille lignes dépasse la limite de paramètres.
      for (let i = 0; i < rows.length; i += 200) {
        const lot = rows.slice(i, i + 200);
        const valeurs = [];
        const places = lot.map((r, n) => `(${colonnes.map((c, k) => {
          valeurs.push(r[c]);
          return `$${n * colonnes.length + k + 1}`;
        }).join(', ')})`);
        await client.query(`insert into ${nomSur(table)} (${listeCol}) values ${places.join(', ')}`, valeurs);
      }
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }

  // On recompte depuis la base, pas depuis le fichier : dire « restauré » sans avoir regardé est
  // exactement l'erreur qu'une sauvegarde non éprouvée fait commettre.
  let total = 0;
  for (const table of TABLES) {
    const n = Number((await pool.query(`select count(*)::int as n from ${nomSur(table)}`)).rows[0].n);
    if (n !== lignes[table]) throw new Error(`${table} : ${n} ligne(s) en base pour ${lignes[table]} dans la sauvegarde.`);
    total += n;
  }
  console.log(`Restauré et vérifié : ${total} ligne(s).`);
  console.log('Les photos et les selfies ne sont pas dans cette sauvegarde : ce sont des fichiers du volume (DATA_DIR/uploads).');
} finally {
  await pool.end();
}
