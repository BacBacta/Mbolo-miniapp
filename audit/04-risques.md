# Mbolo — les huit risques, notés

Phase 4 de l'audit. Ce fichier ne réexplique pas les écrans : il regroupe les constats par **mécanisme
d'échec**, arbitre les doublons, et attribue une note de 0 à 3 par risque.

Ce qui précède et fonde ce fichier : `audit/00-benchmark.md` (la grille, figée avant tout diagnostic),
`audit/02-mesures.md` (les mesures d'exécution), `audit/03-ecrans-*.md` (les 113 constats),
`audit/07-verification.md` (la passe adverse, qui prime sur tout le reste).

---

## 0. Règles de ce fichier

### 0.1 Marques

| marque | ce que ça veut dire |
|---|---|
| **VU** | lu dans le code, avec `chemin:ligne` |
| **MESURÉ** | obtenu en exécutant quelque chose, avec la sortie |
| **SUPPOSÉ** | hypothèse, accompagnée du test qui la trancherait |
| **SOURCE** | repère externe, avec sa provenance et sa limite de comparabilité |

**Une note ne repose que sur du VU ou du MESURÉ.** Aucun SUPPOSÉ, aucune SOURCE n'entre dans une note.
Un repère de marché sert à situer, jamais à viser.

### 0.2 Barème

Repris de `audit/00-benchmark.md` §0.3. Quatre niveaux, le **niveau 2 est le minimum acceptable**.
Règle de lecture : un niveau n'est atteint que si **tout** ce qu'il décrit est vrai. Un seul élément
manquant fait redescendre d'un cran. Symétriquement, un niveau 0 est atteint dès qu'**une seule** de
ses conditions est réunie.

### 0.3 Un constat, un seul risque

La passe adverse a montré que dix groupes de constats décrivent le même fait deux ou trois fois, et
que quatre de ces groupes portaient des gravités ou des étiquettes de sécurité contradictoires
(`audit/07-verification.md` §5). Tant que ce n'est pas arbitré, la liste ne peut pas servir de file
de travail. Les arbitrages sont en §9, avant les fiches, pour qu'on puisse les contester d'abord.

**Compte final : 102 constats retenus**, soit 113 moins un retiré et onze fusionnés.

### 0.4 Ce que ce fichier ne peut pas faire

L'application ne comporte aucune analytique (MESURÉ, `grep -rniE "analytics|gtag|posthog|amplitude|mixpanel|track\("
server/ public/` : sortie vide). Aucun risque n'est donc chiffré en nombre de personnes touchées.
Les notes portent sur **des mécanismes vérifiés dans le code et en exécution**, jamais sur une
fréquence observée. C'est la raison d'être de R8, et l'objet de `audit/05-mesure-produit.md`.

---

## 1. R1 — Le vivier est vide, et le produit ne le dit pas

### Mécanisme d'échec

La découverte n'accepte que les comptes de la même ville **et** de la même intention, avec une coupe
supplémentaire au genre pour « relation sérieuse » : cinq villes fois trois intentions font quinze
compartiments étanches, dont aucun ne communique (VU `server/routes.js:221-227`). Une bêta fermée de
quelques dizaines de personnes se retrouve donc répartie en quinze paquets de deux ou trois, et trois
des cinq villes proposées à l'inscription n'ont aucun lieu partenaire derrière (VU `server/config.js:47-52`
contre `:56`). Quand le paquet est vide, l'écran affirme le contraire de la réalité — « tu as vu tous
les profils du moment » — et n'offre aucun levier pour élargir quoi que ce soit (VU `public/app.js:605-610`).

### Constats rattachés (10)

| id | marque | grav. | preuve |
|---|---|---|---|
| DECOUVERTE-01 | MESURÉ | 4 | 60 comptes vérifiés répartis en 5 villes x 3 intentions x 2 genres → femme/amitié/Yaoundé : 5 profils ; femme/sérieux/Yaoundé : 3. VU `server/routes.js:223`, `:225` |
| DECOUVERTE-02 | VU | 3 | `public/app.js:607` : « Tu as vu tous les profils du moment », que le vivier soit épuisé ou vide |
| DECOUVERTE-03 | VU | 3 | `public/app.js:605-610` : ni compteur de vérifiés, ni élargissement, ni alerte à l'arrivée d'un profil |
| DECOUVERTE-08 | MESURÉ | 2 | inscrits 70009, 70003, 70007, 70001, 70005 → rendus 70001, 70003, 70005, 70007, 70009. VU `server/store.js:131` (`allUsers` suit l'ordre des clés d'objet) |
| DECOUVERTE-25 | VU | 3 | `server/routes.js:187` : `DEFAULT_FILTERS` ne contient que `ageMin`/`ageMax` ; `public/app.js:624` renvoie au profil sans y conduire |
| INSCRIPTION-10 | MESURÉ | 3 | 9 appuis et un selfie entre la première ouverture et l'écran de vérification ; aucun visage vu à ce stade. VU `public/app.js:435-455` : quatre promesses, zéro chiffre |
| INSCRIPTION-17 | VU | 3 | `server/config.js:54` : `duo: 'Sortie en duo'` ; MESURÉ `grep -rn "duo" server/ public/` : un libellé, une icône, deux profils de démonstration, aucune règle |
| INSCRIPTION-18 | VU | 2 | `public/app.js:500` : quartier en texte libre ; `server/routes.js:106` : `trim` et troncature seuls ; `:230` : `sameArea` compare les chaînes |
| INSCRIPTION-19 | VU | 2 | `server/config.js:56` : Buea, ville anglophone ; MESURÉ `grep -rn "i18n\|locale\|translat" public/ server/` : aucun fichier de traduction |
| VERIFICATION-16 | MESURÉ | 2 | `AUTO_APPROVE=true` : `PUT /api/me/photos/2` renvoie `approved` immédiatement. VU `server/routes.js:161` : `setPhoto(..., config.autoApprove ? 'approved' : 'pending')` |

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C07) : le standard est de ne jamais afficher d'écran vide, et
d'élargir progressivement les critères en l'annonçant. **Limite de comparabilité déterminante** :
les apps comparées ont un vivier installé ; Mbolo démarre à zéro en bêta fermée. La densité n'est
pas un problème d'interface, c'est un problème d'offre. Ce qui se compare, et ce que la grille note,
c'est la **gestion honnête du vide** — et sur ce point l'écart est entier : aucun compteur de
personnes vérifiées dans la ville n'est jamais affiché nulle part (MESURÉ, `grep` : aucune route ne
renvoie ce nombre).

### Note : **0 sur 3**

Ancrage C07 niveau 0 : « écran vide sans explication, **ou** une intention ou une ville proposée à
l'inscription sans vivier ni lieu partenaire derrière ». Les deux conditions sont réunies, chacune
sur du VU : `server/config.js:54` (« Sortie en duo » sans code derrière) et `:56` (trois villes sans
lieu partenaire, VU `:47-52`), plus `public/app.js:605-610` (vide sans levier).

Ce que le niveau 1 exigerait et qui manque : un message d'attente qui ne mente pas. Le texte actuel
affirme que la personne a tout vu, ce qui est faux quand le vivier n'a jamais rien contenu.

---

## 2. R2 — Le déséquilibre des genres est programmé, invisible et inexpliqué

### Mécanisme d'échec

Le genre est obligatoire, binaire, et il ne sert qu'à une seule chose : retirer silencieusement les
paires de même genre pour l'intention « relation sérieuse » (VU `server/routes.js:225`). Pour les deux
autres intentions, aucun filtre de genre n'existe, si bien qu'un homme cherchant l'amitié voit des
hommes dans son paquet sans qu'aucune phrase ne l'ait annoncé (MESURÉ : pour l'intention amitié, les
cartes rendues contiennent les deux genres). Cette règle, conforme à `MATCH_POLICY` et à la contrainte
pénale locale rappelée par CLAUDE.md §5.2, est donc à la fois la bonne décision et un effet produit
que personne n'explique.

### Constats rattachés (2)

| id | marque | grav. | preuve |
|---|---|---|---|
| INSCRIPTION-15 | VU | 2 | `server/config.js:55` : `GENDERS = { femme, homme }` ; `server/routes.js:93` refuse toute autre valeur ; `:225` : la règle femme/homme ne s'applique qu'à `intent === 'serieux'` |
| DECOUVERTE-26 | MESURÉ | 3 | intention amitié : 4 cartes, les deux genres ; intention relation sérieuse : un seul genre. VU `server/routes.js:225`. MESURÉ `grep` : aucune phrase de l'interface n'énonce cette règle |

**Deux constats seulement, et c'est le point important.** L'ampleur réelle du déséquilibre — combien
de femmes pour combien d'hommes, qui reçoit combien de likes — n'est mesurable par rien aujourd'hui
(voir R8). Ce risque est donc le moins documenté du dossier, alors que c'est celui qui tue le plus
sûrement une app de rencontres à son lancement. SUPPOSÉ : le rapport hommes/femmes de la bêta fermée
sera déséquilibré. Test qui trancherait : compter `profile.gender` sur les comptes vérifiés non démo
au bout de quatre semaines, et le nombre de likes reçus par genre — deux requêtes sur `db.json`,
faisables dès aujourd'hui, mais qui n'ont jamais été écrites.

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C08) : Hinge applique un appariement stable, Tinder annonce un
appariement sur signaux comportementaux, Bumble remplace le balayage par une recommandation
conversationnelle sur marchés sélectionnés. **Limite** : aucun de ces algorithmes n'est publié ; on
ne compare que le principe. Le niveau 2 de la grille n'exige pas un filtrage par attirance — CLAUDE.md
§5.2 l'interdit — il exige que l'effet soit **expliqué à l'écran**, ce qui ne coûte aucune donnée
nouvelle. C'est exactement ce qui manque.

### Note : **1 sur 3**

Ancrage C08 niveau 1 : « ordre fondé sur des critères fixes, cohérents, mais jamais expliqués à
l'écran ». Le niveau 0 (« ordre aléatoire ou par date ») ne s'applique pas : VU `server/routes.js:241`,
le tri met d'abord ceux qui t'ont liké, puis ton quartier — c'est cohérent et défendable. Le niveau 2
échoue sur un seul mot du critère : « expliqué à l'écran ». MESURÉ, aucune occurrence.

---

## 3. R3 — Le temps mort de vérification n'est ni borné, ni mesuré, ni rattrapé

### Mécanisme d'échec

Entre l'envoi du selfie et la décision, toutes les routes utiles renvoient 403 : aucune découverte,
aucun aperçu, rien à faire, et l'écran d'attente n'affiche aucun élément interactif à l'intérieur du
contenu (VU `server/routes.js:66` ; MESURÉ : 0 élément cliquable dans `#app`, deux boutons hors contenu).
Rien n'horodate l'envoi ni la décision, donc le délai réel est inconnu pour toujours, y compris de
l'équipe (MESURÉ, clés d'un compte : `id, firstName, languageCode, createdAt, profile, verification,
pendingGesture, demo, lastNotifiedAt, lastActiveAt, photos` — pas un seul horodatage de vérification).
Et comme aucun plafond de débit n'existe, un seul compte peut remplir la file de modération en
quelques centaines de millisecondes (MESURÉ : 60 envois d'un seul compte en 165 ms, 60 messages dans
le groupe).

