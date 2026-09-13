# Odo — plan de mesure produit

Phase 5 de l'audit. Ce fichier ne mesure rien : il dit **ce qu'il faut poser dans le code** pour que
la bêta fermée produise enfin des chiffres, et **ce que ces chiffres auront le droit de dire**.

---

## 0. L'avertissement qui conditionne tout le dossier

**L'application ne comporte aucune analytique.**

MESURÉ, commande `grep -rniE "analytics|gtag|posthog|amplitude|mixpanel|track\(" server/ public/` —
sortie vide. VU `server/store.js:9` : la base contient exactement `users, swipes, matches, messages,
reports, blocks, dates`. Aucune table d'événements, aucun outil tiers, aucun journal d'interface.

**Conséquence, à rappeler chaque fois que ce dossier est cité** : l'audit entier est **structurel**.
Il décrit des mécanismes vérifiés dans le code et en exécution. Il ne dit **jamais** combien de
personnes sont touchées, combien abandonnent, ni à quelle étape — parce que personne ne peut le
savoir aujourd'hui, ni rétroactivement. Les notes de `audit/04-risques.md` portent sur des mécanismes,
pas sur des fréquences.

**Ce qui est déjà mesurable** sans écrire une ligne, par simple lecture de `db.json` (VU) :

| ce qui est daté | où | ce qu'on peut déjà en tirer |
|---|---|---|
| création du compte | `server/store.js:55` (`createdAt`) | cohortes hebdomadaires d'inscription |
| balayage, avec l'action | `server/store.js:136` (`db.swipes[].at`, `.action`) | likes et passes par personne et par jour |
| match | `server/store.js:167` (`createdAt`) | délai like → match |
| message | `server/store.js:214` (`at`, `from`) | premier message, longueur des échanges |
| signalement | `server/store.js:222` (`at`) | signalements pour 100 matchs |
| blocage | `server/store.js:227` (`at`) | blocages pour 100 matchs |
| proposition de rendez-vous | `server/store.js:235` (`createdAt`) | propositions pour 100 discussions |
| arrivée confirmée | `server/routes.js:434` (`arrivals[userId]`) | check-in pour 100 propositions |
| dernier passage | `server/store.js:203-206` (`lastActiveAt`) | qui est inactif **aujourd'hui**, jamais depuis quand |

**Ce qui n'est daté nulle part**, et qui est exactement ce qui manque pour décider (VU) : l'ouverture
de l'app, l'étape atteinte dans le formulaire, l'envoi du selfie (`server/routes.js:128` écrase une
chaîne), la décision de modération (`server/bot.js:88` écrase la même chaîne), la carte affichée,
l'écran vide rendu, le blocage anti-arnaque, la suppression du compte.

---

## 1. Les six règles de minimisation

Elles ne sont pas négociables et elles s'appliquent à chaque champ de ce document. CLAUDE.md §5.4 :
toute nouvelle donnée personnelle doit être minimale, justifiée, supprimée par `DELETE /api/me`, et
signalée dans le README (loi camerounaise n° 2024/017).

1. **Aucun contenu.** Aucun événement ne porte de texte de message, de prénom, de quartier, de langue,
   de geste, de photo, de selfie, ni aucun champ de profil. Uniquement des identifiants déjà stockés,
   des noms d'événement et des compteurs.
2. **Aucun identifiant nouveau.** `u` est l'identifiant Telegram déjà présent dans `db.users`
   (VU `server/store.js:41`). Aucun identifiant de session, aucune empreinte de navigateur, aucune
   adresse IP, aucun agent utilisateur.
3. **Effacement réel.** Chaque champ ajouté doit disparaître avec le compte. Les six horodatages de
   §3 vivent dans l'objet utilisateur, donc `delete db.users[id]` (VU `server/store.js:77`) les efface
   déjà. La table `events`, elle, **ne s'efface pas toute seule** : elle exige une ligne dans
   `deleteUser`, décrite en §2.4. **Sans cette ligne, tout ce plan est en infraction avec CLAUDE.md §5.4.**
4. **Durée de conservation écrite.** Une variable `EVENTS_RETENTION_DAYS`, valeur par défaut sûre,
   documentée dans `.env.example` et le README (§7).
