# Mettre Mbolo en ligne

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
| `WEB_SESSION_SECRET` | non | Signe les sessions de l'espace de modération. Tiré au hasard **au premier déploiement seulement** : le reposer à chaque fois déconnecterait la modération à chaque mise en ligne. Renseigne-le si tu veux le maîtriser, ou pour déployer plusieurs machines qui partagent les mêmes sessions |

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

Ouvre ton bot, `/start`, puis **Ouvrir Mbolo**. Crée un profil, envoie un selfie : il doit arriver dans ton groupe de modération avec les boutons **Valider** et **Refuser**.

Tant que tu n'as pas fait ce test, tu ne sais pas si l'inscription fonctionne.

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

### 1. Créer la base

```powershell
flyctl postgres create --name mbolo-db --region ams
flyctl postgres attach mbolo-db -a ton-app      # pose DATABASE_URL toute seule
```

### 2. Reprendre les données existantes

Depuis la machine, là où `DATABASE_URL` est déjà renseignée :

```powershell
flyctl ssh console -a ton-app
node scripts/import-json.js /data/db.json
```

Le script applique les migrations, puis recopie comptes, balayages, matchs, messages, blocages, signalements et rendez-vous. Il **refuse de partir si la base porte déjà des comptes** — relance avec `--force` pour compléter un import interrompu : chaque ligne est écrite sans écraser, donc une reprise ne crée pas de doublon.

Les photos et les selfies ne passent pas par la base : ce sont des fichiers de `/data/uploads`, qui restent sur le volume.

### 3. Vérifier

Redémarre, puis lis le journal :

```
Stockage : PostgreSQL, 1 migration(s) au total, 1 appliquée(s) au démarrage.
```

Garde le `db.json` de côté quelques jours avant de l'effacer.

---

## Quand quelque chose ne va pas

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| Le déploiement s'arrête sur `ADMIN_CHAT_ID absent` | Le secret n'est pas posé | Ajoute-le dans les secrets du dépôt |
| `/moderation` répond « n'est pas configuré » | `WEB_SESSION_SECRET` manque sur la machine | Pose-le (`flyctl secrets set WEB_SESSION_SECRET=...`) ou relance le déploiement, qui en tire un |
| `Groupe de modération injoignable` dans le journal | Bot absent du groupe, ou identifiant mal recopié | Rajoute le bot, refais `/id` dans le groupe |
| `Error: app not found` | Le nom d'app passé au workflow n'existe pas | Vérifie les deux champs de **Run workflow** |
| `setWebhook failed: Failed to resolve host` | Adresse publique toute neuve | Rien : le serveur réessaie tout seul pendant une dizaine de minutes |
| L'app s'ouvre mais reste sur « Chargement… » | `WEBAPP_URL` faux, ou pas d'IP publique | `flyctl ips list -a ton-app` |
| Les photos ne s'affichent pas | `DATA_DIR` relatif, ou volume non monté | `DATA_DIR` doit être absolu — `/data` chez Fly |
| Personne ne peut être vérifié | Le groupe est injoignable | Voir la ligne 2 |
| `Error: unauthorized` à l'étape « Application » | Jeton limité à l'app, qui ne peut pas créer d'app | **Normal**, le script continue |

Le journal en direct : `flyctl logs -a ton-app`. L'état des machines : `flyctl status -a ton-app`.

---

## Avant d'ouvrir à de vraies personnes

Le déploiement technique ne suffit pas. La liste complète est dans le README, section « Avant d'ouvrir à de vraies personnes ». Les trois qui ne peuvent pas attendre :

1. **Les pages publiques dans BotFather** : `/mybots` → ton bot → *Bot Settings*, renseigne `https://ton-app.fly.dev/confidentialite` et `/conditions`.
2. **Une relecture juridique** de ces deux pages, et la déclaration à l'Autorité de protection des données (loi camerounaise n° 2024/017).
3. **Quelqu'un qui regarde le groupe de modération chaque jour.** Depuis que la validation automatique n'existe plus en production, personne ne s'inscrit tant qu'un humain n'a pas tranché.
