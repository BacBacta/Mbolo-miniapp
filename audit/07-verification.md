# Odo — passe adverse sur les 113 constats

Ce fichier ne défend rien. Il cherche à casser ce que quatre agents de diagnostic ont écrit.
Chaque verdict repose sur la preuve rouverte à la ligne citée, ou sur une mesure refaite avec mes
propres scripts, jamais sur les leurs.

Quatre verdicts sont utilisés :

- **CONFIRMÉ** : la ligne citée dit bien ce qu'on lui fait dire, ou la mesure se reproduit.
- **CONFIRMÉ SUR PREUVE REFAITE** : le fond tient, mais le chiffre d'origine est retiré et remplacé
  par le mien. La preuve qui accompagnait le constat ne vaut plus.
- **AFFAIBLI** : une partie porteuse de l'énoncé ne survit pas. Le constat est dégradé en hypothèse,
  avec le test qui trancherait. Il n'est pas réécrit pour être sauvé.
- **RETIRÉ** : l'énoncé, tel qu'il est écrit, est faux.

---

## 0. Conditions de la passe adverse

Dépôt `/home/user/Mbolo-miniapp`, aucun fichier modifié hors de `audit/` (MESURÉ,
`git status --short` : seuls les fichiers `audit/*.md` apparaissent, aucun fichier de `server/`,
`public/`, `test/` ni de configuration).

Node `v22.22.2`. Playwright `/opt/node22/lib/node_modules/playwright`, Chromium
`/opt/pw-browsers/chromium-1194`. Fenêtre 360 x 740.

Trois serveurs lancés, tous avec un répertoire de données hors du dépôt
(`<scratch>/verif/dataA|dataB|dataC`) :

```bash
# A — configuration des fichiers livrés
DATA_DIR=<scratch>/verif/dataA PORT=3901 ALLOW_DEV_AUTH=true SEED_DEMO=true \
  AUTO_APPROVE=true BOT_TOKEN= ADMIN_CHAT_ID= NODE_ENV=development node server/index.js
# B — même configuration, population de 60 comptes construite par l'API
DATA_DIR=<scratch>/verif/dataB PORT=3902 ... (idem)
# C — modération réelle demandée, bot absent
DATA_DIR=<scratch>/verif/dataC PORT=3903 ALLOW_DEV_AUTH=true SEED_DEMO=false \
  AUTO_APPROVE=false BOT_TOKEN= ADMIN_CHAT_ID= NODE_ENV=development node server/index.js
```

Mes scripts sont dans `<scratch>/verif/` : `antiscam.mjs`, `m-quota.mjs`, `m-profil.mjs`,
`m-relation.mjs`, `m-suite.mjs`, `m-vivier.mjs`, `lum.mjs`, `pw-contraste.mjs`, `pw-front.mjs`,
`pw-reveal2.mjs`, `pw-taps.mjs`, `pw-serial.mjs`.

MESURÉ, `npm test` : `# tests 40 # pass 40 # fail 0`. La suite passe, ce qui ne dit rien de ce
qu'elle ne couvre pas (voir VERIFICATION-18 et RELATION-31, tous deux confirmés).

**Une précision de méthode qui change des verdicts.** Les résumés d'une ligne par constat qui m'ont
été transmis sont parfois plus affirmatifs que le texte des fiches `03-ecrans-*.md`. Trois constats
que j'allais affaiblir sur la foi du résumé tiennent quand on lit la fiche (DECOUVERTE-17,
VERIFICATION-20, VERIFICATION-21). Les verdicts ci-dessous portent sur le texte des fiches.

---

## 1. Les mesures rejouées

Dix-huit mesures refaites. Voici les chiffres bruts, à comparer à ceux du dossier.

### 1.1 Compression et poids du premier écran (INSCRIPTION-03, DECOUVERTE-16)

MESURÉ, `curl -H "Accept-Encoding: gzip, deflate, br"` sur le serveur A :

```
/           200  1 906 o   (identique avec et sans Accept-Encoding)
/app.js     200 65 057 o   (identique)
/styles.css 200 39 651 o   (identique)
/ui.js      200  9 866 o   (identique)
/tg.js      200  8 897 o   (identique)
/api/me     200    430 o
TOTAL corps                125 807 o
```

En-têtes de `/app.js` avec `gzip` demandé : aucun `Content-Encoding`, `Content-Length: 65057`.
**Aucune compression, confirmée sans ambiguïté.** Mon total de corps est 125 807 o contre
131 455 o annoncés ; l'écart (environ 900 o par requête) correspond aux en-têtes que le dossier
comptait et que je ne compte pas. Conclusion identique, chiffre à préférer : **environ 126 Ko de
corps** pour atteindre `welcome`.

### 1.2 Anti-arnaque (RELATION-06, RELATION-07, dossier §3)

J'ai exécuté `server/antiscam.js` sur les **phrases nommément citées** par les deux constats et par
le dossier, sans reprendre aucun de leurs corpus (`<scratch>/verif/antiscam.mjs`, `n = 0`) :

