# Lot « relation, garde-fous et retour » — diagnostic par écran et par risque

Phase 3. Maillons 11 à 14 : écrans `matches`, `chat`, `date`, `safety`, `me` ; routes `/matches`,
`/matches/:id`, `/matches/:id/messages`, `/matches/:id/dates`, `/dates/:id/checkin`, `/reports`,
`/presence/leave`, `/summary`, `DELETE /me` ; puis tout le retour : `notify()`, clés de limitation,
liens profonds `?screen=`, réinitialisation du quota, retour à J+1, J+7, J+30.
Grille figée utilisée sans modification : `audit/00-benchmark.md`. 12 septembre 2026.

## 0. Méthode

**VU** = lu dans le code (`chemin:ligne`). **MESURÉ** = obtenu en exécutant l'app ou le module.
**SUPPOSÉ** = hypothèse, avec le test qui la trancherait. **SOURCE** = repère externe repris de la
grille figée, jamais transformé en objectif. Les notes 0 à 3 ne reposent que sur du VU ou du MESURÉ.
Gravité Nielsen : 0 (aucune violation) à 4 (catastrophe).

Mesures refaites aujourd'hui sur base vide, serveur lancé hors du dépôt, sans jeton de bot :

```
DATA_DIR=<scratch>/relation/data PORT=3481 ALLOW_DEV_AUTH=true AUTO_APPROVE=true \
SEED_DEMO=false node server/index.js
```

Aucun `BOT_TOKEN` : `notify()` renvoie donc `NO_BOT` et le vrai bot n'a jamais été touché. Les
constats sur les notifications reposent sur le code (VU), pas sur des envois réels. Serveur arrêté,
dépôt intact, aucun fichier du produit modifié ni créé hors de `audit/`.

Population de test : cinq comptes vérifiés (`AUTO_APPROVE`), deux paires appariées à Yaoundé et à
Douala, une troisième personne hors tranche d'âge.

**Correction d'un chiffre du matériel.** `audit/02-mesures.md` et la cartographie citent
`server/antiscam.js:21` pour « crédit » et `:22` pour « prêt ». Les lignes exactes sont `:22`
(`/\bcredit\b/`) et `:25` (`/\bpret(e|er)?\b/`). Les lignes de `server/config.js` et
`server/store.js` de la cartographie sont également décalées ; celles de la grille figée sont bonnes.
Toutes les références ci-dessous ont été relues dans le dépôt au commit `91c1897`.

---

## 1. Écran `matches` — la liste des discussions

### Concurrence, Odo, écart

| Sujet | Concurrence (SOURCE, grille §C10, C12) | Odo (VU / MESURÉ) | Écart |
|---|---|---|---|
| Tour de parole | Hinge « Your Turn », Grindr « Smart Inbox » : la boîte dit qui attend | Tri par date du dernier message seul (VU `server/routes.js:336`) | fort |
| Non-lus | Standard | Présents et comptés (VU `:333`, `public/app.js:702-708`) | **à parité** |
| Réciprocité | « Likes You » payant chez les leaders | Bande « Ont aimé ton profil », gratuite, actionnable (VU `public/app.js:681-684`) | **Odo devant** |
| Discussion morte | CMB fait expirer à 8 jours (écarté par la grille) | Rien n'expire, rien ne se clôt (VU `server/store.js:163-172`) | moyen |
| Sortie de discussion | Unmatch silencieux partout | Aucun (VU : aucune route de suppression de match) | fort |

### Notes de l'écran

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C12 Anti-ghosting | **1** | Le niveau 1 est atteint : les non-lus sont signalés (VU `server/routes.js:333`). Le niveau 2 tombe : aucun tri ni marquage par « qui attend », alors que la logique existe déjà ailleurs dans le produit pour la liste des profils (VU `:268-270`). |
| C10 Réciprocité | **2** | Gratuite et actionnable depuis cet écran (VU `public/app.js:681-684`, `server/routes.js:282-288`). Le niveau 3 tombe, MESURÉ : la notification correspondante mène ailleurs (RELATION-25). |
| C15 Signaler / bloquer / unmatch | **1** | Signaler et bloquer existent avec des motifs génériques. Le niveau 2 tombe deux fois : aucun unmatch, motifs incomplets. |
| C19 Résilience | **2** | Squelette de chargement (VU `public/app.js:669`), erreur réseau distincte avec « Réessayer » (VU `:678`, `:136-144`). Niveau 3 non atteint. |

---

## 2. Écran `chat` — discussion, anti-arnaque, déblocage des contacts, présence

### Concurrence, Odo, écart

| Sujet | Concurrence (SOURCE, grille §C11, C16, C17, C19) | Odo (VU / MESURÉ) | Écart |
|---|---|---|---|
| Lanceur de conversation | Hinge : like ciblé + commentaire, le premier message existe avant le match | « Commence par une question sur son profil » — et le profil est inaccessible (VU `public/app.js:987`, `:1015-1022`) | fort |
| Anti-arnaque | Classification continue, avertissement avant envoi, score par compte | Filtre par motifs, blocage muet, rien ne remonte (VU `server/antiscam.js:42-56`) | fort |
| Faux positifs | Mesurés et tenus bas | **44 % sur mon corpus, 16 % sur celui du dossier de mesures** (MESURÉ) | fort |
| Contacts | Déblocage progressif | Compteur remplissable par une seule personne (MESURÉ) | fort |
| Ne pas notifier qui lit | Standard | Fait, et bien fait (VU `server/routes.js:378`, `server/store.js:193-197`) | **Odo à parité** |
| Clavier pendant la frappe | Standard | Jamais reconstruit (VU `public/app.js:1035-1041`, règle CLAUDE.md §5.16 tenue) | **à parité** |

### Notes de l'écran

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C11 Lanceur de conversation | **1** | Le profil porte bien une accroche (`promptQ`/`promptA`, VU `server/routes.js:39-40`), transmise à chaque appel (VU `:366`), mais jamais rappelée au moment d'écrire (VU `public/app.js:1015-1022`). Niveau 2 non atteint. |
| C16 Anti-arnaque | **1** | Niveau 1 exactement : filtre par motifs, blocage silencieux, message qui ne dit pas quoi corriger (VU `server/antiscam.js:46`). Le niveau 2 tombe trois fois : la catégorie n'est pas nommée, aucune reformulation n'est proposée sur un faux positif, rien ne remonte à la modération. Le niveau 0 est levé, mais par cet audit, pas par le produit. |
| C17 Notifications | **1** | Événements réels, limitation par discussion (VU `server/routes.js:379`), pas de notification si la personne lit (VU `:378`). Le niveau 2 tombe : MESURÉ, un lien profond de réciprocité n'ouvre pas l'écran où la personne se trouve (RELATION-25). |
| C19 Résilience | **2** | Le clavier survit, les erreurs sont affichées sans reconstruire le champ (VU `public/app.js:1070-1077`). Niveau 3 non atteint : pas de file locale, pas d'indicateur par message, les erreurs de sondage sont avalées (VU `:1056`). |
| C22 Mesure | **0** | Aucun message refusé n'est journalisé, aucune règle déclenchée n'est renvoyée (VU `server/antiscam.js:42-56`). |