5. **Exclusion avant tout calcul.** Profils de démonstration, comptes de développement et périodes de
   validation automatique sont retirés **en amont**, jamais après coup (§4).
6. **Aucun repère de marché transformé en objectif.** SOURCE (secondaire, pages sources inaccessibles,
   403 et 429) : repères de rétention du secteur des rencontres, J1 autour de 24 à 26 %, J30 autour de
   5 à 7 %. **Limite de comparabilité** : apps installées depuis une boutique, sur d'autres marchés,
   avec un vivier installé. Ces valeurs servent à situer un ordre de grandeur, **jamais** à fixer une
   cible ni à déclarer une réussite. Odo se compare à lui-même dans le temps.

---

## 2. Dictionnaire d'événements

### 2.1 La forme d'une ligne

Table `events`, à ajouter dans `db.json` à côté des sept existantes (VU `server/store.js:9`).

```js
{ id: '<8 octets hex>', u: '<identifiant Telegram>', k: '<nom>', at: <ms>, p: { … } }
```

`id` est produit par `newId()`, qui existe déjà (VU `server/store.js:33`). `p` est **facultatif** et
ne contient que des nombres, des booléens ou des mots-clés fermés — jamais de texte libre.

MESURÉ, coût réel d'une ligne (`node -e "Buffer.byteLength(JSON.stringify(...))"`) :

```
{"id":"a1b2c3d4e5f60718","u":"6123456789","k":"profile_saved","at":1789173620311}          81 octets
{"id":"a1b2c3d4e5f60718","u":"6123456789","k":"selfie_sent","at":1789173620311,"p":{"step":3}}  94 octets
```

**81 octets par ligne nue, 94 avec une charge utile courte.** Pour mille comptes produisant chacun
quarante événements : MESURÉ, **environ 3,1 Mio** sur le disque. C'est du même ordre que les photos
de vingt-cinq comptes (VU `server/routes.js:60` : 1,5 Mio par image acceptée). Le stockage n'est pas
le sujet ; la fréquence d'écriture l'est, et elle est traitée en §2.3.

### 2.2 Les événements à poser

Colonne « où » : le point exact du code, avec la ligne actuelle.

| nom | quand | où le poser | charge utile | pourquoi, et quel constat il ferme |
|---|---|---|---|---|
| `app_opened` | à chaque ouverture, **au plus une par heure et par personne** | `server/routes.js:69`, dans `GET /me`, même garde que `touchActivity` (VU `server/store.js:205`) | aucune | seul événement de fréquence du plan. Sans lui, `lastActiveAt` (écrasé) ne dit jamais **quand** quelqu'un est parti. Ferme la moitié de MESURE-01 |
| `form_step` | étape maximale atteinte dans le formulaire | **pas d'appel réseau supplémentaire** : écrire l'étape dans CloudStorage (VU `public/tg.js:205-210`, `cloudSet` existe) à `public/app.js:876`, et la joindre au prochain appel déjà prévu — `PUT /me/profile` (`server/routes.js:87`) ou `GET /me` à l'ouverture suivante | `{ step: 1..3 }` | c'est **la seule** mesure d'abandon de formulaire possible. La variante naïve — un POST par étape — coûterait deux requêtes d'environ 300 o par inscription sur un forfait compté ; la variante retenue coûte **0 octet de requête** |
| `profile_saved` | profil accepté | `server/routes.js:112`, dans le même `store.updateUser` | aucune | borne basse de l'entonnoir |
| `selfie_sent` | selfie accepté et mis en attente | `server/routes.js:128`, dans le même `store.updateUser` | aucune | **le point de départ du délai de modération, qui n'existe nulle part aujourd'hui**. Ferme VERIFICATION-03 |
| `verif_decided` | décision rendue | `server/bot.js:88`, dans le même `store.updateUser` | `{ ok: true\|false, auto: true\|false, ms: <délai depuis selfie_sent> }` | **le chiffre qui manque le plus à l'équipe.** `auto` est obligatoire : sans lui, toute médiane calculée pendant une période `AUTO_APPROVE=true` vaut 3 000 ms et ment (VU `server/routes.js:133`) |
| `verif_retried` | nouveau geste demandé après un refus | `server/routes.js:119`, quand `req.user.verification === 'rejected'` | aucune | combien de personnes reviennent après un refus. Ferme la moitié de VERIFICATION-13 |
| `deck_served` | paquet rendu non vide, **au plus un par 5 min et par personne** | `server/routes.js:248`, avant le `res.json` | `{ n: <cartes>, r: <remaining> }` | l'impression, aujourd'hui totalement invisible. Ferme MESURE-01 côté découverte |
| `deck_empty` | paquet rendu vide | `server/routes.js:235` (quota) et `:248` (liste vide) | `{ why: 'quota'\|'vide' }` | **le symptôme n°1 d'un lancement à vivier vide** (R1). Sans lui, personne ne saura jamais combien de personnes vérifiées n'ont jamais vu une seule carte |
| `quota_hit` | 429 sur un balayage | `server/routes.js:295` | `{ action: 'like'\|'pass' }` | permet de vérifier l'effet de la correction du quota (DECOUVERTE-05), avant et après |
| `antiscam_block` | message refusé par le filtre | `server/routes.js:375` | `{ c: 'MONEY'\|'CONTACT' }` — **jamais le texte, jamais la règle déclenchée** | **le seul moyen honnête d'obtenir un jour les taux que la passe adverse a retirés.** Ferme RELATION-09 |
| `account_deleted` | suppression du compte | `server/routes.js:152`, **avant** `store.deleteUser` | `{ c: '<cohorte ISO semaine>', d: <jours depuis createdAt> }` et **pas de champ `u`** | seule sortie observable du produit. Sans `u`, la ligne survit à l'effacement sans permettre aucune réidentification — c'est la seule exception à la règle 2, et elle est ce qui rend le churn dur calculable |

