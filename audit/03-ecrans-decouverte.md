# Lot « découverte et match » — diagnostic par écran et par risque

Phase 3. Maillons 9 et 10 : écrans `discover`, `filters`, `person`, `match` ; routes `/discover`,
`/profiles`, `/likes`, `/swipes`, `/summary`, `/photos`, `/me/filters`.
Grille figée utilisée sans modification : `audit/00-benchmark.md`. 12 septembre 2026.

## 0. Méthode

**VU** = lu dans le code (`chemin:ligne`). **MESURÉ** = obtenu en exécutant l'app. **SUPPOSÉ** =
hypothèse, avec le test qui la trancherait. **SOURCE** = repère externe repris de la grille figée.
Les notes 0 à 3 portent sur l'écran et ne reposent que sur du VU ou du MESURÉ. Gravité Nielsen : 0
(aucune violation) à 4 (catastrophe).

Mesures refaites aujourd'hui sur base vide, serveur lancé hors du dépôt :
`DATA_DIR=<scratch>/dec/data PORT=3481 ALLOW_DEV_AUTH=true AUTO_APPROVE=true SEED_DEMO=false
BOT_TOKEN=111111:FAKE_AUDIT_TOKEN node server/index.js`. Jeton de bot volontairement faux : le vrai
bot n'a jamais été touché. Serveurs arrêtés, dépôt intact, aucun fichier du produit modifié.

Population : **60 comptes vérifiés**, 2 par (ville x intention x genre), 5 villes x 3 intentions x 2 genres.
MESURÉ, point de vue d'une femme de 24 ans :

| point de vue | `/discover` | `/profiles` | part du vivier |
|---|---|---|---|
| amitié, Yaoundé | 4 cartes (1 525 o) | 4 profils (1 626 o) | 6,7 % de 60 |
| relation sérieuse, Yaoundé | 2 cartes (801 o) | 2 profils (844 o) | 3,3 % de 60 |
| sortie en duo, Garoua | 4 cartes | 4 profils | 6,7 %, **0 lieu partenaire** |

---

## 1. Écran `discover` (cartes et liste)

### Concurrence, Odo, écart

| Sujet | Concurrence (SOURCE, grille §C07-C10, C18, C20) | Odo (VU / MESURÉ) | Écart |
|---|---|---|---|
| Vivier vide | Jamais d'écran vide, élargissement annoncé | Écran vide muet, sans levier ni compteur (VU `public/app.js:605-610`) | total |
| Densité | Vivier installé, pas de compartiment étanche | 15 compartiments étanches, plus le genre pour « sérieux » (VU `server/routes.js:221-227`) | total |
| Ordre | Appariement stable (Hinge), signaux comportementaux (Tinder) | Réciprocité, quartier, puis **identifiant Telegram croissant** (MESURÉ) | fort |
| Quota | Hinge : 8 likes/jour, réinitialisation à heure locale connue | 20 balayages/jour, aucune heure annoncée, fuseau du serveur (VU `server/store.js:157-161`) | moyen |
| Réciprocité | « Likes You » payant chez les leaders | Gratuit et actionnable (VU `server/routes.js:282-288`) | **Odo devant** |
| Coût data | Miniatures serveur, compression | Photo unique servie en taille réelle pour une vignette de 40 px, rien de compressé (MESURÉ) | fort |
| Accessibilité | WCAG 2.2 AA | 0 cible sous 24 x 24, mais 9 sur 12 sous 44 x 44 et 13 textes sous le seuil en clair (MESURÉ) | moyen |

### Notes de l'écran

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C07 Densité et fraîcheur | **0** | Le niveau 0 est atteint deux fois : trois villes proposées à l'inscription sans aucun lieu partenaire (MESURÉ `/venues` = `{"venues":[]}` depuis Garoua ; VU `server/config.js:47-52` contre `:56`), et l'intention « sortie en duo » proposée alors que CLAUDE.md §8 P1-7 la dit inachevée. Écran vide sans levier (VU `public/app.js:605-610`). |
| C08 Règle de découverte | **1** | Critères fixes et cohérents — réciprocité puis quartier (VU `server/routes.js:241`), sans position GPS (VU `:230`) — jamais expliqués à l'écran. Le départage réel au lancement n'est pas un critère (DECOUVERTE-08). |
| C09 Quotas et rareté | **1** | Compteur visible en continu en mode cartes (VU `public/app.js:324`) mais **aucune heure de réinitialisation** : le niveau 2 n'est pas atteint. |
| C10 Réciprocité | **2** | Gratuite (VU `server/routes.js:282-288`), actionnable, remontée en tête du paquet (VU `:241`). Le niveau 3 tombe : MESURÉ, la notification peut mener à un écran sans la personne. |
| C18 Coût en data | **0** | Niveau 0 explicite : ressources servies non compressées. MESURÉ `content-encoding: null` sur `/api/discover`, `/api/profiles`, `/api/photos`. |
| C20 Accessibilité | **1** | Conformité partielle non suivie. MESURÉ : 0 cible sous 24 x 24 (seuil normatif respecté), 9 sur 12 sous 44 x 44, 13 textes sous le seuil de contraste en clair contre 1 en sombre. |
| C22 Mesure produit | **0** | Aucune impression enregistrée, aucun écran vide compté, aucun 429 journalisé. VU `server/store.js:9`. |
| C19 Résilience (cet écran) | **2** | Squelette de chargement (VU `public/app.js:590`), erreur réseau distincte de l'erreur serveur avec « Réessayer » (VU `:136-144`). Niveau 3 non atteint : ni file locale, ni écouteur `online`. |

### Constats