### Constats rattachés (9)

| id | marque | grav. | preuve |
|---|---|---|---|
| VERIFICATION-03 | MESURÉ | 4 | clés d'un compte après parcours complet : aucun `selfieSentAt`, aucun `verifDecidedAt`. VU `server/routes.js:128` et `server/bot.js:88` : `verification` est une chaîne écrasée |
| VERIFICATION-05 | MESURÉ | 3 | après appui sur « Actualiser » : `innerHTML` de `#app` identique, `#toast` masqué avant et après |
| VERIFICATION-07 | MESURÉ | 3 | sur un compte `approved` : `POST /me/verification/start` → 200 ; `POST /me/verification` → 200 `{"verification":"pending"}` ; `/discover` → 403 |
| VERIFICATION-08 | VU | 3 | `public/app.js:893-899` : `saveProfile` renvoie sur `verify` dès que `verification !== 'approved'`, donc aussi pendant l'attente ; `:535-543` retire alors un nouveau geste |
| VERIFICATION-09 | MESURÉ | 3 | 60 envois d'un seul compte en `pending` — 30 selfies, 30 photos — en 165 ms, 60 messages en modération. VU `server/routes.js:12-14` : aucun compteur |
| VERIFICATION-12 | MESURÉ | 3 | `decideVerification(id, true)` puis `(id, false)` : deux messages contradictoires envoyés à la personne. VU `server/bot.js:88` : aucune attribution, aucun verrou |
| VERIFICATION-14 | MESURÉ | 3 | commandes déclarées du bot : `start`, `id`, `aide` seulement (VU `server/bot.js:105-117`) ; MESURÉ, liste des routes : aucune route d'administration |
| VERIFICATION-20 | MESURÉ | 2 | `POST /me/verification` sans geste → 400 `GESTURE_REQUIRED` « Demande un geste avant de prendre le selfie. » — l'écran n'offre aucun moyen d'en demander un |
| INSCRIPTION-24 | VU | 3 | `public/app.js:479` : « Étape ${step + 1} sur 3 » ; `:899` : un quatrième écran obligatoire suit, jamais annoncé |

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C01) : chez Tinder, la vérification par visage est devenue
obligatoire mais la décision est **automatisée et rendue en secondes**. **Limite de comparabilité** :
ces apps ne promettent pas un vivier intégralement vérifié ; la comparaison ne porte donc pas sur
l'équivalence de promesse, mais sur la **gestion de l'attente**. Sur ce point, l'écart n'est pas
technique, il est organisationnel : la promesse « en général quelques minutes » (VU `public/app.js:574`)
ne repose sur aucun mécanisme, et aucun chiffre ne permettra jamais de dire si elle a été tenue.

### Note : **1 sur 3**

Ancrage C01 niveau 1 : « attente expliquée, délai annoncé, mais rien ne mesure ni ne garantit ce
délai ». Les trois membres sont vrais : l'attente est expliquée par une frise en trois étapes
(VU `public/app.js:576-580`), un délai est annoncé (VU `:574`), et rien ne le mesure (MESURÉ, aucun
horodatage). Le niveau 0 ne s'applique pas, précisément parce que le délai est annoncé. Le niveau 2
exigerait un aperçu partiel **avant** la demande de selfie et un délai adossé à un compteur réel :
les deux sont absents.

---

## 4. R4 — Le silence après le match

### Mécanisme d'échec

Au moment exact où l'app dit « brise la glace avec une question sur son profil » puis « commence par
une question sur son profil », le profil de l'autre n'est plus affiché nulle part : `promptQ` et
`promptA` ne sont rendus que dans `profileCard()`, et la discussion ne l'appelle jamais (VU
`public/app.js:235`, `:659`, `:987`). La personne doit donc écrire à quelqu'un dont elle ne voit plus
rien. Si elle s'en sort quand même, le filtre anti-arnaque bloque des phrases du quotidien — « tu es
prête ? » est refusée comme une demande d'argent (MESURÉ) — avec un message qui accuse sans dire quoi
corriger. Et rien n'expire, rien ne se clôt : une discussion morte reste en tête de liste pour
toujours (VU `server/routes.js:336`).