### 2.3 Ce qu'il ne faut surtout pas poser

- **Un événement par sondage.** La discussion interroge toutes les 4 s et le résumé toutes les 20 s
  (VU `public/app.js:730`, `:126`). Un événement par appel écrirait `db.json` des centaines de fois
  par heure et par personne, pour une information nulle. Le débit d'écriture est déjà le point faible
  du stockage actuel (VU `server/store.js:26-33` : une écriture complète du fichier, groupée à 200 ms).
- **Un événement d'erreur envoyé au moment de l'erreur.** VU `public/app.js:65` : le message d'échec
  réseau part quand le réseau est mauvais ; y ajouter une requête, c'est ajouter une requête au pire
  moment. SUPPOSÉ : accumuler les erreurs dans CloudStorage et les joindre au démarrage suivant serait
  suffisant. Test qui trancherait : compter, sur deux semaines, combien d'erreurs sont effectivement
  remontées par cette voie contre le nombre d'échecs observés côté serveur (401, 429, 5xx).
  **À reporter en vague 3** : l'entonnoir passe d'abord.
- **Un événement par carte vue individuellement.** `deck_served` avec `n` suffit et coûte une ligne
  au lieu de dix.

### 2.4 La ligne sans laquelle ce plan est illégal

Dans `deleteUser` (VU `server/store.js:75-92`), à côté de la ligne qui purge déjà les balayages
(VU `server/store.js:78`) :

```js
db.events = db.events.filter((e) => e.u !== id);
```

`account_deleted` n'ayant pas de champ `u`, il survit — c'est voulu, documenté, et c'est le seul
champ du plan qui survit à une suppression. Tout le reste disparaît.

**À vérifier par un test**, dans le même esprit que les tests existants : après `DELETE /api/me`,
`db.events.filter(e => e.u === id).length === 0`. Ce test n'existe pas aujourd'hui, et aucun test
ne couvre non plus `DELETE /api/me` (MESURÉ, `grep -rn "delete" test/`).

---

## 3. Les horodatages manquants, et leur coût exact

Six champs, posés dans l'objet utilisateur, **dans des appels à `store.updateUser` qui existent déjà** :
aucune écriture supplémentaire de `db.json`, aucun appel réseau, aucun champ de profil touché.