**DECOUVERTE-01 — Quinze compartiments étanches, jamais annoncés.** MESURÉ : sur 60 comptes
vérifiés, une femme de 24 ans à Yaoundé voit **4 profils** en amitié (6,7 %) et **2** en relation
sérieuse (3,3 %). VU `server/routes.js:221-227` : même intention **et** même ville, plus le genre
opposé pour « sérieux ». Aucune de ces coupes n'est dite, ni à l'inscription, ni dans l'écran vide.
Nielsen 4 (visibilité de l'état du système). Sécurité : aucun. R1.
*Correction* : afficher sous la barre de Découvrir le nombre de personnes vérifiées dans le
compartiment courant, et proposer l'élargissement en un tap — âge, puis quartier, puis ville.
`server/routes.js:232-244`, `public/app.js:313-326` et `:603-610`, test dans `test/profiles.test.js`.
**3 à 5 jours.**

**DECOUVERTE-02 — L'écran vide affirme le contraire de la réalité.** VU `public/app.js:607` : en mode
cartes le titre est « Tu as vu tous les profils du moment », que le vivier soit épuisé **ou totalement
vide**. Un nouvel inscrit qui n'a jamais vu une carte lit qu'il les a toutes vues. VU
`public/app.js:346-347` : le mode liste dit correctement « Personne pour l'instant. Aucun profil
vérifié à <ville> avec ton intention. » Nielsen 3 (correspondance système / monde réel). Sécurité :
aucun. R1.
*Correction* : distinguer vivier vide, paquet épuisé et quota atteint ; reprendre le texte du mode
liste. `public/app.js:603-610`. **0,5 jour.**

**DECOUVERTE-03 — L'écran vide n'offre aucun levier.** VU `public/app.js:605-610` : ni compteur, ni
élargissement, ni proposition d'être prévenu. Le seul bouton est « Voir mes messages » (VU `:610`),
qui mène à un écran lui aussi vide au lancement. Nielsen 3. Sécurité : aucun. R1.
*Correction* : trois actions dans l'état vide — élargir l'âge, voir les autres quartiers, être prévenu
à l'arrivée d'un profil compatible (le canal `notify` existe déjà). `public/app.js:603-610`,
`server/routes.js`, `server/bot.js:18-36`. **1 à 2 jours.**

**DECOUVERTE-04 — Trois villes proposées n'ont aucun lieu partenaire.** MESURÉ : depuis un compte à
Garoua, `GET /api/venues` renvoie `{"venues":[]}`. VU `server/config.js:56` (Yaoundé, Douala,
Bafoussam, Buea, Garoua) contre `:47-52` (quatre lieux, trois à Yaoundé, un à Douala). À Bafoussam,
Buea et Garoua on peut matcher mais jamais proposer le rendez-vous en lieu public que la promesse de
sécurité décrit. Nielsen 3. **Sécurité : direct.** R5.
*Correction* : restreindre `CITIES` aux villes couvertes pour la bêta, ou afficher l'absence de lieu
avant l'inscription. `server/config.js:56`, étape 2 du profil, un test. **0,5 jour.**

**DECOUVERTE-05 — Le quota de 20 est consommé par les « Passer ».** MESURÉ : 20 « Passer »
consécutifs → `remaining = 0` ; la 21e action, un « J'aime », reçoit `429 DAILY_LIMIT` avec le message
« Tu as vu tous tes profils du jour. Reviens demain. » alors que la personne n'a liké personne et que
10 profils compatibles restent en base. VU `server/store.js:157-161` (`swipesToday` ne filtre pas sur
`s.action`) et `server/routes.js:295-297`. Le commentaire du code affirme l'inverse : « Parcourir ne
consomme rien ; seul un J'aime compte dans le quota du jour » (VU `server/routes.js:246-247`).
Nielsen 4 (prévention des erreurs). Sécurité : aucun. R6.
*Correction* : ne compter que `action === 'like'`, ou deux compteurs distincts.
`server/store.js:157-161`, `server/routes.js:295`, tests neufs. **1 à 2 jours.**

**DECOUVERTE-06 — Quota épuisé : impossible de répondre à un like reçu.** MESURÉ : Clara reçoit un
like (`/likes` = 1, `/summary.likes` = 1), dépense ses 20 balayages en « Passer », puis tente de
répondre : `429 DAILY_LIMIT`. Après l'échec, `/likes` affiche toujours la personne et le badge
affiche toujours 1. VU `server/routes.js:295` : le quota est contrôlé en tête de `POST /swipes`, avant
toute distinction d'origine. Le match le plus probable du produit — réciprocité déjà acquise — est
refusé, et l'interface continue de l'annoncer. Nielsen 4 (contrôle et liberté). Sécurité : aucun. R6.
*Correction* : exempter du quota la réponse à un like déjà reçu (`store.likedBy(target, me)` vrai).
`server/routes.js:290-300`, un test. **1 à 2 jours.**

**DECOUVERTE-07 — La notification « tu as plu à quelqu'un » ouvre un écran où la personne n'est pas.**
MESURÉ : Diane règle son filtre sur 18-30 ans ; Éric, 45 ans, la like. `/likes` renvoie 1 profil,
`/summary.likes` vaut 1, mais `/discover` renvoie 4 cartes sans Éric. VU `server/routes.js:311` : la
notification porte `params: { screen: 'discover' }`. VU `:237` : `/discover` applique `inAgeRange`.
VU `:278-280` : `likersOf` l'ignore volontairement. Le comportement est **testé comme voulu**
(`test/filters.test.js:51-67`) ; personne n'a rapproché ce choix de la cible de la notification.
Second chemin vers le même vide, MESURÉ : quota épuisé, `/discover` renvoie `{ profiles: [],
remaining: 0 }` (VU `:234`). Nielsen 3 (cohérence et standards). Sécurité : aucun. R6.
*Correction* : pointer la notification sur l'écran qui contient les likes reçus (`screen=matches`, VU
`public/app.js:681-684`) ou créer un écran `likes` et le router dans `boot()`.
`server/routes.js:311` et `:407`, `public/app.js:1289-1297`, un test. **0,5 jour.**

**DECOUVERTE-08 — L'ordre du paquet est l'ordre croissant des identifiants Telegram.** Correction
d'une friction de la cartographie, qui parlait d'ordre d'inscription. MESURÉ : cinq comptes inscrits
dans l'ordre `70009, 70003, 70007, 70001, 70005` ressortent dans l'ordre `70001, 70003, 70005, 70007,
70009`. Mécanisme vérifié : `node -e "const o={}; for (const k of
['70009','70003','70007','70001','70005']) o[k]={id:k}; console.log(Object.values(o).map(x=>x.id)
.join(', '))"` → `70001, 70003, 70005, 70007, 70009`. VU `server/store.js:130` : `Object.values` énumère
les clés numériques en ordre croissant, jamais en ordre d'insertion. VU `server/routes.js:241` : le tri
n'a que deux critères, sans aléatoire ni fraîcheur ; au lancement, où presque tout le monde est à
égalité, c'est donc l'identifiant Telegram qui décide. Comme il croît avec l'ancienneté du compte
Telegram, **tout le monde voit les mêmes profils en tête, dans le même ordre**. Nielsen 2.
Sécurité : aucun. R1 et R2.
*Correction* : départage déterministe par personne (graine `hash(moi + jour)`) et bonus de fraîcheur.
`server/routes.js:236-242`, un test d'ordre. **1 à 2 jours.**