```
BLOQUE [légitime] tu es prête ?                                           <- MONEY_BLOCKED
BLOQUE [légitime] Tu es prête pour samedi ?                               <- MONEY_BLOCKED
BLOQUE [légitime] Je prends le taxi jusqu'à Mvog-Mbi, ça me coûte 300 F   <- MONEY_BLOCKED
BLOQUE [légitime] J'ai plus de crédit sur ma ligne...                     <- MONEY_BLOCKED
BLOQUE [légitime] Les frais de scolarité sont chers cette année...        <- MONEY_BLOCKED
BLOQUE [légitime] Mon oncle m'a dépanné avec sa voiture...                <- MONEY_BLOCKED
PASSE  [arnaque]  envoie juste 10k
PASSE  [arnaque]  il faut 50 mille pour finaliser le dossier
PASSE  [arnaque]  Il me faut 5 mille pour le taxi
PASSE  [arnaque]  ma tante est malade à l'hôpital, elle a besoin de médicaments
PASSE  [arnaque]  Achete moi une carte de recharge, je te revaudrai ça
PASSE  [arnaque]  Mon compte est bloqué, envoie le code que je viens de recevoir
PASSE  [arnaque]  J'ai un plan business, mets juste 20000 et tu récupères le double
PASSE  [arnaque]  Je t'envoie un colis de l'étranger, paie juste la douane
PASSE  [arnaque]  Small small helep me, even 2000 na ok

19 phrases citées : 6 légitimes bloquées, 13 arnaques passées. Aucune exception.
```

**Chaque exemple nommé se reproduit.** Le mécanisme est établi : `\bpret(e|er)?\b`
(`server/antiscam.js:19`) attrape « prête » après suppression des accents ; `\d+ ?(f|fcfa|...)`
(`:28`) exige une devise, donc `10k`, `50 mille` et `20000` passent ; aucune règle ne couvre le
registre affectif.

En revanche, les **taux** ne tiennent pas. J'ai relancé les deux corpus d'origine :

```
<scratch>/audit2/corpus.mjs 0  →  Faux positifs 4/25 = 16 %  | Faux négatifs 10/25 = 40 % | exactitude 72 %
<scratch>/relation/corpus.mjs  →  Faux positifs 11/25 = 44 % | Faux négatifs 18/25 = 72 % | exactitude 42 %
```

Deux agents, le même code, deux corpus de 50 messages écrits à la main, et des taux qui varient d'un
facteur 1,8 à 2,8. Ni l'un ni l'autre corpus n'est publié dans l'audit. Un pourcentage qui dépend à
ce point de qui rédige les phrases mesure le rédacteur, pas le filtre. Les deux dossiers présentent
pourtant leur taux comme une propriété du produit, sans mentionner l'autre.

### 1.3 Quota du jour (DECOUVERTE-05, DECOUVERTE-06)

MESURÉ, `<scratch>/verif/m-quota.mjs`, serveur A, 1 compte + 25 cibles compatibles :

```
# vérification de 8000 : approved
# /discover : profils = 10 | remaining = 20
# 20 « Passer » : 20 acceptés, 0 refusés
# après 20 passer → /discover : profils = 0 | remaining = 0
# 21e action, un « J'aime » : 429 {"code":"DAILY_LIMIT","message":"Tu as vu tous tes profils du jour. Reviens demain."}
# /likes après quota : 1 profil | /summary = {"unread":0,"newMatches":0,"likes":1}
# réponse au like reçu : 429 DAILY_LIMIT
# /likes après l'échec : 1 profil
```

Identique aux deux constats, à la virgule près. Le message affiché — « Tu as vu tous tes profils du
jour » — est faux deux fois : la personne n'a liké personne, et cinq profils compatibles restent en
base.

### 1.4 Profil : promptQ hors filtre (INSCRIPTION-20)

MESURÉ, `<scratch>/verif/m-profil.mjs`. J'ai ajouté la contre-épreuve qui manquait au constat :

```
# PUT /me/profile avec promptQ = "WhatsApp 699 88 77 66 envoie moi 5000F" : 200
# promptQ relu dans publicProfile : "WhatsApp 699 88 77 66 envoie moi 5000F"
# le même texte dans promptA   : 400 PROFILE_CONTACT
# le même texte dans name      : 400 PROFILE_CONTACT
# le même texte dans area      : 400 PROFILE_CONTACT
# le même texte dans languages : 400 PROFILE_CONTACT
```

La même chaîne est refusée dans quatre champs sur cinq et acceptée dans le cinquième.
`server/routes.js:98` compose `profileText` avec `name`, `area`, `promptA` et `languages` ;
`promptQ` n'y figure pas, et `:107` l'écrit sans le moindre contrôle. Le constat est plus fort que
ce qu'il dit.

### 1.5 Âge : borne haute (INSCRIPTION-13)

```
# âge 120 : 400 {"code":"AGE_INVALID","message":"Odo est réservé aux 18 ans et plus."}
```

Une personne qui saisit 120 est informée qu'elle est trop jeune. Le constat annonçait une erreur mal
placée ; elle est en plus mal rédigée.

### 1.6 Débit sans limite (INSCRIPTION-27, VERIFICATION-02, RELATION-04, RELATION-12)

MESURÉ, en parallèle, sur un seul compte :