| champ | où exactement | octets (MESURÉ) | ce qu'il rend calculable |
|---|---|---|---|
| `profileSavedAt` | `server/routes.js:112` — `store.updateUser(req.user.id, { profile })` devient `{ profile, profileSavedAt: Date.now() }` | 30 | ouverture → profil |
| `selfieSentAt` | `server/routes.js:128` — `store.updateUser(u.id, { verification: 'pending' })` | 28 | profil → selfie, et borne basse du délai de modération |
| `verifDecidedAt` | `server/bot.js:88` — `store.updateUser(userId, { verification: …, pendingGesture: null })` | 33 | **délai de modération**, le chiffre absent |
| `firstLikeAt` | `server/routes.js:297` — dans `addSwipe`, si `action === 'like'` et champ vide | 27 | vérification → premier like |
| `firstMatchAt` | `server/routes.js:306` — à la création du match | 28 | premier like → premier match |
| `firstMessageAt` | `server/routes.js:377` — à `addMessage`, si champ vide | 30 | **match → premier message : la mesure directe du silence après le match (R4)** |

MESURÉ, commande `node -e "Buffer.byteLength(JSON.stringify({profileSavedAt:…, …}))"` :
**181 octets par compte**, une fois pour toutes, dans un objet utilisateur qui en pèse déjà plusieurs
centaines. `createdAt` existe déjà (VU `server/store.js:55`) et fournit le point de départ.

**Trois horodatages qui existent déjà et qu'il ne faut pas redoubler** : `db.matches[].createdAt`
(VU `server/store.js:167`), `db.dates[].createdAt` (VU `server/store.js:235`) et
`db.dates[].arrivals[userId]` (VU `server/routes.js:434`). Le seul manquant côté rendez-vous est
`statusAt`, la date de la transition de statut — et il **naîtra avec P0-4**, puisque aucun statut ne
change aujourd'hui (MESURÉ : `accept`, `decline`, `cancel`, `status` renvoient tous 404).

**Où les effacer** : nulle part. Les six champs vivent dans `db.users[id]`, que `deleteUser` supprime
en entier (VU `server/store.js:77`). C'est la raison de les mettre là plutôt que dans une table à part.

---

## 4. Les trois exclusions, et pourquoi elles doivent être en amont

### 4.1 Profils de démonstration

VU `server/seed.js:6-11` : six comptes, identifiants préfixés `demo-`. VU `server/seed.js:23` : tous
portent `demo: true`.

**Le piège** : leurs likes, leurs matchs et leurs messages sont écrits **dans les mêmes tables que les
vrais** (VU `server/routes.js:304` : le profil de démonstration like en retour ; `:389` : il répond
après un délai). Exclure l'auteur ne suffit donc pas : il faut exclure la **paire**.

Règle à écrire une fois, et à appeler partout :

```js
const reel = (id) => { const u = store.getUser(id); return !!u && !u.demo && !u.devUser; };
const matchReel = (m) => m.users.every(reel);
```

Sans cette règle, MESURÉ : un seul « J'aime » sur Carine produit un match immédiat (DECOUVERTE-14).
Un tableau de bord naïf afficherait un taux de match proche de 100 %.

### 4.2 Mode développement

VU `server/auth.js:57-60` : quand `ALLOW_DEV_AUTH` est actif, un en-tête `x-dev-user` crée un compte
avec `first_name: 'Testeur'` et un identifiant libre. **Rien ne le distingue en base** : ni préfixe,
ni marqueur. Après coup, un compte de test est indiscernable d'un vrai.

**Correction nécessaire** : poser `devUser: true` au moment de la création, à `server/auth.js:59`.
Un booléen, 16 octets, justifié uniquement par la mesure, effacé par `DELETE /api/me` comme le reste
de l'objet utilisateur. C'est le seul champ de ce plan qui n'a aucun usage produit — et sans lui,
aucun chiffre de la bêta n'est défendable, puisque l'équipe teste sur le même serveur.

Note : `config.allowDevAuth` est déjà neutralisé en production (VU `server/config.js:29` :
`&& process.env.NODE_ENV !== 'production'`). Le marqueur sert donc à nettoyer l'historique de
développement, pas à se protéger d'une faille.

### 4.3 Validation automatique

VU `server/config.js:27` et `server/routes.js:133` : quand `AUTO_APPROVE` est actif, la décision tombe
3 000 ms après l'envoi, sans humain. MESURÉ : `fly.toml:16`, `render.yaml:19-20` et `.env.example:21`
valent `true`, avec `NODE_ENV=production`.