---

## 3. Écran `date` — proposition de rendez-vous et check-in QR

### Concurrence, Odo, écart

| Sujet | Concurrence (SOURCE, grille §C13, C14) | Odo (VU / MESURÉ) | Écart |
|---|---|---|---|
| Lieux | Happn « Perfect Date » : suggestion algorithmique via Foursquare | Lieux réels, négociés, avec avantage commercial (VU `server/config.js:47-52`) | **Odo devant** |
| Cycle de vie | Standard implicite : un rendez-vous se refuse et s'annule | MESURÉ : `accept`, `decline`, `cancel` → 404 ; statut figé à `proposed` | total |
| Preuve d'arrivée | Hinge « We Met » : déclaration | Code QR en lieu partenaire — mais code constant et publié (MESURÉ) | **principe devant, mise en œuvre derrière** |
| Personne de confiance | Tinder « Share My Date », Bumble « Share Date » | Une phrase, répétée trois fois, jamais une fonction (VU `public/app.js:783`, `:841-842`) | total |
| Après le rendez-vous | Point de contrôle, signalement à chaud | Rien (VU : `server/routes.js:428-438` est la dernière route du parcours) | total |

### Notes de l'écran

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C13 Cycle de vie | **1** | Niveau 1 exactement : la proposition est enregistrée, aucune réponse structurée n'est possible, le statut reste figé (MESURÉ, VU `server/routes.js:423`). Le niveau 2 tombe aussi sur le check-in, qui n'est conditionné à rien (VU `:428-437`). |
| C14 Sécurité de la rencontre | **1** | Conseils écrits et accessibles (VU `public/app.js:773-778`), lieu public **imposé** — mais le niveau 2 tombe : le repli du scanner hors Telegram est un texte de développement (VU `public/tg.js:193`) et trois des cinq villes ouvertes n'ont aucun lieu partenaire (VU `server/config.js:47-52` contre `:56`). |
| C15 (check-in) | **1** | Voir RELATION-01 : le check-in survit au blocage. |
| C22 Mesure | **1** | Les arrivées sont bien enregistrées, par lieu et par rendez-vous (VU `server/store.js:234-250`) — c'est l'assiette B2B prévue en P2-1 — mais elles sont falsifiables et non dédoublonnées (MESURÉ). |

---

## 4. Écran `safety` — signaler, bloquer, guide anti-chantage

### Concurrence, Odo, écart

| Sujet | Concurrence (SOURCE, grille §C15) | Odo (VU / MESURÉ) | Écart |
|---|---|---|---|
| Bloquer sans accuser | Disponible partout | Impossible : toute sortie crée un signalement (VU `public/app.js:1111-1131`) | fort |
| Motifs | Couvrant chantage, images intimes, mineur, usurpation, violence | Deux : `money`, `behavior` (VU `public/app.js:1116-1117`) | fort |
| Suite donnée | DSA art. 17 : motivation claire (hors champ au Cameroun, standard de fait) | « Un modérateur vérifie sous 24 h » (VU `:1114`), jamais suivi d'effet (VU `server/routes.js:447`) | fort |
| Sanction | Porte sur toutes les discussions du compte | Aucun état de compte sanctionné (VU `server/store.js:51-61`) | total |
| Discrétion | Pas d'identifiant exposé | Pseudo et numéro jamais montrés (VU `server/routes.js:29-54`) | **Odo à parité, et il le dit** |

### Notes de l'écran

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C15 Signaler / bloquer / suite | **1** | Niveau 1 : signaler et bloquer existent, motifs génériques. Niveau 2 tombe trois fois : aucun unmatch silencieux, motifs incomplets, et la sanction ne porte que sur la relation signalée. |
| C06 Barrière au retour | **0** | Le niveau 0 est atteint mot pour mot : « aucun état de sanction ; un signalement n'a d'effet que sur la relation signalée » (MESURÉ, VU `server/routes.js:441-448`). |
| C23 Ton et messages | **2** | Ton conforme à CLAUDE.md §5.10 sur tout l'écran. Le niveau 3 tombe : une seule langue, alors que Buea est proposée à l'inscription (VU `server/config.js:56`). |

---

## 5. Écran `me` — réglages, notifications, suppression de compte

### Concurrence, Odo, écart

| Sujet | Concurrence (SOURCE, grille §C17, C24) | Odo (VU / MESURÉ) | Écart |
|---|---|---|---|
| Réglage des notifications | Réglage fin par type dans l'app | Aucun : seulement un test (VU `public/app.js:819-830`) ; bot sans `/stop` (VU `server/bot.js:105-117`) | fort |
| Suppression de compte | En autonomie | Deux taps, bouton + confirmation (VU `public/app.js:831`, `:1203-1214`) | **Odo devant** |
| Complétude de la suppression | Tout ou rien | MESURÉ : `db.reports` et les blocages survivent ou disparaissent au mauvais moment | fort |
| Économie de data | Plafond réglable (Spotify Lite) | Interrupteur oui, compteur en mégaoctets non (VU `public/app.js:822-826`) | moyen |

### Notes de l'écran

| Critère | Note | Ce qui fixe la note |
|---|---|---|
| C17 Notifications | **1** | Le niveau 3 exige un réglage par type, une gestion du 429 et un journal des injoignables : aucun des trois (VU `public/app.js:819-830`, `server/bot.js:31-35`). |
| C24 Discrétion et suppression | **1** | Suppression en autonomie, en deux taps, mais **incomplète** : `db.reports` conserve les lignes du compte supprimé (MESURÉ, VU `server/store.js:75-92`). Le niveau 2 exige une suppression « complète et vérifiée ». |

---

## 6. Constats

Chaque constat porte sa marque, sa preuve, sa gravité Nielsen, son impact sur la sécurité des
personnes (aucun / indirect / direct), sa correction et son coût.

### Garde-fous : ce qui protège et ce qui ne protège pas

**RELATION-01 — Le check-in ignore le blocage : un canal de notification qui survit au signalement.**
MESURÉ : après que 1002 a signalé et bloqué 1001, `POST /matches/:id/messages` renvoie
`{"code":"BLOCKED"}`, `POST /matches/:id/dates` aussi, mais `POST /dates/:id/checkin` renvoie
`{"arrived":true}`. VU `server/routes.js:428-437` : la route ne fait aucun appel à `store.isBlocked`,
contrairement à `loadMatch` (VU `:323`). Chaque appel déclenche `notify(otherId, …)` sans clé de
limitation (VU `:436`). MESURÉ : cinq check-ins consécutifs sur le même rendez-vous ont tous été
acceptés, donc cinq messages Telegram à la personne qui vient de signaler. Nielsen **4**. Sécurité
**directe**. Correction : appeler `loadMatch` dans la route, et rendre l'arrivée idempotente (écrire
et notifier une seule fois). **0,5 jour** : trois lignes dans `server/routes.js`, plus un
`test/dates.test.js` qui n'existe pas encore.