```
50 écritures de profil          : 57 ms,  50 acceptées, 0 refusée
30 demandes de geste            : 12 ms,  30 réponses 200, gestes distincts : 4
50 signalements, la MÊME cible  : 52 ms,  50 acceptés
30 propositions de rendez-vous  : 28 ms,  30 acceptées, 31 cartes empilées chez l'autre
```

Les durées diffèrent de celles du dossier (57 contre 138 ms, 12 contre 36 ms) ; la machine n'est pas
la même. Les comptes d'acceptations et de refus sont identiques : **aucun plafond, nulle part**.

### 1.7 Rendez-vous, blocage et check-in (RELATION-01, 10, 11, 12, 13, 14)

MESURÉ, `<scratch>/verif/m-relation.mjs`, après que 6002 a signalé et bloqué 6001 :

```
# message : 403 BLOCKED | proposition de rendez-vous : 403 BLOCKED | CHECK-IN : 200 {"arrived":true,...}
# 5 check-in successifs du même compte sur le même rendez-vous : 200, 200, 200, 200, 200
# check-in avec le code lu dans server/config.js : 200
# GET /venues : {"id":"palmier","name":"Le Palmier","area":"Bastos","city":"Yaoundé","perk":"-10 % avec Odo"}
# vu par 6002, qui n'est PAS arrivée : arrivals = {"6001":1789173620311} | arrivedMe = false
# créneau piégé accepté tel quel : "APPELLE MOI 677889900 URGENT ARGENT"
# POST /dates/:id/accept|decline|cancel|status → 404 NOT_FOUND (les quatre)
```

RELATION-01 est le constat le plus grave du lot et il tient sans réserve : les deux canaux de
contact sont fermés par le blocage, le troisième reste ouvert et déclenche `notify` vers la personne
qui a bloqué (`server/routes.js:436`).

### 1.8 Suppression du compte (RELATION-20, RELATION-21)

MESURÉ, lecture de `db.json` avant et après :

```
# blocks après signalement : [{"from":"5002","to":"5001","at":...}]
# après DELETE /api/me par 5002 → blocks la concernant : []
# après DELETE /api/me par 5002 → reports conservés : 1 {"id":...,"from":"5002","targetId":"5001",...}
# 5002 réinscrite avec le même identifiant : voit-elle 5001 ? true   |   5001 la voit-il ? true
```

Les deux constats se reproduisent. Supprimer son compte rend visible à son agresseur la personne qui
s'en était protégée, et laisse dans la base un signalement attribué à un compte qui n'existe plus.

### 1.9 Vérification (VERIFICATION-07, VERIFICATION-03, VERIFICATION-15)

```
# compte approved → start:200, verification:200 {"verification":"pending"} | avant: approved  après: pending
# accès à /discover pendant ce nouvel état : 403 NOT_VERIFIED
# clés d'un compte : id, firstName, languageCode, createdAt, profile, verification, pendingGesture,
#                    demo, lastNotifiedAt, lastActiveAt, photos
# uploads d'un compte jamais tranché (serveur C) : 990012-selfie.jpg, toujours présent, sans durée de vie
```

### 1.10 Écran d'attente (VERIFICATION-04, 05, 06)

MESURÉ, Playwright, serveur C :

```
# barre d'onglets masquée : true
# boutons : ["Fermer 160x50","Actualiser 160x50"] | éléments cliquables dans #app : 0
# après « Actualiser » : DOM de #app identique ? true | toast masqué avant/après : true / true
# 31 s sur l'écran d'attente : 6 requêtes API, 5 868 octets de corps → 697 requêtes/h
```

697 requêtes/h et 5 868 o/31 s : les mêmes chiffres que le dossier (697 et 6 306 o). Avec les
en-têtes, l'ordre de grandeur d'« environ 1 Mo par heure » tient.

### 1.11 Premier rendu otage du script Telegram (INSCRIPTION-02)

MESURÉ, Playwright, `telegram.org` mis en attente sans réponse :

```
# à 1000 ms : texte à l'écran = "(pas de body)" | paint = []
# à 3000 ms : texte à l'écran = "(pas de body)" | paint = []
# à 6000 ms : texte à l'écran = "(pas de body)" | paint = []
```

Pas de `<body>` du tout, zéro entrée `paint`. Le constat disait « rien n'est peint, pas même
Chargement… » ; c'est exact, et la cause est visible à `public/index.html:10` (balise `<script>`
sans `defer` ni `async`, dans le `<head>`, avant le corps de la page).

### 1.12 Échec du premier appel (INSCRIPTION-04)

```
# écran : "Ouvre Odo depuis Telegram" / "Pas de connexion. Vérifie ton réseau et réessaie." /
#         "Cherche le bot Odo dans Telegram, envoie /start, puis appuie sur « Ouvrir Odo »."
# barre de boutons masquée : true | boutons : 0 | liens : 0 | éléments cliquables : 0
```

Zéro issue, confirmé. Sur la répétition du texte, j'avais d'abord cru le constat inexact : dans le
cas d'une coupure réseau, les trois phrases diffèrent. Mais MESURÉ, `curl /api/me` sans en-tête :
`401 {"code":"UNAUTHORIZED","message":"Ouvre Odo depuis Telegram."}` — c'est le cas le plus
fréquent en vrai (app ouverte hors de Telegram), et le message du serveur est alors **mot pour mot**
le titre de l'écran. Le constat est exact.