### Constats rattachés (5)

| id | marque | grav. | preuve |
|---|---|---|---|
| RELATION-22 | VU | **4** (arbitré) | `public/app.js:659` et `:987` invitent à parler du profil ; `:235` : `promptQ`/`promptA` ne sont rendus que par `profileCard()`, jamais appelé depuis la discussion |
| RELATION-06 | MESURÉ | 4 | `checkMessage` bloque « tu es prête ? », « Tu es prête pour samedi ? », « Je prends le taxi jusqu'à Mvog-Mbi, ça me coûte 300 F », « J'ai plus de crédit sur ma ligne », « Les frais de scolarité sont chers cette année », « Mon oncle m'a dépanné avec sa voiture » — six sur six reproduites. Mécanisme VU `server/antiscam.js:25` (`\bpret(e\|er)?\b` après suppression des accents) |
| RELATION-08 | VU | 3 | `server/antiscam.js:46` : « Les demandes et offres d'argent sont bloquées sur Mbolo. » — n'indique ni la catégorie ni la correction ; `public/app.js:1072` ajoute une consigne pour `MONEY_BLOCKED` seulement |
| RELATION-24 | VU | 2 | `server/store.js:163-172` : le match ne porte ni statut ni expiration ; `server/routes.js:336` : sans message, le tri retombe sur `createdAt` |
| DECOUVERTE-14 | MESURÉ | 3 | `SEED_DEMO=true` : un seul « J'aime » sur Carine (`demo: true`, jauge 3/3) crée un match immédiat. VU `server/routes.js:304` : le profil de démonstration like en retour |

**Retiré :** RELATION-23 (« la liste des discussions ne dit jamais qui attend une réponse ») est
contredit par sa propre preuve — VU `public/app.js:706` préfixe l'aperçu par « Toi : » et `:708`
affiche le compte de non-lus (`audit/07-verification.md` §2.1). Ce qui reste est une hypothèse : il
n'existe ni tri ni marque explicite « à toi de répondre », alors que la logique existe déjà pour la
liste des profils (VU `server/routes.js:249`, `:268-270`). Test qui trancherait : montrer la liste à
dix personnes avec trois discussions dont deux attendent leur réponse, et mesurer combien identifient
les deux bonnes en moins de cinq secondes.

**Les pourcentages sont retirés.** RELATION-06 annonçait 44 % de faux positifs, RELATION-07 72 % de
faux négatifs ; le dossier `02-mesures.md` §9 annonce 15 % et 33 % sur le même code, autre corpus. La
passe adverse a relancé les deux : chacun sort bien ce qu'il annonce. **Un taux qui varie d'un facteur
2,8 selon le rédacteur du corpus mesure le rédacteur, pas le filtre.** Ce qui reste et qui suffit :
chacun des exemples nommés se reproduit, règle par règle. Le vrai taux ne s'obtiendra qu'en étiquetant
les messages réellement envoyés pendant la bêta — c'est la contre-métrique n°3 de `audit/05-mesure-produit.md`.

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C12) : Hinge « Your Turn » marque le tour de parole, Grindr
« Smart Inbox » priorise la boîte, Coffee Meets Bagel fait expirer la conversation au bout de 8 jours.
**Limite explicite** : la péremption n'est pas transposable sur un réseau instable où l'ouverture
quotidienne n'est pas acquise, et la grille ne l'exige pas. Ce qui s'exige, et qui manque, c'est la
distinction visuelle entre « elle ou il attend ta réponse » et « tu attends la sienne ».

### Note : **1 sur 3**

Ancrage C12 niveau 1 : « les non-lus sont signalés, mais pas le tour de parole ». VU `public/app.js:708`
(compteur de non-lus) et `server/routes.js:336` (tri par date du dernier message uniquement). Le
niveau 2 exigerait un tri ou un marquage explicite par « qui attend » : absent, alors que la fonction
équivalente existe déjà pour les profils (VU `server/routes.js:268-270`) — c'est une correction de
quelques lignes, pas une fonctionnalité à concevoir.

---

## 5. R5 — La sécurité des femmes

**C'est le risque le plus chargé du dossier : 30 constats sur 102, dont dix de gravité 4.** C'est
aussi le seul qui touche la promesse écrite en tête de CLAUDE.md, et le seul dont un échec ne se
rattrape pas par une mise à jour.

### Mécanisme d'échec

La configuration livrée délivre le badge « vérifié » sans qu'aucun humain ne regarde : `AUTO_APPROVE=true`
dans les deux fichiers de déploiement du dépôt, avec `NODE_ENV=production` (VU `fly.toml:11`, `:16`,
`render.yaml:13`, `:19-20`, `.env.example:21`), et le geste demandé est rejouable à volonté sans
expiration (MESURÉ : 30 demandes de geste en 36 ms, quatre gestes distincts). Une fois entré, un
compte peut poser un numéro de téléphone et une demande d'argent dans son profil — `promptQ` est le
seul champ qui échappe au filtre (MESURÉ : accepté dans `promptQ`, refusé dans les quatre autres
champs) — puis débloquer les contacts tout seul en envoyant dix messages d'affilée, l'autre personne
n'ayant jamais écrit (MESURÉ : dix messages en 86 ms, le numéro passe au onzième). Et quand la
personne visée se protège, le blocage ferme le message et la proposition de rendez-vous mais **pas le
check-in**, qui déclenche encore une notification vers elle (MESURÉ : message 403, rendez-vous 403,
check-in 200).

### Constats rattachés (30)

**Le verrou d'entrée**

| id | marque | grav. | preuve |
|---|---|---|---|
| VERIFICATION-01 | MESURÉ | 4 | `AUTO_APPROVE=true`, image factice de 22 octets acceptée puis approuvée en 3 s sans aucun humain. VU `fly.toml:15-16`, `render.yaml:17-20`, `.env.example:21,24`, `server/routes.js:133` |
| VERIFICATION-02 | MESURÉ | 4 | 30 appels parallèles à `POST /me/verification/start` en 36 ms, 30 réponses 200, 4 gestes distincts. VU `server/routes.js:117-121` : aucune expiration, aucun usage unique |
| VERIFICATION-13 | VU | 4 | `server/bot.js:51` : deux boutons seulement, Valider et Refuser ; `:94-96` : un seul message de refus quel que soit le motif réel |
| DECOUVERTE-13 | MESURÉ | 4 | compte réel neuf : `trust = {selfie:true, guarantor:false, seniority:false}` → 1/3 ; profil fictif Carine : 3/3 sous une pastille « Vérifié ». VU `server/routes.js:46` : `guarantor` est écrit en dur à `false` pour tout compte réel — un compte réel **ne peut pas dépasser 2/3** |
| VERIFICATION-11 | MESURÉ | 3 | inscription complète : 4 messages dispersés dans le groupe, les photos avant le selfie, rien de comparable côte à côte |
| VERIFICATION-10 | MESURÉ | 4 | après décision, appels à `deleteMessage` : 0. Le fichier serveur est bien effacé (VU `server/bot.js:89-90`), le message du groupe reste. MESURÉ `grep -rn "deleteMessage" server/` : aucune occurrence |
| VERIFICATION-15 | MESURÉ | 2 | compte jamais tranché : `9002-selfie.jpg`, `9002-photo-1..3.jpg` toujours présents, sans limite de durée |