**RELATION-02 — Signaler ne retire personne : aucun état de compte sanctionné n'existe.**
VU `server/routes.js:441-448` : `addReport`, `block` du seul plaignant, `notifyAdmin` en texte. VU
`server/store.js:51-61` : le modèle utilisateur n'a ni `banned`, ni `suspended`. VU
`server/bot.js:119-133` : les deux seuls rappels de modération valident ou refusent un selfie ou une
photo. MESURÉ : après 51 signalements, `GET /api/me` du compte visé renvoie toujours
`verification: approved`, et ce compte continue de découvrir, de liker et d'écrire à tous les autres.
Nielsen **4**. Sécurité **directe**. Correction : champ `status` (`active` / `suspended` / `banned`)
contrôlé dans `requireApproved`, effet sur toutes les discussions du compte. **3 à 5 jours** :
`server/store.js`, `server/routes.js`, `server/bot.js`, `test/`.

**RELATION-03 — Le signalement arrive en modération sans aucun bouton.**
VU `server/routes.js:447` : `notifyAdmin` reçoit une chaîne. VU `server/bot.js:42-45` : `notifyAdmin`
n'attache jamais de clavier, contrairement à `sendSelfieToModeration` (VU `:51`) et
`sendPhotoToModeration` (VU `:65`). VU `server/bot.js:119` et `:127` : les deux seules familles de
rappels sont `approve|reject` et `photo:approve|photo:reject`. Un modérateur qui reçoit un
signalement n'a donc littéralement rien à appuyer. Nielsen **3**. Sécurité **directe**. Correction :
`InlineKeyboard` sur `notifyAdmin`, rappels `ban:<id>` et `ignore:<id>`. **1 à 2 jours** :
`server/bot.js`, `server/routes.js`, tests. Dépend de RELATION-02 pour avoir un état à écrire.

**RELATION-04 — 50 signalements de la même personne en 365 ms, aucune limite, aucun dédoublonnage.**
MESURÉ : 50 `POST /api/reports` sur la même cible en 365 ms, 51 lignes écrites en base. VU
`server/routes.js:12-14` : le routeur n'installe que `requireAuth` et `touchActivity`, aucun compteur.
VU `:441-444` : aucun match n'est exigé, seulement que la cible existe. Conséquence : la file de
modération est noyable par un seul compte, et 50 messages partent au groupe. Nielsen **3**. Sécurité
**directe**. Correction : plafond par compte et par jour, dédoublonnage par `(from, targetId)`,
exiger un match ou une apparition en découverte. **1 à 2 jours** : `server/routes.js`,
`server/store.js`, tests. C'est la tâche P0-3 de la feuille de route, restreinte à une route.

**RELATION-05 — Le compteur de déblocage des contacts se remplit tout seul.**
MESURÉ : un seul compte envoie dix messages en **86 ms**, puis « Mon whatsapp 677889900 » passe au
onzième — l'autre personne n'a jamais écrit un mot. VU `server/routes.js:374` :
`checkMessage(text, store.messagesOf(r.m.id).length, …)` compte le **total** du match, sans
distinction d'auteur. L'écran affiche pourtant « Liens et numéros débloqués à 10 messages » avec une
barre de progression (VU `public/app.js:1001-1005`) : la barrière annoncée n'existe pas. Nielsen
**4**. Sécurité **directe**. Correction : compter les messages de l'autre personne, ou le minimum des
deux compteurs. **0,5 jour** : une ligne dans `server/routes.js`, plus un test.