**Règle** : `verif_decided` porte `auto: config.autoApprove`. Tout calcul de délai de modération
**exclut** les lignes `auto: true`. Sans cela, la médiane du délai de modération vaudra 3 secondes et
l'équipe croira son plafond de débit résolu.

Corollaire à écrire dans le README : **toute statistique produite sur une période où `AUTO_APPROVE`
valait `true` est nulle et non avenue pour la vérification.** Ce n'est pas un filtre de confort, c'est
la différence entre mesurer un produit et mesurer une horloge.

---

## 5. Activation, churn, métrique phare

### 5.1 Activation

> **Une personne est activée quand, dans les 14 jours suivant sa première ouverture, elle a un profil
> enregistré, une vérification approuvée par un humain, et a envoyé au moins un message dans une
> discussion avec une personne réelle.**

Trois choix à défendre :

- **Le message, pas le like ni le match.** VU `server/routes.js:307` : un like non rendu ne produit
  rien pour son auteur. MESURÉ : un match avec un profil de démonstration est automatique. Le message
  est le premier acte qui exige que **deux personnes réelles** aient agi.
- **« Approuvée par un humain ».** Les décisions `auto: true` ne comptent pas (§4.3).
- **14 jours et pas 7.** SUPPOSÉ. Aucune donnée d'usage n'existe, et le délai de modération n'a jamais
  été mesuré (VERIFICATION-03) : une fenêtre de 7 jours mesurerait la disponibilité du modérateur
  autant que l'intérêt de la personne. Test qui trancherait : après la première mesure du délai de
  modération, vérifier que le 90e centile tient dans la fenêtre ; si oui, resserrer à 7 jours.

Calculable avec : `createdAt` (VU `server/store.js:55`), `profileSavedAt`, `verifDecidedAt`,
`db.messages[mid][].at` et `.from` (VU `server/store.js:214`), plus les exclusions de §4.

### 5.2 Churn

Deux définitions, parce qu'aucune ne suffit seule.

**Churn dur** — `account_deleted` (VU `server/routes.js:152`). Observable, sans ambiguïté, mais rare :
c'est le plancher, pas la réalité.

**Churn silencieux** — aucune requête authentifiée depuis 21 jours, lu sur `lastActiveAt`
(VU `server/store.js:203-206`). **Limite à écrire à côté du chiffre** : `lastActiveAt` est écrasé à
chaque passage, il ne donne que le dernier. On peut donc calculer **combien** de personnes sont parties,
jamais **quand** elles sont parties. Seul `app_opened` (§2.2) permettra de dater un départ, et seulement
pour les comptes créés après sa mise en place. **Aucune rétroactivité n'est possible : c'est la
conséquence directe de MESURE-01.**

**21 jours : SUPPOSÉ.** Aucune donnée d'usage. Test qui trancherait : après huit semaines de bêta,
tracer la distribution des écarts entre deux `app_opened` d'une même personne et couper au 90e centile.
Je ne reprends pas les 30 jours usuels du marché : SOURCE (secondaire, non revérifiée) — apps installées
depuis une boutique, sur d'autres marchés, avec une ouverture quotidienne acquise, ce qui n'est pas le
cas ici (CLAUDE.md §1 : forfaits data limités, réseau parfois instable).

### 5.3 La métrique phare

> **Nombre de premiers rendez-vous confirmés par un check-in réciproque entre deux personnes réelles,
> par semaine, par ville.**

**Pourquoi celle-là.** C'est le seul chiffre qui ne peut pas monter si le produit ment. Il exige,
dans l'ordre : un vivier non vide (R1), une vérification effectuée (R3), une conversation qui survit
au filtre anti-arnaque (R4), une proposition acceptée (P0-4), et un déplacement physique réel de deux
personnes. Aucune des dérives habituelles du secteur — profils fictifs, likes gonflés, notifications
de réengagement — ne le fait monter. Et c'est la seule métrique qui se facture : P2-1 prévoit des
lieux partenaires payés **au rendez-vous confirmé**. La métrique de valeur et la métrique de revenu
sont la même.

**Trois conditions à remplir avant de l'afficher, sinon elle ment :**

