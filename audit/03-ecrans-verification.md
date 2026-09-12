# Lot « vérification et modération » — diagnostic par écran et par risque

Phase 3 de l'audit. Maillons 6 à 8 : `verification/start`, capture et envoi du selfie, écran d'attente,
décision de modération vue des deux côtés. Écrans notés : **verify**, **pending**. Acteur noté à part :
**le modérateur**.

Grille de référence : `/home/user/Mbolo-miniapp/audit/00-benchmark.md`, non modifiée.
Marques : **VU** (`chemin:ligne`), **MESURÉ** (commande et sortie), **SUPPOSÉ** (avec le test qui trancherait),
**SOURCE** (repère externe, avec sa fiabilité et sa limite de comparabilité).
Aucune note 0-3 ne repose sur un SUPPOSÉ.

## Conditions de reproduction de mes mesures

Dépôt non modifié : je n'ai écrit que sous `audit/`. Trois harnais, tous dans
`<scratch>/audit3/` (`<scratch>` = `/tmp/claude-0/-home-user-Mbolo-miniapp/81b2a726-c99e-574e-a222-a813bb7fdf3a/scratchpad`) :

```bash
# A — configuration des fichiers livrés
DATA_DIR=<scratch>/audit3/dataA PORT=3481 ALLOW_DEV_AUTH=true SEED_DEMO=false \
  AUTO_APPROVE=true BOT_TOKEN= ADMIN_CHAT_ID= NODE_ENV=development node server/index.js
# B — modération demandée, bot non configuré
DATA_DIR=<scratch>/audit3/dataB PORT=3482 ALLOW_DEV_AUTH=true SEED_DEMO=false \
  AUTO_APPROVE=false BOT_TOKEN= ADMIN_CHAT_ID= NODE_ENV=development node server/index.js
# C — faux Telegram : bot.api.sendPhoto / sendMessage / deleteMessage remplacés par des espions
node <scratch>/audit3/moderation.mjs <scratch>/audit3/dataMod
```

Scripts : `verif3.mjs` (parcours et débit), `pending.mjs` et `degrade.mjs` (navigateur, 360 x 740,
Playwright), `moderation.mjs` (côté modérateur), `a11y.mjs` (cibles tactiles).
Limite générale : `telegram.org` est injoignable dans cet environnement, donc aucun envoi Telegram réel
n'a pu être fait. Tout ce qui dépend d'un vrai bot est marqué SUPPOSÉ, ou MESURÉ avec le faux Telegram,
ce qui est dit à chaque fois.

---

## 1. Les cinq faits qui décident de ce lot

1. **La chaîne de vérification est vide dans les trois configurations livrées.** VU `fly.toml:15-16`,
   `render.yaml:16-20`, `.env.example:21,24` : `AUTO_APPROVE=true`. VU `server/config.js:27-28` : ni
   `autoApprove` ni `seedDemo` ne sont neutralisés en production, alors que `allowDevAuth` l'est
   (`:29`). VU : `ADMIN_CHAT_ID` n'est défini ni dans `fly.toml`, ni dans `render.yaml`, ni dans le
   `Dockerfile`. MESURÉ (serveur A) : une image de **22 octets**, sans visage ni geste, obtient le badge
   « vérifié » en moins de 4 secondes et l'accès complet à la découverte.
2. **Même avec un modérateur humain, le geste ne prouve rien.** MESURÉ : 30 tirages de geste en 36 ms,
   **4 gestes distincts**, aucun refus, aucune expiration. Qui a préparé un selfie redemande jusqu'à
   tomber sur le bon.
3. **Le selfie n'est retiré que du serveur, pas du groupe Telegram.** MESURÉ (faux Telegram) : la
   décision ne déclenche **aucun** appel à `deleteMessage`. Le fichier disparaît du disque, la photo
   reste dans la discussion de modération. L'écran promet « Supprimé dès la décision » (VU
   `public/app.js:561` et `:577`).
4. **Le modérateur n'a ni file, ni contexte, ni verrou.** MESURÉ (faux Telegram) : une inscription
   complète produit **4 messages séparés**, les 3 photos arrivant **avant** le selfie, chacun avec la
   seule légende « prénom, âge, geste, ID ». Deux clics contradictoires écrivent deux fois et envoient
   **deux messages contradictoires** à la personne.
5. **Rien n'est daté, donc rien n'est mesurable.** MESURÉ (contenu de `db.json` après un parcours
   complet) : les seuls horodatages d'un compte sont `createdAt` et `lastActiveAt`. Ni date d'envoi du
   selfie, ni date de décision, ni compteur de tentatives. L'app promet pourtant « en général quelques
   minutes » (VU `public/app.js:562` et `:574`).

---

## 2. Fiche écran — `verify`

VU `public/app.js:533-567`. Titre « Vérifie que c'est bien toi », carte-geste tirée au sort, entrée
fichier `capture="user"`, aperçu, bouton principal « Envoyer pour vérification ».

