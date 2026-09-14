// Vérifie qu'une sauvegarde s'ouvre, et dit ce qu'elle contient.
//
//   BACKUP_SECRET=... node scripts/verifier-sauvegarde.js <fichier>
//
// **Ce script ne touche à aucune base.** C'est tout l'intérêt : on peut le lancer sur la machine
// de production, la nuit, juste après avoir écrit la copie, sans rien risquer.
//
// Pourquoi il existe alors que test/sauvegarde.test.js éprouve déjà l'aller-retour complet :
// ce test tourne avec un secret de test et une base de test. Il prouve que le mécanisme est
// juste, jamais que **ce fichier-là** s'ouvre avec **le secret qui est réellement posé sur la
// machine**. Or c'est précisément ce qui manque le jour où l'on restaure — et ce jour-là, il est
// trop tard pour s'apercevoir que le secret a été changé, mal recopié, ou jamais gardé.
//
// Une sauvegarde qu'on n'a pas ouverte n'est pas une sauvegarde : c'est une hypothèse.
import fs from 'node:fs';
import { dechiffrer, compter, VERSION } from '../server/sauvegarde.js';
import { TABLES } from '../server/bascule.js';

const fichier = process.argv[2];
if (!fichier) {
  console.error('Usage : BACKUP_SECRET=... node scripts/verifier-sauvegarde.js <fichier>');
  process.exit(1);
}
if (!process.env.BACKUP_SECRET) {
  console.error('BACKUP_SECRET manquant : sans lui, on ne peut pas savoir si la copie est lisible.');
  process.exit(1);
}
if (!fs.existsSync(fichier)) { console.error(`Fichier introuvable : ${fichier}`); process.exit(1); }

const octets = fs.readFileSync(fichier);
if (!octets.length) { console.error(`Fichier vide : ${fichier}`); process.exit(1); }

let sauvegarde;
try {
  sauvegarde = await dechiffrer(octets, process.env.BACKUP_SECRET);
} catch (e) {
  // Le chiffrement est authentifié (AES-256-GCM) : un mauvais secret et un fichier abîmé
  // échouent tous les deux ici, et c'est voulu — on ne lit pas « à peu près » une sauvegarde.
  console.error(`La sauvegarde ne s'ouvre pas : ${e.message}`);
  console.error('Soit le secret posé ici n\'est pas celui qui a chiffré ce fichier, soit le fichier est abîmé.');
  process.exit(1);
}

// Une version inconnue veut dire que le fichier a été écrit par un code plus récent que celui
// qui le relit. Mieux vaut s'arrêter que restaurer en interprétant de travers.
if (sauvegarde.version !== VERSION) {
  console.error(`Version ${sauvegarde.version} inattendue : ce code lit la version ${VERSION}.`);
  process.exit(1);
}

const manquantes = TABLES.filter((t) => !Array.isArray(sauvegarde.tables?.[t]));
if (manquantes.length) {
  console.error(`Table(s) absente(s) de la sauvegarde : ${manquantes.join(', ')}.`);
  console.error('Une restauration en laisserait une vide sans le dire.');
  process.exit(1);
}

const lignes = compter(sauvegarde);
const total = Object.values(lignes).reduce((a, b) => a + b, 0);
console.log(`Sauvegarde du ${sauvegarde.faiteLe}, lisible.`);
console.log(`${total} ligne(s) — ${Object.entries(lignes).map(([t, n]) => `${t} ${n}`).join(', ')}`);
// Zéro partout n'est pas une erreur — une base neuve donne ça — mais c'est le genre de chiffre
// qu'on préfère voir écrit que découvrir.
if (!total) console.log('Attention : la sauvegarde ne contient aucune ligne.');
