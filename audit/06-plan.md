# Odo — plan d'action

Lisible en dix minutes. Si tu n'en lis qu'une partie, lis le §3 : les huit premières lignes, quatre
jours de travail, et sept d'entre elles touchent la sécurité.

---

## 1. Ordre de lecture du dossier

| # | fichier | temps | à quoi ça sert |
|---|---|---|---|
| 1 | **`audit/06-plan.md`** (ce fichier) | 10 min | décider quoi faire lundi matin |
| 2 | `audit/04-risques.md` | 20 min | les huit risques, arbitrés et notés de 0 à 3 |
| 3 | `audit/05-mesure-produit.md` | 15 min | ce qu'il faut poser dans le code pour qu'un chiffre existe un jour |
| 4 | `audit/07-verification.md` | 20 min | la passe adverse : ce qui a été cassé, affaibli, retiré. **À lire avant de contester un chiffre du dossier** |
| 5 | `audit/02-mesures.md` | au besoin | les mesures brutes, avec les commandes |
| 6 | `audit/03-ecrans-inscription.md`, `-verification.md`, `-decouverte.md`, `-relation.md` | au besoin | les 113 constats d'origine, écran par écran |
| 7 | `audit/01-parcours.md` | 10 min | le parcours réel, maillon par maillon |
| 8 | `audit/00-benchmark.md` | au besoin | la grille de 24 critères, figée **avant** tout diagnostic |
| 9 | `audit/08-ecarts-documentation.md` | 5 min | où `CLAUDE.md` ment par rapport au code |

**Un avertissement qui vaut pour tout le dossier.** L'application ne comporte aucune analytique
(MESURÉ, `grep -rniE "analytics|gtag|posthog|amplitude|mixpanel|track\(" server/ public/` : sortie
vide). L'audit est donc **structurel** : il décrit des mécanismes vérifiés dans le code et en
exécution, et ne dit **jamais** combien de personnes sont touchées. Aucun chiffre d'usage n'existe,
donc **aucun RICE n'est possible** : il n'y a pas de « reach » à écrire. D'où le tableau ICE ci-dessous.

**État des lieux en une ligne** : trois risques sur huit sont au niveau 0, cinq au niveau 1, aucun au
minimum acceptable (niveau 2). Détail et preuves : `audit/04-risques.md` §10.

---

## 2. Comment lire le tableau

### 2.1 Impact (1 à 10), ancré sur Odo

| note | ce que ça veut dire ici |
|---|---|
| **10** | la promesse de sécurité de `CLAUDE.md` §1 tombe. *Exemples réels : une personne qui a bloqué son agresseur reçoit encore une notification de lui ; le badge « vérifié » est délivré sans qu'aucun humain ne regarde.* |
| **8-9** | une brèche exploitable sans aucun garde-fou, mais qui demande un geste de l'attaquant. *Exemples : poser un numéro et une demande d'argent dans son profil ; débloquer tout seul l'échange de contacts en envoyant dix messages.* |
| **6-7** | le produit devient vide d'usage pour une part importante des gens. *Exemples : le quota du jour consommé par les « Passer » ; le profil de l'autre inaccessible au moment exact où l'app dit de s'en servir ; trois villes proposées sans rien derrière.* |
| **4-5** | une friction qui coûte des abandons sur un parcours entier. *Exemples : le premier écran otage d'un script tiers ; 126 Ko non compressés ; le formulaire perdu en fermant l'app.* |
| **2-3** | une gêne locale et contournable. *Exemples : le défilement non remis à zéro entre deux étapes ; un badge qui additionne trois signaux de nature différente.* |
| **1** | cosmétique. |

### 2.2 Confiance (1 à 10)

**10** : le fait est MESURÉ et l'effet de la correction est mécanique. **7-9** : le fait est VU, l'effet
est mécanique mais dépend d'un comportement non observé. **4-6** : la correction repose sur une
hypothèse de comportement, pas sur une mesure.

### 2.3 Effort (jours-développeur), échelle imposée

`0,5` · `1 à 2` · `3 à 5` · `plus de 5`. Le score ICE utilise le milieu de la fourchette :
0,5 / 1,5 / 4 / 7. Chaque effort est justifié par les fichiers à toucher, colonne « fichiers ».

### 2.4 La règle qui empêche un correctif de sécurité de se retrouver au niveau d'un ajustement cosmétique