**Ce qui entre dans le produit**

| id | marque | grav. | preuve |
|---|---|---|---|
| INSCRIPTION-20 | MESURÉ | 4 | `PUT /api/me/profile` avec `promptQ="WhatsApp 699 88 77 66 envoie moi 5000F"` → 200, chaîne relue telle quelle dans le profil public. Même chaîne dans `promptA`, `name`, `area`, `languages` → 400 `PROFILE_CONTACT`. VU `server/routes.js:98` (composition de `profileText`) et `:107` |
| INSCRIPTION-08 | MESURÉ | 4 | `public/app.js:452` fait accepter des « règles de la communauté » ; MESURÉ, unique occurrence dans tout le dépôt, 0 lien dans tout le front, `/confidentialite` et `/conditions` renvoient la mini app (VU `server/index.js:56`, `app.get('*', renderIndex)`), acceptation stockée nulle part |
| RELATION-07 | MESURÉ | 4 | passent au premier message comme au onzième : « envoie juste 10k », « il faut 50 mille pour finaliser le dossier », « Il me faut 5 mille pour le taxi », « ma tante est malade à l'hôpital, elle a besoin de médicaments », « Achete moi une carte de recharge », « Mon compte est bloqué, envoie le code que je viens de recevoir », « J'ai un plan business, mets juste 20000 et tu récupères le double », « Je t'envoie un colis de l'étranger, paie juste la douane », « Small small helep me, even 2000 na ok ». Mécanisme VU `server/antiscam.js:28` : `\d+ ?(f\|fcfa\|...)` exige une devise |
| RELATION-05 | MESURÉ | 4 | un seul compte envoie dix messages en 86 ms, « Mon whatsapp 677889900 » passe au onzième. VU `server/routes.js:374` : `store.messagesOf(...).length`, tous expéditeurs confondus |
| RELATION-09 | VU | 3 | `server/antiscam.js:42-56` : `checkMessage` ne renvoie pas la règle déclenchée et n'écrit rien ; `server/routes.js:374-375` : 422, aucun `notifyAdmin`, aucune trace ; `server/store.js:9` : aucune table de score |

**Ce qui se passe autour du rendez-vous**

| id | marque | grav. | preuve |
|---|---|---|---|
| RELATION-01 | MESURÉ | 4 | après blocage : message 403 `BLOCKED`, rendez-vous 403 `BLOCKED`, `POST /dates/:id/checkin` **200** `{"arrived":true}` et `notify` part vers la personne qui a bloqué. VU `server/routes.js:428-437` : `loadMatch` n'est pas appelé, seul `m.users.includes` est vérifié |
| RELATION-10 | MESURÉ | 4 | `POST /dates/:id/accept`, `/decline`, `/cancel`, `/status` → 404, les quatre. VU `server/routes.js:423` : `status: 'proposed'` écrit une fois, jamais relu ; `:428-437` : le check-in ne lit jamais `d.status` |
| RELATION-13 | MESURÉ | 3 | check-in accepté avec le code lu dans `server/config.js:48` ; cinq confirmations successives pour la même personne et le même rendez-vous, toutes 200. **Formulation corrigée** : le code est *codé en dur dans le dépôt et jamais renouvelé*, pas « publié » — MESURÉ, `GET /venues` ne renvoie pas le champ `code` (VU `server/routes.js:414`) et `/qr/:id.png` exige `ADMIN_KEY` (VU `server/index.js:32`) |
| RELATION-11 | MESURÉ | 3 | `POST /matches/:id/dates` avec `slot = "APPELLE MOI 677889900 URGENT ARGENT"` accepté et réinjecté tel quel dans la notification. VU `server/routes.js:421` : `String(...).slice(0, 40)` seul, aucun `checkMessage` |
| RELATION-12 | MESURÉ | 3 | 30 propositions en 274 ms, 31 cartes empilées chez l'autre, 30 notifications. VU `server/routes.js:424` : `notify` appelé sans clé de limitation |
| RELATION-14 | MESURÉ | 3 | depuis le compte non arrivé : `arrivals: {"2001": 1789172585415}` — horodatage à la milliseconde de l'autre personne. VU `server/routes.js:365` : `{ ...d }` renvoie l'objet entier |
| RELATION-15 | VU | 2 | `server/routes.js:428-438` est la dernière route liée aux rendez-vous ; aucun écran, aucune tâche, aucune notification après une arrivée |
| RELATION-16 | VU | 2 | `public/app.js:783`, `:841`, `:842` : « préviens une personne de confiance » trois fois ; aucun champ de contact de confiance dans la validation du profil (VU `server/routes.js:104-111`) |
| DECOUVERTE-04 | MESURÉ | 3 | depuis un compte à Garoua, `GET /api/venues` → `{"venues":[]}`. VU `server/config.js:56` (5 villes) contre `:47-52` (4 lieux, 3 à Yaoundé, 1 à Douala) |
| DECOUVERTE-30 | VU | 2 | `public/app.js:664` : deux actions seulement, « Écrire à X » et « Plus tard », alors que `GET /venues` sert déjà la liste des lieux de la ville (VU `server/routes.js:412-415`) |

**Ce qui se passe quand quelqu'un se protège**

| id | marque | grav. | preuve |
|---|---|---|---|
| RELATION-02 | VU | 4 | `server/routes.js:441-448` : `addReport`, `block` du seul plaignant, `notifyAdmin` en texte ; `server/store.js:51-61` : le modèle utilisateur n'a ni `banned` ni `suspended` |
| RELATION-20 | MESURÉ | 4 | 1002 bloque 1001 → `blocks` contient la ligne ; `DELETE /api/me` par 1002 → `blocks` vide ; 1002 se réinscrit avec le même identifiant → chacun revoit l'autre. VU `server/store.js:86` : `db.blocks.filter((b) => b.from !== id && b.to !== id)` |
| RELATION-03 | VU | 3 | `server/routes.js:447` : `notifyAdmin` reçoit une chaîne ; `server/bot.js:42-45` : aucun clavier, contrairement à `sendSelfieToModeration` (VU `server/bot.js:51`) |
| RELATION-04 | MESURÉ | 3 | 50 `POST /api/reports` sur la même cible en 365 ms, 51 lignes dans `db.reports`. VU `server/routes.js:12-14` : aucun compteur |
| RELATION-17 | VU | 3 | aucune route ne supprime un match (`server/routes.js`, seule suppression `DELETE /api/me` à `:151`) ; `public/app.js:1111-1131` : la seule sortie est « Signaler et bloquer » ; aucun déblocage |
| RELATION-18 | VU | 3 | `public/app.js:1116-1117` : deux motifs, `money` et `behavior` ; `:768-778` : le guide anti-chantage renvoie pourtant à ce même écran |
| RELATION-19 | VU | 2 | `public/app.js:777` : « une association d'aide aux victimes » ; MESURÉ, aucune association, aucun numéro, aucun service nommé dans le dépôt |
| RELATION-21 | MESURÉ | 2 | après `DELETE /api/me`, `db.reports` conserve ses lignes, dont `from` pointant un compte qui n'existe plus. VU `server/store.js:75-92` : `db.reports` n'est jamais purgé |

### Écart à l'état de l'art