**RELATION-06 — Anti-arnaque, faux positifs : 44 % sur mon corpus, à commencer par « tu es prête ? ».**
MESURÉ, corpus de 50 messages (25 du quotidien camerounais, 25 formulations d'arnaque), exécution du
`checkMessage` du dépôt : **11 légitimes sur 25 bloqués (44 %)**, exactitude globale 42 %. Chaque
blocage et sa règle, toutes VU dans `server/antiscam.js` :

| message bloqué à tort | règle | ligne |
|---|---|---|
| « Salut, tu es prête pour samedi ? » | `/\bpret(e\|er)?\b/` | `:25` |
| « Il fait frais ce matin à Bastos » | `/\bfrais\b/` | `:23` |
| « Les frais de scolarité sont chers » | `/\bfrais\b/` | `:23` |
| « ça me coûte 300 F pour venir » | `/\d+ ?(f\|fcfa\|francs\|cfa…)/` | `:28` |
| « J'ai plus de crédit sur mon téléphone » | `/\bcredit\b/` | `:22` |
| « Je fais un crédit pour ma moto » | `/\bcredit\b/` | `:22` |
| « Mon frère m'a dépanné hier » | `/\bdepann/` | `:26` |
| « J'ai visa pour mon voyage » | `/\bvisa\b/` | `:21` |
| « Le transfert de mon dossier a pris du temps » | `/\btransf[e]?r/` | `:19` |
| « Je suis om… pardon, je suis au marché » | `/\bom\b/` | `:18` |

Limite d'honnêteté : mon corpus est construit pour éprouver les règles connues, il surreprésente donc
les échecs ; `audit/02-mesures.md` donne 16 % sur une composition différente. Les deux encadrent le
taux réel. Le fait robuste, indépendant du corpus : **« prête » est bloqué**, et c'est le mot le plus
courant pour fixer un rendez-vous en français. Curiosité qui montre la fragilité de la règle :
« Prête-moi ton stylo » **passe**, parce que la normalisation retire le trait d'union (VU `:12`) et
détruit la limite de mot. Nielsen **4**. Sécurité **indirecte** : une personne accusée à tort de
demander de l'argent emmène l'échange ailleurs, hors de toute protection. Correction : retirer
`visa`, `om`, `frais`, `credit` seuls et exiger un contexte (verbe de demande ou d'envoi à proximité) ;
remplacer `pret(e|er)` par les seules formes de demande. **1 à 2 jours** : `server/antiscam.js`,
`test/antiscam.test.js` élargi aux onze phrases mesurées.

**RELATION-07 — Anti-arnaque, faux négatifs : 72 % des formulations d'arnaque passent.**
MESURÉ, même corpus : **18 sur 25 passent** au premier message, 19 après le dixième. Passent, entre
autres : « envoie juste 10k », « il faut 50 mille », « Il me faut 5 mille pour le taxi »,
« ma tante est malade à l'hôpital », « paie juste la douane », « Achete moi une carte de recharge »,
« Tu peux me faire un petit geste », « Small small helep me, even 2000 na ok »,
« Give me small money for chop », « Mon compte bancaire est bloqué, aide-moi ». Deux trous
structurels : les montants en argot (`10k`, `mille`) échappent au motif chiffre + devise (VU `:28`),
et la normalisation qui retire `.` `-` `_` (VU `:12`) détruit le motif de numéro camerounais (VU
`:33`) — MESURÉ, « 6.77.88.99.00 » et « 6-77-88-99-00 » passent dès le premier message alors que
« 677889900 » est bloqué. Nielsen **4**. Sécurité **directe**. Correction : motif de montants en
argot, application du motif de numéro au texte brut avant normalisation, et un lexique pidgin nourri
par les vrais messages signalés. **1 à 2 jours** : `server/antiscam.js`, tests.

**RELATION-08 — Le message de blocage accuse, ne nomme pas la catégorie et ne dit pas quoi corriger.**
VU `server/antiscam.js:46` : « Les demandes et offres d'argent sont bloquées sur Odo. » VU
`public/app.js:1072` : l'interface ajoute « Reformule sans montant ni moyen de paiement. »
**uniquement** pour `MONEY_BLOCKED` ; `CONTACT_TOO_EARLY` affiche le message brut (VU
`server/antiscam.js:52`). Sur un faux positif — « Tu es prête ? » — la personne lit qu'elle est
soupçonnée de demander de l'argent, sans savoir quoi changer. Le niveau 2 de C16 résout la tension
avec CLAUDE.md §5.11 : nommer la catégorie et proposer une reformulation, jamais le mot déclencheur.
Nielsen **3**. Sécurité **indirecte**. Correction : message par catégorie, plus un lien « ce n'est pas
une demande d'argent » qui journalise le faux positif sans révéler la règle — c'est aussi la seule
matière de mesure possible pour C16. **1 à 2 jours** : `server/antiscam.js`, `server/routes.js`,
`public/app.js`, tests.

**RELATION-09 — Un blocage anti-arnaque ne remonte nulle part, et aucun score par compte n'existe.**
VU `server/antiscam.js:42-56` : `checkMessage` ne renvoie pas la règle déclenchée et n'écrit rien. VU
`server/routes.js:374-375` : réponse 422, aucun appel à `notifyAdmin`, aucune trace. VU
`server/store.js:9` : la base ne contient aucune collection d'événements. MESURÉ : **128,6
messages par seconde** acceptés depuis un même compte (40 messages en 311 ms), donc un compte peut
tenter des dizaines de demandes d'argent par seconde sans jamais apparaître nulle part. Nielsen **3**.
Sécurité **directe**. Correction : compteur de refus par compte, seuil d'escalade vers la modération,
plafond de débit. **1 à 2 jours** : `server/store.js`, `server/routes.js`, `server/bot.js`, tests.

### Rendez-vous et rencontre physique

**RELATION-10 — Impossible d'accepter, de refuser ou d'annuler un rendez-vous.**
MESURÉ : `POST /dates/:id/accept`, `/decline`, `/cancel` et `/status` renvoient tous **404**. VU
`server/routes.js:423` : `status: 'proposed'` est écrit à la création ; la seule autre écriture est
`updateDate` pour `arrivals` (VU `:434`). VU `public/app.js:980` : pastille « Proposé » figée. VU
`:982` : le bouton « Je suis arrivé(e) » est offert **aux deux personnes dès la création**, y compris
à celle qui n'a jamais répondu. Nielsen **4** (contrôle et liberté de l'utilisateur). Sécurité
**directe** : personne ne peut refuser un rendez-vous sans quitter l'app, et l'app pousse la personne
sollicitée vers un bouton d'arrivée pour un rendez-vous qu'elle n'a pas accepté. Correction : les
quatre statuts, une route de transition, une notification par transition, check-in conditionné à
`accepted` — c'est P0-4. **3 à 5 jours** : `server/store.js`, `server/routes.js`, `server/bot.js`,
`public/app.js`, tests.

**RELATION-11 — Le créneau est un texte libre de 40 caractères, jamais filtré, réinjecté dans une notification Telegram.**
MESURÉ : `POST /matches/:id/dates` avec `slot: "APPELLE MOI 677889900 URGENT ARGENT"` est accepté et
la chaîne repart telle quelle. VU `server/routes.js:421` : seul `String(...).slice(0, 40)`, jamais
`checkMessage` — alors que le profil y passe (VU `:99`) et les messages aussi (VU `:374`). VU `:424` :
la chaîne est concaténée dans le texte de la notification, qui s'affiche sur l'écran verrouillé. Les
quatre créneaux proposés ne sont qu'un décor côté client (VU `public/app.js:739`). Nielsen **3**.
Sécurité **directe** : canal de contournement de l'anti-arnaque, hors discussion. Correction :
n'accepter qu'un créneau d'une liste fermée côté serveur, ou passer `slot` par `checkMessage`.
**0,5 jour** : `server/routes.js`, un test.

**RELATION-12 — 30 propositions de rendez-vous en 274 ms, chacune une notification sans clé de limitation.**
MESURÉ : 30 `POST /matches/:id/dates` en 274 ms, **31 cartes empilées** dans la discussion de l'autre
personne. VU `server/routes.js:424` : `notify(...)` est appelé sans quatrième argument, donc sans
fenêtre, à comparer aux messages (VU `:379`, clé `msg:<matchId>`, 2 minutes). Même absence au match
(VU `:307`) et au check-in (VU `:436`). Nielsen **3**. Sécurité **directe** : canal de harcèlement par
notification, qui survit à la mise en sourdine de l'app puisqu'il passe par Telegram. Correction :
clé `date:<matchId>`, et un seul rendez-vous ouvert par discussion. **0,5 jour** :
`server/routes.js`, un test.

**RELATION-13 — Le code QR des lieux est une constante publiée : le check-in est falsifiable depuis chez soi.**
MESURÉ : `POST /dates/:id/checkin` avec `{"code":"rdv:lieu:palmier"}` renvoie `{"arrived":true}` sans
être jamais sorti, et **cinq confirmations successives** pour la même personne et le même rendez-vous
sont toutes acceptées, chacune notifiant l'autre. VU `server/config.js:48-51` : quatre codes fixes en
clair dans le dépôt ; VU `README.md:288` donne l'exemple exact à coller. VU `server/config.js:42-43`
reconnaît d'ailleurs le problème en commentaire. Conséquence : le seul signal de résultat réel du
produit — et l'assiette de la facturation B2B prévue en P2-1 — n'est pas fiable. Nielsen **3**.
Sécurité **directe** : une personne peut faire croire à l'autre qu'elle est arrivée au café.
Correction : code tournant par lieu (graine plus fenêtre de temps), arrivée unique et horodatée,
contrôle de plausibilité par rapport au créneau. **3 à 5 jours** : `server/config.js`,
`server/store.js`, `server/routes.js`, `server/index.js` (route `/qr`), tests.

**RELATION-14 — L'arrivée de l'autre est transmise au client puis jetée par l'interface, et l'horodatage exact fuit.**
MESURÉ : depuis le compte qui n'est **pas** arrivé, `GET /api/matches/:id` renvoie
`"arrivals": {"2001": 1789172585415}` — l'horodatage à la milliseconde de l'autre personne — avec
`arrivedMe: false`. VU `server/routes.js:365` : le `{ ...d, … }` recopie tout l'objet, `arrivals`
compris. VU `public/app.js:976-982` : l'interface ne lit que `arrivedMe`, donc la personne assise au
café ne voit jamais dans l'app que l'autre est arrivée. Deux effets contraires dans la même ligne :
l'information utile n'est pas montrée, et une donnée plus précise que tout le reste du produit est
exposée, alors que l'activité est partout arrondie en tranches (VU `server/routes.js:19-26`).
Ceci **corrige** la cartographie, qui affirme que « la route ne renvoie que `arrivedMe` ». Nielsen
**3**. Sécurité **indirecte**. Correction : ne renvoyer que deux booléens, `arrivedMe` et
`arrivedOther`, et afficher les deux sur la carte. **0,5 jour** : `server/routes.js`,
`public/app.js`, un test.

**RELATION-15 — Rien n'existe après le rendez-vous.**
VU : `server/routes.js:428-438` est la dernière route liée aux rendez-vous ; la suivante est
`/reports` (`:441`). Aucun écran, aucune tâche, aucune notification ne se déclenche après une arrivée.
VU `server/store.js:234-250` : l'objet rendez-vous n'a aucun champ de clôture. Conséquences en
chaîne : aucun « es-tu bien rentrée », aucun signalement à chaud, aucun signal de résultat réel
exploitable (niveau 3 de C08, C13 et C22), et la facturation B2B repose sur un compteur falsifiable
(RELATION-13). Nielsen **2**. Sécurité **directe**. Correction : message du bot deux heures après
l'arrivée, deux boutons (« tout s'est bien passé » / « j'ai un souci » qui ouvre le signalement), et
un événement écrit. Suppose un ordonnanceur : il n'en existe aucun côté serveur (VU : les trois seuls
`setTimeout` de `server/routes.js` sont `:133`, `:387`, `:401`, tous liés à la démonstration ou à
`AUTO_APPROVE`). **3 à 5 jours** : `server/bot.js`, `server/store.js`, `server/routes.js`, tests.