| Critère | Ce que fait la concurrence | Ce que fait Mbolo | Écart | Gravité |
|---|---|---|---|---|
| C04 preuve de vivant | SOURCE (consultée) : Tinder Face Check, vidéo-selfie, vivacité automatisée, décision en secondes, média supprimé, empreinte non réversible conservée. Limite : promesse et moyens non comparables à une bêta fermée | MESURÉ : image de 22 o acceptée, geste tiré parmi 4, rejouable 30 fois en 36 ms, jamais expiré, jamais contrôlé | La vivacité n'est vérifiée nulle part, ni par machine, ni en pratique par un humain dans la configuration livrée | 4 |
| C05 ce que le badge promet | SOURCE (secondaire) : le secteur reconnaît qu'un badge n'atteste ni identité légale, ni âge, ni intentions ; Muzz et Bumble affichent ce que couvre leur vérification | VU `public/app.js:219` (pastille « Vérifié »), `:245-248` (jauge « Confiance n/3 ») : aucune explication, aucun tap, aucune limite énoncée | Le badge est affirmé et jamais expliqué | 3 |
| C03 reprise | SOURCE (connaissance) : sauvegarde à chaque étape, reprise exacte, relance si l'inscription reste inachevée | VU `public/app.js:27-28` : `S.selfie` et `S.gesture` en mémoire seule ; un rechargement de la webview reperd la photo et retire un nouveau geste (`:535-543`) | L'état ne survit pas à un rechargement, et un cas d'erreur n'a aucune issue | 3 |
| C23 messages d'erreur | Norme interne, CLAUDE.md §5.11 : dire ce qui se passe et quoi faire | MESURÉ : `GESTURE_REQUIRED` répond « Demande un geste avant de prendre le selfie » alors que l'écran n'offre aucun bouton pour le faire | Consigne impossible à suivre | 2 |

