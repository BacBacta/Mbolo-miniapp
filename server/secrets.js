// Des secrets qui ne doivent jamais partager une valeur.
//
// Ce fichier n'importe rien, et c'est voulu : `scripts/verifier-secrets.js` tourne sur le runner
// de déploiement, avant `npm ci`, là où aucune dépendance n'est installée. Faire passer la liste
// par `config.js` (qui charge dotenv) le ferait échouer sur un module manquant — c'est-à-dire
// exactement quand on a besoin de lui.

// Poser la même chaîne dans deux variables est indolore à l'écriture, et grave à l'usage : la
// sécurité du plus sensible tombe à celle du plus exposé.
//
// C'est arrivé ici. ADMIN_KEY, WEB_SESSION_SECRET et BACKUP_SECRET portaient la même valeur.
// Or ADMIN_KEY voyage dans des URL — le chemin du webhook Telegram en contient une copie, donc
// chaque message reçu la promène dans les journaux de requêtes — tandis que BACKUP_SECRET
// déchiffre les sauvegardes, c'est-à-dire tous les profils et tous les messages. Une adresse
// aperçue dans un journal ouvrait la totalité des copies.
//
// Second effet, plus sournois : ces clés n'ont pas la même durée de vie. WEB_SESSION_SECRET
// devrait se changer souvent, ça ne coûte qu'une reconnexion. BACKUP_SECRET ne se change jamais
// à la légère : chaque copie déjà écrite devient illisible. Soudées, on ne peut plus toucher à
// l'une sans condamner l'autre.
//
// Fonction pure, pour qu'un test puisse lui présenter n'importe quel jeu de variables.
export const SECRETS_DISTINCTS = ['BOT_TOKEN', 'ADMIN_KEY', 'WEB_SESSION_SECRET', 'VENUE_SECRET', 'BACKUP_SECRET'];

// Rend les groupes de noms qui partagent une valeur. Les variables vides sont ignorées : ne rien
// poser est un choix légitime (le serveur tire alors un secret au hasard, ou éteint la fonction),
// et trois variables absentes ne sont pas trois variables identiques.
export function secretsPartages(env = process.env) {
  const parValeur = new Map();
  for (const nom of SECRETS_DISTINCTS) {
    const v = String(env[nom] ?? '').trim();
    if (!v) continue;
    if (!parValeur.has(v)) parValeur.set(v, []);
    parValeur.get(v).push(nom);
  }
  // Jamais la valeur elle-même : ce tableau finit dans un journal.
  return [...parValeur.values()].filter((noms) => noms.length > 1);
}


// Le même contrôle, mais vu de l'extérieur : la liste des secrets telle que l'hébergeur
// l'affiche. Deux valeurs identiques y donnent deux empreintes identiques — c'est exactement
// ainsi que le partage a été découvert, en lisant trois fois la même chaîne dans la colonne
// DIGEST.
//
// Pourquoi ce second chemin alors que le serveur contrôle déjà au démarrage : parce qu'au
// démarrage, il est trop tard. `secretsPartages()` s'exécute sur la machine neuve, une fois
// l'ancienne remplacée ; il ne sait refuser qu'en tombant, et c'est ce qui est arrivé le
// 14 septembre 2026 — dix redémarrages, production éteinte. Lu avant le déploiement, le même
// fait n'arrête qu'un travail.
//
// Fonction pure : du texte entre, des noms sortent. `connus` dit combien de secrets de la liste
// ont été reconnus : zéro ne veut pas dire « tout va bien », mais « je n'ai pas su lire » — et
// un garde-fou qui ne lit plus rien laisse tout passer sans le dire. C'est à l'appelant d'en
// tirer un refus.
export function secretsPartagesFly(sortie) {
  const parEmpreinte = new Map();
  const connus = [];
  for (const ligne of String(sortie).split('\n')) {
    // Le « * » (secret posé, pas encore déployé) et le « ! » (déployé sur une partie des
    // machines) précèdent le nom dans la liste de flyctl. Les prévoir n'est pas un détail :
    // le déploiement pose les secrets juste avant de lire cette liste, donc toutes les lignes
    // qui comptent portent le marqueur. Sans lui, le contrôle ne reconnaît plus rien et refuse
    // tout déploiement en disant « je n'ai pas su lire » — y compris celui qui remet la
    // production debout.
    const m = ligne.match(/^\s*(?:[*!]\s*)?([A-Z0-9_]+)\s+([0-9a-f]{8,})\b/);
    if (!m) continue;
    const [, nom, empreinte] = m;
    if (!SECRETS_DISTINCTS.includes(nom)) continue;
    connus.push(nom);
    if (!parEmpreinte.has(empreinte)) parEmpreinte.set(empreinte, []);
    parEmpreinte.get(empreinte).push(nom);
  }
  // Les empreintes ne sortent pas d'ici : elles n'apprennent rien de plus que « ces deux-là sont
  // pareils », et ce retour finit dans un journal de travail public.
  return { connus, partages: [...parEmpreinte.values()].filter((noms) => noms.length > 1) };
}