**RELATION-16 — « Préviens une personne de confiance » est répété trois fois et n'est jamais une fonction.**
VU `public/app.js:783` (écran `safety`), `:841` et `:842` (écran `date`, dans le résumé et dans le
conseil). Aucun champ de contact de confiance n'existe dans le profil (VU `server/routes.js:87-114`),
aucune notification n'est envoyée à un tiers (VU : les douze `notify` du dépôt ne visent que les deux
personnes du match ou la modération). C'est le niveau 3 de C14 et la tâche P1-2. Nielsen **2** :
l'interface conseille une action qu'elle n'outille pas. Sécurité **directe**. Correction : un contact
Telegram désigné dans le profil, prévenu par le bot à l'acceptation du rendez-vous puis à l'arrivée —
lieu, heure et prénom, jamais de photo ni de position. Suppose RELATION-10. **3 à 5 jours** :
`server/store.js`, `server/routes.js`, `server/bot.js`, `public/app.js`, README, tests.

### Signalement, blocage, suppression

**RELATION-17 — Ni unmatch, ni blocage sans accusation, ni déblocage.**
VU : aucune route ne supprime un match dans `server/routes.js` — la seule suppression est
`DELETE /api/me` (`:151`). VU `public/app.js:1111-1131` : la seule sortie d'une discussion est la
popup « Signaler et bloquer », qui crée toujours un signalement transmis à la modération. VU
`server/store.js:226-231` : `block` n'a pas d'inverse, aucune route de déblocage, aucun écran listant
les personnes bloquées. Un appui malheureux sur « Comportement déplacé » détruit donc définitivement
une discussion et envoie un signalement injustifié. Nielsen **3** (contrôle et liberté ; prévention
des erreurs). Sécurité **indirecte** : qui veut seulement sortir doit accuser, ce qui dilue les vrais
signalements. Correction : `DELETE /api/matches/:id` silencieux (P0-5), et séparer dans la popup « Ne
plus voir ce profil » de « Signaler ». **1 à 2 jours** : `server/routes.js`, `server/store.js`,
`public/app.js`, tests.

**RELATION-18 — Les motifs de signalement ne couvrent pas le chantage, que l'écran Sécurité traite pourtant en quatre étapes.**
VU `public/app.js:1116-1117` : deux motifs, `money` et `behavior`. VU `:768-778` : le guide
« Quelqu'un me fait du chantage » dit à l'étape 3 « Signale et bloque le profil depuis la
discussion » — or aucun motif « chantage » n'existe. Manquent aussi l'image intime non sollicitée, le
faux profil, la violence, et surtout le **soupçon de minorité**, alors que l'exclusion des mineurs est
non négociable (CLAUDE.md §5.6). Nielsen **3** (cohérence entre deux écrans du même produit).
Sécurité **directe**. Correction : cinq motifs, liste fermée côté serveur, et préfixe d'urgence dans
le message de modération pour les motifs graves. **0,5 jour** : `public/app.js`, `server/routes.js`,
`server/bot.js`.

**RELATION-19 — Le guide anti-chantage ne nomme aucun recours réel au Cameroun.**
VU `public/app.js:777` : « Parle à une personne de confiance ou à une association d'aide aux
victimes. » Aucune association, aucun numéro, aucun service n'est nommé nulle part dans le dépôt
(vérifié : aucune occurrence d'un numéro d'urgence ou d'un nom d'organisme). Les trois premières
étapes du guide sont bonnes et concrètes ; la quatrième renvoie dans le vide. Nielsen **2**. Sécurité
**directe**. Correction : une liste de recours locaux vérifiés, à obtenir hors code avant de
l'écrire — je n'ai trouvé aucune source fiable dans la matière réunie, et je ne l'invente pas.
**0,5 jour** de mise en œuvre une fois la liste obtenue : `public/app.js` seul.

**RELATION-20 — Supprimer son compte efface les blocages qui protégeaient la personne elle-même.**
MESURÉ, scénario complet : 1002 signale et bloque 1001 (`db.blocks` contient une ligne) ; 1002
supprime son compte (`db.blocks` devient `[]`) ; 1002 se réinscrit avec le même identifiant Telegram
et refait le parcours — **la personne signalée réapparaît dans sa découverte**. VU `server/store.js:86`
(`db.blocks = db.blocks.filter((b) => b.from !== id && b.to !== id)`) et VU `server/auth.js:59`
(la réinscription reprend le même identifiant). C'est exactement le scénario d'une personne harcelée
qui supprime son compte pour souffler, puis revient. Nielsen **4**. Sécurité **directe**.
Correction : conserver le blocage sous forme d'une paire d'identifiants Telegram, sans aucune autre
donnée. Tension avec CLAUDE.md §5.4 (minimisation, effacement par `DELETE /api/me`) : je ne la
contourne pas, je la pose — une paire d'identifiants est la donnée minimale qui rend le droit à
l'effacement compatible avec la protection d'un tiers ; elle doit être déclarée au README avec une
durée de conservation et validée par le propriétaire (CLAUDE.md §6.1). **1 à 2 jours** :
`server/store.js`, README, tests.