### 1.13 « Afficher la photo » depuis une fiche (DECOUVERTE-12)

MESURÉ, Playwright, économie de data active, mode liste, fiche de P4001 ouverte :

```
# écran person avant : {"nom":"P4001 24","reveal":true,"boutons":["Passer","J'aime"],"dbar":false}
# écran APRÈS « Afficher la photo » : {"cartes":0,"dbar":true,"boutons":[]}
```

Pire que décrit. La personne ne quitte pas seulement la fiche : elle atterrit sur un écran Découvrir
**vide, sans une seule carte et sans un seul bouton**. `SCREENS.discover()` (`public/app.js:1159`)
peint son squelette puis sort à `:599` parce que `S.screen` vaut encore `person`. Seul un onglet
permet de repartir.

### 1.14 Vivier et genre (DECOUVERTE-01, DECOUVERTE-26)

MESURÉ, serveur B, population construite par l'API : 60 comptes vérifiés, 2 par
(ville x intention x genre), 5 villes x 3 intentions x 2 genres.

```
# femme, amitié, Yaoundé  → /discover : 5 profils  (4001, 4002, 4003, demo-brice, demo-nadege)
# femme, sérieux, Yaoundé → /discover : 3 profils  (4006, 4007, demo-junior)
# femme, duo, Yaoundé     → /discover : 5 profils
# intention amitié            : genres = homme + femme
# intention relation sérieuse : genres = homme uniquement
# intention duo               : genres = homme + femme
```

Quinze compartiments étanches (`server/routes.js:223`), plus une coupe supplémentaire au genre pour
la seule intention « relation sérieuse » (`:225`). Confirmé.

### 1.15 Ordre du paquet (DECOUVERTE-08)

```
# inscrits dans l'ordre 70009, 70003, 70007, 70001, 70005
# → paquet rendu : 70001, 70003, 70005, 70007, 70009
```

L'ordre d'inscription est perdu, l'ordre croissant des identifiants Telegram le remplace.

### 1.16 Jauge de confiance et match instantané (DECOUVERTE-13, DECOUVERTE-14)

```
# compte réel neuf : trust = {"selfie":true,"guarantor":false,"seniority":false}   → 1/3
# carte de Carine (démo) : trust = {"selfie":true,"guarantor":true,"seniority":true} → 3/3, verified: true
# un seul « J'aime » sur Carine : 200, MATCH IMMÉDIAT
```

Et le déséquilibre est structurel : `guarantor` est écrit en dur à `false` pour tout compte réel
(`server/routes.js:46`), le garant n'existe nulle part dans le code (feuille de route P1-6). Un
compte réel **ne peut pas dépasser 2/3** aujourd'hui ; un profil fictif affiche 3/3 dès le premier
jour.

### 1.17 Like reçu hors filtre d'âge (DECOUVERTE-07, RELATION-25)

```
# Diane, filtre 18-30, likée par Éric, 45 ans
# → /discover contient Éric ? false | /likes : Eric | /summary : {"unread":0,"newMatches":0,"likes":1}
```

La notification pointe vers `screen: 'discover'` (`server/routes.js:311`), où la personne n'est pas.
Elle est dans Messages. À noter, et les deux fiches l'omettent : le commentaire de
`server/routes.js:276-277` montre que les auteurs ont volontairement fait ignorer le filtre d'âge à
`/likes` « sinon "tu as plu à quelqu'un" mènerait parfois à un écran vide ». Ils ont vu le problème
et l'ont réglé pour `/likes`, puis ont câblé la notification sur le mauvais écran. C'est une erreur
de branchement, pas un oubli de conception.

### 1.18 Contrastes — la mesure qui met en cause un instrument

C'est le point où j'ai trouvé une vraie faute d'outil.

MESURÉ, Playwright, ce que Chromium renvoie réellement pour les couleurs du thème :

```
light  bodyColor "color(srgb 0.0960784 0.0913725 0.0941176)"  bodyBg "color(srgb 0.938039 0.925098 0.928235)"
dark   bodyColor "color(srgb 0.950196 0.943137 0.932549)"     bodyBg "color(srgb 0.0960784 0.0756863 0.075098)"
```

Toutes les couleurs dérivées de `color-mix()` sont sérialisées en `color(srgb …)`, composantes
entre 0 et 1. Or la fonction de luminance de `<scratch>/audit3/a11y.mjs:11` divise ces composantes
par 255, comme s'il s'agissait d'une valeur `rgb()` entre 0 et 255. MESURÉ,
`<scratch>/verif/lum.mjs`, sur les couleurs réelles ci-dessus :

```
clair : titre .display sur fond   a11y.mjs : 1.01   |   calcul correct : 15.18
clair : .eyebrow sur fond          a11y.mjs : 1.00   |   calcul correct : 3.70
sombre : titre .display sur fond   a11y.mjs : 1.01   |   calcul correct : 16.20
couleur de marque rgb() sur fond   a11y.mjs : 6.93   |   calcul correct : 2.57
```

Le script se trompe dans les deux sens : il condamne un titre parfaitement lisible (15,18 annoncé à
1,01) et innocente un texte illisible (2,57 annoncé à 6,93). Toute note appuyée sur ce script est à
reprendre.