SOURCE (connaissance, `00-benchmark.md` C15) : bloquer sans signaler et défaire un match silencieusement
sont disponibles chez toutes les grandes apps. SOURCE (consultée) : Tinder « Share My Date » et Bumble
« Share Date » préviennent une personne de confiance ; partenariat Tinder / Noonlight pour l'appel
d'assistance discret. **Limite** : le partage de position continue coûte cher en data et en vie privée,
il n'est pas souhaitable pour cette cible et la grille ne l'exige pas. SOURCE (secondaire, à ne pas
republier sans revérification) : Meta a déclaré en 2025 avoir supprimé plus de 100 000 comptes liés à
des réseaux d'arnaque sentimentale, en nommant le Cameroun. **Enseignement sûr, qualitatif** :
l'adversaire est organisé et local, et il passe la vérification par selfie avec son propre visage —
ce qui rend la détection de doublons de visage (P1-1) plus utile que le durcissement du selfie.

**Ce que Mbolo fait mieux que le marché, et qu'il ne faut pas casser** (VU, vérifié par la passe
adverse) : le pseudo et le numéro Telegram ne sortent jamais (`server/routes.js:29-54`, liste blanche
explicite) ; aucune position GPS n'est demandée (`:230`, le quartier déclaré tient lieu de proximité) ;
l'activité est arrondie en tranches (`:19-26`, `:239`) ; le lieu public n'est pas suggéré mais imposé
(`public/app.js:746-753`) ; le selfie n'est jamais servi aux autres membres et le fichier serveur est
effacé sur tous les chemins de décision (`server/bot.js:89-90`) ; la modération ne reçoit ni pseudo ni
numéro (`server/bot.js:53`, `:67`).

### Note : **0 sur 3**

Ancrage C15 niveau 0 : « le signalement est le seul recours, **ou** il faut accuser quelqu'un pour
s'en débarrasser ». VU `public/app.js:1111-1131` : la popup impose de choisir entre « Demande d'argent »
et « Comportement déplacé » ; il n'existe ni unmatch, ni blocage sans accusation.

La note reposerait sur ce seul ancrage, mais trois faits MESURÉS indépendants la confirment chacun
séparément, et chacun suffirait : le check-in reste ouvert après un blocage (RELATION-01), le badge
« vérifié » est délivré sans humain dans la configuration livrée (VERIFICATION-01), et supprimer son
compte efface les blocages qui protégeaient la personne elle-même (RELATION-20).

**Conséquence à écrire noir sur blanc** : tant que ces trois-là ne sont pas corrigés, la phrase
« Chaque membre a prouvé qu'il est une vraie personne » (VU `public/app.js:446`) ne doit pas être
affichée à un utilisateur réel. Ce n'est pas un avis de conception, c'est le constat que le texte
affirme le contraire de ce que fait la configuration livrée.

---

## 6. R6 — Rien ne donne envie de revenir

### Mécanisme d'échec

Le quota de vingt profils par jour est consommé par les « Passer » autant que par les « J'aime », en
contradiction avec le commentaire du code lui-même (MESURÉ : 20 « Passer » puis 429 sur la 21e action,
VU `server/routes.js:246-247` contre `server/store.js:157-161`), et une fois épuisé il devient
impossible de répondre à un like reçu alors que l'interface continue de l'annoncer. Les erreurs
n'ont pas d'issue : l'échec du premier appel produit un écran sans un seul bouton ni un seul lien
(MESURÉ : 0 bouton, 0 lien, 0 élément cliquable), et le 429 de quota ne change même pas l'écran.
Enfin, la seule notification qui pourrait ramener quelqu'un — « tu as plu à quelqu'un » — pointe vers
un écran filtré par l'âge où la personne n'est pas (MESURÉ, VU `server/routes.js:311`).

### Constats rattachés (30)

**Entrer et repartir**

| id | marque | grav. | preuve |
|---|---|---|---|
| INSCRIPTION-04 | MESURÉ | 4 | écran d'échec : 0 bouton, 0 lien, 0 élément cliquable, barre de boutons masquée ; `curl /api/me` sans en-tête → `401 "Ouvre Mbolo depuis Telegram."`, mot pour mot le titre de l'écran. VU `public/app.js:1274-1283` contre `:136-144` (`renderError` sait déjà proposer « Réessayer ») |
| INSCRIPTION-01 | VU | **2** (affaibli) | `server/bot.js:108` : `reply_markup` conditionnel à `config.webAppUrl` ; `:27` idem pour les notifications. **Gravité 4 non tenable** : `server/config.js:10-11` dérive l'adresse de `RENDER_EXTERNAL_URL` ou `FLY_APP_NAME`, et le README dit de laisser `WEBAPP_URL` vide chez Render. Sur les deux hébergeurs décrits, le bouton existe |
| VERIFICATION-19 | VU | 3 | `public/app.js:574` affirme que le bot préviendra ; `server/routes.js:82` calcule `notificationsAvailable = !!config.botToken` ; MESURÉ, l'écran `pending` ne lit jamais ce champ |
| VERIFICATION-04 | MESURÉ | 3 | écran d'attente : `#topbar` masqué, 0 élément cliquable dans `#app`, deux boutons hors contenu (« Fermer » et « Actualiser », 160 x 50 chacun) |
| RELATION-28 | VU | 1 | les douze `notify` du dépôt sont tous déclenchés par une requête HTTP ou une décision de modération (VU `server/routes.js:141, 307, 311, 379, 391, 407, 424, 436` et `server/bot.js:78, 81, 93, 95`) ; aucune tâche périodique de rappel |

**Le formulaire**

| id | marque | grav. | preuve |
|---|---|---|---|
| INSCRIPTION-23 | MESURÉ | 3 | après les trois étapes sans enregistrer : `localStorage {}`, profil serveur `null` ; après rechargement, retour à l'étape 1 |
| INSCRIPTION-13 | MESURÉ | 3 | âge vide → « Mbolo est réservé aux 18 ans et plus. » (VU `public/app.js:854`, `Number('')` vaut 0) ; âge 120 → même message (MESURÉ, 400 `AGE_INVALID`), sur un écran où le champ n'existe plus |
| INSCRIPTION-14 | VU | 2 | `server/routes.js:91-97` : six champs obligatoires — un de plus que l'ancrage C02 niveau 2 — sans phrase de justification par champ |
| INSCRIPTION-25 | VU | 2 | `public/app.js:268-272` : `showError` écrit dans `<p id="form-error">` sans focus, sans mise en évidence du champ, sans défilement ; aucun `<form>`, donc la touche de validation du clavier Android ne fait rien |
| INSCRIPTION-21 | VU | 2 (affaibli) | `public/app.js:1234` et `:1167` appellent `SCREENS.profile()`, qui remplace tout le contenu à `:523`. **La perte de focus est certaine ; la fermeture du clavier Android n'a jamais été observée sur un appareil** — test qui trancherait : curseur dans « Ta réponse », appui sur la croix d'un emplacement photo, observation du clavier |
| INSCRIPTION-22 | MESURÉ | 2 | éléments focalisables de l'étape 3 : `button`, `select[promptQ]`, `input[promptA]`, `input[languages]` — les trois emplacements photo n'y sont pas. VU `public/app.js:513` : `<input type="file" hidden>` dans un `<label>` |
| INSCRIPTION-26 | MESURÉ | 2 | défilement 73 px avant « Continuer », 73 px après l'affichage de l'étape 2 |

**Lisibilité**