**RELATION-21 — Les signalements survivent à la suppression du compte, sans que rien ne le dise.**
MESURÉ : après `DELETE /api/me` par 1002, `db.reports` conserve ses 51 lignes, dont
`{from: '1002', targetId: '1001', reason: 'behavior', matchId, at}`. VU `server/store.js:75-92` :
`deleteUser` purge utilisateurs, balayages, matchs, messages, rendez-vous, blocages et fichiers —
jamais `db.reports`. CLAUDE.md §5.4 exige que toute donnée personnelle soit supprimée par
`DELETE /api/me` : ce n'est pas le cas, et l'utilisateur lit pourtant « Ton compte et tes données ont
été supprimés » (VU `public/app.js:1208`). Lecture inverse, tout aussi vraie : c'est la seule trace de
modération qui survive. La bonne réponse n'est donc pas de supprimer la ligne mais d'anonymiser le
plaignant et de déclarer la conservation. À trancher par le propriétaire. Nielsen **2**. Sécurité
**indirecte**. **0,5 jour** : `server/store.js`, README.

### Le silence après le match, et ce qui ramène quelqu'un

**RELATION-22 — Le profil devient inaccessible au moment exact où l'app dit de s'en servir.**
VU `public/app.js:659` : l'écran match dit « Brise la glace avec une question sur son profil ». VU
`:987` : la discussion vide dit « Commence par une question sur son profil. » VU `:1015-1022` :
l'en-tête de la discussion ne porte que l'avatar, le prénom, l'âge, la tranche d'activité et un bouton
Signaler — aucun accès au profil. VU `:638` : `SCREENS.person` ne cherche que dans `S.people` et
`S.likes`, jamais dans les matchs. VU `:357` : en vue liste, une personne au statut `match` mène à la
discussion, jamais à sa fiche. La seule consigne donnée **deux fois** à l'utilisateur est donc
impossible à suivre sans avoir mémorisé le profil avant de matcher. Nielsen **4** (reconnaissance
plutôt que rappel : la violation la plus nette du lot). Sécurité **aucune**. Correction : rappeler la
question et la réponse en tête de la discussion vide, et rendre l'en-tête cliquable vers la fiche.
Coût data nul : `promptQ` et `promptA` sont déjà dans `publicProfile` (VU `server/routes.js:39-40`),
renvoyé à chaque appel de la discussion (VU `:366`). **0,5 jour** : `public/app.js` seul. C'est la
correction la moins chère et la plus rentable du lot.

**RELATION-23 — La liste des discussions ne dit jamais qui attend une réponse.**
VU `server/routes.js:336` : tri par date du dernier message, et à défaut par `createdAt`. VU `:333` :
`unread` et `isNew` sont renvoyés ; l'auteur du dernier message n'apparaît que dans l'aperçu textuel,
sous forme du préfixe « Toi : » (VU `public/app.js:706`). Aucun tri, aucune marque, aucun rappel. La
logique « ceux qui attendent ta réponse d'abord » **existe déjà dans le produit**, écrite et
commentée, mais pour la liste des profils (VU `server/routes.js:249`, `:268-270`). Nielsen **2**.
Sécurité **aucune**. Correction : réutiliser `listRank` pour les discussions, marquer « à toi de
répondre ». **0,5 jour** : `server/routes.js`, `public/app.js`.

**RELATION-24 — Rien n'expire, rien ne se clôt : une discussion morte reste en tête pour toujours.**
VU `server/store.js:163-172` : le match ne porte ni statut, ni expiration. VU
`server/routes.js:336` : sans message, le tri retombe sur `createdAt`, donc un match muet reste en
tête jusqu'à ce qu'un autre match plus récent arrive. VU `public/app.js:706` : l'aperçu affiche
« Nouveau match, écris le premier message » indéfiniment. Aucun rappel de tour de parole n'existe
(VU : les douze `notify` du dépôt sont tous déclenchés par une action d'autrui). Nielsen **2**.
Sécurité **aucune**. Correction : marquer « sans réponse depuis N jours » et permettre de retirer la
discussion de sa propre liste, sans notification et sans la détruire chez l'autre. La grille écarte
explicitement la péremption automatique à la Coffee Meets Bagel, inadaptée à un réseau instable.
**1 à 2 jours** : `server/store.js`, `server/routes.js`, `public/app.js`, tests.

**RELATION-25 — La notification « tu as plu à quelqu'un » mène à un écran où la personne n'est pas.**
MESURÉ : Carol, 31 ans, like Alice, 24 ans, dont le filtre d'âge est réglé sur 18-25.
`GET /api/discover` depuis Alice renvoie `[]` ; `GET /api/likes` renvoie `['Carol']`. Or la
notification (VU `server/routes.js:311` et `:407`) ouvre `screen=discover`, et `/discover` applique
`inAgeRange` (VU `:237`) alors que `/likes` l'ignore volontairement (VU `:278-279`, commentaire
explicite). La personne ouvre donc la notification et tombe sur un écran vide, alors que l'admirateur
l'attend dans l'onglet Messages. Nielsen **3** (cohérence entre le système et le monde réel).
Sécurité **aucune**. Correction : pointer la notification vers `screen=matches`, où la bande « Ont
aimé ton profil » se trouve déjà (VU `public/app.js:681-684`) ; `boot()` traite déjà ce paramètre
(VU `:1295`). **0,5 jour** : deux lignes dans `server/routes.js`, plus un test.

**RELATION-26 — La clé de limitation est consommée avant l'envoi : un échec réseau coûte 24 heures de silence.**
VU `server/bot.js:25` : `store.updateUser(… lastNotifiedAt …)` s'exécute **avant**
`bot.api.sendMessage` (VU `:29`). Un refus de Telegram est réduit à un `console.warn` (VU `:31-35`),
la clé reste dépensée, et `lastNotifiedAt` est persisté en base (VU `server/store.js:60`) : le silence
survit au redémarrage. Pour la clé `likes`, la fenêtre est de 24 heures (VU `server/routes.js:311`).
Aucun appelant n'exploite le résultat de `notify`, sauf le bouton de test (VU `:141`) : l'équipe ne
peut donc pas savoir qui est injoignable. Nielsen **2**. Sécurité **indirecte** : la même mécanique
avale une notification d'arrivée au rendez-vous. Correction : écrire la clé après un envoi réussi,
lire `retry_after` sur une erreur 429, et stocker le dernier échec sur l'utilisateur. **0,5 jour** :
`server/bot.js`, `test/notifications.test.js`.