1. **P0-4 doit exister.** MESURÉ : `accept`, `decline`, `cancel` et `status` renvoient 404. Sans statut
   `accepted`, un check-in ne prouve pas qu'un rendez-vous a été voulu par les deux personnes.
2. **Le check-in doit cesser d'être falsifiable.** MESURÉ : `POST /dates/:id/checkin` avec le code lu
   dans `server/config.js:48` renvoie `{"arrived":true}` sans être sorti de chez soi, et cinq
   confirmations successives sont acceptées. **Une métrique phare falsifiable est pire que pas de
   métrique** : elle donne une fausse assurance et, ici, elle facturerait un lieu partenaire pour un
   rendez-vous qui n'a pas eu lieu.
3. **« Réciproque » est obligatoire.** VU `server/routes.js:434` : `arrivals` est un objet par personne.
   Un rendez-vous où une seule personne s'est déplacée n'est pas un succès, c'est un échec — et c'est
   un signal de sécurité (voir contre-métrique 6).

### 5.4 Métriques d'entrée

Les six seules choses qui font monter la phare. Chacune est calculable, et chacune pointe un risque.

| # | métrique | calcul | risque adressé |
|---|---|---|---|
| 1 | comptes vérifiés par un humain et actifs dans la ville | `verifDecidedAt` avec `auto: false`, `lastActiveAt` sous 21 jours, `profile.city` | R1 |
| 2 | délai médian de modération | `selfieSentAt` → `verifDecidedAt`, lignes `auto: true` exclues | R3 |
| 3 | part des ouvertures de Découvrir qui rendent au moins une carte | `deck_served` / (`deck_served` + `deck_empty`) | R1 |
| 4 | part des matchs qui reçoivent un message dans les 48 h | `matches.createdAt` → `firstMessageAt` et `db.messages` | R4 |
| 5 | part des discussions de plus de 10 messages qui produisent une proposition | `db.messages` → `db.dates[].createdAt` | R4 |
| 6 | part des propositions acceptées | `statusAt`, disponible après P0-4 | R5 |

### 5.5 Contre-métriques

Si l'une monte, la phare ne compte plus. À afficher **sur la même page** que la phare, jamais ailleurs.

| # | contre-métrique | calcul | ce qu'elle empêche |
|---|---|---|---|
| 1 | signalements pour 100 matchs | `db.reports[].at` (VU `server/store.js:222`) | faire monter les rendez-vous en laissant entrer n'importe qui |
| 2 | blocages anti-arnaque pour 100 messages, par catégorie | `antiscam_block`, champ `c` | relâcher le filtre pour fluidifier les discussions |
| 3 | **faux positifs de l'anti-arnaque** : part des messages bloqués dont l'expéditeur n'a été ni signalé ni bloqué dans les 30 jours | `antiscam_block` croisé à `db.reports` et `db.blocks` | durcir le filtre au point de bloquer le langage courant. **C'est le seul chemin honnête vers le taux que la passe adverse a retiré** : un corpus écrit par un agent mesure son rédacteur, des messages réels mesurent le filtre |
| 4 | suppressions de compte pour 100 comptes vérifiés | `account_deleted` | confondre croissance et satisfaction |
| 5 | comptes vérifiés n'ayant jamais vu une seule carte | `deck_empty` sans aucun `deck_served` | ouvrir des villes ou des intentions sans vivier derrière (R1) |
| 6 | part des check-in non réciproques | `db.dates[].arrivals` : une seule clé | compter comme succès un rendez-vous où une personne a attendu seule. **C'est aussi un signal de sécurité : quelqu'un s'est déplacé pour rien, ou pire** |

---

## 6. Ce que ce plan ne permettra jamais de mesurer

À écrire, pour qu'on cesse de le chercher.

- **La désinstallation, ou l'arrêt de l'usage de Telegram.** Aucune trace côté serveur, par
  construction.
- **Les personnes qui envoient `/start` sans jamais ouvrir l'app.** VU `server/bot.js:105-117` : le bot
  répond sans rien écrire en base. Un compte n'existe qu'au premier `GET /api/me` (VU
  `server/auth.js:53`, `server/store.js:41`). Corriger cela demanderait d'écrire un utilisateur à
  `/start`, donc de créer une ligne pour quelqu'un qui n'a rien accepté : **à ne pas faire**.
