# Odo — protocole de mesure, volet exécution

Chaque affirmation porte une marque :
**VU** = lu dans le code, avec `chemin:ligne` ; **MESURÉ** = obtenu en exécutant, avec la commande et la
sortie brute ; **SUPPOSÉ** = hypothèse, avec le test qui la trancherait.
Aucune note n'est donnée ici : ce fichier ne contient que des faits reproductibles.

---

## 0. Conditions de reproduction

Dépôt : `/home/user/Mbolo-miniapp`, non modifié (aucune écriture hors de `audit/`).
Node : `v22.22.2` (MESURÉ, `node -e "console.log(process.version)"`).
Playwright : module `/opt/node22/lib/node_modules/playwright`, navigateur
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
Fenêtre de test : 360 x 740 px (gabarit d'un Android d'entrée de gamme), sauf mention contraire.

Trois serveurs lancés pour cet audit, chacun avec son propre répertoire de données, jamais celui du dépôt :

```bash
# A — configuration identique à celle des fichiers livrés (AUTO_APPROVE=true)
DATA_DIR=<scratch>/audit2/data1 PORT=3471 ALLOW_DEV_AUTH=true SEED_DEMO=true \
  AUTO_APPROVE=true BOT_TOKEN= NODE_ENV=development node server/index.js

# B — modération réelle demandée, mais bot non configuré
DATA_DIR=<scratch>/audit2/data2 PORT=3472 ALLOW_DEV_AUTH=true SEED_DEMO=false \
  AUTO_APPROVE=false BOT_TOKEN= ADMIN_CHAT_ID= NODE_ENV=development node server/index.js

# C — production, authentification de développement coupée
DATA_DIR=<scratch>/audit2/data3 PORT=3473 ALLOW_DEV_AUTH=false SEED_DEMO=true \
  AUTO_APPROVE=true BOT_TOKEN= NODE_ENV=production node server/index.js
```

`<scratch>` = `/tmp/claude-0/-home-user-Mbolo-miniapp/81b2a726-c99e-574e-a222-a813bb7fdf3a/scratchpad`.
Les scripts de mesure sont dans `<scratch>/audit2/` : `corpus.mjs`, `debit.mjs`, `debit-msg.mjs`,
`cascade.mjs`, `coupure.mjs`, `verif.mjs`, `sans-telegram.mjs`, `contraste2.mjs`, `data-cout.mjs`, `rendu.mjs`.

Limite générale de cet environnement : `telegram.org` et `fonts.googleapis.com` ne répondent pas
(coupure du réseau sortant, `ERR_CONNECTION_RESET` après 12,5 s). C'est une condition de laboratoire,
mais elle reproduit exactement le cas visé par le produit : un réseau où telegram.org ne répond pas.
Tout ce qui touche à l'envoi réel de messages Telegram n'a donc pas pu être exécuté : ces points sont
marqués SUPPOSÉ, avec le test qui les trancherait.

---

## 1. Effet de la configuration livrée — le point central

### 1.1 Ce que valent AUTO_APPROVE et SEED_DEMO dans les trois configurations du dépôt

VU, `fly.toml:15-16` :
```toml
  # Tests uniquement : profils de démonstration et selfies validés sans modération
  SEED_DEMO = "true"
  AUTO_APPROVE = "true"
```
VU, `render.yaml:16-20` : `SEED_DEMO` = `"true"`, `AUTO_APPROVE` = `"true"`.
VU, `.env.example:21` et `.env.example:24` : `AUTO_APPROVE=true`, `SEED_DEMO=true`.

VU, `server/config.js:27-29` :
```js
  autoApprove: bool(process.env.AUTO_APPROVE, false),
  seedDemo: bool(process.env.SEED_DEMO, false),
  allowDevAuth: bool(process.env.ALLOW_DEV_AUTH, false) && process.env.NODE_ENV !== 'production',
```
Seul `allowDevAuth` est neutralisé en production. `autoApprove` et `seedDemo` ne le sont pas.

