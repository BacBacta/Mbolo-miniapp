// Sauvegarder la base, et savoir la remettre.
//
// **Ce qui manquait.** La production tourne sur un PostgreSQL non géré, choisi pour son prix.
// « Non géré » veut dire exactement ceci : personne ne sauvegarde à notre place. Les instantanés
// de volume de l'hébergeur protègent d'un disque qui lâche — pas d'une table effacée, pas d'une
// migration ratée, pas d'un `delete` sans `where`. Or ce que la base porte ne se reconstitue pas :
// des comptes, des discussions, et des événements de mesure qui ne sont pas rétroactifs.
//
// **Pourquoi pas `pg_dump`.** L'image est un `node:22-alpine` sans client PostgreSQL. L'ajouter,
// c'est alourdir l'image et coupler sa version à celle du serveur — un dump produit par un client
// plus ancien que la base est refusé au rechargement. On lit donc les tables comme n'importe quelle
// requête, avec le pilote qui est déjà là.
//
// **Ce que la sauvegarde emporte, et ce qu'elle laisse.** Les tables de `bascule.js`, et elles
// seules : c'est déjà la liste de ce qu'une reprise complète doit retrouver, et en tenir une
// seconde garantirait qu'elles divergent. Deux tables en sont exclues exprès — `rate_limits`, des
// compteurs anti-spam sans valeur historique, et `schema_migrations`, que le migrateur reconstruit.
// Un test refuse qu'une table apparaisse en base sans être rangée dans l'un ou l'autre camp :
// c'est exactement l'oubli qui avait laissé les événements de mesure hors de l'import.
//
// **Les photos et les selfies n'y sont pas.** Ce sont des fichiers de `DATA_DIR/uploads`, qui ne
// traversent jamais la base. Restaurer cette sauvegarde rend les comptes et les discussions, pas
// les images : elles vivent sur le volume, et c'est le volume qu'il faut copier pour elles.
//
// **Pourquoi c'est chiffré.** Le fichier contient tous les messages et tous les profils de
// personnes réelles. Il va se poser sur un volume, passer dans un terminal, et peut-être finir sur
// un ordinateur portable. Une sauvegarde en clair est une fuite qui attend son heure.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { TABLES } from './bascule.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Les tables volontairement absentes de la sauvegarde, avec la raison. Le test de couverture lit
// cette liste : y ajouter une table est un geste conscient, l'oublier est une erreur qui se voit.
export const HORS_SAUVEGARDE = {
  rate_limits: 'compteurs anti-spam : aucune valeur historique, ils repartent à zéro sans dommage',
  schema_migrations: 'reconstruite par le migrateur au premier démarrage',
};

export const VERSION = 1;
const ALGO = 'aes-256-gcm';

// Clé dérivée du secret par scrypt : un secret court reste un secret court, mais la dérivation
// coûte assez cher pour qu'une liste de mots de passe ne se teste pas à la chaîne.
const clef = (secret, sel) => crypto.scryptSync(String(secret), sel, 32);

// Un fichier de sauvegarde : sel, vecteur d'initialisation, étiquette d'authentification, puis le
// JSON compressé et chiffré. L'étiquette est ce qui fait échouer le déchiffrement d'un fichier
// modifié, au lieu de rendre des octets faux.
export async function chiffrer(contenu, secret) {
  if (!secret) throw new Error('BACKUP_SECRET manquant : sans lui, la sauvegarde serait en clair.');
  const sel = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const chiffreur = crypto.createCipheriv(ALGO, clef(secret, sel), iv);
  const corps = Buffer.concat([chiffreur.update(await gzip(JSON.stringify(contenu))), chiffreur.final()]);
  return Buffer.concat([Buffer.from([VERSION]), sel, iv, chiffreur.getAuthTag(), corps]);
}

export async function dechiffrer(octets, secret) {
  if (!secret) throw new Error('BACKUP_SECRET manquant : la sauvegarde ne peut pas être lue sans lui.');
  if (octets[0] !== VERSION) throw new Error(`Version de sauvegarde inconnue : ${octets[0]}.`);
  const sel = octets.subarray(1, 17);
  const iv = octets.subarray(17, 29);
  const tag = octets.subarray(29, 45);
  const dechiffreur = crypto.createDecipheriv(ALGO, clef(secret, sel), iv);
  dechiffreur.setAuthTag(tag);
  let clair;
  try {
    clair = Buffer.concat([dechiffreur.update(octets.subarray(45)), dechiffreur.final()]);
  } catch {
    // Le message compte : le premier réflexe devant un déchiffrement raté est de croire le fichier
    // perdu, alors que neuf fois sur dix c'est le secret qui n'est pas celui du jour de la copie.
    throw new Error('Déchiffrement impossible : le secret ne correspond pas, ou le fichier a été modifié.');
  }
  return JSON.parse((await gunzip(clair)).toString('utf8'));
}

// Lit chaque table dans l'ordre de `TABLES`. Le schéma ne porte aucune clé étrangère, donc
// l'ordre ne contraint pas la restauration — il est fixe pour que deux sauvegardes de la même base
// se comparent ligne à ligne, ce qui sert le jour où l'on se demande laquelle reprendre.
export async function lireTout(pool) {
  const tables = {};
  for (const table of TABLES) {
    const { rows } = await pool.query(`select * from ${nomSur(table)}`);
    tables[table] = rows;
  }
  return { version: VERSION, faiteLe: new Date().toISOString(), tables };
}

// Le nom d'une table ne vient jamais d'une entrée : il doit figurer dans la liste, sinon on
// refuse. C'est la seule protection qui tienne quand un nom entre dans une requête.
export function nomSur(table) {
  if (!TABLES.includes(table)) throw new Error(`Table inconnue de la sauvegarde : ${table}.`);
  return `"${table}"`;
}

// Compte ce que porte une sauvegarde, table par table. Sert à dire ce qu'on s'apprête à remettre
// avant de le remettre — et à vérifier après.
export const compter = (sauvegarde) => Object.fromEntries(TABLES.map((t) => [t, (sauvegarde.tables?.[t] || []).length]));