**RELATION-27 — Aucun réglage de notification, ni dans l'app ni dans le bot.**
VU `public/app.js:819-830` : le bloc Paramètres contient le test de notification, l'économie de data,
l'invitation et l'ajout à l'écran d'accueil — rien sur les notifications elles-mêmes. VU
`server/bot.js:105-117` : trois commandes seulement, `/start`, `/id`, `/aide` ; VU `:172-175` : deux
publiées. Aucun `/stop`. Le seul recours d'une personne agacée est de mettre le bot en sourdine ou de
le bloquer, ce qui coupe aussi les notifications de sécurité — et reste invisible côté serveur (VU
`:31-35`). Nielsen **2**. Sécurité **indirecte**. Correction : trois interrupteurs (matchs, messages,
rendez-vous) dans `me`, stockés sur l'utilisateur, lus par `notify`. **1 à 2 jours** :
`server/store.js`, `server/routes.js`, `server/bot.js`, `public/app.js`, tests.

**RELATION-28 — Rien ne ramène quelqu'un que personne n'a liké.**
VU : les douze `notify` du dépôt sont tous déclenchés par une requête HTTP ou un rappel de modération
(`server/routes.js:141, 307, 311, 379, 391, 407, 424, 436` ; `server/bot.js:78, 81, 93, 95`). VU :
aucun `setInterval` côté serveur, et les trois `setTimeout` de `server/routes.js` (`:133`, `:387`,
`:401`) servent `AUTO_APPROVE` et les profils de démonstration. Pour une personne réelle dans une
ville où personne ne la like, le nombre de notifications reçues est donc **zéro, indéfiniment**. VU
`public/app.js:1289-1297` : au retour, aucun écran ne dit ce qui s'est passé depuis la dernière
visite. Ce n'est pas un défaut de mise en scène, c'est l'absence totale du maillon 14 pour la moitié
du vivier. Nielsen **1**. Sécurité **aucune**. Correction : une seule alerte, honnête et non déguisée
en événement social — « N nouvelles personnes vérifiées à Yaoundé depuis ta dernière visite », au plus
une par semaine, uniquement si N est supérieur à zéro. Suppose un ordonnanceur, inexistant.
**1 à 2 jours** : module d'ordonnancement, `server/bot.js`, `server/store.js`, tests.

**RELATION-29 — Le quota du jour se réinitialise sur le fuseau du serveur, et l'heure n'est jamais annoncée.**
VU `server/store.js:157-160` : `new Date().setHours(0, 0, 0, 0)`, c'est-à-dire minuit dans le fuseau
du processus Node. VU : `TZ` n'est défini ni dans `fly.toml` (dont le bloc `[env]` compte cinq
variables, lignes 8-16), ni dans `render.yaml`, ni ailleurs. MESURÉ dans ce conteneur :
`process.env.TZ` non défini et minuit local égal minuit UTC. Yaoundé est à UTC+1 toute l'année : la
réinitialisation tomberait donc à 1 h du matin, heure locale. VU `server/routes.js:295` : « Tu as vu
tous tes profils du jour. Reviens demain. » — sans aucune heure. Confiance **moyenne** : le fuseau
réel de la machine déployée n'a pas été observé. Test falsifiable : `fly ssh console -C date` sur la
machine, puis épuiser le quota à 23 h 30 heure de Yaoundé et relever le compteur à 00 h 30. Nielsen
**2**. Sécurité **aucune**. Correction : borner la journée sur un fuseau déclaré et afficher l'heure
de réinitialisation. **0,5 jour** : `server/store.js`, `server/routes.js`, `public/app.js`.

**RELATION-30 — La présence expire en 10 secondes alors que la discussion interroge toutes les 4 secondes.**
VU `server/store.js:197` : `isViewing(userId, matchId, withinMs = 10000)`. VU `public/app.js:730` :
`setInterval(pollChat, 4000)`. Deux sondages perdus d'affilée suffisent donc à faire croire au serveur
que la personne a quitté l'écran, et une notification part vers quelqu'un qui est en train de lire —
exactement le cas que la mécanique cherche à éviter. VU `server/store.js:23` : la présence est une
`Map` en mémoire, vide après redémarrage, et `fly.toml:22-24` arrête la machine dès qu'elle est
inactive. Nielsen **1**. Sécurité **aucune**. Correction : porter la fenêtre à 15 secondes.
**0,5 jour** : `server/store.js`, `test/notifications.test.js`.

### Ce que l'équipe peut observer

**RELATION-31 — Zéro test sur les rendez-vous, le check-in, les signalements et le blocage.**
VU : `grep` sur `test/` ne trouve aucune occurrence de `dates`, `checkin`, `/reports` ni `unmatch`.
Les neuf fichiers couvrent authentification, anti-arnaque, activité, filtres, notifications, photos,
profils, empreintes de fichiers et webhook. VU `test/antiscam.test.js:20-23` : trois phrases normales
seulement, dont aucune ne contient « prêt(e) », « frais », « crédit » ni un montant en francs — donc
**aucun** des onze faux positifs mesurés ne serait attrapé par la suite actuelle. Toute la partie du
parcours qui porte la promesse de sécurité physique est modifiable sans filet. Nielsen **0** (ce n'est
pas une violation d'interface). Sécurité **indirecte**. Correction : `test/dates.test.js`,
`test/reports.test.js`, et élargissement du corpus de `test/antiscam.test.js`. **1 à 2 jours** :
`test/` seulement.

**RELATION-32 — Zéro événement produit : le silence après le match, l'effet de l'anti-arnaque et la suite d'un signalement sont invisibles.**
VU `server/store.js:9` : la base ne contient que `users`, `swipes`, `matches`, `messages`, `reports`,
`blocks`, `dates` — aucune collection d'événements. MESURÉ (repris du dossier de mesures, commande
`grep -rniE "analytics|gtag|posthog|amplitude|mixpanel|track\(" server/ public/`) : sortie vide.
Ne sont pas calculables pour ce lot : le délai entre le match et le premier message, la part de matchs
restés muets, le nombre de messages refusés par l'anti-arnaque et la règle déclenchée, ce que fait la
personne après un refus, la suite donnée à un signalement (la décision se prend dans un groupe
Telegram, hors base, VU `server/routes.js:447`), et le taux de délivrance des notifications (VU
`server/bot.js:31-35`, résultat jeté par tous les appelants sauf le test). Restent calculables par un
script sur `db.json` : matchs par jour, messages par discussion, premier message oui ou non,
propositions de rendez-vous et arrivées scannées par lieu, signalements et blocages. Nielsen **0**.
Sécurité **indirecte**. Correction : une table d'événements en ajout seul, cinq événements suffisent
pour ce lot (message refusé et sa catégorie, premier message d'un match, transition de rendez-vous,
arrivée, signalement et sa décision), avec exclusion des comptes `demo` (VU `server/routes.js:47`).
**3 à 5 jours** : `server/store.js`, appels dans `server/routes.js` et `server/bot.js`, tests.

---

## 7. Récapitulatif

