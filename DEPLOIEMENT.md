# Mettre Odo en ligne

Guide pas à pas, du compte vide à l'application que des gens utilisent. Compte une heure la première fois.

Les commandes sont données pour **PowerShell** (Windows). Sur macOS ou Linux, remplace `$env:X = "y"` par `export X=y`.

---

## Avant de commencer

Il te faut trois choses, dans cet ordre. Aucune n'est facultative.

| Quoi | Où | Pourquoi |
|---|---|---|
| Un **bot Telegram** | [@BotFather](https://t.me/BotFather) → `/newbot` | C'est par lui que les gens ouvrent l'app et reçoivent les notifications |
| Un **groupe de modération** | Telegram → nouveau groupe → ajoute ton bot → envoie `/id` dedans | Sans lui, **le serveur refuse de démarrer** : personne ne pourrait être vérifié |
| Un **hébergeur** | Fly.io, Render, ou n'importe quel serveur Docker | L'app doit répondre en HTTPS pour que Telegram l'accepte |

Note l'identifiant que `/id` renvoie dans le groupe : il ressemble à `-1001234567890`, avec le tiret. C'est ton `ADMIN_CHAT_ID`.

> **Pourquoi le serveur refuse de démarrer sans lui.** L'app promet que tous les profils sont vérifiés par un humain. Sans groupe, les selfies ne partent nulle part et tout le monde reste en attente pour toujours. Démarrer quand même reviendrait à mentir en silence.

---

## Le plus simple : Fly, depuis un navigateur

Aucune ligne de commande, donc faisable depuis un téléphone.

### 1. Les secrets

Sur GitHub : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

| Secret | Obligatoire | Valeur |
|---|---|---|
| `FLY_API_TOKEN` | oui | [fly.io](https://fly.io) → Account → Tokens. Prends un **jeton de déploiement limité à l'app** plutôt qu'un jeton de compte : en cas de fuite, il ne donne accès qu'à elle |
| `BOT_TOKEN` | oui | Donné par BotFather |
| `ADMIN_CHAT_ID` | oui | L'identifiant de ton groupe de modération |
| `ADMIN_KEY` | non | Protège les QR codes des lieux. Généré au hasard si absent |
| `WEBHOOK_SECRET` | non | Ce que Telegram renvoie dans l'en-tête de chaque appel du webhook ; le serveur refuse tout appel qui ne le porte pas. Généré au hasard si absent, et le webhook est reposé avec à chaque démarrage |
| `WEB_SESSION_SECRET` | non | Signe les sessions de l'espace de modération. Tiré au hasard **au premier déploiement seulement** : le reposer à chaque fois déconnecterait la modération à chaque mise en ligne. Renseigne-le si tu veux le maîtriser, ou pour déployer plusieurs machines qui partagent les mêmes sessions. **S'il porte la même valeur qu'`ADMIN_KEY` ou `BOT_TOKEN`, le déploiement n'en pose pas une copie** : il en tire un au hasard, le dit, et le refera à chaque déploiement tant que le secret du dépôt n'aura pas sa propre valeur |

**Chaque secret doit avoir sa propre valeur.** Le serveur refuse de démarrer en production si deux d'entre eux portent la même chaîne, et dit lesquels. La raison : `ADMIN_KEY` voyage dans des URL — celles des QR des lieux, et jusqu'au 14 septembre 2026 le chemin du webhook Telegram, donc les journaux de requêtes — alors que `BACKUP_SECRET` ouvre les sauvegardes, c'est-à-dire tous les profils et tous les messages. Partagée, une adresse aperçue dans un journal suffirait à tout déchiffrer. **Et `BACKUP_SECRET` ne se remplace jamais sans avoir gardé l'ancien ailleurs** : les copies déjà écrites ne s'ouvrent qu'avec lui.

Le partage ne se voit pas depuis le code : il a fallu lire la liste des secrets chez l'hébergeur, où trois lignes affichaient la même empreinte. **Le déploiement la lit donc pour toi**, juste avant de remplacer la machine, et s'arrête sur `Deux secrets portent la même valeur` en nommant lesquels. C'est le même constat que celui du démarrage, une étape plus tôt : sur la machine, le serveur ne sait refuser qu'en tombant — le 14 septembre 2026, ça a coûté dix redémarrages et une production éteinte.

```powershell
# Voir les empreintes : deux lignes identiques dans la colonne DIGEST, c'est le même secret
flyctl secrets list -a "ton-app"

# En reposer un au hasard (jamais BACKUP_SECRET sans avoir gardé l'ancien ailleurs)
flyctl secrets set ADMIN_KEY="$(-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }))" -a "ton-app"
```

### 2. Le déploiement

Onglet **Actions** → **Déployer sur Fly** → **Run workflow** → bouton vert.

Les deux champs sont déjà remplis avec l'app réelle. **Pour une mise à jour, n'y touche pas.** Pour une première installation, mets un nom libre (ils sont uniques dans le monde entier) et une région : `ams` Amsterdam, `cdg` Paris, `jnb` Johannesburg, `mad` Madrid — puis **reporte ces deux valeurs dans les `default` du workflow** pour ne plus jamais les retaper.

Le workflow crée l'app, le volume de données et les adresses IP publiques s'ils manquent, pose les secrets, construit l'image et déploie. Trois à cinq minutes.

### 3. Vérifier que ça marche vraiment

Trois contrôles, du plus rapide au plus concluant.

```powershell
# 1. Le serveur répond
Invoke-RestMethod "https://ton-app.fly.dev/health"          # attendu : ok = True

# 2. Les pages publiques sont servies
(Invoke-WebRequest "https://ton-app.fly.dev/confidentialite").StatusCode   # attendu : 200
```

**3. Le groupe de modération est joignable.** C'est le contrôle qui compte, et il n'est visible que dans le journal de l'app :

```powershell
flyctl logs -a ton-app
```

Tu dois y lire :

```
Modération : les selfies et les photos partent vers « Nom de ton groupe ».
```

Si tu lis `Groupe de modération injoignable`, le message dit quoi corriger — en général le bot n'a pas été ajouté au groupe, ou l'identifiant a été recopié sans le tiret. **L'app démarre quand même** (une panne passagère de Telegram ne doit pas la coucher), donc `/health` ne te le dira pas : seul ce journal tranche.

### 4. Dans Telegram

Ouvre ton bot, `/start`, puis **Ouvrir Odo**. Crée un profil, envoie un selfie : il doit arriver dans ton groupe de modération avec les boutons **Valider** et **Refuser**.

Tant que tu n'as pas fait ce test, tu ne sais pas si l'inscription fonctionne.

**Après un déploiement qui touche l'interface, le bot ou la modération**, passe la liste complète :
[`CONTROLES-TELEPHONE.md`](CONTROLES-TELEPHONE.md). Elle couvre ce que les tests automatiques ne
peuvent pas voir — la WebView de Telegram, le vrai bot, les notifications, le groupe de
modération — écran par écran, en quarante minutes la première fois.

---

## En ligne de commande

Même script que le workflow — une seule logique, donc pas de dérive entre les deux chemins.

```powershell
iwr https://fly.io/install.ps1 -useb | iex          # une seule fois
$env:FLY_API_TOKEN = "..."
$env:BOT_TOKEN = "..."
$env:ADMIN_CHAT_ID = "-1001234567890"
bash ./deployer-fly.sh mon-app ams
```

Le script s'arrête avant de rien construire si un secret manque, et vérifie `/health` à la fin.

---

## Sur un autre hébergeur

L'app est une image Docker ordinaire. Il lui faut :

- **un volume persistant** monté sur `/data` — sinon la base et les photos disparaissent à chaque redéploiement ;
- **HTTPS** sur un nom stable ;
- **un contrôle de santé** sur `/health`, qui répond `{"ok":true}`.

```powershell
docker build -t mbolo .
docker run -p 8080:8080 `
  -v mbolo_data:/data `
  -e BOT_TOKEN="..." `
  -e ADMIN_CHAT_ID="-1001234567890" `
  -e WEBAPP_URL="https://ton-domaine" `
  -e USE_WEBHOOK=true `
  mbolo
```

L'image tourne sous l'utilisateur `node`, jamais root : l'entrée prépare le volume puis abandonne les droits.

`render.yaml` décrit le même service pour un déploiement Render en **Blueprint**. Attention : l'offre gratuite de Render n'a pas de disque persistant, les données de test disparaissent à chaque redéploiement.

---

## Les variables à définir

Le minimum, en production :

```
BOT_TOKEN=...              donné par BotFather
ADMIN_CHAT_ID=-100...      ton groupe de modération, sans lui rien ne démarre
WEBAPP_URL=https://...     vide chez Fly et Render : déduit automatiquement
USE_WEBHOOK=true           Telegram appelle ton serveur au lieu que le bot aille chercher
NODE_ENV=production        éteint la validation automatique et le mode développement
```

Tout le reste a une valeur par défaut sûre. La liste complète est dans `.env.example`.

**Trois réglages qui ne s'appliquent pas en production, quoi que tu écrives** : `AUTO_APPROVE` (validerait les selfies sans humain) et `ALLOW_DEV_AUTH` (permettrait d'entrer sans Telegram) sont éteints par `NODE_ENV=production`. `SEED_DEMO`, lui, reste réglable : il est à `false` dans `fly.toml` et `render.yaml`, et ne doit repasser à `true` que sur une machine de démonstration — de vraies personnes écriraient à des profils fictifs.

---

## Passer à PostgreSQL

Sans `DATABASE_URL`, les données vivent dans `/data/db.json`. C'est suffisant pour une bêta sur une seule machine, et **obligatoire à quitter avant tout paiement** ou dès qu'il y a plus d'une instance.

La bascule se fait **en deux temps**, et jamais d'un coup. `flyctl postgres attach` pose `DATABASE_URL` et redémarre l'application aussitôt : entre ce redémarrage et la fin de l'import, la production tournerait sur une base vide. Personne ne retrouverait son compte, et quelqu'un qui en recrée un pendant ce temps écrirait dans la base que l'import s'apprête à remplir — deux comptes pour une personne, et un import qui ne peut plus repartir proprement.

On attache donc la base sous un autre nom, `DATABASE_URL_FUTURE`, que le serveur ignore. On importe, on vérifie, **et on ne renomme qu'après**.

### Depuis un navigateur de téléphone

Onglet **Actions** du dépôt, travail **PostgreSQL**, bouton **Run workflow**. Deux lancements :

1. **`preparer`** — coche « Créer la base » au premier passage, et choisis le moteur : `mpg` (gérée par Fly, sauvegardes comprises) ou `brut` (moins chère, sauvegardes et reprise à ta charge). Crée la base, l'attache sous `DATABASE_URL_FUTURE`, reprend `/data/db.json` et vérifie que rien ne manque. **La production ne bouge pas.**
2. **`basculer`** — refait le contrôle, puis échange les noms. C'est le seul moment où la production change de stockage, et il dure un redémarrage.

**`verifier`** se lance quand tu veux : il ne fait que lire, et dit sur quoi tourne la production.

`FLY_API_TOKEN` doit être un **jeton d'organisation** (fly.io, Account puis Tokens) : un jeton de déploiement limité à une seule app ne peut pas créer de base.

L'étape `preparer` le vérifie **avant de rien créer** : un jeton qui ne voit aucune organisation s'arrête là, avec la marche à suivre. Sans ce contrôle, Fly répond « Organization not found » — qu'on lit comme un nom d'organisation mal orthographié, et qu'on cherche longtemps.

**Le secret `FLY_API_TOKEN` du dépôt ne convient pas forcément** : celui qui suffit à déployer est souvent un jeton limité à une seule app. Plutôt que de l'élargir — il sert à chaque mise en ligne —, ajoute un second secret **`FLY_ORG_TOKEN`** avec le jeton d'organisation : le travail PostgreSQL le prend en priorité, le déploiement garde le sien, et tu peux supprimer `FLY_ORG_TOKEN` une fois la bascule faite.

### En ligne de commande

```powershell
$env:FLY_API_TOKEN = "..."
./basculer-postgres.sh preparer mbolo-miniapp mbolo-db
./basculer-postgres.sh basculer mbolo-miniapp mbolo-db
./basculer-postgres.sh verifier mbolo-miniapp mbolo-db
```

Pour créer la base au passage : `$env:CREER_LA_BASE = "true"` et `$env:MOTEUR = "mpg"`. Le script a besoin de `flyctl` et de `jq` (ce dernier sert à retrouver une base gérée par son nom, les commandes `mpg` prenant un identifiant). Les deux sont déjà là sur le runner GitHub.

`FLY_ORG` change d'organisation si tu n'utilises pas la personnelle.

**La machine de l'app est réveillée d'abord.** `fly.toml` l'éteint quand personne ne s'en sert, et `flyctl ssh console` ne sait pas entrer dans une machine arrêtée. Le script la réveille par une requête sur `/health` avant chaque commande à distance.

**Relancer une étape ne coûte rien.** Si l'import est coupé en route, relance `preparer` : la base déjà attachée est reconnue à son secret, et l'import reprend sans rien écraser — jamais une seconde base facturée à côté de la bonne.

### Ce que l'import emporte

Comptes, balayages, matchs, messages, blocages, signalements, rendez-vous **et les événements de mesure**. Ces derniers comptent : un compte se réinscrit, un message se réécrit, mais un entonnoir d'inscription de la semaine dernière, non.

Le script **refuse de partir si la base porte déjà des comptes** — relance avec `--force` pour compléter un import interrompu : chaque ligne est écrite sans écraser, donc une reprise ne crée pas de doublon.

Les photos et les selfies ne passent pas par la base : ce sont des fichiers de `/data/uploads`, qui restent sur le volume.

### Le contrôle qui arrête tout

Entre l'import et l'échange, `scripts/etat-stockage.js` compare les deux stockages table par table :

```
table       fichier     base
users             7        7
events           41       41
```

Il **sort en erreur** dès qu'une table porte moins que le fichier, et la bascule s'arrête là. C'est le seul garde-fou contre un import qui a écrit « 0 importé(s) sur 41 » au milieu d'une page de texte — ce qui ne se remarquerait qu'une fois le fichier effacé.

Il compte ce que chaque table sait distinguer, pas les lignes du fichier : deux balayages de la même paire n'écrivent qu'une ligne, et il ne faut pas y voir une perte.

### Vérifier soi-même

Après la bascule, le journal doit porter :

```
Stockage : PostgreSQL, 2 migration(s) au total, 2 appliquée(s) au démarrage.
```

Garde le `db.json` de côté quelques jours avant de l'effacer. Pour revenir en arrière tant qu'il est là : `flyctl secrets unset -a mbolo-miniapp DATABASE_URL`.

Tant que la bascule n'est pas faite, chaque démarrage en production l'écrit dans le journal :

```
Attention : en production sur un fichier JSON.
```

---


## Sauvegarder, et savoir restaurer

Le PostgreSQL de la production est **non géré** : personne ne sauvegarde à ta place. Les instantanés
de volume de Fly protègent d'un disque qui lâche — pas d'une table effacée, pas d'une migration
ratée, pas d'un `delete` sans `where`. Et ce que la base porte ne se reconstitue pas : des comptes,
des discussions, et des événements de mesure qui ne disent rien rétroactivement.

### Ce qu'il faut poser une fois

```powershell
flyctl secrets set BACKUP_SECRET="$(openssl rand -hex 32)" --app mbolo-miniapp
```

**Garde ce secret ailleurs que sur la machine** — un gestionnaire de mots de passe, un papier dans
un tiroir. Il ouvre les sauvegardes, et lui seul : le perdre, c'est perdre toutes les copies d'un
coup. Le poser au même endroit que la base, c'est le perdre en même temps qu'elle.

### Ce qui tourne tout seul

Le travail **Sauvegarde** (onglet Actions) part chaque nuit à 02 h 30 UTC, et se lance aussi à la
main. Il écrit sur le volume, garde les quatorze dernières, et **ramène la plus récente** dans les
artefacts GitHub pour quatre-vingt-dix jours.

GitHub ne voit que le fichier chiffré : le secret n'y est pas. Une copie qui ne quitte pas la
machine disparaîtrait avec le volume qui porte aussi la base — c'est pour ça qu'elle en sort.

### À la main, depuis la machine

```powershell
flyctl ssh console -a mbolo-miniapp -C "node scripts/sauvegarde.js /data/sauvegardes"
```

Tu dois lire `Sauvegarde écrite` suivi du compte de lignes, table par table. Si la commande annonce
que la base est vide alors qu'elle ne l'est pas, arrête-toi : ne laisse pas la rotation effacer une
bonne copie pour en garder quatorze mauvaises.

### Vérifier qu'une sauvegarde s'ouvre

Écrire n'est pas sauvegarder. Tant que personne n'a rouvert un fichier avec le secret réellement
posé sur la machine, « on a des sauvegardes » reste une hypothèse — et le jour où on la vérifie
pour de bon est le pire jour possible pour la démentir.

Le travail nocturne le fait maintenant tout seul, sur la copie qu'il vient d'écrire. Pour le lancer
à la main, sur la machine ou sur un fichier ramené chez toi :

```powershell
# Sur la machine : le secret y est déjà
flyctl ssh console -a mbolo-miniapp -C "node scripts/verifier-sauvegarde.js /data/sauvegardes/<fichier>"

# Ou chez toi, sur l'artefact GitHub téléchargé
$env:BACKUP_SECRET="<ton secret>"
node "scripts\verifier-sauvegarde.js" "sauvegarde.bin"
```

Tu dois lire `lisible`, suivi de la date et du compte par table. **Ce contrôle ne touche à aucune
base** : il déchiffre en mémoire, compte, et s'arrête là. On peut donc le lancer sur la production
sans rien risquer.

S'il répond que la sauvegarde ne s'ouvre pas, il n'y a que deux causes : le secret posé n'est pas
celui qui a chiffré ce fichier, ou le fichier est abîmé. Le chiffrement est authentifié, donc il
refuse plutôt que de rendre des octets faux. **Ne remplace pas un secret qui « ne marche pas » sans
avoir retrouvé l'ancien** : toutes les copies chiffrées avec lui deviendraient illisibles.

### Restaurer

**Ne restaure jamais par-dessus une base vivante sans l'avoir décidé.** Le script refuse tout seul
si la base porte déjà des lignes, et te dit combien : c'est le chiffre que tu t'apprêtes à écraser.

```powershell
# 1. Récupère une sauvegarde : l'artefact GitHub, ou depuis le volume
flyctl ssh sftp get /data/sauvegardes/mbolo-2026-09-13T02-30-00-000Z.sauvegarde -a mbolo-miniapp

# 2. Arrête l'app : restaurer pendant qu'elle écrit fausserait la copie, et le script refuse
#    tant qu'une de ses connexions est ouverte
flyctl scale count 0 -a mbolo-miniapp

# 3. Remets-la, depuis une machine éphémère
flyctl machine run . -a mbolo-miniapp --rm -C "node scripts/restaurer.js /data/sauvegardes/<fichier>"

# 4. Relance l'app
flyctl scale count 1 -a mbolo-miniapp
```

Si tu dois vraiment restaurer app allumée, `--meme-si-lapp-tourne` passe outre le refus — en sachant
qu'une ligne écrite pendant la restauration peut tout faire revenir en arrière.

Tu dois lire `Restauré et vérifié` suivi du total : le script recompte **depuis la base** après
avoir écrit, et refuse cette phrase si un seul compte ne correspond pas. Il écrit tout dans une transaction : ou tout revient, ou rien ne bouge.

### Ce que la sauvegarde ne contient pas

**Les photos et les selfies.** Ce sont des fichiers de `/data/uploads`, qui ne traversent jamais la
base. Restaurer rend les comptes, les discussions et les rendez-vous ; les images, il faut copier le
volume pour les avoir :

```powershell
flyctl ssh sftp get /data/uploads -a mbolo-miniapp
```

### Éprouve-la avant d'en avoir besoin

Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde. `test/sauvegarde.test.js` fait
l'aller-retour complet à chaque `npm run test:pg` — copie, effacement, remise, comparaison ligne à
ligne. Refais-le une fois à la main sur une base d'essai avant d'ouvrir à de vraies personnes : le
jour où tu en auras besoin, tu ne voudras pas découvrir la procédure.

## Quand quelque chose ne va pas

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| Le déploiement s'arrête sur `ADMIN_CHAT_ID absent` | Le secret n'est pas posé | Ajoute-le dans les secrets du dépôt |
| Le déploiement s'arrête sur `Deux secrets portent la même valeur` | Deux secrets ont la même chaîne chez l'hébergeur | Repose-en un au hasard (`flyctl secrets list` montre les empreintes), puis relance. **Jamais `BACKUP_SECRET`** sans avoir gardé l'ancien ailleurs |
| Le déploiement s'arrête sur `Je n'ai pas su lire la liste des secrets` | `flyctl secrets list --json` a changé de forme | Le contrôle refuse plutôt que d'approuver à l'aveugle, et décrit ce qu'il a reçu (empreintes masquées). Compare les empreintes toi-même, puis corrige `scripts/verifier-secrets.js` |
| `/moderation` répond « n'est pas configuré » | `WEB_SESSION_SECRET` manque sur la machine | Pose-le (`flyctl secrets set WEB_SESSION_SECRET=...`) ou relance le déploiement, qui en tire un |
| `Groupe de modération injoignable` dans le journal | Bot absent du groupe, ou identifiant mal recopié | Rajoute le bot, refais `/id` dans le groupe |
| `Error: app not found` | Le nom d'app passé au workflow n'existe pas | Vérifie les deux champs de **Run workflow** |
| `setWebhook failed: Failed to resolve host` | Adresse publique toute neuve | Rien : le serveur réessaie tout seul pendant une dizaine de minutes |
| L'app s'ouvre mais reste sur « Chargement… » | `WEBAPP_URL` faux, ou pas d'IP publique | `flyctl ips list -a ton-app` |
| Les photos ne s'affichent pas | `DATA_DIR` relatif, ou volume non monté | `DATA_DIR` doit être absolu — `/data` chez Fly |
| Personne ne peut être vérifié | Le groupe est injoignable | Voir la ligne 2 |
| **Le bot ne répond à rien**, et `getWebhookInfo` semble parfait | Le domaine de la mini app n'est pas déclaré dans BotFather : Telegram refuse les boutons `web_app`. Le journal dit `BUTTON_TYPE_INVALID` | BotFather, `/mybots`, ton bot, **Bot Settings, Configure Mini App**, avec ton `WEBAPP_URL`. Depuis le 16 septembre 2026 le message part quand même **sans son bouton**, et le groupe de modération reçoit l'alerte — mais le bouton ne revient qu'une fois la case cochée |
| `Error: unauthorized` à l'étape « Application » | Jeton limité à l'app, qui ne peut pas créer d'app | **Normal**, le script continue |

Le journal en direct : `flyctl logs -a ton-app`. L'état des machines : `flyctl status -a ton-app`.

---

## Avant d'ouvrir à de vraies personnes

Le déploiement technique ne suffit pas. La liste complète est dans le README, section « Avant d'ouvrir à de vraies personnes ». Les trois qui ne peuvent pas attendre :

1. **Les pages publiques dans BotFather** : `/mybots` → ton bot → *Bot Settings*, renseigne `https://ton-app.fly.dev/confidentialite` et `/conditions`.
2. **Une relecture juridique** de ces deux pages, et la déclaration à l'Autorité de protection des données (loi camerounaise n° 2024/017).
3. **Quelqu'un qui regarde le groupe de modération chaque jour.** Depuis que la validation automatique n'existe plus en production, personne ne s'inscrit tant qu'un humain n'a pas tranché.