- **Ce qui se passe après le rendez-vous.** VU `server/routes.js:428-438` est la dernière route liée
  aux rendez-vous : aucun écran, aucune tâche, aucune notification ne suit une arrivée (RELATION-15).
  Tant que P1-2 et le point de contrôle d'après rendez-vous n'existent pas, le résultat réel d'une
  rencontre est hors de portée.
- **Pourquoi quelqu'un abandonne.** Aucun événement ne porte d'intention, et aucun n'en portera :
  ce serait du texte libre, donc une donnée personnelle non minimale. La réponse se cherche en parlant
  à dix personnes de la bêta fermée, pas dans `db.json`.
- **Quoi que ce soit rétroactivement.** Tous les chiffres de §5 partent du jour où ces lignes sont
  posées.

---

## 7. Ce qu'il faut écrire dans le README et dans `.env.example`

CLAUDE.md §6.4 et §6.5 l'exigent, et §5.4 impose que toute donnée personnelle nouvelle soit signalée.

**`.env.example`** — une seule variable nouvelle, avec une valeur par défaut sûre :

```
# Durée de conservation des événements de mesure, en jours. 0 = ne rien conserver.
EVENTS_RETENTION_DAYS=180
```

Valeur par défaut proposée : 180. SUPPOSÉ que c'est suffisant pour deux cycles de cohortes
trimestrielles. Test qui trancherait : après six mois, vérifier qu'aucune question posée à la base ne
remonte au-delà. La valeur `0` doit désactiver complètement l'écriture : c'est ce qui rend la
fonctionnalité refusable par le propriétaire sans toucher au code.

**README**, section « Ce que Odo enregistre » :

- les six horodatages d'entonnoir, leur emplacement (objet utilisateur) et le fait qu'ils
  disparaissent avec `DELETE /api/me` ;
- la table `events`, sa forme exacte, le fait qu'elle ne contient **aucun texte** et qu'elle est
  purgée par `DELETE /api/me` — à l'exception documentée de `account_deleted`, qui ne porte pas
  d'identifiant ;
- le marqueur `devUser`, son usage unique et son effacement ;
- `EVENTS_RETENTION_DAYS` et son effet ;
- la phrase qui manque aujourd'hui et qui vaut pour tout le dossier : **toute statistique produite
  pendant une période où `AUTO_APPROVE` valait `true` ne dit rien de la vérification**.

**Tests à ajouter** (CLAUDE.md §6.3, `npm test` doit passer) :

1. `DELETE /api/me` laisse `db.events.filter(e => e.u === id).length === 0` ;
2. `account_deleted` survit à cette suppression et ne porte aucun identifiant ;
3. un compte `demo: true` et un compte `devUser: true` sont exclus de la fonction de comptage ;
4. `verif_decided` porte `auto: true` quand `config.autoApprove` est actif.

---

## 8. Effort et rattachement

| lot | contenu | effort | feuille de route |
|---|---|---|---|
| M1 | les six horodatages + `devUser` | 0,5 j | **hors feuille de route** — préalable à toute évaluation de P0 |
| M2 | table `events`, purge dans `deleteUser`, `EVENTS_RETENTION_DAYS`, les quatre tests | 1 à 2 j | **hors feuille de route** |
| M3 | les neuf événements de §2.2, exclusions comprises | 1 à 2 j | **hors feuille de route** |
| M4 | script en ligne de commande qui sort l'entonnoir et les six contre-métriques depuis `db.json` | 0,5 j | préfigure **P1-10** (tableau de bord de modération) |

Total : **3 à 5 jours-développeur**, aucune dépendance nouvelle (CLAUDE.md §2 : `express`, `grammy`,
`qrcode`, `dotenv` — rien à ajouter), aucune donnée de contenu, une seule variable d'environnement.

**Ordre par rapport à la feuille de route.** M1 et M2 doivent précéder P0-2 (migration PostgreSQL) :
la migration doit emporter le schéma définitif, et rattraper des horodatages après coup est impossible
puisqu'ils n'ont jamais existé. M3 peut suivre. La contrainte est simple à énoncer : **chaque jour de
bêta fermée qui tourne sans M1 est un jour de données perdues pour toujours.**