| id | marque | grav. | preuve |
|---|---|---|---|
| INSCRIPTION-11 | MESURÉ | 3 | **chiffres remplacés** (l'outil d'origine divisait par 255 des composantes `color(srgb …)` déjà comprises entre 0 et 1) : thème clair, welcome 8/13, étape 1 7/8, étape 2 7/11, étape 3 12/13 sous le seuil WCAG 2.2 AA ; thème sombre 0/13, 0/8, 0/11, 0/13. Exemples exacts : intitulés de champ 3,70 (seuil 4,5), sous-titres 4,17, numéro d'emplacement photo 1,05 |
| DECOUVERTE-21 | MESURÉ | 2 | thème clair : 13 textes sous le seuil sur 24 ; thème sombre : 1. Initiale d'avatar 1,12 (seuil 3), âge sur la carte 1,91 (3), tampon « J'AIME » 2,90 (3), « 20 restants » 3,70 (4,5), intitulés 11 px 4,17 (4,5) x 7. **Rattaché à R6 et non à R7** : le contraste ne coûte ni data ni temps de chargement, il décide de la lisibilité au soleil |
| INSCRIPTION-12 | VU | 2 | `public/index.html:5` : `maximum-scale=1`. **Ratio corrigé** : les deux mentions fines de `welcome` sont à 13 px et **3,70**, pas 4,17 |
| INSCRIPTION-07 | VU | 2 | `public/styles.css:39-43`, `:52`, `:60-64` : dix variables de fond et de texte définies uniquement en `color-mix()`, sans repli `@supports` |

**La découverte**

| id | marque | grav. | preuve |
|---|---|---|---|
| DECOUVERTE-05 | MESURÉ | 4 | 20 « Passer » → `remaining = 0` ; 21e action, un « J'aime » → 429 `DAILY_LIMIT` « Tu as vu tous tes profils du jour. Reviens demain. » VU `server/store.js:157-161` : `swipesToday` ne filtre pas sur `action`, contre le commentaire `server/routes.js:246-247` |
| DECOUVERTE-06 | MESURÉ | 4 | après quota : réponse au like reçu → 429 ; `/likes` affiche toujours le profil, `/summary.likes` vaut toujours 1 |
| DECOUVERTE-12 | MESURÉ | 4 | depuis une fiche, « Afficher la photo » → écran Découvrir **avec 0 carte et 0 bouton**. VU `public/app.js:1159` : `S.revealed[id] = true` puis `SCREENS.discover()` sans condition sur l'écran courant ; sortie à `:599` parce que `S.screen` vaut encore `person` |
| DECOUVERTE-07 | MESURÉ | 3 | filtre 18-30, likée par un homme de 45 ans : `/discover` ne le contient pas, `/likes` le contient. VU `server/routes.js:311` : la notification pointe vers `screen: 'discover'`. À noter : `:276-277` montre que le filtre d'âge a été volontairement retiré de `/likes` pour éviter un écran vide — c'est une erreur de branchement, pas un oubli |
| DECOUVERTE-09 | VU | 3 | `public/app.js:939-959` : aucun toast sur le chemin nominal de `swipe()` ; `:421` en affiche un depuis le détail d'un profil |
| DECOUVERTE-10 | VU | 3 | `public/app.js:952` : `swipe()` décrémente `S.remaining` ; `:407-423` : `swipePerson()` ne le fait pas |
| DECOUVERTE-19 | VU | 3 | `server/routes.js:295` : 429 ; `public/app.js:960-967` : la carte revient en place, le paquet reste affiché |
| DECOUVERTE-20 | VU | 3 (affaibli) | `public/ui.js:112` (capture à 6 px), `:119-122` (décision à 32 % de la largeur ou 0,7 px/ms). **« Rien ne permet de revenir en arrière » est trop large** : VU `server/routes.js:298-300` et `public/app.js:642`, un « Passer » peut redevenir un « J'aime ». Seul un **like** est irréversible |
| DECOUVERTE-11 | VU | 2 | `server/store.js:157-159` : `new Date()` puis `setHours(0,0,0,0)`, minuit du fuseau du processus. MESURÉ, `grep -rn "TZ" Dockerfile fly.toml render.yaml .env.example` : aucune ligne |
| DECOUVERTE-27 | VU | 3 | `public/app.js:638-639` : `person({id})` cherche dans `S.people` ou `S.likes` et sort par `go('discover')` sans message si absent ; aucune route ne sert un profil isolé |
| DECOUVERTE-32 | VU | 3 | `public/app.js:683` ouvre `person` depuis Messages ; `:420-423` : après décision, `swipePerson()` appelle `go('discover')` quel que soit l'écran d'origine |
| DECOUVERTE-31 | VU | 2 | `public/app.js:164-171` : `n = unread + newMatches + likes`, étiquette « n nouveautés », alors que `server/routes.js:355` renvoie les trois séparément |

**Les notifications**

| id | marque | grav. | preuve |
|---|---|---|---|
| RELATION-26 | VU | 2 | `server/bot.js:25` : `lastNotifiedAt` écrit **avant** `bot.api.sendMessage` (`:29`) ; un refus de Telegram se réduit à un `console.warn` (`:31-35`), la clé reste dépensée |
| RELATION-27 | VU | 2 | `public/app.js:819-830` : le bloc Paramètres contient le test de notification, l'économie de data, l'invitation et l'ajout à l'écran d'accueil — rien sur les notifications elles-mêmes |

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C09) : Hinge accorde 8 likes gratuits par jour avec une
réinitialisation à heure locale connue. **Limite** : chez eux la limite est un levier de monétisation,
chez Mbolo elle sert la qualité du vivier ; la comparaison porte sur la **mise en scène**, pas sur la
finalité. SOURCE (consultée, C17) : les conditions développeurs de Telegram interdisent explicitement
de harceler les utilisateurs avec des messages non sollicités — ce que Mbolo respecte, et qui limite
par construction les leviers de retour disponibles.

**Ce que Mbolo fait mieux** (VU) : parcourir ne coûte rien, seule une décision compte
(`server/routes.js:246-247`) ; les likes reçus sont gratuits et actionnables (`:282-288`), alors que
SOURCE (grille C10) le feed « Likes You » est le principal produit d'appel payant du marché ; aucune
notification n'est envoyée à quelqu'un en train de lire (`:378`, `server/store.js:193-197`).

### Note : **1 sur 3**

Ancrage C17 niveau 1 : « notifications sur événements réels, mais sans limitation **ou** avec un lien
profond qui n'ouvre pas le bon écran ». VU `server/routes.js:311` : le lien profond de « tu as plu à
quelqu'un » pointe vers un écran filtré par l'âge. Le niveau 0 ne s'applique pas : aucune notification
de pur réengagement n'existe (VU, les douze `notify` sont tous déclenchés par un événement réel).
Le niveau 2 échoue sur le seul mot « fiable ».

---

## 7. R7 — Le coût en data et la lenteur

### Mécanisme d'échec

Le premier rendu est otage d'un script tiers chargé en bloquant dans le `<head>` : tant que
telegram.org ne répond pas, il n'y a pas de `<body>` du tout et zéro entrée de peinture, pas même le
bloc « Chargement… » présent dans le fichier (MESURÉ à 1 000, 3 000 et 6 000 ms ; VU `public/index.html:10`
contre `:24`). Ensuite, rien n'est compressé : environ 126 Ko de corps pour atteindre le premier
écran, contre environ 36 Ko en gzip sur les mêmes fichiers (MESURÉ). Enfin, aucun appel réseau n'a de
délai maximal, donc une réponse qui n'arrive jamais laisse l'écran de chargement en place
indéfiniment (VU `public/app.js:59-70`).

### Constats rattachés (13)