J'ai donc refait la mesure avec un calcul correct (`<scratch>/verif/pw-contraste.mjs`, parseur
`color(srgb …)` traité) :

```
thème clair : welcome 8/13, étape 1 7/8, étape 2 7/11, étape 3 12/13 sous le seuil WCAG 2.2 AA
thème sombre : 0/13, 0/8, 0/11, 0/13
exemples reproduits : intitulés de champ 3,70 (seuil 4,5) ; sous-titres 4,17 (seuil 4,5) ;
                      numéro d'emplacement photo 1,05 (seuil 4,5, #f3ede4 sur --btn-secondary)
```

Et pour l'écran Découvrir, j'ai relancé `<scratch>/audit2/contraste2.mjs` — script différent, qui
**traite correctement** `color(srgb …)` à sa ligne 6 — contre ma propre population :

```
=== thème light : 13 textes sous le seuil sur 24 mesurés ===
  3.70 (4.5) 13px « 20 restants »          1.12 (3) 150px initiale d'avatar
  1.91 (3) 30px âge sur la carte           2.90 (3) 24px tampon « J'AIME »
  4.17 (4.5) 11px x 7 intitulés            1.91 (4.5) 13px « 2/3 »
=== thème dark : 1 texte sous le seuil ===
  2.78 (4.5) 11px pastille de compteur
--- cibles tactiles : 11 visibles, 0 sous 24x24, 9 sous 44x44
```

DECOUVERTE-21 se reproduit **exactement**, valeur par valeur. Le déséquilibre clair/sombre est réel.
La conclusion d'INSCRIPTION-11 se reproduit aussi, mais avec d'autres comptages.

### 1.19 Deux petites mesures de forme (INSCRIPTION-10, 22, 26)

```
# appuis de « Créer mon profil » jusqu'à l'écran de vérification : 9 (dont 3 sur des champs)
# écran atteint : « Vérifie que c'est bien toi » — aucun visage vu à ce stade
# étape 3 — éléments focalisables : button, select[promptQ], input[promptA], input[languages]
# étape 3 — liens (a href) : 0 ; liens dans tout public/app.js : 0
# défilement avant « Continuer » : 73 px → après affichage de l'étape 2 : 73 px
# mentions fines de welcome : 13px ratio 3,70 (et non 4,17)
# /confidentialite → 200 text/html 1 906 o ; /conditions → 200 1 906 o ; /nimportequoi → 200 1 906 o
```

Les « 9 taps » d'INSCRIPTION-10 tombent juste. Les trois emplacements photo sont bien hors du
parcours clavier (`<input type="file" hidden>` dans un `<label>`). Le défilement n'est pas remis à
zéro entre deux étapes. Et `/confidentialite` renvoie la même page que n'importe quelle adresse
inventée : `server/index.js:306` (`app.get('*', renderIndex)`).

---

## 2. Ce qui tombe

### 2.1 RETIRÉ — un constat