MESURÉ — résolution de la configuration avec l'environnement exact de chaque fichier livré
(`env -i` pour partir d'un environnement vide) :

```
=== environnement EXACT de fly.toml ===
{ "autoApprove": true, "seedDemo": true, "allowDevAuth": false, "useWebhook": true,
  "webAppUrl": "https://mbolo.fly.dev", "botToken": "(vide)", "adminChatId": "(vide)",
  "adminKey": "(vide)", "matchPolicy": "romance_opposite" }

=== environnement EXACT de render.yaml ===
{ "autoApprove": true, "seedDemo": true, "allowDevAuth": false, "useWebhook": true,
  "webAppUrl": "https://mbolo.onrender.com", "adminChatId": "(vide)", "adminKey": "genere" }

=== .env.example tel quel ===
{ "autoApprove": true, "seedDemo": true, "allowDevAuth": false, "useWebhook": false,
  "webAppUrl": "https://ton-adresse-publique.example", "adminChatId": "(vide)",
  "adminKey": "change-moi", "port": 3000 }
```

Les trois configurations livrées donnent **AUTO_APPROVE = true et SEED_DEMO = true en production**.
Aucune ne définit `ADMIN_CHAT_ID` (VU : absent de `fly.toml`, absent de `render.yaml`, vide dans
`.env.example:13`).

VU, `README.md:261` : la procédure de déploiement Render écrite dans le README demande explicitement
de poser `SEED_DEMO=true`, `AUTO_APPROVE=true`. VU, `README.md:267` et `README.md:343` : deux lignes
plus loin, le même README dit de les passer à `false` avant d'ouvrir à de vraies personnes. Entre l'app
déployée et une population non vérifiée, il n'y a donc qu'une case à cocher manuelle, sans contrôle
au démarrage, sans avertissement dans les journaux, sans blocage.

### 1.2 Ce que cela fait à la promesse de vérification

VU, `server/routes.js:123-138` : `POST /api/me/verification` enregistre l'image, met le compte en
`pending`, essaie de l'envoyer en modération, puis :
```js
  if (config.autoApprove) {
    setTimeout(() => decideVerification(u.id, true), 3000);
  }
```
La validation automatique est déclenchée **quel que soit le résultat de l'envoi en modération**
(la variable `sent` n'est pas testée sur cette branche).

VU, `server/bot.js:47-50` : `sendSelfieToModeration` sort immédiatement si `config.adminChatId` est vide.
VU, `server/bot.js:120` : la décision de modération est refusée si la discussion n'est pas
`config.adminChatId` ; avec `adminChatId` vide, `String(ctx.chat?.id) !== ''` est toujours vrai, donc
aucun clic ne serait accepté même si un modérateur voyait le message.

MESURÉ — `node <scratch>/audit2/verif.mjs`, image factice de 73 octets (un en-tête JPEG, aucun visage,
aucun geste) :

```
## AUTO_APPROVE=true (valeur des trois configurations livrées) (port 3471)
   geste demandé : « Touche ton oreille gauche »
   taille du « selfie » envoyé : 73 octets (image factice, aucun visage)
   réponse immédiate : {"verification":"pending"}
   t+ 1 s : verification=pending  badge public verified=false
   t+ 3 s : verification=pending  badge public verified=false
   t+ 5 s : verification=approved  badge public verified=true
   → accès à /discover : OUVERT, 10 profils

## AUTO_APPROVE=false, BOT_TOKEN et ADMIN_CHAT_ID vides (port 3472)
   t+20 s : verification=pending  badge public verified=false
   → accès à /discover après 20 s : {"code":"NOT_VERIFIED","message":"Vérifie ton profil pour accéder à cette fonction."}
```
Journal du serveur B :
```
Selfie de 7002 en attente : configure BOT_TOKEN et ADMIN_CHAT_ID pour le recevoir en modération.
```

**Conclusion (MESURÉ) : dans l'état livré, le badge « vérifié » ne prouve rien.** N'importe quelle image
de 73 octets obtient le badge en 3 secondes, sans qu'aucun humain ne l'ait vue. Le geste aléatoire est
tiré (`server/routes.js:118`), affiché à l'utilisateur, et jamais contrôlé.

C'est la promesse n°1 du produit, celle qui justifie le selfie, le stockage temporaire d'une image du
visage, et le discours de sécurité tenu dans l'app. Elle est désactivée par défaut dans les trois
fichiers de déploiement du dépôt.

Conséquence supplémentaire (VU, `server/seed.js:19-31` appelé depuis `server/index.js:64`) :
`SEED_DEMO=true` crée en production six profils fictifs déjà `verification: 'approved'`, qui « likent »
en retour (VU, `server/routes.js:304`) et répondent aux messages (VU, `server/routes.js:384-394`).

La mention existe, mais elle disparaît en route. MESURÉ, écran Découvrir, compte Serge (homme,
« relation sérieuse », Yaoundé) :
```
carte Découvrir : "C | Vérifié | T'a liké | démo | En ligne cette semaine | Carine | 24 | Bastos,
Yaoundé | Relation sérieuse | ... | CONFIANCE | 3/3 | Selfie vérifié | Un garant | Membre depuis 3 mois"
écran Messages : "ONT AIMÉ TON PROFIL | C | Carine | Tes matchs apparaîtront ici ..."  (aucune mention)
```
VU, `public/app.js:222` : la pastille « démo » n'est posée que par `profileCard`, donc sur la carte de
découverte et l'écran d'une personne. VU, `public/app.js:700-710` (liste Messages) et
`public/app.js:1011-1022` (en-tête de discussion) : ni la liste des discussions, ni le bandeau de
conversation, ni la bande « ont aimé ton profil » ne reprennent l'information. **Une fois la discussion
ouverte, plus rien ne distingue un profil fictif d'une vraie personne.**

Pire, MESURÉ sur la même carte : la jauge affiche **« CONFIANCE 3/3 · Selfie vérifié · Un garant ·
Membre depuis 3 mois »** pour un profil créé à la seconde du démarrage du serveur. VU,
`server/seed.js:6` : `trust: { selfie: true, guarantor: true, seniority: true }` est écrit en dur, et
VU `server/routes.js:46`, `publicProfile` reprend `p.trust` tel quel sans jamais le recalculer. Les
trois signaux de confiance affichés à côté d'un profil de démonstration sont donc inventés.

### 1.3 Ce qui aggrave le tableau

VU, `fly.toml:22-24` : `auto_stop_machines = "stop"`, `min_machines_running = 0`. VU,
`server/routes.js:133` : la validation automatique est un `setTimeout` en mémoire. SUPPOSÉ : si la
machine s'arrête entre l'envoi du selfie et la fin des 3 secondes, le compte reste `pending` sans
reprise possible. Test qui trancherait : déployer sur Fly, envoyer un selfie, forcer l'arrêt de la
machine dans la seconde (`fly machine stop`), rouvrir l'app et lire `verification`.

Observation d'exploitation, hors périmètre du code : un `BOT_TOKEN` réel de 46 caractères est présent
dans l'environnement du shell de cette session (MESURÉ, `[ -n "$BOT_TOKEN" ]` → oui, longueur 46).
Il n'est ni dans le dépôt (MESURÉ, `git ls-files | grep -c "^\.env$"` → `0`) ni dans un fichier `.env`
(MESURÉ, `[ -f .env ]` → non), et `.env` est bien ignoré (MESURÉ, `git check-ignore -v .env` →
`.gitignore:2:.env`). La valeur n'est pas reproduite ici.

---

## 2. Le plafond de modération

### 2.1 Ce qu'un modérateur voit et fait

VU, `server/bot.js:47-57` — un selfie arrive dans la discussion `ADMIN_CHAT_ID` sous la forme d'une
photo, avec cette légende et deux boutons :
```js
  const keyboard = new InlineKeyboard().text('Valider', `approve:${userId}`).text('Refuser', `reject:${userId}`);
  caption: `Vérification de ${user.profile?.name || user.firstName}, ${user.profile?.age || '?'} ans\n` +
           `Geste demandé : ${user.pendingGesture || 'deux doigts levés'}\nID : ${userId}`,
```
VU, `server/bot.js:61-71` — une photo de profil arrive de la même façon, boutons
`photo:approve:<id>:<n>` / `photo:reject:<id>:<n>`.

**Gestes par selfie** (MESURÉ par lecture du parcours, pas par chronométrage sur téléphone) :
- minimum absolu : **1 geste**, le clic sur Valider ou Refuser, si le message est déjà à l'écran ;
- parcours réaliste : ouvrir Telegram, ouvrir le groupe, faire défiler jusqu'au message non traité,
  toucher la photo pour l'agrandir, revenir, cliquer sur la décision → **4 à 5 gestes**.

**Gestes par photo de profil** : même structure, 1 geste au minimum, 4 à 5 en pratique.
VU, `server/routes.js:157` : trois emplacements de photo par personne. Une inscription complète avec
trois photos représente donc **4 décisions**, soit 4 gestes au minimum et une vingtaine en pratique.

### 2.2 Ce qu'il ne voit pas

Tout ceci est VU (absence dans `server/bot.js`, aucune autre interface de modération dans le dépôt) :
- **Aucune file.** Le « tableau de bord » est une conversation Telegram linéaire. Rien ne distingue un
  élément traité d'un élément en attente, sinon la légende déjà modifiée.
- **Rien sur le profil.** La légende ne contient ni la ville, ni la réponse à la question, ni le nombre
  de tentatives précédentes de cette personne, ni l'existence d'un signalement la visant.
- **Aucune attribution.** Deux modérateurs peuvent cliquer sur le même message. VU, `server/bot.js:119-125` :
  aucune vérification de l'état courant avant d'appliquer la décision. Un clic sur « Refuser » après un
  clic sur « Valider » réapplique l'écriture et **envoie une seconde notification contradictoire** à la
  personne (VU, `server/bot.js:88-96`).
- **Les signalements ne sont pas actionnables.** VU, `server/routes.js:447` : un signalement part par
  `notifyAdmin(...)`, VU `server/bot.js:42-45` : un simple `sendMessage`, sans clavier. Dans le groupe,
  le modérateur lit « Signalement : X (ID …), motif « … » » et **ne dispose d'aucun bouton** : pas de
  bannissement, pas de consultation du profil, pas de lien vers la discussion signalée. Il n'existe
  aucune route de bannissement dans `server/routes.js`.
- **Aucune mesure du délai.** Rien n'enregistre l'heure d'envoi en modération ni l'heure de décision.

SUPPOSÉ : `editMessageCaption` appelé sans `reply_markup` (VU, `server/bot.js:123` et `server/bot.js:131`)
retire le clavier, ce qui empêcherait un second clic. Test qui trancherait : envoyer une photo avec
clavier dans un groupe de test, cliquer, puis regarder si les boutons disparaissent.

### 2.3 La nuit

VU : aucun planning, aucune relance, aucune escalade, aucun horaire dans le code. La file est l'ordre
d'arrivée dans un groupe Telegram ; hors présence humaine, rien ne se passe.

Pendant ce temps, côté utilisateur (VU, `public/app.js:574`) :
> « En général quelques minutes. Le bot t'écrit dans Telegram dès que c'est fait : tu peux fermer l'app. »

MESURÉ (serveur B, section 1.2) : toutes les routes utiles répondent
`403 {"code":"NOT_VERIFIED"}` pendant l'attente. VU, `public/app.js:583` : l'écran d'attente
réinterroge `/api/me` toutes les 5 secondes.
MESURÉ : `GET /api/me` pèse 985 octets de corps, 1 487 octets en comptant les en-têtes des deux sens
(`curl -w "%{size_request} %{size_header} %{size_download}"`). Une personne qui laisse l'écran
d'attente ouvert consomme donc **720 requêtes par heure, soit environ 1,0 Mo par heure**, pour
n'apprendre rien.

### 2.4 Débit maximal d'inscriptions absorbable — chiffrage

Hypothèses, toutes explicites :
- **H1** : un modérateur met 15 s par élément (lire la légende, agrandir la photo, comparer au geste,
  décider). Non mesuré : aucun modérateur n'a été chronométré.
- **H2** : un modérateur est disponible 8 heures par jour, sans interruption.
- **H3** : une inscription médiane produit 2 éléments à modérer (1 selfie + 1 photo de profil).
- **H4** : le nombre d'inscriptions est réparti uniformément sur les heures de présence.

Sous H1 à H4 : 240 éléments par heure et par personne, soit **1 920 éléments par jour**, soit
**960 inscriptions par jour** pour un modérateur à plein temps. Le temps humain n'est donc pas la
contrainte à l'échelle d'une bêta fermée.

Les vraies contraintes mesurées sont ailleurs :

1. **La latence, pas le volume.** Sous H2, un selfie envoyé à 23 h attend jusqu'à 10 heures. L'app,
   elle, promet « quelques minutes » (VU, `public/app.js:574`). Aucun code ne mesure cet écart.
2. **Le débit d'envoi vers le groupe.** SUPPOSÉ : l'API Telegram limite les envois vers un même groupe
   à une vingtaine de messages par minute. Avec jusqu'à 4 messages par inscription, cela plafonnerait
   à environ 5 inscriptions par minute, indépendamment du nombre de modérateurs. Repère documentaire,
   **non vérifié ici** (aucun envoi Telegram possible dans cet environnement). Test qui trancherait :
   avec un bot et un groupe réels, poster 60 selfies en une minute et compter les erreurs 429.
3. **L'absence de plafond côté serveur** (MESURÉ, section 4) : un seul compte envoie 30 selfies en
   28 ms, soit 30 messages dans le groupe de modération. C'est le plafond réel : un seul compte
   malveillant rend la file illisible avant qu'un modérateur ait touché son téléphone.

---

## 3. Anti-arnaque : corpus de 50 messages

### 3.1 Méthode

Script : `<scratch>/audit2/corpus.mjs`, qui importe `server/antiscam.js` sans le modifier.
Commande : `node <scratch>/audit2/corpus.mjs 0` (0 = message envoyé au tout début d'une discussion,
`unlockAfter = 10`, la valeur de `server/config.js:35`).

Corpus : 50 messages, **25 légitimes et 25 arnaques**, en français courant du Cameroun (fr),
camfranglais (cf) et pidgin (pi). Les arnaques reprennent les formulations classiques de la région :
demande momo, dépannage, urgence médicale familiale, colis bloqué à la douane, faux investissement,
poussée vers WhatsApp.

Convention : `attendu = bloqué` pour une arnaque ou une poussée hors plateforme ; `attendu = passe`
pour un message qu'une vraie personne peut légitimement envoyer.

### 3.2 Résultat brut

```
Légitimes: 25 | Arnaques: 25
Faux positifs: 4/25 = 16 %
Faux négatifs: 10/25 = 40 %
Exactitude globale: 36/50 = 72 %
```

Les mêmes 50 messages, après le déblocage des contacts (`node corpus.mjs 10`) :
```
Faux positifs: 4/25 = 16 %
Faux négatifs: 16/25 = 64 %
Exactitude globale: 30/50 = 60 %
```
VU, `server/antiscam.js:48` : les règles CONTACT ne s'appliquent qu'avant le dixième message. Après,
six arnaques de plus passent (numéro, lien, WhatsApp, snap, @pseudo, wa.me). Le blocage des contacts
n'est donc pas une protection contre l'arnaque, seulement un délai de 10 messages.

### 3.3 Les quatre messages légitimes bloqués à tort, avec la règle qui les bloque

| Message | Règle de `server/antiscam.js` | Message d'erreur reçu |
|---|---|---|
| « Je prends le taxi jusqu'à Mvog-Mbi, ça me coûte 300 F » | `:28` `/\d+ ?(f\|fcfa\|francs\|cfa\|euros?\|€\|\$)\b/` | « Les demandes et offres d'argent sont bloquées sur Odo. » |
| « J'ai plus de crédit sur ma ligne, je t'écris depuis le wifi du campus » | `:21` `/\bcredit\b/` | idem |
| « Les frais de scolarité sont chers cette année, je gère comme je peux » | `:23` `/\bfrais\b/` | idem |
| « Mon oncle m'a dépanné avec sa voiture pour le déménagement » | `:26` `/\bdepann/` | idem |

Trois de ces quatre règles frappent un vocabulaire quotidien : au Cameroun, **dire le prix d'un taxi,
parler du crédit de communication, parler des frais de scolarité et remercier quelqu'un qui vous a
dépanné sont des banalités**. Le message d'erreur (VU, `server/antiscam.js:46`) ne nomme jamais le mot
qui a déclenché le blocage : la personne ne sait pas quoi corriger, et VU, `public/app.js:1072`,
l'interface ajoute seulement « Reformule sans montant ni moyen de paiement. »

Le même filtre s'applique au profil (VU, `server/routes.js:99`, appelé avec `unlockAfter = 1`).
MESURÉ :
```
ACCEPTE | Carine Bastos Le ndolé de ma tante Français, ewondo
REFUSE  | Ornella Ngoa-Ekellé Je paie mes frais de scolarité en vendant du beignet Français
REFUSE  | Blaise Mvog-Ada Un bon plat coûte 500 F au quartier Français, bassa
ACCEPTE | Tom Essos Je suis fan des Lions Français, pidgin
ACCEPTE | Prisca Melen Je travaille chez Orange Cameroun Français, anglais
```
Deux profils sincères sur cinq sont refusés à l'inscription avec le message
« Ton profil ne doit contenir ni numéro, ni lien, ni pseudo, ni demande d'argent. » (VU,
`server/routes.js:99`), qui ne correspond à aucune des deux phrases écrites.

### 3.4 Les dix arnaques qui passent (avant le dixième message)

Aucune ne déclenche la moindre règle (colonne « règles touchées » vide dans la sortie brute) :

| Message | Registre | Pourquoi il passe |
|---|---|---|
| « J'ai un souci de santé, aide-moi avec quelque chose stp » | fr | aucun mot d'argent |
| « envoie juste 10k et je t'explique le plan » | cf | `:20` attend `envoie moi/mw/me` ; `:28` attend une devise, pas `10k` |
| « Achete moi une carte de recharge, je te revaudrai ça » | fr | « recharge » absent des listes |
| « il faut 50 mille pour finaliser le dossier » | fr | « mille » écrit en lettres |
| « Mon compte est bloqué, envoie le code que je viens de recevoir » | fr | `:27` exige `code secret` ou `code pin` |
| « Je suis militaire en mission, j'ai besoin d'aide pour un colis » | fr | aucun mot d'argent |
| « J'ai un plan business, mets juste 20000 et tu récupères le double » | cf | montant sans devise |
| « Je t'envoie un colis de l'étranger, paie juste la douane » | fr | « paie », « douane » absents |
| « C'est ma tante qui est malade à l'hôpital, elle a besoin de médicaments » | fr | aucun mot d'argent |
| « Small small helep me, even 2000 na ok » | pi | pidgin non couvert, montant sans devise |

Trois constats MESURÉS :
- **les montants en lettres ou en argot passent** (`10k`, `50 mille`, `20000`) alors que `300 F` bloque
  une phrase anodine : le filtre est réglé exactement à l'envers de l'usage réel ;
- **le pidgin et le camfranglais ne sont pas couverts** : 2 des 3 arnaques en pidgin/camfranglais du
  corpus passent ;
- **le registre affectif** (santé, famille, colis, urgence), qui est le cœur de l'arnaque sentimentale,
  n'est couvert par aucune règle.

Reproduction : `node <scratch>/audit2/corpus.mjs 0` puis `node <scratch>/audit2/corpus.mjs 10`.
La sortie ligne à ligne donne, pour chaque message, le verdict, le registre, la catégorie de blocage et
les règles touchées.

---

## 4. Débit maximal par compte

Script : `<scratch>/audit2/debit.mjs` et `<scratch>/audit2/debit-msg.mjs`, serveur A (port 3471),
un seul compte, requêtes lancées en parallèle avec `Promise.all`.

```
# vérification du compte de test : approved
# profils compatibles visibles : 32
LIKES : 32 requêtes en parallèle en 44 ms → 20 acceptés, 12 refusés
  codes de refus : DAILY_LIMIT 429
LIKES après quota : 10 requêtes en 10 ms → 429 DAILY_LIMIT
SIGNALEMENTS : 50 requêtes sur la MÊME cible en 65 ms → 200 ok
VERIFICATION : 30 envois de selfie en 28 ms → 200 pending
GESTES : 30 demandes de geste en 19 ms → 200 | gestes distincts : 4
PHOTOS : 30 envois (3 emplacements) en 24 ms → 200 ok
PROFIL : 30 réécritures en 19 ms → 200
COMPTES : 50 identités créées en 26 ms → 200
```
```
# match créé : 163d0249d3faf78d
MESSAGES : 40 envois en parallèle en 39 ms → 200 ok soit 1026 msg/s
MESSAGES : 300 envois en 225 ms → 200 soit 1333 msg/s
```

| Action | Plafond mesuré | Ce qui le produit |
|---|---|---|
| Messages | **aucun** — 1 333 msg/s tenus sur 300 envois | VU : `server/routes.js:369-396`, aucun compteur |
| Likes | **20 par jour**, mais atteignables en 44 ms | VU : `server/routes.js:295`, quota journalier, pas un débit |
| Signalements | **aucun** — 50 signalements de la même personne en 65 ms | VU : `server/routes.js:441-448`, aucun compteur, aucun dédoublonnage |
| Selfies de vérification | **aucun** — 30 en 28 ms | VU : `server/routes.js:123-138` |
| Demandes de geste | **aucun** — 30 en 19 ms, seulement 4 gestes possibles | VU : `server/routes.js:116-121`, `GESTURES` à `server/routes.js:17` |
| Photos | **aucun** — 30 envois sur 3 emplacements en 24 ms | VU : `server/routes.js:170-176` |
| Réécriture du profil | **aucun** — 30 en 19 ms | VU : `server/routes.js:87-114` |
| Création de comptes | **aucun** — 50 identités en 26 ms | mode développement uniquement ; en production, limité par Telegram |

Trois conséquences MESURÉES, au-delà du simple « pas de limitation » :

1. **Le quota de likes n'est pas un anti-spam.** 20 likes en 44 ms sont acceptés. VU,
   `server/routes.js:311` : chaque like non réciproque déclenche une notification vers la cible,
   limitée à une par jour et par personne (clé `likes`). Le quota de 20 protège donc le destinataire,
   pas le serveur.
2. **Les signalements sont une arme.** 50 signalements de la même personne passent. VU,
   `server/routes.js:446` : chaque signalement bloque aussi la cible, et VU `server/routes.js:447`,
   envoie une ligne dans le groupe de modération. Un compte peut donc noyer la modération
   et, avec autant de comptes, faire disparaître n'importe qui de la découverte d'autres personnes
   (VU, `server/routes.js:237`, `!store.isBlocked(...)` retire la personne des paquets).
3. **Les 4 gestes sont tirés au sort sans mémoire.** VU, `server/routes.js:118` :
   `GESTURES[Math.floor(Math.random() * 4)]`. Trente demandes de geste en 19 ms, sans limite :
   qui veut un geste précis le redemande jusqu'à l'obtenir. Un selfie préparé à l'avance suffit alors,
   même avec une modération humaine active.

---

## 5. Le parcours sans Telegram, et sans WEBAPP_URL

### 5.1 Une personne qui n'a pas Telegram

MESURÉ, serveur C (production, `ALLOW_DEV_AUTH=false`), navigateur 360 x 740 :
```
## Navigateur ordinaire, SDK telegram.org injoignable
   temps jusqu'au premier message lisible : 109 ms
   texte affiché : "Ouvre Odo depuis Telegram

Ouvre Odo depuis Telegram.

Cherche le bot Odo dans Telegram, envoie /start, puis appuie sur « Ouvrir Odo »."
   barre de boutons visible : false
```
MESURÉ, ce qu'un visiteur anonyme peut atteindre :
```
/                    200 1906 o  text/html
/confidentialite     200 1906 o  text/html
/conditions          200 1906 o  text/html
/health              200 11 o    application/json
/api/plans           401 64 o    application/json
/qr/palmier.png      404 0 o
```

Constats :
- **Le parcours s'arrête là.** VU, `public/app.js:1274-1283` : l'échec de `GET /api/me` (ligne 1274) mène à un écran
  sans aucune action. Aucun lien `t.me`, aucun nom de bot cliquable, aucun lien de téléchargement de
  Telegram. VU, `server/routes.js:77` : le nom du bot n'est renvoyé que par `/api/me`, qui vient
  justement de répondre 401. L'app connaît le renseignement dont la personne a besoin et ne peut pas
  le lui donner.
- Le texte est écrit deux fois de suite, sous deux formes presque identiques (le titre, puis le message
  d'erreur du serveur) : VU, `public/app.js:1280-1281`.
- **`/confidentialite` et `/conditions` renvoient l'application elle-même**, pas une page. VU,
  `server/index.js:56` : `app.get('*', renderIndex)`. La personne non connectée y voit donc le même
  écran « Ouvre Odo depuis Telegram ». La tâche P0-8 du CLAUDE.md n'est pas faite, et l'effet visible
  est pire qu'un 404 : le lien semble exister.
- **Aucune version web n'existe.** MESURÉ : `grep -rn "plans|payments|web/auth|entitlement|origin" server/`
  ne renvoie rien ; `ls public/*.webmanifest public/manifest* public/sw.js` ne renvoie rien.
  Rien de la section 10 du CLAUDE.md n'est commencé : pas de manifeste PWA, pas de service worker,
  pas de session web, pas de `session.origin`.

### 5.2 Une installation où WEBAPP_URL est absent

VU, `server/config.js:24` : `webAppUrl` retombe sur `RENDER_EXTERNAL_URL`, puis sur
`https://<FLY_APP_NAME>.fly.dev`. Sur Render et sur Fly, il est donc déduit (MESURÉ, section 1.1).
Il reste vide sur **tout autre hébergeur**, y compris le `Dockerfile` du dépôt, qui ne définit ni l'un
ni l'autre (VU, `Dockerfile:19-22`).

MESURÉ, avec `WEBAPP_URL` absent :
```
appUrl() = "/"
appUrl({screen:'chat',match:'abc'}) = "/?screen=chat&match=abc"
```
et au démarrage du serveur :
```
WEBAPP_URL absent : les boutons du bot ne pourront pas ouvrir la mini app.
```

Ce que cela produit, VU :
- `server/bot.js:27` : `reply_markup = button && config.webAppUrl ? ... : undefined`. **Toutes les
  notifications partent sans bouton** : match, message reçu, « tu as plu à quelqu'un », rendez-vous
  proposé, arrivée confirmée, vérification acceptée ou refusée. La personne lit « Nouveau match :
  Carine et toi, vous vous plaisez. » et n'a aucun moyen d'ouvrir l'app depuis là.
- `server/bot.js:108` : la réponse à `/start` part elle aussi sans bouton « Ouvrir Odo ».
- `server/bot.js:167-170` : le bouton de menu permanent n'est pas posé.
- `server/bot.js:182` : en mode webhook, `poseWebhook('' + '/telegram/...')` est appelé avec une adresse
  relative. VU, `server/bot.js:142` : six tentatives, espacées de 5 s à 300 s, soit **8 minutes et
  20 secondes** avant l'abandon, puis « Il sera reposé au prochain démarrage ». SUPPOSÉ : Telegram
  refuse une adresse non absolue, donc le bot reste muet jusqu'au redémarrage suivant. Test qui
  trancherait : lancer le serveur avec un `BOT_TOKEN` valide, `USE_WEBHOOK=true` et sans `WEBAPP_URL`,
  et lire les six lignes « Webhook refusé (…) » dans le journal.

Une installation Docker ordinaire produit donc un bot qui écrit sans jamais pouvoir ramener personne
dans l'app, et le seul signal est un avertissement dans les journaux du serveur.

---

## 6. Réseau coupé, puis retour du réseau, en pleine discussion

Script : `<scratch>/audit2/coupure.mjs`. Discussion réelle de 340 messages, coupure par
`context.setOffline(true)`.

```
# écran ouvert : chat
# bulles affichées au départ : 340
# réseau coupé
# notice affichée : "Pas de connexion. Vérifie ton réseau et réessaie."
# champ de saisie conservé : "Message pendant la coupure"
# focus sur le champ : message
# écran encore la discussion : true
# après 10 s hors ligne, notice : "Pas de connexion. Vérifie ton réseau et réessaie."
# appels API en échec pendant la coupure : 3
# réseau rétabli
# notice après retour (sans action) : "Pas de connexion. Vérifie ton réseau et réessaie."
# le message tapé est-il parti tout seul ? false
# champ toujours rempli : "Message pendant la coupure"
# après clic manuel, message présent : true
# notice finale : "(vide)"
# écran Découvrir hors ligne : "Pas de connexion\n\nVérifie ton réseau et réessaie."
# rechargement hors ligne : échec de navigation : net::ERR_INTERNET_DISCONNECTED
```

Ce qui marche (MESURÉ) :
- le texte tapé n'est pas perdu, le curseur reste dans le champ, le clavier ne se ferme pas
  (VU, `public/app.js:1035-1041` : `updateChat` ne touche que `#messages` et `#chat-notice`, jamais le
  formulaire construit en `public/app.js:1025-1028` — la règle 16 du CLAUDE.md est respectée) ;
- l'écran de discussion reste affiché, l'historique reste lisible ;
- l'interrogation périodique échoue en silence sans casser l'écran (VU, `public/app.js:1056` : `} catch { /* réseau instable : prochain essai dans 4 secondes */ }`) ;
- un écran d'erreur réseau propre existe pour les autres écrans (VU, `public/app.js:136-144`).

Ce qui ne marche pas (MESURÉ) :
- **Rien ne repart tout seul au retour du réseau.** Cinq secondes après le rétablissement, le message
  est toujours dans le champ et l'avertissement rouge est toujours affiché. Il faut cliquer à nouveau
  sur Envoyer. VU : aucun écouteur `online`/`offline` dans `public/app.js`
  (`grep -n "addEventListener('online" public/app.js` ne renvoie rien).
- **L'avertissement ment après coup.** « Pas de connexion » reste affiché alors que la connexion est
  revenue : VU, `public/app.js:1067`, la notice n'est effacée (`S.chat.notice = null`) qu'au prochain envoi réussi ;
  elle est posée en `public/app.js:1072`.
- **Aucun état « en cours d'envoi » ni file d'attente.** Le message n'existe nulle part tant qu'il n'est
  pas accepté par le serveur ; fermer l'app le perd.
- **Aucun écran hors ligne au rechargement.** Recharger la page sans réseau donne la page d'erreur du
  navigateur : VU, absence de service worker et de manifeste dans `public/`.
- **Aucun signal permanent d'état réseau.** Le seul indice est l'avertissement sous la discussion.

Charge annexe MESURÉE, même écran : la discussion affiche ses 341 bulles d'un coup, sans pagination
(VU, `public/app.js:985-999`), et `updateChat` réécrit tout le bloc à chaque nouveauté
(VU, `public/app.js:1039` : `box.innerHTML = chatBody(S.chat)`) :
```
CPU /1 : ouverture 201 ms | 341 bulles | réécriture de #messages : 7 ms en moyenne
CPU /4 : ouverture 1552 ms | 341 bulles | réécriture de #messages : 127 ms en moyenne, 145 ms au pire
CPU /6 : ouverture 1574 ms | 341 bulles | réécriture de #messages : 63 ms en moyenne, 66 ms au pire
```
(`Emulation.setCPUThrottlingRate` ; l'inversion entre /4 et /6 est du bruit de mesure, la valeur à
retenir est l'ordre de grandeur : de 60 à 145 ms de fil principal bloqué à chaque message reçu sur un
appareil ralenti, contre 7 ms sans ralentissement.)

---

## 7. Vérification des treize mesures de départ

J'ai repris dix des treize mesures. Verdict et écarts :

| # | Mesure de départ | Verdict | Ce que j'obtiens |
|---|---|---|---|
| 1 | Le SDK Telegram bloque le premier rendu | **reproduit** | `first-paint` à 12 580 ms, échec du SDK à 12 565 ms. Voir 7.1 |
| 2 | Aucune compression HTTP | **reproduit à l'octet près** | Voir 7.2 |
| 3 | Coût de l'interrogation périodique | **reproduit en nature, chiffres plus élevés** | Voir 7.3 |
| 4 | Cibles tactiles sous la norme | **reproduit** | 9 cibles sur 12 sous 44 x 44, 0 sous 24 x 24. Voir 7.4 |
| 5 | Liens profonds partiels | **fait exact, conclusion à corriger** | Voir 7.5 |
| 6 | Aucun écran hors ligne | **reproduit** | Section 6 |
| 7 | Découverte non filtrée par genre | **reproduit** | Voir 7.6 |
| 8 | Deux erreurs de console au chargement | **reproduit** | `telegram.org` et `fonts.googleapis.com`, `ERR_CONNECTION_RESET` |
| 9 | Anti-arnaque : faux positifs et négatifs | **reproduit en nature, taux différents** | Corpus plus large, section 3 |
| 10 | Aucune limitation de débit | **reproduit, débit bien plus élevé** | 1 333 msg/s contre 135 annoncés |
| 11 | Attente de modération | **reproduit** | Section 2.3 |
| 12 | Poids d'une discussion complète | **non reproduit tel quel** | Voir 7.7 |
| 13 | Contrastes du thème clair | **reproduit, un écart de plus trouvé** | Voir 7.8 |

### 7.1 Mesure 1 — cascade du premier chargement

`node <scratch>/audit2/cascade.mjs` :
```
     7 ms | départ   | http://127.0.0.1:3471/?dev_user=8801
    10 ms | reçu     | http://127.0.0.1:3471/ 200
    31 ms | départ   | https://telegram.org/js/telegram-web-app.js
    31 ms | départ   | /styles.css?v=e13f0d21cd
    31 ms | départ   | /app.js?v=e13f0d21cd
    33 ms | reçu     | /styles.css 200
    53 ms | reçu     | /app.js 200
 12565 ms | ÉCHEC    | https://telegram.org/js/telegram-web-app.js net::ERR_CONNECTION_RESET
 12570 ms | départ   | /tg.js, /ui.js
 12585 ms | départ   | /api/me
 12613 ms | PEINTURE | first-paint
 12950 ms | ÉCRAN    | premier contenu dans #app
# paint entries: [["first-paint",12580],["first-contentful-paint",12616]]
```
VU, `public/index.html:10` : le SDK est chargé en script classique dans `<head>`, sans `defer` ni
`async`. Rien n'est peint tant que cette requête n'a pas abouti ou échoué, **y compris le
`<div class="boot">Chargement…</div>` de `public/index.html:24`**.

Précision utile, MESURÉ : quand la même requête échoue **tout de suite** au lieu de traîner
(`route.abort()`), le premier message lisible arrive en **109 ms** (section 5.1). Le coût n'est donc pas
« 12 secondes » en soi : c'est exactement le temps que met telegram.org à répondre ou à échouer. Sur un
réseau lent ou un portail captif, ce délai est indéterminé, et l'écran reste blanc pendant tout ce temps.

### 7.2 Mesure 2 — compression

```
=== sans Accept-Encoding ===
/app.js        servi=65057 o
/styles.css    servi=39651 o
/tg.js         servi= 8897 o
/ui.js         servi= 9866 o
/              servi= 1906 o
=== avec Accept-Encoding: gzip, deflate, br ===
/app.js        Content-Length: 65057     (aucun en-tête Content-Encoding)
/styles.css    Content-Length: 39651
/tg.js         Content-Length:  8897
/ui.js         Content-Length:  9866
/              Content-Length:  1906
=== taille gzippée théorique ===
app.js       brut=65031 o  gzip=19129 o
styles.css   brut=39651 o  gzip= 8881 o
tg.js        brut= 8897 o  gzip= 3234 o
ui.js        brut= 9866 o  gzip= 3668 o
```
Chiffres identiques à la mesure de départ. VU : `grep -rn "compression|gzip|brotli" server/ package.json`
ne renvoie rien. **125 377 octets servis au lieu d'environ 35 700 : facteur 3,5**, payé en data à chaque
premier chargement et à chaque changement de version.

### 7.3 Mesure 3 — coût de l'interrogation périodique

Mesuré cette fois avec un vrai navigateur (`request.sizes()`, en-têtes des deux sens comptés),
identité Android, `node <scratch>/audit2/data-cout.mjs` :
```
# premier chargement (page + code + première API) : 7 requêtes, 163 152 octets
# 60 s dans la discussion, sans rien faire : 15 requêtes, 16 905 octets
  → extrapolation 1 h de discussion ouverte : 991 Ko, dont 279 Ko de requêtes
# 60 s sur l'onglet Profil (résumé toutes les 20 s) : 3 requêtes, 2 130 octets
  → extrapolation 1 h app ouverte hors discussion : 125 Ko
```
Détail par route sur la session complète :
```
    1 appels    65769 o  /app.js
   16 appels    49261 o  /api/matches/:id
    1 appels    40389 o  /styles.css
    1 appels    10628 o  /ui.js
    1 appels     9659 o  /tg.js
    4 appels     2840 o  /api/summary
    1 appels     2701 o  /
    1 appels     1650 o  /api/me
```
Écart avec la mesure de départ : **991 Ko/h contre 702 Ko/h** en discussion, **125 Ko/h contre 68 Ko/h**
au repos. L'écart vient des en-têtes : `curl` envoie 138 octets de requête, un navigateur Android en
envoie plus du double. La mesure de départ sous-estime ; la nature du problème est la même.
Charge utile d'une interrogation à vide : **435 octets** (MESURÉ) contre 449 annoncés — même ordre, la
différence vient de la longueur des prénoms.
VU, `server/routes.js:358-367` : chaque interrogation renvoie le profil public complet de l'autre
personne et la liste des rendez-vous ; seuls les messages sont incrémentaux.

### 7.4 Mesure 4 — cibles tactiles

Écran Découvrir, 360 x 740, thème clair (MESURÉ) :
```
--- cibles tactiles visibles : 12 ---
  sous 24x24 (seuil WCAG 2.2 AA 2.5.8) : 0
  sous 44x44 (recommandation mobile)   : 9
     80 x  36 « Découvrir »      80 x  36 « Messages »
     80 x  36 « Profil »         80 x  36 « Sécurité »
    118 x  32 « Yaoundé »        83 x  26 « Cartes »
     83 x  26 « Liste »         139 x  32 « BUTTON »
    148 x  34 « Signaler ce profil »
```
Identique à la mesure de départ, à la largeur des onglets près (80 px ici à 360 px de large, 90 px à
400 px : ils s'adaptent). Le seuil normatif de WCAG 2.2 AA (24 x 24) est respecté partout ; c'est la
recommandation mobile de 44 x 44 qui ne l'est pas, sur 9 cibles.

### 7.5 Mesure 5 — liens profonds : le fait est exact, la conclusion ne l'est pas

MESURÉ : `/?dev_user=…&screen=safety` ouvre bien l'écran Découvrir.
VU, `public/app.js:1289-1297` : seuls `verify`, `chat`, `matches` et `me` sont traités ; tout le reste
tombe sur `go('discover')`.
Mais VU, `grep -n "screen: '" server/*.js` : les notifications du bot n'utilisent que
`me`, `discover`, `verify` et `chat` — quatre écrans qui **aboutissent tous au bon endroit**
(`discover` par la valeur par défaut). Aucune notification n'utilise `safety`.
Donc : **aucun lien de notification ne casse aujourd'hui**. Le défaut est latent, pas actif. La phrase
« alors que les notifications du bot l'utilisent » de la mesure de départ n'est pas soutenue par le code.

### 7.6 Mesure 7 — découverte et genre

MESURÉ : Estelle, femme, intention « amitié », Yaoundé → **35 profils proposés**, dont 3 hommes
(répartition réelle en base : `{"amitie/femme":33, "amitie/homme":3, "serieux/homme":2, ...}`).
Serge, homme, intention « relation sérieuse », Yaoundé → **1 profil, Carine**, une femme.
VU, `server/routes.js:221-227` : la règle `romance_opposite` ne s'applique qu'à `intent === 'serieux'`.
Pour « amitié » et « sortie en duo », le genre n'entre pas dans la sélection.
MESURÉ : le champ `gender` n'est jamais renvoyé par l'API (clés d'un profil public :
`id, name, age, intent, intentLabel, city, area, promptQ, promptA, languages, photos, hasPhoto,
verified, trust, demo, activity, isNew, likedYou, status, matchId`). C'est cohérent avec la règle de
minimisation, et l'effet produit n'est expliqué nulle part dans l'interface.

### 7.7 Mesure 12 — poids d'une discussion : non reproduite telle quelle

La mesure de départ annonce 43 messages pour 4 710 octets. Je n'ai pas la même discussion.
MESURÉ sur la mienne : **340 messages → 31 554 octets** au premier chargement, soit 93 octets par
message contre 110 dans la mesure de départ — cohérent, la différence tient à la longueur des textes.
Aucune pagination : VU, `server/routes.js:364` renvoie tous les messages postérieurs à `after`, et avec
`after=0` c'est tout l'historique ; VU, `public/app.js:985-999`, le front les affiche tous.

### 7.8 Mesure 13 — contrastes

Écran Découvrir, 360 x 740, `node <scratch>/audit2/contraste2.mjs` :
```
=== thème light : 13 textes sous le seuil WCAG 2.2 AA sur 23 mesurés ===
  3.70 (seuil 4.5) 13px « 20 restants »
  1.12 (seuil 3) 150px « A »            (initiale de l'avatar)
  1.12 (seuil 3) 150px « T »
  1.91 (seuil 3) 30px « 22 »            (âge sur la carte, doré)
  2.90 (seuil 3) 24px « J'AIME »
  4.17 (seuil 4.5) 11px « MON PLAT DU DIMANCHE » « SES INFOS » « ICI POUR »
                        « QUARTIER » « PARLE » « MEMBRE » « CONFIANCE »
  1.91 (seuil 4.5) 13px « 1/3 »
=== thème dark : 1 texte sous le seuil ===
  2.78 (seuil 4.5) 11px « 0 »           (pastille de compteur, blanc sur corail)
```
Valeurs identiques à la mesure de départ (1.12, 1.91, 2.90, 3.70, 4.17, 2.78 en sombre).
Deux ajouts : les intitulés à 4.17 sont **sept**, pas cinq, et **« 1/3 » à 1.91 sur 13 px** manquait.
Le déséquilibre est confirmé : 13 écarts en clair contre 1 en sombre.

---

## 8. Ce que je n'ai pas pu mesurer

- **Tout ce qui suppose un envoi Telegram réel** : réception du selfie dans le groupe de modération,
  clic sur Valider, disparition du clavier après `editMessageCaption`, limite de messages par minute
  vers un groupe, comportement de `setWebhook` avec une adresse relative. Test qui trancherait dans
  tous les cas : un bot de test et un groupe privé, avec `ADMIN_CHAT_ID` renseigné.
- **Le temps réel d'un modérateur par selfie** : aucune personne chronométrée. Les chiffres de la
  section 2.4 reposent sur les hypothèses H1 à H4, énoncées.
- **Le comportement sur un vrai Android d'entrée de gamme** : les mesures de rendu utilisent
  `Emulation.setCPUThrottlingRate`, qui ralentit le processeur mais ne reproduit ni la mémoire, ni le
  stockage lent, ni la webview de Telegram.
- **Le coût en data sur un réseau réel** : mesuré en boucle locale, donc sans perte, sans reprise de
  connexion, sans renégociation TLS. Les chiffres de la section 7.3 sont un **plancher**.
- **La mesure 12 de départ** (43 messages, 4 710 octets) : jeu de données différent, non reproductible
  en l'état. Il faudrait le `db.json` exact utilisé alors.
