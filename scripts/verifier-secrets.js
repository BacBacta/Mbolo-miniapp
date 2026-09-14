#!/usr/bin/env node
// Refuse un déploiement dont deux secrets porteraient la même valeur — avant qu'il ne commence.
//
// Le serveur fait déjà ce contrôle au démarrage (server/config.js, secretsPartages). Mais au
// démarrage, la décision arrive trop tard : la machine neuve a déjà remplacé l'ancienne, et le
// seul refus qu'elle sache exprimer est de tomber. Le 14 septembre 2026, ça s'est traduit par
// dix redémarrages et une production éteinte le temps de reposer deux secrets.
//
// Ici, on lit la même chose une étape plus tôt, dans la liste de l'hébergeur : deux valeurs
// identiques y donnent deux empreintes identiques. Le refus ne coûte alors qu'un travail arrêté.
//
// Usage :  flyctl secrets list -a <app> | node scripts/verifier-secrets.js
//
// Il ne touche à rien : il lit du texte sur son entrée et sort en erreur, ou pas.
import { secretsPartagesFly, SECRETS_DISTINCTS } from '../server/secrets.js';

const lire = () => new Promise((resolve) => {
  let t = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { t += c; });
  process.stdin.on('end', () => resolve(t));
});

const sortie = await lire();
const { connus, partages } = secretsPartagesFly(sortie);

// Un garde-fou qui ne comprend plus ce qu'il lit ne prévient de rien : il approuve. Si la liste
// change de forme un jour, ce message dira lequel des deux s'est passé, au lieu de laisser croire
// que tout va bien. Un déploiement en pose toujours au moins deux (BOT_TOKEN et ADMIN_KEY).
if (connus.length < 2) {
  console.error("Je n'ai pas su lire la liste des secrets : aucune empreinte reconnue.");
  console.error(`Attendu des lignes « NOM  empreinte », pour ${SECRETS_DISTINCTS.join(', ')}.`);
  console.error('Vérifie la sortie de : flyctl secrets list -a <app>');
  process.exit(1);
}

if (partages.length) {
  console.error('Deux secrets portent la même valeur chez l\'hébergeur. Déploiement arrêté.');
  for (const noms of partages) console.error(`  ${noms.join(', ')}`);
  console.error('');
  console.error('La sécurité du plus sensible tombe à celle du plus exposé : ADMIN_KEY voyage');
  console.error('dans le chemin du webhook Telegram, donc dans les journaux de requêtes, tandis');
  console.error('que BACKUP_SECRET déchiffre tous les profils et tous les messages.');
  console.error('');
  console.error('Pose une valeur différente pour chacun, par exemple :');
  console.error('  flyctl secrets set NOM="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d \' \\n\')" -a <app>');
  console.error('');
  console.error('Sauf BACKUP_SECRET : le changer rend illisible toute sauvegarde déjà écrite.');
  console.error('Garde l\'ancienne valeur quelque part avant d\'y toucher.');
  process.exit(1);
}

console.log(`Secrets distincts (${connus.length} reconnus sur ${SECRETS_DISTINCTS.length}).`);