| id | marque | grav. | preuve |
|---|---|---|---|
| INSCRIPTION-02 | MESURÉ | 4 | telegram.org mis en attente sans réponse : à 1 000, 3 000 et 6 000 ms, texte à l'écran « (pas de body) », `paint = []`. VU `public/index.html:10` : `<script src>` sans `defer` ni `async`, dans le `<head>` |
| INSCRIPTION-03 | MESURÉ | 3 | avec `Accept-Encoding: gzip, deflate, br` : `/app.js` 65 057 o, aucun `Content-Encoding`, `Content-Length: 65057`. Corps total jusqu'à `welcome` : **125 807 o**. Contre-mesure MESURÉE (C18) : `app.js` 19 129 o en gzip, `styles.css` 8 881, `ui.js` 3 668, `tg.js` 3 234, `index.html` 1 044 — **35 956 o au total** |
| INSCRIPTION-05 | MESURÉ | 3 | `/api/me` qui ne répond pas : « Chargement… » indéfiniment. VU `public/app.js:59-70` : `fetch` sans `AbortController` ni minuteur ; `public/tg.js:205-210` : `cloudGet` ne résout que dans le rappel Telegram |
| INSCRIPTION-06 | VU | 2 | `public/app.js:1285-1286` : deux `cloudGet` séquentiels avant tout `go()`, pour deux réglages inutiles à `welcome` et au formulaire |
| VERIFICATION-06 | MESURÉ | 2 | 31 s sur l'écran d'attente : 6 requêtes API, 5 868 o de corps → 697 requêtes/h ; avec les en-têtes, l'ordre de grandeur d'environ 1 Mo/h tient |
| VERIFICATION-21 | VU | 2 | `public/app.js:59-70` : aucun délai ; `:907-921` : aucun verrou contre un second envoi après erreur |
| DECOUVERTE-15 | MESURÉ | 2 (affaibli) | `GET /api/photos/<id>/1` et `GET /api/photos/<id>` renvoient exactement le même fichier, octet pour octet, que la destination soit une carte plein écran ou une vignette de 40 px. **Les 122 880 octets d'origine sont retirés** : cette photo avait été déposée par l'API sans passer par `compressImage` (VU `public/app.js:82`, 720 px, qualité 0,8), qui plafonne ce qu'un vrai téléphone envoie |
| DECOUVERTE-16 | VU | 2 (réduit) | **La moitié « aucune compression HTTP » est retirée, elle répète INSCRIPTION-03.** Reste : `public/app.js:614-616`, la carte suivante est rendue mais `loadCardPhoto` n'est appelé que pour la carte du haut |
| DECOUVERTE-17 | VU | 2 | `public/app.js:953` : `swipe()` remet `S.people = []` ; `:337-341` : `renderPeople()` recharge `GET /profiles` dès que la liste est vide ; `server/routes.js:271` : jusqu'à 50 profils |
| DECOUVERTE-18 | VU | 3 | `public/app.js:947-950` : `Promise.all([api('/swipes'), throwCard(card, …)])` lance l'appel réseau et l'animation de 320 ms en parallèle |
| DECOUVERTE-22 | VU | 0 | `server/store.js:133-142` : `hasSwiped`, `likedBy` et `swipeOf` parcourent tout `db.swipes` ; `server/routes.js:250-273` les appelle par candidat, jusqu'à 50 |
| DECOUVERTE-24 | VU | 0 | `public/app.js:72-78` : chaque photo devient une URL d'objet mémorisée dans `S.photoUrls`, sans `revokeObjectURL` ; `:92` : le seul appel porte sur l'image d'envoi |
| RELATION-30 | VU | 1 (affaibli) | `server/store.js:197` : présence valable 10 s ; `public/app.js:730` : sondage toutes les 4 s. **Portée corrigée** : deux sondages perdus ouvrent une fenêtre de 2 secondes seulement (t=10 à t=12), pas un état persistant. Il en faut trois pour six secondes |

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C18) : budgets 2026 au 75e percentile — réseau de référence
9 Mbit/s descendant, 100 ms de latence ; pour un chargement en 3 s, 2,0 Mio au total dont 0,3 Mio de
JS. **Limite** : ces budgets ne sont pas des mesures de terrain camerounais. SOURCE (secondaire,
indicatif) : 500 FCFA achètent de l'ordre de 500 à 750 Mo selon l'opérateur — **valeur tirée d'extraits
de recherche non revérifiés, à ne jamais transformer en objectif**.

**Ce que Mbolo fait mieux** (MESURÉ) : le cache fonctionne réellement — 2 941 o à la deuxième ouverture
contre 125 807 à la première, grâce à une empreinte tirée du contenu et non de l'heure de démarrage
(VU `server/assets.js:13-17`), ce qui est **sous la barre des 20 Ko du niveau 2 de C18**. Les photos
sont compressées sur le téléphone avant l'envoi (VU `public/app.js:82-98`) et chargées à la demande
(`:191`, `:256`, `:373-385`). L'app est rapide même sur processeur lent : welcome → étape 1 en 155 ms
avec un CPU bridé ×6 (MESURÉ). **Le coût de démarrage n'est pas dans le code de Mbolo, il est dans le
script tiers bloquant.**

### Note : **0 sur 3**

Ancrage C18 niveau 0 : « le coût n'a jamais été mesuré, **ou** les ressources sont servies non
compressées ». MESURÉ sans ambiguïté : aucun `Content-Encoding`, même avec `Accept-Encoding` demandé.
La seconde condition suffit, la note est 0.

**Cette note est la plus facile à remonter du dossier.** Tout le reste du niveau 2 est déjà tenu :
cache efficace (MESURÉ), photos à la demande (VU), coût horaire du temps réel connu (MESURÉ, 449 o
par sondage, environ 702 Ko par heure de discussion ouverte). Il manque la compression, que `zlib`
fournit dans Node sans aucune dépendance nouvelle. Gain MESURÉ sur les fichiers du dépôt :
125 374 o → 35 956 o.

---

## 8. R8 — La cécité de mesure

### Mécanisme d'échec

La base ne contient que sept tables métier — `users, swipes, matches, messages, reports, blocks, dates`
(VU `server/store.js:9`) — et aucune table d'événements. Les horodatages qui existent sont ceux des
objets métier ; les étapes qui décident du produit ne sont datées nulle part : envoi du selfie,
décision de modération, étape atteinte dans le formulaire, carte affichée, écran vide rendu. Et
`lastActiveAt` est écrasé à chaque requête (VU `server/store.js:200-206`), donc il donne le dernier
passage et jamais l'historique : aucune cohorte, aucun entonnoir, aucune courbe de rétention n'est
calculable aujourd'hui.

### Constats rattachés (3)

| id | marque | grav. | preuve |
|---|---|---|---|
| **MESURE-01** (fusion de INSCRIPTION-28 + DECOUVERTE-23 + RELATION-32) | MESURÉ | **3** (arbitré) | `grep -rniE "analytics\|gtag\|posthog\|amplitude\|mixpanel\|track\("` sur `server/` et `public/` : sortie vide. VU `server/store.js:9` : sept tables, aucune table d'événements. VU `server/store.js:55` : seul `createdAt` existe à la création. VU `server/routes.js:112` : `store.updateUser(req.user.id, { profile })` n'horodate rien. VU `server/routes.js:128` et `server/bot.js:88` : `verification` est une chaîne écrasée |
| VERIFICATION-18 | MESURÉ | 2 | `grep -rn "me/verification" test/` : aucune requête HTTP vers `/me/verification` ni `/me/verification/start` dans les neuf fichiers de test |
| RELATION-31 | MESURÉ | **2** (arbitré) | `grep` sur `test/` : aucune occurrence de `dates`, `checkin`, `/reports`, `unmatch`. Les neuf fichiers couvrent authentification, anti-arnaque, activité, filtres, notifications, photos, profils, empreintes, webhook |