| Critère | Note | Écran déterminant |
|---|---|---|
| C06 Barrière au retour d'un compte sanctionné | **0** | `safety` : aucun état de sanction (RELATION-02) |
| C10 Réciprocité | **2** | `matches` : gratuite et actionnable ; niveau 3 perdu sur RELATION-25 |
| C11 Lanceur de conversation | **1** | `chat` : accroche existante, jamais rappelée (RELATION-22) |
| C12 Anti-ghosting | **1** | `matches` : non-lus oui, tour de parole non (RELATION-23) |
| C13 Rendez-vous, cycle de vie | **1** | `date` : statut figé (RELATION-10) |
| C14 Sécurité de la rencontre | **1** | `date` : lieu imposé, mais pas de personne de confiance (RELATION-16) |
| C15 Signaler, bloquer, unmatch | **1** | `safety` : pas d'unmatch, motifs incomplets (RELATION-17, -18) |
| C16 Anti-arnaque | **1** | `chat` : filtre par motifs, rien ne remonte (RELATION-06 à -09) |
| C17 Notifications | **1** | `me` : aucun réglage, pas de gestion du 429 (RELATION-26, -27) |
| C22 Mesure produit | **1** | Horodatages métier oui, étapes clés non (RELATION-32) |
| C24 Discrétion et suppression | **1** | `me` : suppression incomplète (RELATION-21) |

**Ordre de traitement proposé, par rapport coût / gravité.** D'abord les cinq corrections à 0,5 jour
qui ferment des trous de sécurité ou de sens : RELATION-01 (check-in et blocage), RELATION-05
(compteur de déblocage), RELATION-11 (créneau non filtré), RELATION-22 (profil rappelé dans la
discussion), RELATION-25 (lien profond de réciprocité). Ensuite RELATION-02 et -03 ensemble, qui
rendent enfin utile la chaîne de signalement. Ensuite P0-4 (RELATION-10) puis P0-5 (RELATION-17), qui
sont déjà dans la feuille de route.

---

## 8. Ce que Odo fait mieux que la concurrence sur ce lot

Sept points, tous VU, à protéger de toute correction qui les abîmerait.

1. **Les lieux de rendez-vous sont réels, négociés et porteurs d'un avantage.** VU
   `server/config.js:47-52` : quatre lieux avec quartier, avantage commercial et code de confirmation.
   Happn vient de lancer « Perfect Date » en s'appuyant sur un référentiel externe et un modèle de
   recommandation ; Odo fait déjà plus concret, sans dépendance.
2. **Le check-in est une preuve de présence, pas une déclaration.** VU `server/routes.js:428-437`.
   Hinge « We Met » demande aux gens de dire s'ils se sont vus ; ici, un code scanné dans un lieu
   partenaire vaut preuve — le principe est supérieur, même si sa mise en œuvre est aujourd'hui
   falsifiable (RELATION-13).
3. **Aucune notification si la personne est en train de lire.** VU `server/routes.js:378`,
   `server/store.js:193-197`, et la sortie d'écran est signalée activement au serveur (VU
   `public/app.js:1255-1265`). Peu d'apps se donnent cette peine ; c'est un respect du forfait data
   autant que de l'attention.
4. **La réciprocité est gratuite et actionnable, contre le modèle dominant.** VU
   `server/routes.js:282-288` et `public/app.js:681-684`. C'est le principal produit d'appel payant
   des leaders ; ici il est offert, et la route `/likes` ignore même volontairement le filtre d'âge
   pour ne pas créer d'écran vide (commentaire VU `server/routes.js:276-277`).
5. **Le pseudo et le numéro Telegram ne sont jamais exposés, et l'activité est floutée par
   conception.** VU `server/routes.js:29-54` et `:19-26`, avec un commentaire qui explique pourquoi :
   un « en ligne maintenant » précis servirait à faire pression sur qui ne répond pas. C'est
   exactement l'inverse du choix de Happn sur la position, écarté par la grille.
6. **Le clavier ne se ferme jamais pendant la frappe.** VU `public/app.js:1035-1041` : seul
   `#messages` est reconstruit. Sur Android d'entrée de gamme, c'est un détail qui décide de la
   qualité perçue d'une discussion.
7. **La suppression de compte se fait en deux taps, depuis l'app, sans passer par un support.** VU
   `public/app.js:831` et `:1203-1214`. Le minimum de C24 demande moins de cinq taps : Odo est
   nettement en dessous. Reste à la rendre réellement complète (RELATION-21).

---

## 9. Frictions du matériel écartées ou corrigées

- **« Les liens profonds `?screen=` ne mènent pas tous au bon écran. »** *Écartée.* VU : les douze
  notifications du dépôt n'utilisent que `chat`, `discover`, `verify` et `me`, tous traités par
  `boot()` (VU `public/app.js:1292-1297`). Le cas `screen=safety` cité dans le matériel n'est émis par
  aucune notification. Le vrai problème de lien profond est ailleurs : RELATION-25, l'écran atteint
  peut être vide.
- **« La route de discussion ne renvoie que `arrivedMe`. »** *Corrigée.* MESURÉ : elle renvoie tout
  l'objet, `arrivals` compris, avec l'horodatage exact de l'autre personne. Le défaut est côté
  interface, et il s'accompagne d'une fuite de précision (RELATION-14).
- **Lignes de `server/antiscam.js`, `server/config.js` et `server/store.js` citées par la
  cartographie.** *Décalées.* Toutes les références du présent document ont été relues au commit
  `91c1897`.
- **« 135 messages par seconde possibles. »** *Confirmée, valeur voisine.* MESURÉ ici : 128,6
  messages par seconde (40 messages en 311 ms) sur une boucle `curl` séquentielle. L'ordre de
  grandeur tient ; le chiffre exact dépend de la machine et n'a pas de sens absolu.
- **« Le blocage est irréversible et non listé. »** *Confirmée* (VU `server/store.js:226-231`), mais
  RELATION-20 montre qu'il est en réalité **trop** réversible : une suppression de compte l'efface.

---

## 10. Ce que je n'ai pas pu trancher

- **Le fuseau réel de la machine déployée** (RELATION-29). Confiance moyenne. Test :
  `fly ssh console -C date`.
- **Le comportement réel de `notify` face à une erreur 429 de Telegram.** Aucun jeton de bot n'a été
  utilisé. Le code ne lit pas `retry_after` (VU `server/bot.js:31-35`) ; l'effet exact sur le volume
  reçu reste à observer sur un compte réel pendant une semaine, comme le demande la mesure de C17.
- **Le taux de faux positifs de l'anti-arnaque sur du vrai trafic.** Deux corpus artificiels donnent
  16 % et 44 % ; la grille demande 200 à 300 messages réels. Aucun message réel n'existe, et le
  produit n'en journalise aucun (RELATION-32) : la mesure restera impossible tant que RELATION-08
  n'est pas fait.
- **Le nombre de personnes qui abandonnent après un faux positif.** Rien n'est enregistré ; le test
  qui trancherait est une session observée avec cinq personnes de la cible, pas une lecture de code.
- **Les recours locaux à citer dans le guide anti-chantage** (RELATION-19). Aucune source fiable dans
  la matière réunie ; je n'invente ni nom ni numéro.