**DECOUVERTE-09 — Aucun accusé de réception du like en mode cartes.** VU `public/app.js:939-959` : le
chemin nominal de `swipe()` n'affiche aucun toast ; le seul retour est la carte qui s'envole. VU
`:421` : depuis le détail d'un profil, le même geste affiche « Aimé. Tu seras prévenu en cas de
match. » Pour savoir qui on a aimé, il faut basculer en mode liste et repérer la pastille « Aimé »
parmi 50 lignes (VU `:330`, `:360`). Nielsen 3 (visibilité de l'état du système). Sécurité : aucun. R6.
*Correction* : même toast dans les deux chemins, et un filtre « Aimés » en mode liste.
`public/app.js:939-959`, `:331-369`. **0,5 jour.**

**DECOUVERTE-10 — Le compteur « X restants » ment, et disparaît là où il servirait.** VU
`public/app.js:952` : `swipe()` décrémente `S.remaining`. VU `:407-423` : `swipePerson()` ne le fait
pas — après des likes donnés depuis la liste ou la bande des likes reçus, le retour au mode cartes
affiche l'ancien nombre. VU `:324` : le compteur n'est rendu qu'en mode cartes, alors que les likes
donnés depuis la liste consomment le même quota. Nielsen 3. Sécurité : aucun. R6.
*Correction* : source unique de vérité renvoyée par `/swipes`, affichée dans les deux modes.
`server/routes.js:290-314`, `public/app.js:313-326`, `:407-423`, `:939-959`. **0,5 jour.**

**DECOUVERTE-11 — Réinitialisation à l'heure du serveur, jamais annoncée.** VU `server/store.js:157-159` :
`new Date()` puis `setHours(0,0,0,0)`, donc minuit du fuseau du processus Node. MESURÉ :
`grep -rn "TZ" Dockerfile fly.toml render.yaml .env.example` ne renvoie rien. En UTC, le quota d'une
personne de Yaoundé (UTC+1) se réinitialise à 1 h du matin locale, et ce qui est fait entre minuit et
1 h compte sur la veille. Le message dit seulement « Reviens demain » (VU `server/routes.js:295`).
Nielsen 2. Sécurité : aucun. R6.
*Correction* : `TZ=Africa/Douala` dans les trois configurations de déploiement (hors de mon périmètre
d'écriture) et heure de réinitialisation affichée. `server/store.js:157-161`, `public/app.js:605-610`.
**0,5 jour.**

**DECOUVERTE-13 — La jauge de confiance est inversée : 1/3 pour les vrais comptes, 3/3 pour les
fictifs.** MESURÉ, compte réel neuf : `trust = {"selfie":true,"guarantor":false,"seniority":false}` →
la carte affiche « Confiance 1/3 » sous une pastille « Vérifié ». MESURÉ avec `SEED_DEMO=true` :
Carine, profil fictif, affiche 3/3. VU `server/routes.js:46` (défaut : `guarantor: false`, `seniority`
vrai seulement après 90 jours, impossible dans une bêta qui ouvre) contre `server/seed.js:6` et `:10`
(`trust: { selfie: true, guarantor: true, seniority: true }` en dur). VU `public/app.js:243-249` : la
jauge est rendue sur chaque carte. Nielsen 4 (correspondance système / monde réel).
**Sécurité : indirect** — la jauge apprend à faire confiance aux profils les moins réels du vivier. R5.
*Correction* : ne pas afficher la jauge tant que le garant (P1-6) n'existe pas, ou n'afficher que
l'information vraie : « selfie vérifié ». `public/app.js:243-249`, `server/routes.js:45-46`. **1 à 2 jours.**

**DECOUVERTE-14 — Un seul « J'aime » sur un profil de démonstration crée un match instantané.**
MESURÉ avec `SEED_DEMO=true` : un homme cherchant une relation sérieuse à Yaoundé voit **une seule
carte**, Carine, `demo: true`, activité « cette semaine », jauge 3/3 ; un like renvoie immédiatement
un `match` et `/matches` contient une discussion. VU `server/routes.js:302-304`. VU `:400-408` :
60 s après la validation de la vérification, un profil de démonstration like automatiquement le
nouveau membre et déclenche « Tu as plu à quelqu'un ». La pastille « démo » n'existe que sur la carte
(VU `public/app.js:222`). Nielsen 3. **Sécurité : indirect.** R4 et R8.
*Correction* : refuser `SEED_DEMO=true` quand `NODE_ENV=production`, comme le fait déjà `allowDevAuth`
(VU `server/config.js:29`). `server/config.js:28`, un test. **0,5 jour.**

**DECOUVERTE-15 — Une photo est servie en taille unique, quel que soit son usage.** MESURÉ : photo de
122 880 octets déposée ; `GET /api/photos/<id>/1` (carte plein écran) renvoie 122 880 octets ;
`GET /api/photos/<id>` (vignette de 40 px de la liste, VU `public/app.js:190-198`) renvoie les mêmes
122 880 octets ; `?w=40` n'est pas honoré, 122 880 octets encore. En-têtes : `image/jpeg`,
`private, max-age=3600`, `content-encoding: null`. VU `server/routes.js:203-211` : `sendFile` du
fichier stocké, aucune variante. La compression n'existe que côté client, 720 px et qualité 0,8
(VU `public/app.js:81-95`), et le serveur accepte jusqu'à 1,5 Mo (VU `server/routes.js:59`).
Nielsen 2 (efficacité). Sécurité : aucun. R7.
*Correction* : produire une miniature de 128 px au dépôt et la servir aux vignettes. Un encodeur
d'image serait une dépendance nouvelle, ce que CLAUDE.md §2 restreint : soit arbitrage du
propriétaire, soit repli sans dépendance en faisant produire deux tailles par le client.
`server/routes.js:156-176` et `:203-211`, `public/app.js:190-198`. **3 à 5 jours.**

**DECOUVERTE-16 — Aucun préchargement, aucune compression.** VU `public/app.js:614-616` : la carte
suivante est rendue mais `loadCardPhoto` n'est appelé que pour la carte du haut. VU
`public/styles.css:356` et `:541` : la carte suivante est non interactive et son contenu est masqué —
elle ne montre rien pendant l'attente. MESURÉ : `content-encoding: null` sur les réponses JSON.
Nielsen 2. Sécurité : aucun. R7.
*Correction* : précharger la photo suivante après le rendu, activer la compression HTTP.
`public/app.js:612-618`, `server/index.js`. **1 à 2 jours.**

**DECOUVERTE-17 — Chaque balayage invalide la liste entière.** VU `public/app.js:953` : `swipe()`
remet `S.people = []`. VU `:337-341` : `renderPeople()` recharge `/profiles` dès que `S.people` est
vide, soit jusqu'à 50 profils (VU `server/routes.js:271`). Nielsen 2. Sécurité : aucun. R7.
*Correction* : mettre à jour la ligne concernée au lieu de vider la liste. `public/app.js:939-959`.
**0,5 jour.**

**DECOUVERTE-18 — La carte part avant la réponse du serveur, puis revient.** VU
`public/app.js:947-950` : `Promise.all([api('/swipes'), throwCard(card, …)])` — animation de sortie
(320 ms) et appel réseau lancés ensemble. Sur réseau lent l'écran reste sur la carte suivante,
volontairement vide (VU `public/styles.css:541`), sans indicateur de progression ; en cas d'échec la
carte déjà sortie revient (VU `:960-967`). Nielsen 3 (visibilité, récupération d'erreur). Sécurité :
aucun. R7.
*Correction* : indicateur au-delà de 400 ms, renvoi en file en cas d'échec. `public/app.js:939-967`.
**1 à 2 jours.**

**DECOUVERTE-19 — Le 429 de quota ne change pas l'écran.** VU `server/routes.js:295` : réponse
`429 DAILY_LIMIT`. VU `public/app.js:268-272` : `showError` sans élément cible se rabat sur un toast.
VU `:960-967` : la carte revient en place et le paquet reste affiché, boutons compris. On peut
balayer indéfiniment, chaque geste produisant une erreur et un appel réseau inutile. Nielsen 3
(prévention des erreurs). Sécurité : aucun. R6 et R7.
*Correction* : sur `DAILY_LIMIT`, basculer sur l'état « quota atteint » et retirer les boutons.
`public/app.js:939-967`, `:603-610`. **0,5 jour.**

**DECOUVERTE-20 — Le geste décide sur toute la carte, et rien ne permet de revenir en arrière.**
VU `public/ui.js:112` : le pointeur est capturé dès 6 px. VU `:119-122` : décision à 32 % de la
largeur **ou** à une vitesse supérieure à 0,7 px/ms au-delà de 40 px. VU `public/app.js:617` : le
geste est attaché à la carte entière, corps de texte compris. VU `server/routes.js:298-300` : un
« Passer » peut redevenir « J'aime », l'inverse jamais — il n'existe donc aucune annulation d'un like.
Sur un téléphone tenu d'une main, un défilement mal orienté suffit. Nielsen 3 (contrôle et liberté).
**Sécurité : indirect** (décision non voulue, quota consommé). R6.
*Correction* : relever le seuil de vitesse, restreindre le geste à la zone photo, ajouter une
annulation du dernier balayage. `public/ui.js:86-141`, `public/app.js:612-618`,
`server/routes.js:290-300`, tests. **1 à 2 jours.**

**DECOUVERTE-21 — La carte de découverte est l'écran le moins lisible en thème clair.** MESURÉ
(dossier de mesures §7.8) : 13 textes sous le seuil WCAG 2.2 AA en clair contre 1 en sombre —
initiale d'avatar 1,12 pour 3,0 ; âge sur la carte 1,91 pour 3,0 ; tampon « J'AIME » 2,90 pour 3,0 ;
« 1/3 » de la jauge 1,91 pour 4,5 ; « 20 restants » 3,70 pour 4,5 ; sept intitulés de section 4,17
pour 4,5. MESURÉ (§7.4) : 9 cibles sur 12 sous 44 x 44, 0 sous 24 x 24. Nielsen 2. Sécurité : aucun. R7.
*Correction* : reprendre les paires de couleurs dérivées du thème pour ces sept rôles de texte,
porter les cibles de la barre de Découvrir à 44 px. `public/styles.css`. **1 à 2 jours.**

**DECOUVERTE-22 — Scans linéaires de toute la base, toutes les 20 secondes.** VU
`server/store.js:133-142` : `hasSwiped`, `likedBy` et `swipeOf` parcourent tout `db.swipes`. VU
`server/routes.js:250-273` : `/profiles` les appelle par candidat, jusqu'à 50, plus `matchBetween`.
VU `:355` : `/summary` appelle `likersOf`, qui parcourt tous les utilisateurs et, pour chacun, tous
les balayages. VU `public/app.js:126` : `/summary` est interrogé toutes les 20 secondes par session.
Nielsen 0 (aucune violation visible aujourd'hui). Sécurité : aucun. R7.
SUPPOSÉ : le coût devient sensible avant la migration PostgreSQL (P0-2). Test falsifiable : rejouer
`/summary` et `/profiles` avec 2 000 comptes et 50 000 balayages, relever le temps au 95e centile.
*Correction* : indexer les balayages par `from` et par `to` en mémoire. `server/store.js:125-160`.
**1 à 2 jours.**

**DECOUVERTE-23 — Aucune impression n'est enregistrée.** VU `server/store.js:9` : les tables sont
`users, swipes, matches, messages, reports, blocks, dates`. Rien ne dit qu'une carte a été affichée,
ni qu'un écran vide a été rendu (VU `public/app.js:603-610`), ni qu'un `429 DAILY_LIMIT` a été
renvoyé (VU `server/routes.js:295`). Le taux de like ne peut donc être calculé que sur les décisions
prises, jamais sur les profils vus, et le symptôme le plus important du lancement — l'écran vide —
est invisible pour l'équipe. Nielsen 0. Sécurité : aucun. R8.
*Correction* : journal d'événements append-only (`impression`, `vide`, `quota`), comptes `demo` et
mode développement exclus. `server/store.js`, `server/routes.js:232-244` et `:290-314`. **3 à 5 jours.**

**DECOUVERTE-24 — Les URL blob des photos ne sont jamais libérées.** VU `public/app.js:72-78` :
chaque photo consultée devient une URL d'objet mémorisée dans `S.photoUrls`, sans `revokeObjectURL` —
le seul appel existant porte sur l'image d'envoi (VU `:92`). Le cache évite de retélécharger la même
photo dans la session, ce qui est un gain de data ; en contrepartie la mémoire de l'onglet croît
pendant toute la session. Nielsen 0. Sécurité : aucun. R7.
*Correction* : borner le cache aux 30 dernières photos et révoquer au-delà. `public/app.js:72-78`.
**0,5 jour.**

---

## 2. Écran `filters`

| Sujet | Concurrence (SOURCE, grille §C07, C09) | Odo (VU) | Écart |
|---|---|---|---|
| Leviers | Distance, âge, intention, centres d'intérêt au même endroit | Tranche d'âge seule (VU `server/routes.js:187`) | fort |
| Ville et intention | Réglables sans refaire le profil | « Ta ville et ton intention viennent de ton profil » (VU `public/app.js:624`), sans lien pour les changer | fort |
| Effet annoncé | Nombre de résultats mis à jour en direct | Aucun compteur | moyen |

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C07 Densité et fraîcheur | **1** | Un levier existe et il est bien fait (bouton secondaire « Tout voir », VU `public/app.js:634`), mais le niveau 2 exige **tous** les leviers à portée de tap — ville, quartier, intention — plus un compteur honnête. |
| C09 Quotas | **1** | Le quota n'apparaît pas sur cet écran, et aucune heure de réinitialisation n'y est annoncée. |
| C23 Langue et erreurs (cet écran) | **2** | Tutoiement, phrases courtes, erreurs actionnables : « Indique des âges entre 18 et 99 ans. » et « L'âge minimum doit être inférieur ou égal au maximum. » (VU `public/app.js:392-393`, `server/routes.js:194-196`). Niveau 3 non atteint : pas de seconde langue. |

**DECOUVERTE-25 — Les deux filtres qui découpent vraiment le vivier ne sont pas dans l'écran Filtres.**
VU `server/routes.js:187` : `DEFAULT_FILTERS` ne contient que `ageMin` et `ageMax`. VU
`public/app.js:624` : l'écran annonce que la ville et l'intention viennent du profil, sans y conduire.
VU `server/routes.js:87-114` : `PUT /me/profile` accepte pourtant un changement de ville et
d'intention à tout moment, sans restriction. Le levier existe, il est à quatre taps, personne ne le
dit. MESURÉ : changer d'intention fait passer le vivier visible de 4 à 2 profils sur la même
population. Nielsen 3 (flexibilité et efficacité). Sécurité : aucun. R1.
*Correction* : deux liens « changer ma ville » et « changer ce que je cherche » depuis Filtres, chacun
ouvrant l'étape voulue du formulaire (`data-action="edit-step"` existe, VU `public/app.js:1162`), plus
le nombre de personnes vérifiées par option. `public/app.js:621-635`, `server/routes.js`. **1 à 2 jours.**

**DECOUVERTE-26 — Aucun filtre de genre hors « relation sérieuse », et l'effet n'est expliqué nulle
part.** VU `server/routes.js:225` : la règle femme/homme n'est appliquée que si
`a.intent === 'serieux'`. MESURÉ : en amitié les 4 cartes contiennent les deux genres ; en relation
sérieuse, seuls les 2 comptes de genre opposé. MESURÉ : le champ `gender` n'est jamais renvoyé par
l'API — clés d'un profil public : `id, name, age, intent, intentLabel, city, area, promptQ, promptA,
languages, photos, hasPhoto, verified, trust, demo, activity, isNew, likedYou`. Une femme inscrite en
amitié reçoit donc des hommes dans son paquet, sans avertissement et sans réglage. Nielsen 3.
**Sécurité : indirect** pour les femmes, qui découvrent l'effet en le subissant. R2 et R5.
*Tension avec CLAUDE.md §5.2* : aucune donnée d'orientation sexuelle ne peut être collectée, et un
filtre de préférence sur « relation sérieuse » en serait une. Je ne recommande donc pas ce filtre.
*Alternative sans donnée nouvelle* : écrire l'effet à l'écran — « En amitié, tu verras des femmes et
des hommes » — à l'étape 2 du profil et sous la barre de Découvrir. `public/app.js:313-326` et étape 2.
**0,5 jour.** Un filtre de genre limité aux intentions non romantiques reste possible, mais c'est une
décision du propriétaire, pas de l'audit.

---

## 3. Écran `person`

| Sujet | Concurrence (SOURCE, grille §C05, C11, C15) | Odo (VU) | Écart |
|---|---|---|---|
| Badge | Badge plus explication en un tap, limites énoncées | Pastille « Vérifié » plus jauge 3 barres, sans explication ni limites (VU `public/app.js:219`, `:243-249`) | moyen |
| Accroche | Hinge : on aime un élément précis, avec commentaire attaché | Like binaire, aucun commentaire (VU `server/routes.js:290-314`) | fort |
| Signaler / bloquer | Bloquer sans accuser, défaire un match en silence | « Signaler ce profil » seul, deux motifs (VU `public/app.js:250`, `:1111-1131`) | fort |
| Persistance | Profil ouvrable par lien, rechargeable | Vit en mémoire seule (VU `public/app.js:638-639`) | moyen |

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C05 Ce que le badge promet | **1** | Badge présent (VU `public/app.js:219`) plus une explication générale portée par les trois intitulés de la jauge (VU `:248`). Le niveau 2 exige une explication qui dit précisément ce qui a été vérifié ; le niveau 3, l'énoncé des limites. Aggravant MESURÉ : la jauge est inversée (DECOUVERTE-13). |
| C11 Lanceur de conversation | **1** | Le profil porte une accroche (`promptQ` / `promptA`, VU `server/routes.js:39-40`, rendue en `public/app.js:235`) mais elle n'est rappelée nulle part au moment d'écrire. |
| C15 Signaler, bloquer, défaire | **1** | Signaler et bloquer en deux taps depuis la carte, avec deux motifs seulement (`money`, `behavior`, VU `public/app.js:1111-1131`). Le niveau 2 exige un unmatch silencieux et des motifs couvrant chantage, images intimes, mineur, usurpation et violence : absents. |
| C19 Résilience (cet écran) | **1** | Après rechargement, l'écran renvoie en silence vers Découvrir (DECOUVERTE-27) : ni message, ni réessai. |

**DECOUVERTE-12 — « Afficher la photo » éjecte du profil consulté et réarme les boutons sur une autre
personne.** VU `public/app.js:1159` : `case 'reveal': S.revealed[el.dataset.id] = true;
SCREENS.discover(); break;` — l'appel est inconditionnel. VU `:217` : le bouton « Afficher la photo »
est rendu par `profileCard()`, donc **aussi sur l'écran `person`** (VU `:637-648`), en économie de
data. Conséquence : sur le détail d'un profil, appuyer sur « Afficher la photo » remplace l'écran par
le paquet de cartes (VU `:586-618`) et `tg.setButtons()` réarme « J'aime » et « Passer » sur la carte
du haut, qui est **une autre personne**. Nielsen 4 (contrôle et liberté, prévention des erreurs).
**Sécurité : indirect** — un like peut partir sur une personne non choisie, et il ne se retire pas
(VU `server/routes.js:298-300`). R6.
*Correction* : rerendre l'écran courant au lieu d'appeler `SCREENS.discover()`. `public/app.js:1159`.
**0,5 jour.**

**DECOUVERTE-27 — Le détail d'un profil n'existe qu'en mémoire et disparaît sans un mot.** VU
`public/app.js:638-639` : `person({id})` cherche le profil dans `S.people` ou `S.likes` et, s'il ne le
trouve pas, appelle `go('discover')` sans message. Aucune route ne sert un profil isolé : `/discover`,
`/profiles` et `/likes` renvoient des listes (VU `server/routes.js:232`, `:250`, `:282`). Après un
rechargement de la mini app, ou si la liste a été vidée par un balayage (VU `public/app.js:953`), la
personne qu'on regardait s'évapore. Nielsen 3 (aide à la récupération d'erreur). Sécurité : aucun. R6.
*Correction* : `GET /api/profiles/:id` et repli de `person()` sur cette route.
`server/routes.js:248-274`, `public/app.js:637-648`, un test. **1 à 2 jours.**

**DECOUVERTE-28 — Depuis un profil, la seule façon de faire disparaître quelqu'un est de l'accuser.**
VU `public/app.js:250` : le seul bouton de la carte est « Signaler ce profil ». VU `:1111-1131` : la
popup impose de choisir entre « Demande d'argent » et « Comportement déplacé », et annonce « Un
modérateur vérifie sous 24 h ». VU `server/routes.js:441-448` : la route enregistre un signalement,
**pose un blocage** et envoie un message texte à la modération ; aucune route ne retire ce blocage.
VU `server/store.js:231` : le blocage est symétrique — la personne disparaît des deux paquets,
définitivement. Nielsen 3 (contrôle et liberté). **Sécurité : direct** — la protection fonctionne,
mais elle est irréversible et indissociable d'une accusation. R5.
Ce constat recoupe le lot « discussion et rendez-vous » ; il est consigné ici parce que le bouton vit
sur la carte de découverte.
*Correction* : séparer « ne plus voir ce profil » (silencieux, réversible) de « signaler »
(accusatoire), et élargir les motifs. `public/app.js:250`, `:1111-1131`, `server/routes.js:441-448`,
une route de retrait, des tests. **3 à 5 jours.**

---

## 4. Écran `match`

| Sujet | Concurrence (SOURCE, grille §C10, C11, C13) | Odo (VU) | Écart |
|---|---|---|---|
| Premier message | Hinge : le commentaire attaché au like **est** le premier message | Champ vide, rien du profil rappelé (VU `public/app.js:650-665`) | fort |
| Passage au rendez-vous | Hinge « Direct to Date » : disponibilités partagées dès le match | Deux boutons : « Écrire à X », « Plus tard » (VU `:664`) | fort |
| Symétrie | Les deux personnes voient le même écran | Une seule le voit ; l'autre reçoit une notification et ne sait rien dans l'app avant son prochain `/summary` (VU `server/routes.js:305-309`, `public/app.js:126`) | moyen |

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C10 Réciprocité | **2** | L'écran de match est gratuit, immédiat, actionnable (VU `public/app.js:650-665`). Le niveau 3 tombe pour la raison exposée en DECOUVERTE-07. |
| C11 Lanceur de conversation | **1** | Lecture exhaustive du front : `promptQ` et `promptA` n'apparaissent qu'à un seul endroit, `public/app.js:235`, dans `profileCard()`. L'écran `match` n'affiche que deux avatars et un nom (VU `:650-665`) ; l'en-tête de la discussion non plus (VU `:717-731`). Aucune amorce en un tap. |
| C13 Passage au rendez-vous (part « dès le match ») | **1** | La proposition est enregistrée, mais rien n'est offert au moment du match : ni lieu, ni créneau. Le reste du cycle relève du lot « discussion et rendez-vous ». |

**DECOUVERTE-29 — Au moment d'écrire, plus rien du profil de l'autre n'est à l'écran.** VU
`public/app.js:235` : l'accroche n'est rendue que dans `profileCard()`. VU `:650-665` : l'écran
`match` montre deux avatars, un nom et la phrase « Brise la glace avec une question sur son profil » —
une consigne qui renvoie à une information que l'écran vient de retirer. VU `:717-731` : l'en-tête de
la discussion ne la rappelle pas non plus, alors que `GET /matches/:id` renvoie bien `other` avec ses
champs (VU `server/routes.js:359-367`). La donnée est disponible et n'est pas affichée. Nielsen 3
(reconnaissance plutôt que rappel). Sécurité : aucun. R4.
*Correction* : rappeler question et réponse sur l'écran `match` et dans l'en-tête de la discussion,
et proposer deux amorces en un tap construites à partir de `promptQ`. `public/app.js:650-665`,
`:717-731`, `:1011-1040`. **1 à 2 jours.**

**DECOUVERTE-30 — L'écran de match ne propose ni lieu ni créneau, alors que tout est en place.** VU
`public/app.js:664` : les deux seules actions sont « Écrire à X » et « Plus tard ». VU
`server/routes.js:412-415` : la liste des lieux partenaires de la ville est déjà servie par `/venues`.
VU `public/app.js:739` : quatre créneaux sont déjà écrits en dur dans l'écran `date`. Le moment où
l'intention est la plus forte est le seul où rien n'est proposé. Nielsen 2 (flexibilité).
**Sécurité : indirect** — plus tôt le rendez-vous est cadré dans un lieu partenaire, moins la
négociation glisse vers un lieu privé. R5.
*Correction* : un troisième bouton « Proposer un lieu » ouvrant l'écran `date` existant.
`public/app.js:650-665`. **1 à 2 jours**, état vide « ville sans lieu partenaire » compris.

**DECOUVERTE-31 — Le badge de l'onglet Messages additionne trois signaux de nature différente.** VU
`public/app.js:164-171` : `n = unread + newMatches + likes`, plafonné à « 9+ », avec pour seule
étiquette « n nouveautés ». VU `server/routes.js:355` : les trois compteurs sont pourtant renvoyés
séparément. MESURÉ : après un like reçu, `/summary` vaut `{"unread":0,"newMatches":0,"likes":1}` et le
badge affiche 1 — indistinguable d'un message non lu. Nielsen 2 (cohérence et standards). Sécurité :
aucun. R6.
*Correction* : n'agréger que les messages non lus et les nouveaux matchs, poser un point distinct pour
les likes reçus. `public/app.js:164-171`. **0,5 jour.**

**DECOUVERTE-32 — Répondre à un like depuis Messages renvoie dans le paquet de cartes.** VU
`public/app.js:683` : la bande « Ont aimé ton profil » ouvre l'écran `person`. VU `:420-423` : après
la décision, `swipePerson()` appelle `go('discover')` quel que soit l'écran d'origine. Qui traite sa
file de likes reçus doit revenir à Messages après chaque personne. Nielsen 3 (flexibilité et
efficacité). Sécurité : aucun. R6.
*Correction* : mémoriser l'écran d'origine et y revenir. `public/app.js:407-429`. **0,5 jour.**

---

## 5. Récapitulatif

| id | constat | écran | Nielsen | sécurité | effort |
|---|---|---|---|---|---|
| 01 | Quinze compartiments étanches, jamais annoncés | discover | 4 | aucun | 3 à 5 j |
| 02 | L'écran vide affirme le contraire de la réalité | discover | 3 | aucun | 0,5 j |
| 03 | Aucun levier dans l'écran vide | discover | 3 | aucun | 1 à 2 j |
| 04 | Trois villes sans lieu partenaire | discover | 3 | **direct** | 0,5 j |
| 05 | Le quota est consommé par les « Passer » | discover | 4 | aucun | 1 à 2 j |
| 06 | Quota épuisé : impossible de répondre à un like | discover | 4 | aucun | 1 à 2 j |
| 07 | La notification mène à un écran sans la personne | discover | 3 | aucun | 0,5 j |
| 08 | Ordre du paquet = identifiants Telegram croissants | discover | 2 | aucun | 1 à 2 j |
| 09 | Aucun accusé de réception du like en cartes | discover | 3 | aucun | 0,5 j |
| 10 | Le compteur « X restants » ment et disparaît | discover | 3 | aucun | 0,5 j |
| 11 | Réinitialisation à l'heure du serveur, non annoncée | discover | 2 | aucun | 0,5 j |
| 12 | « Afficher la photo » éjecte vers une autre personne | person | 4 | indirect | 0,5 j |
| 13 | Jauge de confiance inversée : 1/3 réel, 3/3 fictif | discover | 4 | indirect | 1 à 2 j |
| 14 | Match instantané sur profil de démonstration | discover | 3 | indirect | 0,5 j |
| 15 | Photo en taille unique, 122 880 o pour 40 px | discover | 2 | aucun | 3 à 5 j |
| 16 | Aucun préchargement, aucune compression | discover | 2 | aucun | 1 à 2 j |
| 17 | Chaque balayage invalide la liste entière | discover | 2 | aucun | 0,5 j |
| 18 | La carte part avant la réponse du serveur | discover | 3 | aucun | 1 à 2 j |
| 19 | Le 429 ne change pas l'écran | discover | 3 | aucun | 0,5 j |
| 20 | Geste décisif sur toute la carte, sans annulation | discover | 3 | indirect | 1 à 2 j |
| 21 | 13 échecs de contraste, 9 cibles sous 44 px | discover | 2 | aucun | 1 à 2 j |
| 22 | Scans linéaires toutes les 20 secondes | discover | 0 | aucun | 1 à 2 j |
| 23 | Aucune impression enregistrée | discover | 0 | aucun | 3 à 5 j |
| 24 | URL blob jamais libérées | discover | 0 | aucun | 0,5 j |
| 25 | Ville et intention absentes de l'écran Filtres | filters | 3 | aucun | 1 à 2 j |
| 26 | Aucun filtre de genre hors « sérieux », effet non dit | filters | 3 | indirect | 0,5 j |
| 27 | Le détail d'un profil n'existe qu'en mémoire | person | 3 | aucun | 1 à 2 j |
| 28 | Pour faire disparaître quelqu'un, il faut l'accuser | person | 3 | **direct** | 3 à 5 j |
| 29 | L'accroche disparaît au moment d'écrire | match | 3 | aucun | 1 à 2 j |
| 30 | Ni lieu ni créneau proposés au match | match | 2 | indirect | 1 à 2 j |
| 31 | Le badge Messages additionne trois signaux | match | 2 | aucun | 0,5 j |
| 32 | Répondre à un like renvoie dans le paquet | match | 3 | aucun | 0,5 j |

**Les dix heuristiques de Nielsen sur ce lot.** Visibilité de l'état du système : 01, 09, 10, 18.
Correspondance système / monde réel : 02, 05, 13, 26. Contrôle et liberté : 06, 12, 20, 28.
Cohérence et standards : 07, 31. Prévention des erreurs : 05, 12, 19, 20. Reconnaissance plutôt que
rappel : 29. Flexibilité et efficacité : 03, 15, 16, 17, 25, 30, 32. Esthétique et design minimaliste :
21. Aide à la récupération d'erreur : 19, 27. Aide et documentation : 08, 26.

---

## 6. Ce que Odo fait mieux que la concurrence sur ce lot

1. **Les likes reçus sont gratuits et actionnables** — VU `server/routes.js:282-288` : `/likes` est
   ouverte à tout compte vérifié. SOURCE (grille C10) : c'est le principal produit d'appel payant du
   marché. Odo ne verrouille pas le seul signal qui protège d'un vivier vide.
2. **Le like reçu ignore volontairement la tranche d'âge, pour ne pas mener à un écran vide** —
   VU `server/routes.js:276-277` (commentaire explicite) et `test/filters.test.js:51-67` : le choix
   est testé. L'intention est juste ; c'est la cible de la notification qui ne suit pas.
3. **Parcourir ne coûte rien** — VU `server/routes.js:246-247`, MESURÉ : `GET /profiles` n'affecte pas
   `remaining`. Seule une décision compte, contrairement au modèle dominant.
4. **Aucune position GPS n'est demandée : le quartier déclaré tient lieu de proximité** —
   VU `server/routes.js:230` et `:241`. C'est le choix le plus protecteur du produit sur ce lot.
5. **Le genre ne sort jamais de l'API** — MESURÉ, clés d'un profil public : `id, name, age, intent,
   intentLabel, city, area, promptQ, promptA, languages, photos, hasPhoto, verified, trust, demo,
   activity, isNew, likedYou`. Ni `gender`, ni `createdAt`, ni `lastActiveAt`, ni identifiant Telegram.
6. **L'activité est rabattue avant le match** — VU `server/routes.js:239` et `:255` : « cette semaine »
   au maximum tant qu'il n'y a pas de match. Jamais d'heure exacte, jamais de statut à la seconde.
7. **Un « Passer » peut redevenir un « J'aime », jamais l'inverse** — VU `server/routes.js:298-300`,
   testé `test/profiles.test.js:100-103` : un like a pu prévenir la personne, il ne se retire pas en
   silence.
8. **Seules les photos validées par la modération sont exposées** — VU `server/routes.js:43` et `:207`.
9. **`prefers-reduced-motion` est respecté partout** — VU `public/styles.css:518-520` et
   `public/ui.js:146` : c'est le niveau 3 de C20 sur ce point précis.
10. **Aucune cible tactile sous 24 x 24 sur Découvrir** — MESURÉ : 0 sur 12. Le seuil normatif
    WCAG 2.2 AA (SC 2.5.8) est respecté ; c'est la recommandation mobile de 44 x 44 qui ne l'est pas.
11. **Photos chargées à la demande, jamais en économie de data** — VU `public/app.js:191`, `:256`,
    `:373-385` (vignettes chargées à l'apparition de la ligne, marge de 120 px).
12. **Les liens profonds des notifications de ce lot aboutissent tous** — MESURÉ (mesures §7.5) :
    `screen=discover` tombe sur la valeur par défaut de `boot()` (VU `public/app.js:1297`).
13. **Les profils de démonstration portent une pastille « démo » sur la carte** — VU `public/app.js:222`,
    mais elle disparaît ensuite (DECOUVERTE-14).

---

## 7. Frictions du matériel écartées ou corrigées

| friction reprise du matériel | verdict | preuve |
|---|---|---|
| « L'ordre du paquet est l'ordre d'inscription » | **corrigée** : c'est l'ordre croissant des identifiants Telegram | MESURÉ : inscription `70009, 70003, 70007, 70001, 70005` → paquet `70001, 70003, 70005, 70007, 70009` |
| « Changer de mode ou afficher une photo laisse des écouteurs attachés » | **écartée** : `render()` remplace `app.innerHTML` (VU `public/app.js:131`), la carte et ses écouteurs sont détruits avec le nœud. Le défaut réel est ailleurs (DECOUVERTE-12) | VU `public/app.js:131`, `:1159`, `:1168-1173` |
| « Aucune limitation de débit sur tout le segment » | **confirmée, hors de mon lot** : déjà mesurée (50 signalements en 65 ms, 30 photos en 24 ms), non recomptée ici | dossier de mesures §4 |
| « La jauge affiche 1/3 pour tous les vrais membres » | **confirmée et mesurée** | MESURÉ : `{"selfie":true,"guarantor":false,"seniority":false}` sur un compte neuf |
| « Le quota bloque la réponse à un like reçu » | **confirmée et mesurée** | MESURÉ : `429 DAILY_LIMIT` |
| « Les vignettes téléchargent la photo en taille réelle » | **confirmée et mesurée** | MESURÉ : 122 880 octets dans les deux usages |
| « Le quota se réinitialise à l'heure du serveur » | **confirmée** | VU `server/store.js:157-159` ; aucun `TZ` dans `Dockerfile`, `fly.toml`, `render.yaml`, `.env.example` |

## 8. Ce que je n'ai pas pu trancher

- **La répartition réelle des genres à Yaoundé.** Aucun compteur par genre n'existe. Test falsifiable :
  compter `db.users` par `(city, intent, gender)` après deux semaines de bêta fermée.
- **L'effet du tri « même quartier d'abord ».** VU `server/routes.js:230` : `sameArea` exige une
  égalité exacte de chaîne saisie librement dans 40 caractères (VU `:106`). SUPPOSÉ : très peu de
  personnes écriront « Ngoa-Ekellé » à l'identique. Test falsifiable : distribution du champ `area`
  après 200 inscriptions.
- **Le seuil de 20 balayages par jour.** VU `server/config.js:36` : valeur en dur, sans variable
  d'environnement ni justification, et aucun test ne la couvre (`grep -rn "DAILY_LIMIT\|dailyProfiles"
  test/` sans résultat). Rien ne permet de dire si elle est trop haute ou trop basse.