**Arbitrage des gravités.** Les trois identifiants fusionnés portaient 3, 0 et 0 ; les deux constats
de tests portaient 2 et 0. Une gravité 0 n'est pas défendable ici : c'est l'absence d'instrumentation
qui **oblige** cet audit entier à rester structurel et à ne jamais rien quantifier sur des usages
réels. C'est le défaut qui empêche de mesurer tous les autres.

### Écart à l'état de l'art

SOURCE (consultée, `00-benchmark.md` C22) : HEART et le passage Objectifs → Signaux → Métriques
(Rodden, Hutchinson et Fu, CHI 2010, Google) — la colonne « réussite de la tâche » est celle qui manque
à AARRR. SOURCE (secondaire, pages sources inaccessibles, 403 et 429) : repères de rétention du secteur
des rencontres, J1 autour de 24 à 26 %, J30 autour de 5 à 7 %. **Limite explicite, à respecter** : ces
valeurs viennent d'apps installées depuis une boutique, sur des marchés non comparables ; elles ne
doivent jamais servir d'objectif ni de critère de réussite. Comparer Mbolo à lui-même dans le temps.

### Note : **1 sur 3**

Ancrage C22 niveau 1 : « les horodatages métier existent (création de compte, balayage, message) mais
les étapes clés ne sont pas datées : envoi du selfie, décision de modération, étapes du formulaire ».
C'est mot pour mot la situation. VU pour la première moitié : `server/store.js:55` (`createdAt`),
`:136` (`db.swipes[].at`), `:212` (`db.messages[][].at`), `:167` (`matches.createdAt`),
`server/routes.js:445` (`reports.at`), `:434` (`arrivals`). VU pour la seconde : `server/routes.js:128`,
`server/bot.js:88`, et aucun événement d'étape de formulaire.

Le niveau 0 (« aucune instrumentation ; aucun taux calculable ») serait **trop sévère** : les balayages,
les matchs, les messages et les signalements sont horodatés, donc certains taux sont déjà calculables
par une lecture directe de `db.json`. C'est le seul point de départ existant, et le plan de mesure
part de là.

---

## 9. Arbitrages

### 9.1 Doublons fusionnés — onze identifiants retirés

| groupe | conservé | retiré | risque retenu | motif |
|---|---|---|---|---|
| 1 | DECOUVERTE-07 | RELATION-25 | R6 | même fait, même preuve, même risque |
| 2 | DECOUVERTE-11 | RELATION-29 | R6 | mêmes lignes `store.js:157-160` |
| 3 | RELATION-22 | DECOUVERTE-29 | R4 | **gravité arbitrée à 4** : l'app donne deux fois une consigne qu'elle rend elle-même impossible, au pivot exact du produit |
| 4 | VERIFICATION-01 | INSCRIPTION-09 | R5 | une seule ligne de configuration, formulée deux fois |
| 5 | DECOUVERTE-13 | VERIFICATION-17 | R5 | la jauge avantage les profils fictifs |
| 6 | DECOUVERTE-04 | INSCRIPTION-16 | **R5** | **arbitré vers la sécurité** : une ville sans lieu partenaire ne vide pas seulement le vivier, elle retire la promesse du lieu public, qui est la promesse de sécurité (CLAUDE.md §1) |
| 7 | RELATION-17 | DECOUVERTE-28 | **R5, sécurité directe** | arbitré : devoir accuser quelqu'un pour s'en débarrasser est un fait de sécurité directe, pas indirecte |
| 8 | VERIFICATION-09 | INSCRIPTION-27 | R3 | un compte inonde la file de modération |
| 9 | MESURE-01 | INSCRIPTION-28, DECOUVERTE-23, RELATION-32 | R8 | **gravité arbitrée à 3** (la plus haute des trois) |
| 10 | INSCRIPTION-03 | moitié de DECOUVERTE-16 | R7 | « aucune compression » comptée une seule fois ; le préchargement reste propre à DECOUVERTE-16 |

### 9.2 Constat retiré — un

**RELATION-23**, contredit par sa propre preuve (`public/app.js:706`, `:708`). Détail en §4.

### 9.3 Chiffres retirés — quatre

Les taux de faux positifs et de faux négatifs de l'anti-arnaque (44 %, 42 %, 72 %, 76 %), parce
qu'un autre agent a mesuré 15 % et 33 % sur le même code avec un autre corpus, et que les deux corpus
sortent bien ce qu'ils annoncent. Les exemples nommés restent, et ils suffisent. Détail en §4.

Les quatre comptages de contraste d'INSCRIPTION-11, produits par un instrument qui divisait par 255
des composantes `color(srgb …)` déjà comprises entre 0 et 1 — il annonçait 1,01 là où le calcul correct
donne 15,18, et 6,93 là où il donne 2,57. Remplacés par les mesures de la passe adverse. Les trois
ratios cités en exemple (3,70 ; 4,17 ; 1,05) sont exacts et se reproduisent.

### 9.4 Constats affaiblis — six

INSCRIPTION-01 (gravité 4 → 2), INSCRIPTION-12 (ratio corrigé), INSCRIPTION-21 (clavier non mesuré),
DECOUVERTE-15 (chiffre retiré, mécanisme confirmé), DECOUVERTE-20 (seul un like est irréversible),
RELATION-13 (« codée en dur et jamais renouvelée », pas « publiée »), RELATION-30 (fenêtre de 2 s).
Chacun est repris avec sa correction dans la fiche du risque concerné.

### 9.5 Une famille, cinq constats, une seule correction

INSCRIPTION-27 (fusionné), VERIFICATION-02, VERIFICATION-09, RELATION-04 et RELATION-12 sont cinq
surfaces d'un seul mécanisme absent : la limitation de débit, inscrite en **P0-3** de la feuille de
route. Cinq constats légitimes, une seule ligne de travail.

---

## 10. Tableau de bord

| risque | note | constats | dont gravité 4 | le fait qui fixe la note |
|---|---|---|---|---|
| **R5** sécurité des femmes | **0** | 30 | 10 | le check-in reste ouvert après un blocage (MESURÉ, `server/routes.js:428-437`) |
| **R1** vivier vide | **0** | 10 | 1 | une intention et trois villes proposées sans rien derrière (VU `server/config.js:54`, `:56`) |
| **R7** coût en data | **0** | 13 | 1 | aucune compression HTTP (MESURÉ, 125 807 o contre 35 956 o en gzip) |
| **R6** aucune raison de revenir | **1** | 30 | 4 | le lien profond de « tu as plu à quelqu'un » ouvre le mauvais écran (VU `server/routes.js:311`) |
| **R3** temps mort de vérification | **1** | 9 | 1 | un délai est annoncé, rien ne le mesure (VU `public/app.js:574`, aucun horodatage) |
| **R4** silence après le match | **1** | 5 | 2 | le profil disparaît au moment d'écrire (VU `public/app.js:235`, `:659`, `:987`) |
| **R8** cécité de mesure | **1** | 3 | 0 | les horodatages métier existent, les étapes clés ne sont pas datées (VU `server/store.js:9`) |
| **R2** déséquilibre des genres | **1** | 2 | 0 | la règle s'applique, elle n'est expliquée nulle part (VU `server/routes.js:225`) |

Trois risques au niveau 0, cinq au niveau 1, aucun au minimum acceptable. **Aucune note ne repose sur
une supposition** : chaque ligne du tableau nomme un fait VU ou MESURÉ qui suffit seul à la fixer.

Le plan d'action est dans `audit/06-plan.md`. Le plan de mesure, qui conditionne toute évaluation
future de ces notes, est dans `audit/05-mesure-produit.md`.