**Notes.** C04 = **0** (ancrage 0 : « une image de galerie sans geste suffit » — MESURÉ dans la
configuration livrée ; au mieux **1** avec `AUTO_APPROVE=false`, ancrage 1 mot pour mot : geste
rejouable, ensemble petit, pas d'expiration, image de galerie acceptée).
C05 = **0** (ancrage 0 : « badge affiché sans explication accessible »).
C03 = **1** pour ce lot (le chemin normal atteint le niveau 2 — la photo est conservée et le réessai ne
la redemande pas, VU `public/app.js:917-919` — mais un cas reproductible n'offre aucun réessai, voir
VERIFICATION-20, et la règle de la grille fait redescendre d'un cran).
C23 = **1** pour ce lot (ton conforme, un message d'erreur non actionnable).

### Constats

**VERIFICATION-01 — La configuration livrée délivre le badge sans qu'aucun humain ne regarde.**
MESURÉ, serveur A, image de 22 octets : `verification` passe à `approved` en moins de 4 s, badge public
`verified=true`, `GET /discover` répond 200. VU `server/routes.js:131-133` : le `setTimeout` de validation
automatique est déclenché **sans tester** le résultat de l'envoi en modération. VU `server/index.js:69-70` :
le serveur avertit au démarrage sur `WEBAPP_URL` et `ALLOW_DEV_AUTH`, jamais sur `AUTO_APPROVE` en
production. VU `README.md:261` demande de poser `AUTO_APPROVE=true` au déploiement, `README.md:267` et
`:343` de le repasser à `false` : une case à cocher manuelle est la seule barrière.
Gravité 4. Sécurité : **direct**. Risque R5.
*Correction* : refuser le démarrage si `NODE_ENV=production` et `autoApprove` sans variable d'acceptation
explicite ; retirer les deux variables des descripteurs de déploiement ; refuser `pending` sans
`ADMIN_CHAT_ID`. Fichiers : `server/config.js`, `server/index.js`, `fly.toml`, `render.yaml`,
`.env.example`, `README.md`. **0,5 j.**

**VERIFICATION-02 — Le geste est rejouable à volonté, et n'expire jamais.**
MESURÉ : 30 appels à `POST /api/me/verification/start` en 36 ms, 30 réponses 200, **4 gestes distincts**.
VU `server/routes.js:17` (quatre phrases en dur), `:116-121` (tirage sans horodatage, sans compteur).
VU `server/routes.js:76` : `GET /api/me` renvoie `pendingGesture`, donc le geste se lit sans ouvrir
l'écran. VU `server/routes.js:56-63` : le serveur accepte n'importe quelle `data:image/(jpeg|jpg|png|webp)`
jusqu'à 1,5 Mo ; `capture="user"` (VU `public/app.js:550-557`) n'est qu'une indication côté client.
Gravité 4. Sécurité : **direct**. Risque R5.
*Correction* : horodater le geste, le rendre à usage unique, l'expirer en 5 minutes, un tirage par minute
au plus, et refuser un selfie envoyé plus de N minutes après le tirage. Fichiers : `server/routes.js`,
`server/store.js`, `test/`. **1 à 2 j.**

**VERIFICATION-07 — Un compte déjà vérifié peut se rétrograder lui-même et perdre l'accès.**
MESURÉ, serveur A : sur un compte `approved`, `POST /api/me/verification/start` répond 200 et retire un
geste ; `POST /api/me/verification` répond 200 et repasse le compte en `pending` ; `GET /discover` répond
aussitôt `403 NOT_VERIFIED`. MESURÉ (navigateur) : ouvrir `/?dev_user=9001&screen=verify` sur un compte
vérifié affiche l'écran de vérification et pose un nouveau geste côté serveur. Le chemin est atteignable
sans bidouille : VU `server/bot.js:95`, le message de refus porte un bouton « Réessayer » vers
`?screen=verify`, et ce bouton reste cliquable dans l'historique de la conversation. VU
`public/app.js:1292` : `params.screen === 'verify'` est testé **avant** l'état du compte.
Gravité 3. Sécurité : **indirect**. Risque R3.
*Correction* : refuser `POST /me/verification` quand le compte est déjà `approved` ; ne router vers
`verify` que si l'état le justifie. Fichiers : `server/routes.js`, `public/app.js`, `test/`. **0,5 j.**

**VERIFICATION-08 — Modifier son profil pendant l'attente relance toute la vérification.**
VU `public/app.js:893-899` : `saveProfile` envoie sur `verify` dès que `verification !== 'approved'`, donc
aussi pendant l'attente. L'écran retire alors un nouveau geste (VU `:535-543`), écrase `pendingGesture`
(VU `server/routes.js:119`), et un second selfie écrase le fichier et part en modération. MESURÉ (faux
Telegram) : rien n'empêche les envois répétés, chacun produit un message de plus dans le groupe.
Gravité 3. Sécurité : **indirect**. Risque R3.
*Correction* : ne pas renvoyer vers `verify` quand l'état est `pending` ; renvoyer vers `pending`.
Fichiers : `public/app.js`, `test/`. **1 à 2 j.**

**VERIFICATION-16 — Les photos de profil suivent un sort incohérent selon la configuration.**
MESURÉ, serveur A (`AUTO_APPROVE=true`) : `PUT /api/me/photos/2` renvoie immédiatement
`status: "approved"` — aucune relecture humaine, VU `server/routes.js:161-165`. MESURÉ, serveur B
(`AUTO_APPROVE=false`, sans bot) : les trois emplacements restent `pending` indéfiniment, la personne
n'est jamais prévenue, et son profil reste sans photo pour les autres (VU `server/routes.js:43-44`).
Gravité 2. Sécurité : **indirect**. Risque R1.
*Correction* : dire à l'écran qu'une photo attend la modération et depuis quand ; ne pas valider les
photos automatiquement en production. Fichiers : `public/app.js`, `server/routes.js`. **0,5 j.**

**VERIFICATION-17 — Le badge et la jauge de confiance affirment plus qu'ils ne prouvent.**
VU `public/app.js:219` (pastille « Vérifié »), `:245-248` (jauge « Confiance n/3 » : selfie, garant,
ancienneté) : aucun tap n'explique ce qui a été vérifié, et rien n'énonce ce que le badge ne promet pas.
VU `public/app.js:446` : l'accueil affirme « Chaque membre a prouvé qu'il est une vraie personne ».
MESURÉ : un compte réel fraîchement vérifié affiche `trust = {selfie:true, guarantor:false,
seniority:false}`, soit **1/3**, parce que le système de garant n'existe pas (CLAUDE.md §8 P1-6) et que
l'ancienneté exige 90 jours (VU `server/routes.js:46`) ; VU `server/seed.js:6` : les profils de
démonstration portent `trust` écrit en dur, jusqu'à **3/3**. Un profil fictif paraît donc plus fiable
qu'une personne réelle vérifiée.
Gravité 3. Sécurité : **indirect**. Risque R5.
*Correction* : une feuille d'explication en un tap (« ce qui a été vérifié », « ce que cela ne dit pas »),
rappelée au passage au rendez-vous ; ne plus servir de `trust` inventé pour les profils de démonstration.
Fichiers : `public/app.js`, `server/routes.js`, `server/seed.js`. **1 à 2 j.**

**VERIFICATION-20 — L'erreur `GESTURE_REQUIRED` n'a aucune issue dans l'écran.**
MESURÉ : `POST /api/me/verification` sans geste répond `400 {"code":"GESTURE_REQUIRED","message":"Demande
un geste avant de prendre le selfie."}`. VU `public/app.js:534-566` : l'écran n'offre aucun bouton pour
demander un geste, il ne le fait qu'au premier rendu quand `S.gesture` est vide. Le cas se produit
quand une décision de modération remet `pendingGesture` à `null` (VU `server/bot.js:88`) pendant que la
personne est restée sur l'écran avec une photo déjà prise. Seule sortie : fermer et rouvrir l'app.
Gravité 2. Sécurité : **aucun**. Risque R3.
*Correction* : sur ce code d'erreur, redemander un geste automatiquement et le réafficher.
Fichiers : `public/app.js`. **0,5 j.**

**VERIFICATION-21 — L'envoi du selfie n'a ni délai d'expiration ni verrou.**
VU `public/app.js:59-70` : `api()` appelle `fetch` sans `AbortController` ni minuteur. VU `:907-921` :
aucun verrou contre un second envoi après une erreur. Sur un réseau qui traîne, le bouton reste sur
« Envoi du selfie » sans issue ; si la requête aboutit mais que la réponse se perd, la personne renvoie
et un second selfie part en modération. Coût en data doublé : le selfie voyage en base64 dans du JSON
(VU `server/routes.js:56`), soit un tiers de plus que l'image elle-même, jusqu'à 1,5 Mo décodés
(VU `server/routes.js:60`) dans un corps accepté jusqu'à 3 Mo (VU `server/index.js:13`).
Gravité 2. Sécurité : **aucun**. Risque R7.
*Correction* : minuteur et bouton « Annuler » sur les envois d'image, verrou d'envoi unique.
Fichiers : `public/app.js`. **0,5 j.**

---

## 3. Fiche écran — `pending`

VU `public/app.js:569-584`. Animation, frise en trois étapes, deux boutons : « Actualiser » et
« Fermer ». Sondage `GET /api/me` toutes les 5 secondes.

| Critère | Ce que fait la concurrence | Ce que fait Mbolo | Écart | Gravité |
|---|---|---|---|---|
| C01 gestion de l'attente | SOURCE (consultée) : les grandes apps montrent de la valeur avant d'exiger la vérification complète ; chez Tinder la décision est automatisée et rendue en secondes. Limite : promesse de vivier non comparable | MESURÉ (navigateur) : onglets masqués, deux boutons, aucun contenu, aucun compteur de personnes vérifiées dans la ville | L'attente est expliquée mais vide, et le délai annoncé n'est adossé à rien | 3 |
| C19 résilience | SOURCE (connaissance) : file locale, indicateur d'état, écran hors ligne utile | MESURÉ : appuyer sur « Actualiser » ne change **rien** dans le DOM, n'affiche aucun toast, en ligne comme hors ligne ; VU `public/app.js:934` : le `catch` est vide | Bouton actif qui ne fait rien de perceptible : ancrage 0 de C19 | 3 |
| C18 coût en data | SOURCE (secondaire, indicatif) : 500 FCFA achètent de l'ordre de 500 à 750 Mo. Limite : extraits de recherche non revérifiés, unité de compte seulement | MESURÉ : 697 requêtes API par heure, 1 051 o de corps et 1 527 o en comptant les en-têtes, soit environ **1 Mo par heure** pour n'apprendre rien | La personne paie l'attente au prix de l'octet | 2 |

**Notes.** C01 = **1** pour ce lot (ancrage 1 : « attente expliquée, délai annoncé, mais rien ne mesure
ni ne garantit ce délai »). C19 = **0** pour cet écran (ancrage 0 : « boutons actifs qui ne font rien »),
contre **2** pour l'écran `verify` qui a bien un squelette et un écran d'erreur avec réessai (VU
`public/app.js:536-541`). La note du lot est **0**, puisqu'un niveau n'est atteint que si tout est vrai.

### Constats

**VERIFICATION-03 — Le temps mort n'est ni borné, ni mesuré, ni rattrapé.**
MESURÉ (`db.json` après un parcours complet) : les clés d'un compte sont `id, firstName, languageCode,
createdAt, profile, verification, pendingGesture, demo, lastNotifiedAt, lastActiveAt, photos`. Aucune date
d'envoi, aucune date de décision, aucun compteur. VU `server/routes.js:128` : le patch appliqué est
`{ verification: 'pending' }` seul. VU `server/bot.js:88` : la décision n'écrit que le statut. MESURÉ
(grep) : aucune tâche périodique dans `server/`, donc aucune relance et aucune escalade. L'écran promet
pourtant « en général quelques minutes » (VU `public/app.js:562` et `:574`) et « Une vraie personne
regarde le geste et le visage » (VU `:578`).
Gravité 4. Sécurité : **indirect**. Risque R3 et R8.
*Correction* : écrire `verificationSubmittedAt`, `verificationDecidedAt`, `verificationAttempts` ;
afficher le délai réel médian à la place d'une promesse ; relancer la modération au-delà d'un seuil.
Fichiers : `server/store.js`, `server/routes.js`, `server/bot.js`, `public/app.js`, `test/`. **1 à 2 j.**

**VERIFICATION-04 — Pendant l'attente, il n'y a strictement rien à faire.**
MESURÉ (navigateur, compte en attente) : la barre d'onglets est masquée, le contenu se résume à la frise,
et les seuls éléments interactifs sont « Actualiser » (160 x 50) et « Fermer » (160 x 50). VU
`public/app.js:154` : les onglets sont conditionnés à `verification === 'approved'`, donc ni guide
sécurité, ni profil, ni aperçu. VU `public/app.js:103` : `pending` n'a pas de parent, donc aucun bouton
retour. MESURÉ : hors de Telegram, le bouton « Fermer » est inerte (VU `public/tg.js:234-236`), ce qui
concerne directement la version web prévue en P0-6.
Gravité 3. Sécurité : **aucun**. Risque R6 et R3.
*Correction* : ouvrir l'onglet Sécurité et le profil pendant l'attente ; afficher un compteur honnête de
personnes vérifiées dans la ville, servi par une route qui n'exige pas d'être vérifié.
Fichiers : `public/app.js`, `server/routes.js`, `test/`. **3 à 5 j.**

**VERIFICATION-05 — « Actualiser » ne produit aucun retour, même hors ligne.**
MESURÉ (navigateur) : après appui, le DOM de `#app` est identique, `#toast` reste masqué. Hors ligne,
même résultat. VU `public/app.js:923-935` : `refreshStatus` n'a aucune branche pour l'état `pending` et
son `catch` est vide.
Gravité 3. Sécurité : **aucun**. Risque R3.
*Correction* : retour haptique et message d'état (« toujours en attente, envoyé il y a X minutes »),
message réseau distinct en cas d'échec. Fichiers : `public/app.js`. **0,5 j.**

**VERIFICATION-06 — L'attente coûte environ 1 Mo par heure pour n'apprendre rien.**
MESURÉ (navigateur, 31 s d'observation) : 6 requêtes API, 6 306 octets de corps, soit **697 requêtes par
heure**. MESURÉ (`curl -w`) : `GET /api/me` pèse 101 o de requête, 375 o d'en-têtes de réponse et 1 051 o
de corps, soit 1 527 o par tour. VU `public/app.js:583` : sondage toutes les 5 secondes. VU
`public/app.js:1045` : la boucle de discussion s'arrête quand l'onglet est masqué ; la boucle d'attente
ne fait pas cette vérification. VU `server/routes.js:69-83` : `/me` renvoie le profil complet, les
options, les filtres et les photos à chaque tour, pour un seul champ qui change.
Gravité 2. Sécurité : **aucun**. Risque R7.
*Correction* : route d'état minimale, intervalle croissant, arrêt quand l'onglet est masqué.
Fichiers : `public/app.js`, `server/routes.js`, `test/`. **0,5 j.**

**VERIFICATION-19 — La promesse « le bot t'écrit » n'est vérifiée nulle part.**
VU `public/app.js:574` : l'écran affirme que le bot préviendra. VU `server/routes.js:82` : le serveur
sait si le bot existe (`notificationsAvailable`) ; MESURÉ (grep) : ce champ n'est **jamais lu** dans
`public/app.js`. VU `public/app.js:915` : le résultat de `tg.requestWriteAccess()` est jeté, et VU
`public/tg.js:221` : hors Telegram, la fonction renvoie `true` sans rien demander. VU `server/bot.js:93`
et `:95` : `decideVerification` ignore le retour de `notify`, qui peut valoir `NO_BOT` ou
`TELEGRAM_ERROR`. MESURÉ (serveur B) : `notificationsAvailable=false` et l'écran promet quand même.
SUPPOSÉ : une personne arrivée par un lien sans avoir lancé le bot ne reçoit rien. Test qui trancherait :
avec un bot réel, ouvrir la mini app par un lien direct sans envoyer `/start`, valider le compte, et
regarder le code d'erreur renvoyé par `sendMessage`.
Gravité 3. Sécurité : **aucun**. Risque R6 et R3.
*Correction* : adapter le texte quand `notificationsAvailable` est faux ou l'accès en écriture refusé ;
compter les échecs de notification. Fichiers : `public/app.js`, `server/bot.js`, `server/store.js`. **1 à 2 j.**

---

## 4. Fiche acteur — le modérateur

Le modérateur n'a aucun écran dans l'app. Son poste de travail est une conversation Telegram.
Tout ce qui suit est MESURÉ avec un faux Telegram (`moderation.mjs`), sauf mention contraire.

| Critère | Ce que fait la concurrence | Ce que fait Mbolo | Écart | Gravité |
|---|---|---|---|---|
| C04 décision | SOURCE (consultée) : décision automatisée rendue en secondes, comparaison au visage des photos du profil | 4 messages séparés par inscription, photos avant le selfie, aucun lien entre eux | Le modérateur ne peut pas comparer ce qu'il doit comparer | 3 |
| C06 barrière au retour | SOURCE (consultée) : empreinte non réversible, refus automatique en cas de doublon. Limite : donnée biométrique, base légale camerounaise non tranchée | VU `server/store.js:51-61` : aucun champ `banned` ; VU `server/bot.js:94-96` : le refus invite explicitement à recommencer | Aucun état de sanction, donc aucune barrière | 4 |
| C22 mesure | SOURCE (consultée) : HEART, objectifs → signaux → métriques | Aucun horodatage, aucun motif, aucune trace de décision côté serveur | Le délai, le taux de refus et les motifs sont inconnaissables | 3 |

**Notes.** C06 = **0** (ancrage 0 : « aucun état de sanction »). C22 pour cet entonnoir = **1**
(ancrage 1 mot pour mot : « les horodatages métier existent mais les étapes clés ne sont pas datées :
envoi du selfie, décision de modération »).

### Constats

**VERIFICATION-09 — Aucun plafond : un seul compte non vérifié remplit la file de modération.**
MESURÉ (faux Telegram) : 60 envois d'un seul compte en `pending` — 30 selfies puis 30 photos — en
**165 ms**, produisant **60 messages** dans le groupe de modération. MESURÉ (serveur B) : les mêmes
envois sont tous acceptés (30 photos en 37 ms, 30 selfies en 32 ms) alors que le compte n'est pas
vérifié. VU `server/routes.js:123-138` et `:170-176` : aucun compteur, aucun contrôle de fréquence.
SUPPOSÉ : la limite d'envoi de l'API Telegram vers un même groupe étalerait ces 60 messages sur
plusieurs minutes et retarderait toutes les vraies vérifications. Test qui trancherait : avec un bot et
un groupe réels, poster 60 selfies en une minute et compter les erreurs 429.
Gravité 3. Sécurité : **indirect**. Risque R3.
*Correction* : plafonds par compte et par fenêtre sur `verification`, `verification/start` et `photos`
(P0-3 de la feuille de route). Fichiers : `server/routes.js`, `server/store.js`, `test/`. **1 à 2 j.**

**VERIFICATION-10 — Le selfie promis « supprimé » reste dans le groupe Telegram.**
MESURÉ (faux Telegram) : après décision, le nombre d'appels à `deleteMessage` est **0**, et le fichier
serveur est bien effacé (`fs.existsSync(...selfie.jpg)` → `false`). MESURÉ (grep) : aucune occurrence de
`deleteMessage` dans `server/`. VU `server/bot.js:89-90` : seule la suppression du fichier local est
faite. VU `server/bot.js:123` : la décision se contente d'éditer la légende, la photo du message reste.
VU `public/app.js:546`, `:561` et `:577` : trois promesses de suppression à l'écran.
Gravité 4. Sécurité : **direct**. Risque R5.
*Correction* : conserver le `message_id` du message de modération, appeler `deleteMessage` à la décision,
et écrire au README la durée de conservation réelle. Fichiers : `server/bot.js`, `server/store.js`,
`README.md`, `test/`. **1 à 2 j.**

**VERIFICATION-11 — La modération est aveugle : rien de ce qu'il faut comparer n'est mis côte à côte.**
MESURÉ (faux Telegram), inscription complète :
```
1. [photo] "Photo 1 de Awa, 24 ans\nID : 5001"        boutons=["Valider","Refuser"]
2. [photo] "Photo 2 de Awa, 24 ans\nID : 5001"        boutons=["Valider","Refuser"]
3. [photo] "Photo 3 de Awa, 24 ans\nID : 5001"        boutons=["Valider","Refuser"]
4. [photo] "Vérification de Awa, 24 ans\nGeste demandé : Pose ta main sur ta joue\nID : 5001"
```
Les photos arrivent **avant** le selfie (VU `public/app.js:884-889` : elles partent à l'enregistrement du
profil). La légende ne porte ni ville, ni quartier, ni réponse à la question, ni tentatives antérieures,
ni signalement en cours. VU `server/bot.js:53` et `:67` : les deux légendes ne partagent que l'ID.
Point positif à conserver : aucune donnée Telegram (pseudo, numéro) n'est envoyée au groupe.
Gravité 3. Sécurité : **indirect**. Risque R5.
*Correction* : un seul message par inscription, selfie et photos groupés, légende portant le profil utile
et l'historique. Fichiers : `server/bot.js`, `server/routes.js`, `test/`. **3 à 5 j.**

**VERIFICATION-12 — Aucune attribution, aucun verrou : deux clics, deux messages contradictoires.**
MESURÉ (faux Telegram) : `decideVerification(id, true)` puis `decideVerification(id, false)` envoient
**deux** messages à la personne — « Ton profil est vérifié… » puis « Ta vérification n'a pas abouti… » —
et l'état final suit le dernier clic. VU `server/bot.js:119-125` : aucune lecture de l'état courant avant
d'écrire. VU `server/bot.js:93` et `:95` : ces notifications partent sans clé de limitation, donc sans
aucun garde-fou de fréquence. SUPPOSÉ : `editMessageCaption` appelé sans `reply_markup` retire le clavier
et empêcherait un second clic. Test qui trancherait : envoyer une photo avec clavier dans un groupe de
test, cliquer, puis regarder si les boutons disparaissent.
Gravité 3. Sécurité : **indirect**. Risque R3.
*Correction* : refuser une décision sur un compte déjà tranché, répondre « déjà traité par X », et
enregistrer qui a décidé. Fichiers : `server/bot.js`, `server/store.js`, `test/`. **1 à 2 j.**

**VERIFICATION-13 — Un seul motif de refus, aucun compteur, aucun état de sanction.**
VU `server/bot.js:51` : deux boutons, « Valider » et « Refuser », donc aucun motif saisissable. VU
`server/bot.js:94-96` : quel que soit le motif réel — mineur, photo volée, contenu inadapté — la personne
reçoit « le geste ou le visage n'était pas assez visible. Tu peux réessayer. » MESURÉ (`db.json`) : aucun
champ de tentatives ni de sanction dans l'objet utilisateur. MESURÉ (grep des routes) : aucune route de
bannissement dans `server/routes.js`. Conséquence : un mineur refusé est explicitement invité à
recommencer, autant de fois qu'il veut, avec une photo différente.
Gravité 4. Sécurité : **direct**. Risque R5.
*Correction* : motifs de refus au clic, compteur de tentatives, état `banned` coupant l'accès à toutes
les discussions, message adapté au motif. Fichiers : `server/bot.js`, `server/store.js`,
`server/routes.js`, `public/app.js`, `test/`. **3 à 5 j.**
*Réserve CLAUDE.md* : §6.1 impose l'accord explicite du propriétaire avant toute tâche touchant la
sécurité et les données. Ce constat entre dans ce cadre : la décision de créer un état de sanction lui
revient.

**VERIFICATION-14 — Il n'existe aucune file, et aucun moyen de savoir combien de gens attendent.**
MESURÉ (grep des commandes du bot) : `start`, `id`, `aide` seulement (VU `server/bot.js:105-117`).
MESURÉ (liste des routes) : aucune route d'administration dans `server/routes.js` ; `/health` ne renvoie
que `{ ok: true }` (VU `server/index.js:25`). MESURÉ (grep) : aucune tâche périodique dans `server/`.
Le tableau de bord est donc l'ordre d'arrivée dans une conversation, et la nuit rien ne se passe.
Gravité 3. Sécurité : **indirect**. Risque R3 et R8.
*Correction immédiate et bon marché* : une commande de bot `/attente` listant les comptes en attente,
triés par ancienneté, avec le délai écoulé — Fichiers : `server/bot.js`, `server/store.js`. **1 à 2 j.**
*Correction complète* : le tableau de bord web protégé prévu en P1-10. **plus de 5 j.**

**VERIFICATION-15 — Les fichiers d'un compte jamais tranché ne sont jamais nettoyés.**
MESURÉ, serveur B : après un parcours interrompu, `dataB/uploads/` contient toujours `9002-selfie.jpg`
et les trois `9002-photo-N.jpg`, sans limite de durée. VU `server/bot.js:89-90` : la seule suppression
est déclenchée par une décision. MESURÉ (grep) : aucune purge, aucune expiration. Le seul effacement
réel est la suppression volontaire du compte (VU `server/store.js:75-92`).
Gravité 2. Sécurité : **indirect**. Risque R5.
*Correction* : purge des selfies au-delà d'un délai écrit, durée de conservation déclarée au README
(loi camerounaise n° 2024/017). Fichiers : `server/store.js`, `server/index.js`, `README.md`. **1 à 2 j.**

**VERIFICATION-18 — Les routes de vérification n'ont aucun test.**
MESURÉ (grep sur `test/`) : aucune requête HTTP vers `/me/verification` ni `/me/verification/start` ;
les huit fichiers de test contournent l'étape en forçant `store.updateUser(id, { verification:
'approved' })`. Les fonctions de décision, elles, sont partiellement couvertes : `decidePhoto` dans
`test/photos.test.js:67-97`, `decideVerification` dans `test/notifications.test.js:87`.
Gravité 2. Sécurité : **indirect**. Risque R8.
*Correction* : un fichier `test/verification.test.js` couvrant les codes d'erreur, l'expiration du geste,
le plafond de débit et la garde d'identité des rappels de modération. Fichiers : `test/`. **1 à 2 j.**

---

## 5. Récapitulatif

| id | titre court | écran / maillon | gravité | sécurité | effort |
|---|---|---|---|---|---|
| VERIFICATION-01 | Badge délivré sans humain dans la configuration livrée | chaîne entière | 4 | direct | 0,5 |
| VERIFICATION-02 | Geste rejouable, jamais expiré | verify | 4 | direct | 1 à 2 |
| VERIFICATION-03 | Temps mort ni borné ni mesuré | pending | 4 | indirect | 1 à 2 |
| VERIFICATION-04 | Rien à faire pendant l'attente | pending | 3 | aucun | 3 à 5 |
| VERIFICATION-05 | « Actualiser » sans aucun retour | pending | 3 | aucun | 0,5 |
| VERIFICATION-06 | 1 Mo par heure d'attente | pending | 2 | aucun | 0,5 |
| VERIFICATION-07 | Auto-rétrogradation d'un compte vérifié | verify | 3 | indirect | 0,5 |
| VERIFICATION-08 | Modifier son profil relance la vérification | verify | 3 | indirect | 1 à 2 |
| VERIFICATION-09 | Aucun plafond, file inondable | modération | 3 | indirect | 1 à 2 |
| VERIFICATION-10 | Selfie conservé dans le groupe Telegram | modération | 4 | direct | 1 à 2 |
| VERIFICATION-11 | Modération aveugle, 4 messages dispersés | modération | 3 | indirect | 3 à 5 |
| VERIFICATION-12 | Aucune attribution, décisions contradictoires | modération | 3 | indirect | 1 à 2 |
| VERIFICATION-13 | Un seul motif de refus, aucune sanction | modération | 4 | direct | 3 à 5 |
| VERIFICATION-14 | Aucune file, aucun compteur d'attente | modération | 3 | indirect | 1 à 2 |
| VERIFICATION-15 | Fichiers jamais purgés | modération | 2 | indirect | 1 à 2 |
| VERIFICATION-16 | Photos : sort incohérent selon la configuration | verify | 2 | indirect | 0,5 |
| VERIFICATION-17 | Badge et jauge affirment plus qu'ils ne prouvent | verify | 3 | indirect | 1 à 2 |
| VERIFICATION-18 | Routes de vérification non testées | chaîne entière | 2 | indirect | 1 à 2 |
| VERIFICATION-19 | « Le bot t'écrit » non vérifié | pending | 3 | aucun | 1 à 2 |
| VERIFICATION-20 | `GESTURE_REQUIRED` sans issue | verify | 2 | aucun | 0,5 |
| VERIFICATION-21 | Envoi du selfie sans expiration ni verrou | verify | 2 | aucun | 0,5 |

**Notes du lot.** C01 = 1 · C03 = 1 · C04 = 0 · C05 = 0 · C06 = 0 · C19 = 0 (verify 2, pending 0) ·
C22 = 1 · C23 = 1. Chaque note repose uniquement sur du VU ou du MESURÉ cité ci-dessus.

**Ordre de traitement conseillé, à coût croissant et à effet décroissant sur la sécurité :**
01, 02, 10, 13, puis 07, 03, 09, 12, puis le reste.

---

## 6. Ce que Mbolo fait mieux que la concurrence sur ce lot

1. **La porte est réellement fermée.** MESURÉ : tant que le compte n'est pas `approved`, `/discover`,
   `/profiles`, `/likes`, `/matches` et `/photos` répondent `403 NOT_VERIFIED` (VU
   `server/routes.js:65-66`). Aucune app du benchmark ne conditionne l'accès entier au vivier à une
   vérification. Le verrou est correct ; c'est la décision derrière qui est vide.
2. **Le selfie n'est jamais servi aux autres membres, et il est supprimé du serveur sur tous les chemins
   de décision.** MESURÉ : après décision, le fichier n'existe plus sur le disque. VU
   `server/bot.js:89-90` : la suppression est faite que la décision soit positive ou négative. C'est
   l'exigence de niveau 2 de C04, tenue côté serveur.
3. **Aucune donnée Telegram ne fuit vers la modération.** VU `server/bot.js:53` et `:67` : la légende ne
   contient que prénom, âge, geste et identifiant interne. Ni pseudo, ni numéro.
4. **Le refus d'une photo est plus honnête que la moyenne.** VU `server/bot.js:81` : la photo refusée est
   supprimée, et le message nomme trois causes possibles (« visage peu visible, contenu inadapté, ou ce
   n'est pas toi ») plutôt qu'un refus muet. À reprendre pour le refus de vérification, qui n'a qu'un
   seul motif.
5. **La reprise après refus tient en un tap.** VU `server/bot.js:95` : le message de refus porte un
   bouton « Réessayer » qui ouvre directement l'écran de vérification. C'est le niveau attendu par C03,
   et c'est déjà là.
6. **L'attente dit franchement qu'on peut fermer l'app.** VU `public/app.js:574`. Sur un forfait compté,
   c'est le bon conseil, et il est rare : la plupart des produits retiennent la personne sur un écran de
   chargement.
7. **Les cibles tactiles de ces deux écrans sont larges.** MESURÉ (360 x 740) : carte-geste 328 x 250,
   boutons de l'attente 160 x 50. Aucun micro-élément, contrairement à l'écran Découvrir mesuré ailleurs
   dans cet audit (9 cibles sur 12 sous 44 x 44).

---

## 7. Frictions de la cartographie que j'écarte ou que je corrige

- **« Tout le segment est dépourvu de tests » : corrigé.** MESURÉ : `decidePhoto` est testée
  (`test/photos.test.js:67-97`) et `decideVerification` l'est partiellement
  (`test/notifications.test.js:87`). Ce qui manque, ce sont les **routes HTTP** de vérification et la
  garde d'identité des rappels de modération. Constat reformulé en VERIFICATION-18.
- **« Les boutons de modération des photos sont inertes pour un identifiant non numérique » : écarté en
  production.** Le fait est exact (VU `server/bot.js:127`, motif `(\d+)`, contre `server/bot.js:119`,
  motif `(.+)`), mais les identifiants Telegram réels sont numériques et les profils de démonstration
  n'envoient pas de photo. L'effet n'existe qu'en développement, je ne le retiens pas comme constat.
- **« L'écran d'attente est un cul-de-sac dont on sort sans pouvoir y revenir » : partiellement vérifié.**
  MESURÉ : absence de bouton retour et d'onglets, confirmée. La sortie par le bouton Réglages natif de
  Telegram n'a **pas** pu être vérifiée ici, faute de Telegram. Je retiens l'absence d'issue utile
  (VERIFICATION-04) et pas l'enchaînement précis décrit dans la cartographie.
- **« Le compte reste pending pour toujours si l'envoi en modération échoue » : vérifié et mesuré**
  (serveur B, compte encore `pending` après plus de six secondes, journal du serveur : « configure
  BOT_TOKEN et ADMIN_CHAT_ID »). Intégré à VERIFICATION-14.

## 8. Ce que je n'ai pas pu trancher

- **La suppression effective du selfie dans un vrai groupe Telegram.** MESURÉ avec un faux Telegram :
  aucun appel à `deleteMessage`. Reste à confirmer qu'un message photo édité conserve bien l'image dans
  l'historique — test : envoyer une photo dans un groupe de test, éditer sa légende, rouvrir la
  conversation.
- **Le plafond d'envoi réel vers un groupe de modération.** SUPPOSÉ, repère documentaire non vérifié ici.
  Test : poster 60 selfies en une minute avec un bot réel et compter les erreurs 429.
- **La disparition du clavier après `editMessageCaption`.** SUPPOSÉ. Test : cliquer une fois puis
  regarder si les boutons restent.
- **Le temps réel d'un modérateur par élément.** Non mesuré : aucun modérateur chronométré. Le chiffrage
  de débit disponible dans `audit/02-mesures.md` §2.4 repose sur des hypothèses énoncées, pas sur une
  observation.
- **Le comportement de la validation automatique quand la machine s'arrête.** VU
  `server/routes.js:133` : un `setTimeout` en mémoire, et VU `fly.toml:22-24` : la machine s'arrête
  quand personne ne s'en sert. Test : déployer, envoyer un selfie, arrêter la machine dans la seconde,
  rouvrir et lire `verification`.