**RELATION-23 — « La liste des discussions ne dit jamais qui attend une réponse ».**
L'énoncé est contredit par sa propre preuve. `public/app.js:706` préfixe l'aperçu par « Toi : »
quand le dernier message est le tien, et `:708` affiche le compte de non-lus. La liste dit donc,
ligne par ligne, qui a parlé en dernier et combien de messages attendent. La fiche le reconnaît
elle-même à la ligne 425 (« l'auteur du dernier message n'apparaît que dans l'aperçu textuel »),
mais le titre et le résumé disent « jamais ». Je ne réécris pas le titre pour le sauver.

Ce qui reste, **dégradé en hypothèse** : il n'existe ni tri ni marque explicite « à toi de
répondre », alors que la logique correspondante existe déjà pour la liste des profils
(`server/routes.js:249`, `:268-270`). Test qui trancherait : montrer la liste à dix personnes avec
trois discussions dont deux attendent leur réponse, et mesurer combien identifient les deux bonnes
en moins de cinq secondes. Tant que ce test n'est pas fait, ce n'est pas un constat.

### 2.2 RETIRÉ — trois chiffres à l'intérieur de constats qui, eux, tiennent

**INSCRIPTION-11 — les quatre comptages et l'outil cité.** La preuve dit « MESURÉ (a11y.mjs) :
welcome 5/10, étape 1 7/8, étape 2 7/11, étape 3 9/10 ». J'ai prouvé que `a11y.mjs` calcule faux
(§1.18). Deux comptages sur quatre se reproduisent avec un calcul correct (7/8 et 7/11), deux ne se
reproduisent pas (je trouve 8/13 et 12/13). Une mesure issue d'un instrument faux n'est pas une
mesure : elle ne peut pas soutenir une note. Les chiffres d'origine sont retirés et remplacés par
les miens. **Les trois ratios cités en exemple (3,70 ; 4,17 ; 1,05) sont exacts** et se reproduisent
tous les trois.

**RELATION-06 — « 44 % du langage courant bloqué », « exactitude globale 42 % ».**
**RELATION-07 — « 72 % des formulations d'arnaque passent », « 76 % après le dixième ».**
Le dossier `02-mesures.md` §3.2, sur un autre corpus de 50 messages, annonce 16 %, 40 % et 72 %
d'exactitude. J'ai relancé les deux corpus : les deux sortent bien ce qu'ils annoncent (§1.2). Le
code est le même ; seules les phrases changent. Un taux qui varie d'un facteur 2,8 selon le rédacteur
du corpus ne mesure pas le produit, et aucun des deux corpus n'est publié dans l'audit. Les quatre
pourcentages sont retirés.

Ce qui reste, et qui est solide : **chacun des dix-neuf exemples nommés par ces deux constats se
reproduit à l'identique** (§1.2), règle par règle, ligne par ligne. C'est suffisant pour fonder les
deux constats sans aucun pourcentage. Test qui donnerait un vrai taux : étiqueter les messages
réellement envoyés pendant la bêta fermée, sur au moins 500 messages, et rejouer `checkMessage`
dessus. Aucun corpus écrit par un agent ne remplacera cela.

---

## 3. Ce qui est dégradé — AFFAIBLI

**INSCRIPTION-01 — gravité 4 non tenable.**
Le fait est exact : `server/bot.js:108` rend `reply_markup` conditionnel à `config.webAppUrl`, et
`:27` fait de même pour toutes les notifications. Mais `server/config.js:265-266` dérive l'adresse de
`RENDER_EXTERNAL_URL` ou de `FLY_APP_NAME`, et `README.md:261` dit explicitement de laisser
`WEBAPP_URL` vide chez Render. Sur les deux hébergeurs décrits par le dépôt (`fly.toml`,
`render.yaml`), le bouton existe. Le cas sans bouton suppose un troisième hébergeur et une variable
oubliée, avec un avertissement au démarrage (`server/index.js:319`). « Aucune entrée dans l'app »
reste vrai dans ce cas ; la gravité 4 ne s'y applique pas. Hypothèse à trancher : déployer une fois
sur Fly et sur Render sans `WEBAPP_URL` et observer `/start`.

**INSCRIPTION-12 — le ratio cité est faux.** Les deux mentions fines de `welcome` sont à
13 px et **3,70**, pas 4,17 (MESURÉ, §1.19). La vraie valeur est pire que celle annoncée, ce qui ne
la rend pas plus juste. Le reste du constat (`maximum-scale=1` à `public/index.html:5`, mentions
décisives en petit corps) tient.

**INSCRIPTION-21 — « le clavier se referme » n'est pas mesuré.** Que l'étape entière soit
reconstruite et le focus perdu est certain (`public/app.js:1234` et `:1167` appellent
`SCREENS.profile()`, qui remplace `app.innerHTML` à `:523`). Que le clavier Android se referme est
une conséquence probable, jamais observée sur un appareil. Test qui trancherait : un Android réel,
curseur dans « Ta réponse », appui sur la croix d'un emplacement photo, observation du clavier.

**DECOUVERTE-15 — le chiffre de 122 880 octets appartient au fichier envoyé, pas au produit.**
Le mécanisme est confirmé : `GET /api/photos/<id>/1` et `GET /api/photos/<id>` renvoient exactement
le même fichier, octet pour octet, que la destination soit une carte plein écran ou une vignette de
40 px (MESURÉ, 5 287 o des deux côtés avec mon fichier). Mais la photo mesurée par le constat a été
déposée par l'API, sans passer par `compressImage` (`public/app.js:82`, 720 px, qualité 0,8), qui
plafonne ce qu'un vrai téléphone envoie. Le chiffre est à remplacer par la mesure d'une photo passée
par l'app.

**DECOUVERTE-20 — « rien ne permet de revenir en arrière » est trop large.**
Le corps de la fiche est juste : « un Passer peut redevenir J'aime, l'inverse jamais ». C'est
exactement ce que fait `server/routes.js:298-300`, et `public/app.js:642` propose même « Tu avais
passé ce profil. Tu peux revenir sur ta décision. » Il n'existe aucune annulation d'un **like** ;
c'est ce qu'il faut écrire. Le seuil de geste (`public/ui.js:112`, `:119-122`) est confirmé au mot
près.

**RELATION-13 — « constante publiée » n'est pas vérifié.**
Tout le reste tient et se reproduit : check-in accepté avec le code lu dans `server/config.js:303`,
cinq confirmations successives acceptées pour la même personne et le même rendez-vous. Mais le code
n'est pas servi par l'API (MESURÉ, `GET /venues` renvoie l'objet sans le champ `code`,
`server/routes.js:414`) et `/qr/:id.png` exige `ADMIN_KEY` (`server/index.js:282`). « Publiée »
suppose que le dépôt `github.com/BacBacta/Mbolo-miniapp` soit public : je ne l'ai pas vérifié, et je
n'ai pas à le faire depuis cette session. À écrire : « codée en dur dans le dépôt et jamais
renouvelée ». Test qui trancherait : ouvrir l'adresse du dépôt sans être connecté.

**RELATION-30 — « deux sondages perdus suffisent » ouvre une fenêtre de 2 secondes, pas un état.**
Arithmétique : dernier sondage réussi à t = 0, présence valable jusqu'à t = 10
(`server/store.js:197`), sondages perdus à t = 4 et t = 8, sondage suivant à t = 12. Le serveur croit
la personne partie entre t = 10 et t = 12 seulement. Il faut un troisième sondage perdu pour ouvrir
six secondes. Le défaut existe, sa portée est plus étroite que l'énoncé. La correction proposée
(porter la fenêtre à 15 s) reste la bonne.

---

## 4. Ce qui tient

Les 67 constats majeurs restants ont été rouverts à la ligne citée. **La ligne dit ce qu'on lui fait
dire dans tous les cas.** Les points que j'ai cherché à casser sans y parvenir, et qui ressortent
plus solides qu'ils n'entrent :

| Constat | Ce que j'ai tenté | Résultat |
|---|---|---|
| RELATION-01 | trouver un contrôle de blocage dans `/dates/:id/checkin` | aucun : `loadMatch` n'est pas appelé, seul `m.users.includes` est vérifié (`routes.js:428-437`). Message 403, rendez-vous 403, check-in 200 |
| INSCRIPTION-20 | montrer que le front verrouille `promptQ` | le front propose une liste (`app.js:518`), le serveur accepte n'importe quoi (`routes.js:107`). Contre-épreuve : refusé dans les 4 autres champs |
| VERIFICATION-10 | trouver un `deleteMessage` ailleurs | `grep -rn "deleteMessage" server/` : aucun. Le fichier local est bien effacé (`bot.js:90`), le message du groupe reste |
| VERIFICATION-01 | trouver un garde-fou contre `AUTO_APPROVE` en production | aucun dans le code. `fly.toml:15-16`, `render.yaml:17-20`, `.env.example:21,24` valent `true`. Le README avertit (`:267`, `:343`) — un avertissement n'est pas un garde-fou |
| DECOUVERTE-12 | montrer que la sortie de la fiche est bénigne | plus grave que décrit : 0 carte, 0 bouton (§1.13) |
| RELATION-05 | trouver un compteur par expéditeur | `routes.js:374` passe `store.messagesOf(...).length`, tous expéditeurs confondus. Onzième message d'un seul compte, contenant un numéro : accepté |
| DECOUVERTE-05 | trouver la trace d'un quota réservé aux likes | `store.js:157-161` ne filtre pas sur `action`. Le commentaire de `routes.js:246-247` affirme l'inverse de ce que fait le code |
| INSCRIPTION-08 | trouver les « règles de la communauté » quelque part | une seule occurrence dans tout le dépôt, la phrase de `app.js:452` elle-même. 0 lien dans tout le front. Acceptation stockée nulle part |
| INSCRIPTION-17 | trouver du code propre au mode « duo » | `grep -rn duo server/ public/` : un libellé, une icône, deux profils de démonstration. Aucune règle |
| VERIFICATION-18, RELATION-31 | trouver un test sur ces routes | `grep` sur `test/` : aucune requête vers `/me/verification`, aucun `dates`, `checkin`, `/reports`, `unmatch` |
| INSCRIPTION-07 | trouver un repli `@supports` pour `color-mix()` | aucun. Dix variables de fond et de texte n'existent que sous cette forme (`styles.css:39-43`, `:52`, `:60-64`) |
| DECOUVERTE-23, RELATION-32, INSCRIPTION-28 | trouver une trace d'événement | `db.json` contient exactement `users, swipes, matches, messages, reports, blocks, dates`. Aucun outil de mesure dans le dépôt |
| RELATION-28 | trouver un rappel non déclenché par une requête | douze appels à `notify`, tous déclenchés par un appel HTTP ou une décision de modération. Les trois `setTimeout` du serveur sont l'auto-validation et les deux comportements de démonstration |
| VERIFICATION-20, VERIFICATION-21 | contester la joignabilité du cas | les fiches donnent le chemin exact (`bot.js:88` remet `pendingGesture` à `null` pendant que l'écran est ouvert ; renvoi après erreur à `app.js:919`). Mon objection tombe |
| DECOUVERTE-17 | contester « rechargement à chaque balayage » | la fiche ne dit pas cela : elle dit que la liste est invalidée et rechargée quand elle est rouverte. Exact. C'est le résumé d'une ligne qui déforme |

---

## 5. Doublons

Dix groupes, vingt et un identifiants. Onze identifiants peuvent disparaître sans perdre un seul
fait. Les 113 constats couvrent environ **103 faits distincts**.

| # | Identifiants | Nature |
|---|---|---|
| 1 | **DECOUVERTE-07 ≡ RELATION-25** | même fait, même preuve, même gravité, même risque R6 : la notification « tu as plu à quelqu'un » pointe vers un écran filtré par l'âge |
| 2 | **DECOUVERTE-11 ≡ RELATION-29** | même fait, mêmes lignes (`store.js:157-160`, absence de `TZ`), même risque R6 |
| 3 | **DECOUVERTE-29 ≡ RELATION-22** | même fait (le profil disparaît au moment où l'app dit de s'en servir), même risque R4, **deux gravités différentes : 3 et 4** |
| 4 | **INSCRIPTION-09 ≡ VERIFICATION-01** | même fait (`AUTO_APPROVE=true` livré), même gravité 4, même sécurité directe, même risque R5. Deux formulations d'une seule ligne de configuration |
| 5 | **DECOUVERTE-13 ≡ VERIFICATION-17** | même fait (la jauge avantage les profils fictifs), même risque R5 |
| 6 | **DECOUVERTE-04 ≡ INSCRIPTION-16** | même fait (villes sans lieu partenaire), **rattaché à deux risques différents** : R5 avec sécurité directe d'un côté, R1 avec sécurité indirecte de l'autre. C'est le cas exact que la consigne demandait de chercher |
| 7 | **DECOUVERTE-28 ≡ RELATION-17** | même fait (pas de retrait sans accusation), même gravité 3, **deux étiquettes de sécurité : directe et indirecte** |
| 8 | **INSCRIPTION-27 ≡ VERIFICATION-09** | même fait, même mesure (un compte inonde la file de modération), même risque R3 |
| 9 | **INSCRIPTION-28 ≡ DECOUVERTE-23 ≡ RELATION-32** | trois identifiants pour une seule absence : aucun horodatage, aucune impression, aucun événement. **Trois gravités : 3, 0 et 0** |
| 10 | **INSCRIPTION-03 ⊃ DECOUVERTE-16** | la seconde moitié de DECOUVERTE-16 (« aucune compression HTTP ») répète INSCRIPTION-03 en entier. Le préchargement de la carte suivante, lui, est propre à DECOUVERTE-16 |

**Une famille, pas un doublon, à signaler quand même.** INSCRIPTION-27, VERIFICATION-02,
VERIFICATION-09, RELATION-04 et RELATION-12 décrivent cinq surfaces différentes d'un seul mécanisme
absent : la limitation de débit, inscrite en P0-3 de la feuille de route. Ce sont cinq constats
légitimes ; c'est une seule correction.

**Incohérences de notation révélées par les doublons.** Trois paires portent des gravités ou des
étiquettes de sécurité différentes pour le même fait (groupes 3, 6, 7, 9). Aucune raison ne peut le
justifier : soit le fait touche directement la sécurité, soit non. Il faut trancher avant de trier.

---

## 6. Ce que cette passe n'a pas pu trancher

- **Tout ce qui suppose un envoi Telegram réel.** `BOT_TOKEN` est vide dans mes trois serveurs.
  VERIFICATION-10, -11, -12, -13, RELATION-03 et RELATION-26 reposent sur la lecture du code et sur
  un faux Telegram monté par un autre agent. Le code est sans ambiguïté ; le comportement réel de
  l'API Telegram ne l'est pas. Test qui trancherait : un bot de test et un groupe privé, avec
  `ADMIN_CHAT_ID` renseigné.
- **Le comportement sur un Android d'entrée de gamme.** Chromium à 360 x 740 n'est ni la WebView de
  Telegram, ni un appareil lent, ni un clavier virtuel. Tout ce qui touche au clavier
  (INSCRIPTION-21, INSCRIPTION-25) et au rendu (INSCRIPTION-02) reste à confirmer sur téléphone.
- **La visibilité du dépôt GitHub** (RELATION-13).
- **Les taux d'erreur réels de l'anti-arnaque**, qui ne s'obtiendront que sur des messages réels.
- **Le support de `color-mix()` dans la WebView des téléphones visés** (INSCRIPTION-07). Le défaut de
  repli est certain ; la part d'appareils concernés ne l'est pas. Test qui trancherait : ouvrir l'app
  dans une WebView Chrome antérieure à la version 111.

---

## 7. Verdict de calibrage

Je retire un constat sur 113 et quatre chiffres à l'intérieur de constats qui, eux, tiennent.
J'affaiblis six autres. Cela fait onze corrections sur 113, soit environ un constat sur dix touché.

Ce taux est bas. Deux raisons, vérifiables :

1. **La majorité des constats sont des VU sur un dépôt de 4 209 lignes.** Quand un constat dit
   « `server/routes.js:436` appelle `notify` sans contrôle de blocage », il n'y a pas de place pour
   l'interprétation. Les cinquante-huit constats que j'ai rouverts ligne à ligne disent tous ce que
   la ligne dit.
2. **Les mesures d'exécution se reproduisent presque toutes au chiffre près** : 20 « Passer » puis
   429, 697 requêtes/h sur l'écran d'attente, 9 taps jusqu'à la vérification, 5 check-in successifs
   acceptés, 13 textes sous le seuil en clair contre 1 en sombre, `arrivals` fuité à la milliseconde.
   Quand les chiffres ont bougé, ce sont des durées d'exécution (57 ms contre 138 ms), qui dépendent
   de la machine et ne portent aucune conclusion.

Là où l'audit est réellement mal calibré, ce n'est pas sur les faits, c'est sur trois points :

- **un instrument faux a produit des notes** (`a11y.mjs`, §1.18), et personne ne l'a vérifié avant de
  s'en servir ;
- **deux agents ont mesuré la même chose et sont arrivés à des taux incompatibles** sur l'anti-arnaque,
  sans qu'aucune des deux fiches ne mentionne l'autre ;
- **un fait sur dix est compté deux fois**, parfois avec deux gravités et deux étiquettes de sécurité
  contradictoires.

Ces trois défauts n'invalident pas les constats. Ils invalident le classement qu'on voudrait en
tirer. Tant que les doublons ne sont pas fusionnés et les gravités arbitrées, la liste ne peut pas
servir de file de travail.