L'échelle d'impact s'en charge mécaniquement : un correctif de sécurité part de 8, un ajustement
cosmétique plafonne à 3. **Et, par-dessus, une règle de tri dure** : aucune action de confort n'est
engagée tant qu'une action de sécurité de la même vague est ouverte, quel que soit son score ICE.
Les actions de sécurité portent le préfixe **S**, le produit **P**, la performance et la data **D**,
la mesure **M**.

---

## 3. Le tableau ICE, trié

| # | action | I | C | eff. | ICE | fichiers à toucher | feuille de route |
|---|---|---|---|---|---|---|---|
| 1 | **S01 — Fermer le check-in au blocage.** Appeler `loadMatch` au lieu du seul `m.users.includes` | 10 | 10 | 0,5 | **200** | `server/routes.js:428-437` ; test neuf `test/dates.test.js` | **hors** (P0-4 le contient, mais n'attend pas) |
| 2 | **S02 — `AUTO_APPROVE=false` et `SEED_DEMO=false` livrés**, plus un refus au démarrage si `NODE_ENV=production` | 10 | 10 | 0,5 | **200** | `fly.toml:14-16` ; `render.yaml:16-20` ; `.env.example:20-24` ; `server/config.js:27-28` ; `server/index.js:67-70` | **hors** |
| 3 | **S03 — Passer `promptQ` par `checkMessage`.** Ajouter `b.promptQ` à `profileText` | 9 | 10 | 0,5 | **180** | `server/routes.js:98` ; `test/profiles.test.js` | **hors** |
| 4 | **S04 — Compter les messages par expéditeur** pour le déblocage des contacts | 9 | 10 | 0,5 | **180** | `server/routes.js:374` ; `server/store.js:211` ; `test/antiscam.test.js` | **hors** |
| 5 | **S05 — Supprimer le message de modération dans Telegram** après décision | 9 | 8 | 0,5 | **144** | `server/bot.js:85-96` | **hors** |
| 6 | **S07 — Geste de vérification à usage unique et expirant** (10 min) | 7 | 10 | 0,5 | **140** | `server/routes.js:116-128` ; `server/store.js` | **hors** |
| 7 | **S06 — Ne plus renvoyer `arrivals` brut** : un booléen par personne, sans horodatage | 7 | 10 | 0,5 | **140** | `server/routes.js:365` | **hors** |
| 8 | **S08 — Ne proposer que les villes réellement servies** à l'inscription | 7 | 10 | 0,5 | **140** | `server/config.js:56` | **hors** — *décision propriétaire* |
| 9 | **P01 — Le quota ne compte que les « J'aime ».** Filtrer sur `action` | 7 | 10 | 0,5 | **140** | `server/store.js:157-161` ; `server/routes.js:295` ; test | **hors** |
| 10 | **D01 — Compression HTTP**, avec `zlib` natif : pré-compresser au démarrage, servir selon `Accept-Encoding` | 7 | 10 | 0,5 | **140** | `server/index.js:36-56` ; `test/assets.test.js` | **hors** |
| 11 | **M1 — Les six horodatages d'entonnoir + le marqueur `devUser`** | 7 | 10 | 0,5 | **140** | `server/routes.js:112, 128, 297, 306, 377` ; `server/bot.js:88` ; `server/auth.js:59` | **hors** — préalable à P0-2 |
| 12 | **P02 — Afficher le profil de l'autre dans la discussion** (en-tête dépliable) | 7 | 9 | 0,5 | **126** | `public/app.js:717-732` (le profil complet est déjà renvoyé par `server/routes.js:366`) | **hors** |
| 13 | **S15 — Filtrer le créneau du rendez-vous** par `checkMessage`, et le fermer à une liste | 6 | 10 | 0,5 | **120** | `server/routes.js:421` ; `public/app.js:739` | P0-4 |
| 14 | **S16 — Interdire la rétrogradation d'un compte vérifié** et ne pas relancer la vérification sur une simple édition de profil | 6 | 10 | 0,5 | **120** | `server/routes.js:116-121` ; `public/app.js:893-899` | **hors** |
| 15 | **P03 — Corriger la cible de « tu as plu à quelqu'un »** : `screen: 'matches'` | 6 | 10 | 0,5 | **120** | `server/routes.js:311` | **hors** |
| 16 | **P04 — « Afficher la photo » ne doit pas éjecter de la fiche** | 6 | 10 | 0,5 | **120** | `public/app.js:1159` | **hors** |
| 17 | **P05 — Retirer « Sortie en duo »** de l'inscription tant que le mode n'existe pas | 6 | 10 | 0,5 | **120** | `server/config.js:54` ; `server/seed.js:10-11` | **P1-7** (branche « retrait ») |
| 18 | **D03 — Délai maximal sur chaque appel et sur le démarrage** (`AbortController`, minuteur sur `cloudGet`) | 6 | 10 | 0,5 | **120** | `public/app.js:59-70` ; `public/tg.js:205-210` | **hors** |
| 19 | **D04 — Donner une issue à l'écran d'échec du démarrage** (réutiliser `renderError`) | 6 | 10 | 0,5 | **120** | `public/app.js:1274-1283`, `:136-144` | **hors** |
| 20 | **M5 — Intégration continue** : `npm ci` et `npm test` sur chaque PR, Node 20 et 22 | 6 | 10 | 0,5 | **120** | `.github/workflows/ci.yml` (neuf) | **P0-1** |
| 21 | **S14 — Anonymiser `from` dans `db.reports`** à la suppression du compte | 5 | 10 | 0,5 | **100** | `server/store.js:75-92` | **hors** — *décision propriétaire* |
| 22 | **S17 — Purger les fichiers des comptes jamais tranchés** (selfie et photos, au-delà de 7 jours) | 5 | 10 | 0,5 | **100** | `server/store.js` ; `server/index.js:64` | **hors** |
| 23 | **D05 — Alléger la réponse de sondage de la discussion** : ne renvoyer le profil et les rendez-vous qu'au premier appel | 5 | 10 | 0,5 | **100** | `server/routes.js:358-367` | **hors** |
| 24 | **M4 — Script en ligne de commande** qui sort l'entonnoir et les six contre-métriques depuis `db.json` | 5 | 10 | 0,5 | **100** | fichier neuf, lecture seule | préfigure **P1-10** |
| 25 | **P09 — Expliquer la règle de découverte à l'écran** (ville, intention, effet du genre) | 5 | 8 | 0,5 | **80** | `public/app.js:586-636` | **hors** |
| 26 | **P06 — Message d'âge distinct pour un champ vide**, borne haute côté client | 4 | 10 | 0,5 | **80** | `public/app.js:854` ; `server/routes.js:92` | **hors** |
| 27 | **D06 — Retirer `maximum-scale=1`** | 4 | 10 | 0,5 | **80** | `public/index.html:5` | **hors** |
| 28 | **M7 — Mettre `CLAUDE.md` à jour** (neuf fichiers de test, trois photos, P0-1 non fait) | 4 | 10 | 0,5 | **80** | `CLAUDE.md`, `AGENTS.md` | **hors** |
| 29 | **P07 — Accusé de réception du like + compteur cohérent** depuis la liste | 4 | 9 | 0,5 | **72** | `public/app.js:939-959`, `:407-423` | **hors** |
| 30 | **P08 — Revenir au bon écran après une décision** prise depuis Messages ou une fiche | 4 | 9 | 0,5 | **72** | `public/app.js:420-423`, `:638-639` | **hors** |
| 31 | **S13 — Les blocages survivent à la suppression du compte protégé** (empreinte salée du seul compte supprimé) | 9 | 10 | 1-2 | **60** | `server/store.js:75-92` ; `server/routes.js:151` ; README | **hors** — *décision propriétaire obligatoire* |
| 32 | **P12 — Marquer le tour de parole** dans la liste des discussions | 5 | 6 | 0,5 | **60** | `server/routes.js:327-338` (la logique existe déjà à `:268-270`) | **hors** |
| 33 | **P15 — Annoncer l'heure de réinitialisation du quota**, et fixer `TZ` | 3 | 10 | 0,5 | **60** | `fly.toml:8-16` ; `render.yaml:11-20` ; `public/app.js:586-620` | **hors** |
| 34 | **D07 — Repli de couleurs sans `color-mix()`** | 5 | 6 | 0,5 | **60** | `public/styles.css:39-64` | **hors** |
| 35 | **S10 — Limitation de débit par utilisateur** (messages, likes, signalements, vérification, rendez-vous) | 9 | 9 | 1-2 | **54** | `server/routes.js:12-14` ; `server/store.js` ; test neuf | **P0-3** |
| 36 | **X4 — Traiter les deux vulnérabilités `qs`** sans changement majeur de version | 3 | 9 | 0,5 | **54** | `package.json`, `package-lock.json` | **P0-10** |
| 37 | **S11 — Unmatch + blocage sans accusation + déblocage + motifs élargis** (chantage, mineur, usurpation, violence) | 8 | 10 | 1-2 | **53** | `server/routes.js:441-449` + routes neuves ; `server/store.js` ; `public/app.js:1107-1131` | **P0-5** + hors |
| 38 | **S12 — Pages `/confidentialite` et `/conditions`**, liées depuis l'accueil, acceptation horodatée | 8 | 10 | 1-2 | **53** | `server/index.js:46-56` (avant le `app.get('*')`) ; deux fichiers `public/` ; `public/app.js:452` | **P0-8** |
| 39 | **D02 — SDK Telegram non bloquant** : `defer`, attente bornée, repli sur le mode hors Telegram | 8 | 10 | 1-2 | **53** | `public/index.html:10` ; `public/tg.js` ; `public/app.js:1269` | **hors** |
| 40 | **S09 — Anti-arnaque** : corriger `\bpret(e\|er)?\b`, couvrir « 10k / 50 mille / registre affectif », nommer la catégorie, remonter chaque blocage à la modération | 8 | 9 | 1-2 | **48** | `server/antiscam.js:14-56` ; `server/routes.js:374-375` ; `public/app.js:1070-1077` ; `test/antiscam.test.js` | **hors** |
| 41 | **S21 — Codes QR de lieux stockés et renouvelables** | 7 | 10 | 1-2 | **47** | `server/config.js:47-52` ; `server/index.js:30-34` ; `server/routes.js:428-437` | **hors** (préalable à P2-1) |
| 42 | **M2 + M3 — Table `events`, purge dans `deleteUser`, rétention, les neuf événements** | 7 | 10 | 1-2 (x2) | **47** | `server/store.js:9, 75-92` ; `server/routes.js:69, 112, 128, 152, 235, 248, 295, 375` ; `.env.example` ; README ; tests | **hors** — préalable à P0-2 |
| 43 | **S18 — Motif de refus de vérification + compteur de tentatives** | 7 | 9 | 1-2 | **42** | `server/bot.js:51, 85-96` | **hors** |
| 44 | **D08 — Contraste du thème clair** (13 textes sous le seuil contre 1 en sombre) | 6 | 10 | 1-2 | **40** | `public/styles.css` | **hors** |
| 45 | **M6 — Tests des routes non couvertes** : vérification, rendez-vous, check-in, signalements, blocage, suppression | 6 | 10 | 1-2 | **40** | `test/` (trois fichiers neufs) | préfigure **P0-7** |
| 46 | **P10 — Écran vide honnête** : distinguer vivier vide / paquet épuisé / quota, compteur de vérifiés dans la ville, leviers d'élargissement | 7 | 8 | 1-2 | **37** | `public/app.js:603-610`, `:344-347` ; `server/routes.js:232-248` | **hors** (C07 niveau 2) |
| 47 | **P11 — Enregistrer le formulaire étape par étape** (CloudStorage) | 6 | 8 | 1-2 | **32** | `public/app.js:458-531`, `:849-899` ; `public/tg.js` | **hors** |
| 48 | **D09 — Vignette de photo séparée**, produite à l'envoi par `compressImage` | 5 | 9 | 1-2 | **30** | `public/app.js:82-98` ; `server/routes.js:212-231` | **hors** |
| 49 | **D10 — Précharger la carte suivante, ne pas recharger 50 profils à chaque balayage, attendre la réponse avant l'animation** | 4 | 9 | 1-2 | **24** | `public/app.js:614-616`, `:947-953`, `:337-341` | **hors** |
| 50 | **S20 — État de compte sanctionné** (`suspended`, `banned`) + boutons d'action dans le signalement en modération | 10 | 9 | 3-5 | **22** | `server/store.js:51-61` ; `server/routes.js:441-449`, `:65-66` ; `server/bot.js:42-45` | **hors** (couvert en partie par P1-10) |
| 51 | **X3 — Déploiement** : volume vérifié, `/health` déjà là, guide pas à pas | 4 | 8 | 1-2 | **21** | `Dockerfile`, `fly.toml`, `render.yaml`, README | **P0-9** (partiellement fait) |
| 52 | **S19 — Cycle de vie du rendez-vous** : `proposed`/`accepted`/`declined`/`cancelled`, notifié des deux côtés, check-in conditionné | 8 | 10 | 3-5 | **20** | `server/routes.js:417-438` ; `server/store.js:234-250` ; `public/app.js:733-763` ; test neuf | **P0-4** |
| 53 | **S23 — File de modération visible** : combien attendent, depuis quand, attribution, verrou de décision | 7 | 9 | 3-5 | **16** | `server/bot.js:42-117` ; `server/store.js` | **hors** (P1-10 le contient) |
| 54 | **X8 — Tableau de bord de modération web protégé** | 7 | 9 | 3-5 | **16** | serveur + page neuve | **P1-10** |
| 55 | **X2 — Tests de bout en bout Playwright** en mode développement, lancés en CI | 5 | 10 | 3-5 | **12,5** | `test/e2e/` ; `.github/workflows/ci.yml` | **P0-7** |
| 56 | **S22 — Personne de confiance prévenue** à l'acceptation et à l'arrivée | 6 | 8 | 3-5 | **12** | `server/routes.js:104-111`, `:417-438` ; `server/bot.js` ; `public/app.js` | **P1-2** |
| 57 | **X1 — Migration PostgreSQL** avec migrations versionnées, interface `store.js` inchangée, script d'import | 7 | 10 | >5 | **10** | `server/store.js` en entier ; `migrations/` ; `package.json` | **P0-2** |
| 58 | **X7 — Anglais et pidgin** | 5 | 7 | 3-5 | **8,75** | tout le front + `server/config.js` | **P1-9** |
| 59 | **X6 — Détection de doublons de visage** | 8 | 6 | >5 | **6,9** | `server/bot.js`, `server/store.js`, dépendance nouvelle | **P1-1** |
| 60 | **X5 — Version web + paiement mobile money** | 6 | 7 | >5 | **6** | `server/payments/`, `server/web/`, `public/`, migrations | **P0-6** |

**Sous le seuil, cités pour mémoire** : libérer les URL blob (`public/app.js:72-78`), indexer les
balayages (`server/store.js:133-142`), porter la présence à 15 s (`server/store.js:197`), séparer les
trois compteurs du badge Messages (`public/app.js:164-171`), justifier les six champs obligatoires à
l'écran (`public/app.js:473-531`), temps réel SSE (**P1-11**).

---

## 4. Trois vagues

### Vague 1 — avant d'ouvrir à de vrais utilisateurs · environ **16 à 20 jours-développeur**

**Actions 1 à 30, plus S10, S11, S12, S09, S13.**

Critère de sortie, à vérifier une par une :

- [ ] un compte bloqué ne peut plus atteindre la personne qui l'a bloqué, par **aucun** canal ;
- [ ] aucun badge « vérifié » n'existe sans qu'un humain ait cliqué ;
- [ ] aucun champ de profil n'échappe au filtre anti-arnaque ;
- [ ] un compte seul ne peut ni inonder la modération, ni débloquer les contacts tout seul ;
- [ ] on peut se débarrasser de quelqu'un sans l'accuser ;
- [ ] les pages de confidentialité et de conditions existent et sont liées depuis l'accueil ;
- [ ] `npm test` tourne sur chaque pull request, Node 20 et 22 ;
- [ ] les six horodatages d'entonnoir sont posés — **chaque jour de bêta sans eux est un jour de
      données perdues pour toujours, sans rattrapage possible.**

**Et une décision, pas un développement** : tant que S01, S02 et RELATION-20 ne sont pas corrigés, la
phrase « Chaque membre a prouvé qu'il est une vraie personne » (VU `public/app.js:446`) ne doit pas
être affichée à un utilisateur réel. Elle affirme le contraire de ce que fait la configuration livrée
(VU `fly.toml:15-16`, `render.yaml:17-20`).

### Vague 2 — pendant la bêta fermée · environ **20 à 25 jours-développeur**

**S19** (cycle de vie du rendez-vous, P0-4), **S20** (compte sanctionné), **S21** (codes QR
renouvelables), **S18**, **M2 + M3** (table `events` et les neuf événements), **M6** (tests des routes
non couvertes), **D02** (SDK non bloquant), **D08** (contraste), **P02**, **P10**, **P11**, **P12**,
**M4**, **X4**, **X3**.

Critère de sortie : la métrique phare de `audit/05-mesure-produit.md` §5.3 devient calculable **et
non falsifiable** — ce qui exige S19 et S21 tous les deux. Une métrique phare falsifiable est pire
que pas de métrique : ici, elle facturerait un lieu partenaire pour un rendez-vous qui n'a pas eu lieu.

### Vague 3 — après la bêta · le reste

**X1** (PostgreSQL, P0-2), **X2** (Playwright, P0-7), **X8** (tableau de bord, P1-10), **S22**
(personne de confiance, P1-2), **X6** (doublons de visage, P1-1), **X7** (langues, P1-9), **X5** (web
et mobile money, P0-6), **D09**, **D10**, **X9** (temps réel, P1-11), et la queue du §3.

---

## 5. Là où ce plan contredit l'ordre de P0, et pourquoi

`CLAUDE.md` §8 écrit que l'ordre de P0 est contraignant. Ce plan le respecte sur deux points et le
contredit sur trois. Chaque écart est argumenté ; aucun n'est un contournement silencieux.

**Respecté.** P0-1 (intégration continue) reste très haut : c'est une demi-journée qui protège tout
ce qui suit, et MESURÉ, `.github/workflows/` ne contient aujourd'hui qu'un déploiement manuel qui ne
lance aucun test — P0-1 n'est pas fait, contrairement à ce que la présence du dossier laisse croire
(`audit/08-ecarts-documentation.md` §3). P0-10 (`npm audit`) reste une demi-journée à faire tôt.

**Contredit 1 — P0-2 (PostgreSQL) passe en vague 3, après P0-3, P0-4, P0-5 et P0-8.**
`CLAUDE.md` §8 précise lui-même le vrai motif : « Obligatoire avant tout paiement ». C'est donc une
condition de **P0-6**, pas de la bêta fermée. VU `server/store.js:1` : le stockage JSON est
explicitement dimensionné pour « une bêta fermée de quelques centaines de personnes ». Consacrer plus
de cinq jours à migrer un magasin dont l'interface ne doit pas changer, pendant que le canal de
check-in reste ouvert à une personne bloquée (MESURÉ), serait le mauvais ordre. **Deux conditions** :
M1 et M2 (`audit/05-mesure-produit.md`) passent **avant** la migration, pour que le schéma définitif
emporte les horodatages ; et la migration reste obligatoire avant la moindre ligne de P0-6.

**Contredit 2 — une dizaine de correctifs hors feuille de route passent avant P0-3.**
Les huit premières lignes du §3 ne figurent nulle part dans `CLAUDE.md` §8. Ce n'est pas un défaut de
la feuille de route : ce sont des défauts découverts par cet audit, dont quatre étaient invisibles
sans exécuter le code. Argument de tri : sept d'entre elles coûtent une demi-journée chacune et
ferment chacune une brèche notée 9 ou 10 en impact. P0-3 (limitation de débit) coûte un à deux jours
et reste en vague 1, juste derrière.

**Contredit 3 — P0-6 (version web et mobile money) passe en vague 3, loin.**
La bêta fermée ne vend rien. §10.2 exige par ailleurs la table `entitlements` et donc PostgreSQL.
Engager plus de cinq jours de développement de paiement avant d'avoir un seul chiffre d'usage, c'est
construire une caisse avant d'avoir une boutique. **Rien dans ce plan n'affaiblit §10** : les règles
d'origine de session, de parité Stars et de non-conservation des données de paiement restent
intégralement applicables le jour où P0-6 démarre.

**Une branche de la feuille de route est prise telle quelle.** P1-7 propose « mode sortie en duo
complet **ou** retrait de l'option tant qu'il n'est pas terminé ». Le plan prend la seconde branche,
pour une demi-journée (action 17), parce que MESURÉ, `grep -rn "duo" server/ public/` ne trouve qu'un
libellé, une icône et deux profils de démonstration : aucune règle.

**Deux règles de `CLAUDE.md` bloquent une recommandation, et je le dis plutôt que de les contourner.**

1. **§5.4, minimisation des données, contre RELATION-20** (supprimer son compte efface les blocages
   qui protégeaient la personne). Conserver un blocage après une demande d'effacement, c'est conserver
   un lien entre deux identifiants Telegram après que l'un a demandé sa suppression. **Alternative
   proposée** (action 31) : ne conserver que l'empreinte salée du seul compte supprimé, en clair
   l'identifiant de la personne signalée — qui, elle, n'a rien demandé. Le blocage se réapplique si la
   personne revient avec le même identifiant, et aucune liste lisible n'est conservée. **Cette
   alternative doit être validée par le propriétaire avant d'être codée**, et documentée dans le
   README au titre de la loi n° 2024/017.
2. **§5.7, aucune vente de bien numérique hors Telegram Stars, contre la recette dominante du marché**
   (verrouiller « qui t'a aimé » derrière un paywall). SOURCE (grille C10) : c'est le principal produit
   d'appel payant de Hinge+, Coffee Meets Bagel Premium et Happn. **Aucune recommandation en ce sens
   n'est faite** : VU `server/routes.js:282-288`, `/likes` est gratuit et actionnable, et
   `audit/04-risques.md` §6 le compte comme un avantage. Alternative déjà inscrite en P2 : monétiser
   le confort en Stars et le B2B au rendez-vous confirmé.

---

## 6. Les trois corrections immédiates

Trois lignes de code. Aucune ne touche la sécurité, ni les données personnelles, ni les paiements.
Aucune n'ajoute de dépendance, de variable d'environnement ni de champ en base. Chacune corrige un
endroit où l'app envoie la personne au mauvais endroit ou nulle part.

**1. La notification « tu as plu à quelqu'un » ouvre le mauvais écran.**
`server/routes.js:311` — remplacer `params: { screen: 'discover' }` par `{ screen: 'matches' }`.
MESURÉ : la personne qui a liké est dans `/likes`, jamais dans `/discover`, parce que `/discover`
applique le filtre d'âge et `/likes` l'ignore volontairement (VU, commentaire `server/routes.js:276-277`).
Les auteurs avaient vu le problème et l'avaient réglé pour `/likes` ; seule la cible de la notification
n'a pas suivi. **Un mot.**

**2. « Afficher la photo » depuis une fiche éjecte vers un écran vide.**
`public/app.js:1159` — conditionner le rendu à l'écran courant : `if (S.screen === 'discover') SCREENS.discover(); else SCREENS.person(...)`.
MESURÉ : la personne atterrit sur un écran Découvrir avec **0 carte et 0 bouton**, et seul un onglet
permet de repartir. **Une condition.**

**3. L'écran d'échec du démarrage n'a ni bouton ni lien.**
`public/app.js:1274-1283` — appeler `renderError` (`public/app.js:136-144`), qui sait déjà proposer
« Réessayer », au lieu de rendre un bloc figé après `tg.setButtons(null)`.
MESURÉ : 0 bouton, 0 lien, 0 élément cliquable, et le titre de l'écran répète mot pour mot le message
du serveur (`401 "Ouvre Odo depuis Telegram."`). **Une fonction déjà écrite, à appeler.**

*Quatrième candidate si la matinée le permet* : retirer `maximum-scale=1` de `public/index.html:5`,
qui interdit le zoom à deux doigts alors que les mentions décisives de l'accueil sont à 13 px et à un
contraste MESURÉ de 3,70 pour un seuil de 4,5.

---

## 7. Ce qui ne peut pas être tranché ici

### 7.1 Sur un vrai téléphone Android, dans Telegram

| # | question | pourquoi ici c'est impossible | ce qui tranche |
|---|---|---|---|
| 1 | Le clavier se ferme-t-il quand on ajoute ou retire une photo ? | Chromium à 360 x 740 n'a pas de clavier virtuel. Seule la **perte de focus** est certaine (VU `public/app.js:1234`, `:1167`, `:523`) | curseur dans « Ta réponse », appuyer sur la croix d'un emplacement photo, observer |
| 2 | `color-mix()` fonctionne-t-il dans la WebView des téléphones visés ? | le défaut de repli est certain (VU `public/styles.css:39-64`) ; la part d'appareils concernés ne l'est pas | ouvrir l'app dans une WebView Chrome antérieure à la version 111 |
| 3 | Combien de temps met réellement le premier écran sur un réseau camerounais ? | les 12 688 ms mesurés sont un **mode de défaillance** (telegram.org injoignable), pas une valeur de terrain | rejouer la trace à Yaoundé, relever la première peinture |
| 4 | Le message de modération est-il réellement supprimé du groupe ? | `BOT_TOKEN` était vide dans les trois serveurs de la passe adverse ; la preuve est un faux Telegram | un bot de test, un groupe privé, `ADMIN_CHAT_ID` renseigné |
| 5 | Le scanner QR marche-t-il dans la lumière d'un lieu partenaire, et que montre le repli ? | VU `public/tg.js:193` : le repli affiche un texte de développement (« Hors Telegram : colle le contenu du QR code ») | scanner au Palmier, puis sur un Telegram antérieur à la version 6.4 |
| 6 | Que montre l'aperçu d'une notification sur écran verrouillé ? | VU `server/routes.js:379` : les 60 premiers caractères du message sont inclus dans la notification | prêter le téléphone à quelqu'un, regarder l'écran verrouillé |

### 7.2 Auprès du propriétaire

1. **Conserver ou non un blocage après la suppression du compte de la personne protégée** (RELATION-20).
   Protection contre droit à l'effacement. L'alternative de l'action 31 doit être acceptée ou refusée
   explicitement.
2. **Purger ou anonymiser `db.reports` à la suppression** (RELATION-21). Purger détruit l'historique
   de modération ; anonymiser conserve un lien.
3. **Le dépôt GitHub est-il public ?** Si oui, les quatre codes QR de `server/config.js:47-52` sont
   lisibles par n'importe qui, et l'action 41 passe en vague 1.
4. **Qui modère, à quelles heures, avec quel délai cible ?** Rien dans le code ne le dit, et c'est le
   plafond de débit de toute la bêta (VERIFICATION-14).
5. **Quelles villes ouvrir, et avec quels lieux partenaires signés ?** Bloque l'action 8.
6. **Garder ou retirer « Sortie en duo » ?** P1-7 laisse le choix ; l'action 17 prend le retrait.
7. **Qui écrit les conditions et la politique de confidentialité, et quelle durée de conservation pour
   chaque donnée ?** Bloque l'action 38 (P0-8).
8. **Accepte-t-il les seules données nouvelles que demande le plan de mesure** — six horodatages, une
   table `events` sans aucun texte, un marqueur `devUser` ? Sans accord, aucun chiffre n'existera.
9. **Quel budget data par personne et par mois vise-t-il ?** Aucun repère local fiable n'existe dans
   le dossier : SOURCE (secondaire, non revérifiée) 500 FCFA pour 500 à 750 Mo — à ne pas transformer
   en objectif.

---

## 8. Les chiffres que ce dossier refuse d'avancer

Par honnêteté, et parce que les inventer serait pire que de les taire.

- **Le taux de faux positifs et le taux de faux négatifs de l'anti-arnaque.** Deux agents, le même
  code, deux corpus écrits à la main : 16 % et 40 % pour l'un, 44 % et 72 % pour l'autre. Les deux se
  reproduisent. Un taux qui varie d'un facteur 2,8 selon le rédacteur mesure le rédacteur. **Ce qui
  reste et qui suffit** : chacun des dix-neuf exemples nommés se reproduit à l'identique.
- **Le nombre de personnes qui abandonnent, et à quelle étape.** Aucune instrumentation, aucune
  rétroactivité possible.
- **Le délai réel de modération.** Aucun horodatage d'envoi ni de décision (VU `server/routes.js:128`,
  `server/bot.js:88`).
- **Le rapport hommes/femmes de la bêta et le nombre de likes reçus par genre.** Deux requêtes sur
  `db.json` suffiraient, elles n'ont jamais été écrites.
- **Le temps réel jusqu'au premier écran sur un réseau camerounais.**
- **La part d'appareils dont la WebView ignore `color-mix()`.**
- **Le poids réel d'une photo envoyée depuis un téléphone.** La mesure de 122 880 octets portait sur
  un fichier déposé par l'API, sans passer par `compressImage`.
- **Tout objectif de rétention.** Les repères du secteur (J1 24-26 %, J30 5-7 %) sont SOURCE secondaire,
  issus d'apps installées depuis une boutique sur d'autres marchés. Ils situent un ordre de grandeur ;
  ils ne fixent pas une cible. **Odo se compare à lui-même dans le temps.**
