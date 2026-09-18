# 16. Les frictions d'Odo — audit du 18 septembre 2026

Ce que ce dossier est : la liste de tout ce qui freine, dans l'app telle qu'elle tourne sur `main`
le 18 septembre 2026 (après les PR #130, #131 et #132), écran par écran, geste par geste, avec la
cause dans le code et une preuve pour chaque ligne. Ce qu'il n'est pas : une liste d'envies. Une
opinion sans preuve va dans la dernière section, pas dans le tableau.

Rien n'a été modifié dans l'app pour ce dossier. Les captures sont dans `audit/16-captures/`,
nommées `écran-état-schéma.png`, 85 écrans × deux schémas = 170 fichiers.

---

## 0. En une page

**Vingt frictions prouvées, cinq lots, aucune qui demande une nouvelle donnée.**

Les trois qui coûtent le plus cher, et qu'on ne voit pas depuis un ordinateur :

1. **L'entrée s'arrête au mauvais endroit.** Après le profil, l'écran de vérification met
   « Plus tard » en bouton principal et cache le vrai bouton sous le pli (n° 1). Qui envoie
   quand même son selfie tombe sur « Vérification en cours », un écran d'attente avec
   « Actualiser » et « Fermer », alors que sous « badge » la découverte est ouverte depuis le
   profil (n° 2). La première session finit sur une salle d'attente au lieu d'un visage.
2. **Le bot ne peut pas écrire à qui a dit « Plus tard ».** `requestWriteAccess()` n'est appelé
   qu'à l'envoi du selfie. Sous « badge », la moitié des gens ne l'envoient pas tout de suite,
   et ceux qui sont arrivés par un lien (`ref_campus`, la story, une invitation — nos canaux
   d'acquisition) n'ont jamais démarré le bot. Match, message, « tu as plu » : tout meurt en
   silence, avec une ligne `Notification impossible` dans le journal (n° 4).
3. **Une erreur de formulaire qu'on ne voit pas.** `#form-error` est au bas du formulaire, le
   formulaire fait 907 px pour 727 visibles, et `showError()` n'y défile jamais. « Continuer »
   vibre et ne fait rien (n° 3). C'est la panne que le propriétaire a vécue avec la galerie :
   un bouton qui ne répond pas se lit comme une app cassée.

**Ce que l'audit 15 a livré tient** : 30 constats sur 33 sont vérifiés dans les captures ou dans
le code (§ 4). Deux ne sont pas au niveau annoncé (Q : le message anti-arnaque fait quatre lignes,
pas deux, et porte une faute ; Z : le libellé du pass est resté « Prendre 30 jours · 299 ★ »), un
n'est pas du code (K : les portraits).

**Les appuis** (§ 2.3) sont dans la norme du marché partout sauf à l'inscription, où le compte
brut (16) mêle les erreurs voulues par le scénario ; le chemin sans faute fait 9 appuis et deux
saisies, ce qui est bien.

---

## 1. Méthode

### 1.1 Le harnais

- **Deux serveurs de développement**, `SEED_DEMO=true` (ports 3401, 3402, 3404, 3405) et
  `SEED_DEMO=false` (3403, 3406), avec **les politiques de la production** : `VERIFICATION_POLICY=badge`,
  `MATCH_POLICY=open` (le défaut du dépôt est `gate` / `romance_opposite`, ce n'est pas ce que les
  membres voient). `AUTO_APPROVE=true` et `RATE_LIMIT=false` pour dérouler sans attendre.
- **Playwright, Pixel 5** (393 × 727 utiles), Chromium, sombre et clair.
- **Le vrai SDK Telegram** (`telegram-web-app.js`) avec un pont Android factice : `initData`
  signé HMAC, `tgWebAppPlatform=android`, `tgWebAppVersion=8.0`, `window.TelegramWebviewProxy`
  qui répond aux demandes de fenêtre, de thème, d'encarts sûrs et d'accès en écriture, ferme
  les popups, sert le CloudStorage. Les boutons natifs sont lus dans la barre que le SDK dessine
  en mode debug ; « retour » et « réglages » sont injectés par `Telegram.WebView.receiveEvent`.
- **Les états** : vide (aucun autre compte), chargement (route retenue), réseau coupé
  (`route.abort()` sur `/api/**`), quota épuisé (5 « J'aime », puis 2 sans badge), sans badge,
  avec pass (`/pass` posé par l'API), en attente de vérification, compte fermé (`banned` écrit
  dans `db.json`), compte supprimé.
- **Un journal par capture** (`journal.jsonl`, 259 lignes) : titre, texte, boutons natifs,
  bouton retour, popups, haptiques, feuille ouverte, toast, hauteur de page contre hauteur de
  fenêtre. C'est ce journal qui dit « 907 px pour 727 » ou « l'erreur est dans le DOM mais pas
  dans la capture ».
- **Les appuis** sont comptés par le harnais, geste par geste, sur les onze tâches de la
  consigne.

Ce que le harnais **ne prouve pas**, et qui est marqué « téléphone » dans le tableau : le vrai
bot et ses notifications, la WebView de Telegram (clavier, hauteur, sélecteur de fichiers), un
réseau réellement lent, la fermeture de la mini app par Android. La recette pour ces cas est au § 6.

### 1.2 Cinq personnes

Les frictions sont attribuées à ces cinq profils, qui couvrent la cible et ses bords :

| | Qui | Ce qui la caractérise |
|---|---|---|
| **P1** | Aïcha, 21, étudiante à Ngoa-Ekellé | Android à 2 Go, forfait d'une semaine, 3G qui tombe. Première app de rencontre. Fait tout ce que l'écran dit, ne défile pas pour chercher. |
| **P2** | Junior, 26, jeune actif | Méfiant : dit « Plus tard » à la vérification pour voir d'abord. Arrivé par une affiche (`?startapp=ref_campus`), n'a jamais écrit au bot. |
| **P3** | Nadia, 24, vérifiée | Ouvre l'app chaque soir, épuise ses cinq « J'aime » en trois minutes. |
| **P4** | Paul, 30, Bruxelles | Lit en anglais, cherche « Relation sérieuse » dans une ville où personne n'est encore inscrit. Parfois sur Telegram Desktop. |
| **P5** | Marie, 28, pass de 30 jours | A payé. Attend que ce qu'elle a payé soit fluide, remarque tout ce qui ressemble à une vente. |

### 1.3 Le barème

- **Gravité** : *bloque* (impossible de continuer), *fait abandonner* (on peut continuer, mais on
  ne le fait pas), *fait hésiter* (on s'arrête, on cherche), *agace* (on continue en le notant).
- **Fréquence** : *chaque ouverture*, *chaque jour*, *chaque inscription*, *à chaque erreur*,
  *rare*.
- **Coût** : *minuscule* (une ligne, une heure), *petit* (une demi-journée, un test), *moyen*
  (une journée, plusieurs écrans), *grand* (plus, ou une décision).
- **Preuve** : le nom d'une capture (sans le schéma : les deux existent), ou « code » quand la
  cause se lit dans la source et que l'écran ne la montre pas, ou « téléphone » quand seule la
  recette du § 6 tranche.

---

## 2. Les frictions

### 2.1 Le tableau

| n° | Écran | Geste | Ce qui se passe | Ce qu'on attendait | Qui | Gravité | Fréquence | Cause dans le code | Coût | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Vérification (après le profil) | Arriver sur l'écran | Le bouton natif dit **« Plus tard »**. Le bouton « Choisir mon selfie dans la galerie » est sous le pli (page 974 px pour 727) derrière trois avantages et le geste. | Le geste et le bouton visibles sans défiler ; « Plus tard » discret. | P1, P2 | fait abandonner (la vérification) | chaque inscription | `app.js` `SCREENS.verify` ~1385 : `main: Plus tard` tant que `S.selfie` est vide ; la carte des avantages passe avant le geste — parcours d'écran | petit | 07-apres-profil, 08-verification-geste |
| 2 | Vérification en cours | Après l'envoi du selfie | Un écran d'attente : « Actualiser » / « Fermer », interrogation toutes les 5 s, « tu peux fermer l'app ». La ligne « Profil visible — Tu découvres les profils de ta zone » est annoncée **à venir**, alors que sous « badge » le profil est déjà visible et la découverte ouverte. | Aller à Découvrir tout de suite, avec une pastille « vérification en cours ». | P1, P2, P3 | fait abandonner (la session) | chaque inscription | `app.js` `SCREENS.pending` ~1394-1405 : écrit pour `gate`, jamais adapté à `badge` ; `refreshStatus()` ~2404 ne mène à Découvrir qu'une fois `verifie()` — règle d'écran | petit | 09-verification-en-cours |
| 3 | Profil, étape 1 | « Continuer » sans âge (ou sans prénom, sans genre) | Le téléphone vibre, rien ne change à l'écran. L'erreur est écrite **au bas** du formulaire (907 px), hors de la fenêtre. | L'erreur sous le champ fautif, ou au moins ramenée à l'écran. | P1 | bloque (pour qui ne défile pas) | à chaque erreur | `app.js:772` `showError()` pose `textContent` et ne défile pas ; `<p id="form-error">` est après les champs — mise en page | minuscule | 03-profil-etape1-erreur-vide (le journal porte `erreur: Indique ton âge.`, la capture ne la montre pas) |
| 4 | Toute l'app, sans badge | Dire « Plus tard », puis matcher ou recevoir un message | Le bot ne peut pas écrire à qui n'a pas démarré la discussion avec lui : `requestWriteAccess()` n'est demandé **qu'à l'envoi du selfie**. Aucune notification n'arrive, sans que rien ne le dise. | L'accès demandé à l'enregistrement du profil (ou au premier match), et un mot si c'est refusé. | P2 (tous les arrivés par lien) | fait abandonner (on attend une nouvelle qui ne vient pas) | chaque « Plus tard » venu d'un lien | `app.js:2396` seul appel ; `bot.js:97` journalise `Notification impossible` et continue — règle serveur + parcours | petit | code, téléphone (§ 6.1) |
| 5 | Découvrir, paquet vide | Arriver après l'inscription, ou changer d'intention | « Personne d'autre dans cette zone » et un bouton **« Changer de zone »** qui ouvre les filtres où « Tout le pays » porte un cadenas : la seule zone plus large est derrière le pass. Le texte dit « Change de zone » alors que ce qui est gratuit est « une autre ville ». Un commentaire du code affirme qu'« aucune alerte d'arrivée n'existe », alors que `nouveaux.js` la fait depuis. | Un bouton qui mène à quelque chose d'ouvert (« Changer de ville », « Inviter »), et la promesse vraie : « on te prévient quand quelqu'un arrive ». | P4, tous en bêta (peu de comptes) | fait abandonner (première session sans visage) | chaque inscription tant que la ville est peu peuplée | `app.js:1450` bouton vers `filters` ; `app.js:1530` le cadenas ; `zoneCherchee()` côté serveur ramène à la ville sans pass — parcours d'écran | petit | 10-decouvrir-premiere-fois, 40-decouvrir-vide, 22-filtres |
| 6 | Découvrir, quota à zéro | Appuyer sur ♥ | Le ♥ reste plein et blanc, la pastille dit « ♥ 0 ». L'appui répond par un **toast faux** : « Tu as vu tous tes profils du jour. Reviens demain. » (passer marche toujours, et on n'a rien vu). Ni le badge ni le pass ne sont proposés — la feuille du quota, à un appui de là, le fait très bien. | Le ♥ éteint à zéro, et l'appui ouvre la feuille du quota (badge gratuit d'abord, pass ensuite). | P3, P2 | fait hésiter, puis agace | chaque jour (5 « J'aime », 2 sans badge) | `routes.js:1161` le message `DAILY_LIMIT` ; `app.js:137` la copie ; `swipe()` ~2453 `showError` → toast ; `app.js:1488` le bouton n'est jamais `disabled` — texte + règle d'écran | petit | 11-quota-sans-badge-atteint, 34-quota-epuise |
| 7 | Découvrir, chargement | Ouvrir l'onglet | Pendant le chargement, la pastille affiche **« ♥ 0 »** et un anneau vide, à côté du squelette. Sur 3G, une à deux secondes à lire « plus de J'aime ». | La pastille en squelette, ou absente tant que le nombre n'est pas là. | tous | fait hésiter | chaque ouverture | `app.js:855` `dbar()` lit `S.remaining` (0 par défaut) avant la réponse de `/discover` — chargement | minuscule | 45-decouvrir-chargement |
| 8 | Profil, étapes 1 à 3 | Fermer la mini app pendant l'inscription (notification, appel, retour Android), ou revenir à l'accueil | Tout est à retaper : `S.form` vit en mémoire, seul le numéro d'étape est retenu (`form_step`). « Créer mon profil » remet le brouillon à zéro. | Reprendre là où on était, texte compris (pas la photo). | P1 | fait abandonner | modérée (Telegram ferme une mini app d'un geste) | `app.js:564-592` seul `form_step` passe par `localStorage` ; `app.js:2158` et `3503` `S.form = null` — règle d'écran | petit | code, téléphone (§ 6.3) |
| 9 | Profil, enregistrement avec photo | Enregistrer sur un réseau lent | `PUT /me/photos/:n` partage le délai de **12 s** de tout appel. Une photo de 720 px (80 à 150 Ko) dépasse 12 s sur EDGE. Le profil, lui, est déjà enregistré : l'écran dit « Pas de connexion », le bouton redevient « Enregistrer », et tout repart, photo comprise. | Un délai proportionnel à la taille pour un envoi, et un message vrai : « ton profil est enregistré, la photo n'est pas partie ». | P1 | fait abandonner (la photo, +25 % de complétion) | chaque photo sur réseau lent (la cible) | `app.js:103` `DELAI_MAX_MS`, `:165` le même minuteur pour tout ; `saveProfile()` 2360-2367 enchaîne profil puis photos et n'annonce pas ce qui a réussi — attente réseau | petit | code, téléphone (§ 6.2) |
| 10 | Discussion | Envoyer « Envoie-moi 5000 FCFA sur orange money » | Le bandeau dit « ressemble à **une moyen de paiement** » (faute d'accord, `une ${categorie}`), sur quatre lignes. Le constat Q de l'audit 15 visait deux lignes ; la faute retire son autorité au message qui doit en avoir le plus. | « Les demandes d'argent sont bloquées ici. Retire le montant ou le moyen de paiement. » | tous, au pire moment | fait hésiter | rare | `server/antiscam.js:270` `une ${categorie}` avec `categorieArgent()` qui rend `moyen de paiement` (masculin) — texte | minuscule | 28-discussion-message-bloque |
| 11 | Profil, étape 3 | Arriver sur l'étape | Une carte dorée **« 3 questions sur ta fiche — Avec Odo Plus »** entre la réponse et les langues : un pass vendu **pendant l'inscription**, avant le premier visage. | Rien à vendre avant d'avoir montré quelqu'un ; la porte reste dans « Modifier mon profil ». | P1, P5 | agace | chaque inscription | `app.js:807` `porteDuPass({ quoi: 'questions' })` rendu sans distinguer inscription et modification — parcours d'écran | minuscule | 06-profil-etape3-vide |
| 12 | Messages | Ouvrir l'onglet avec zéro « J'aime » reçu | La carte dorée « Voir qui t'a aimé — Le pass les nomme » est **en tête**, avant les discussions, même quand personne n'a aimé. | La carte seulement quand `n > 0`, ou après les discussions. (Le flou, lui, est une décision : § 3.) | P3, P5 | agace | chaque ouverture de Messages | `app.js:1676-1681` le groupe est rendu sans condition sur `S.likesN` — parcours d'écran | minuscule | 41-messages-vide, 33-messages-liste |
| 13 | Compte fermé | Ouvrir l'app | « **Un problème est survenu** » (le titre générique), « Réessayer » (qui réessaie pour rien), et « écris au bot avec la commande /aide » à taper à la main. | Un titre vrai (« Ton compte est fermé »), un bouton « Écrire au bot » par `tg.openTelegramLink()`, pas de « Réessayer ». | rare, mais c'est le recours | agace (et retire le recours à qui ne sait pas taper une commande) | rare | `app.js:407-415` `renderError()` sert le même gabarit à tout code sauf `NETWORK` — texte + parcours | petit | 47-compte-ferme |
| 14 | Compte supprimé | Confirmer la suppression | Un écran sans aucun bouton : « ferme Odo et rouvre-le depuis le bot ». Dans Telegram, `tg.close()` ferme la mini app ; il n'est pas proposé. | Un bouton « Fermer ». | rare | agace | rare | `app.js:1926` `tg.setButtons(null)` ; le commentaire vise le mode hors Telegram — parcours | minuscule | 60-supprimer-confirmation |
| 15 | Découvrir, barre du haut | Regarder le sélecteur Cartes / Liste | Le segment sélectionné est un **disque blanc sans glyphe**, à côté d'un cadenas : ça se lit comme un avatar vide et un verrou. Cause réelle : les icônes `card` et `rows` **n'existent pas** dans `PATHS`, `icon()` dessine un SVG vide. Avec un pass, les deux segments sont vides. Le propriétaire a déjà demandé ce que voulait dire « ♥ 2 » ; celui-ci se lit encore moins. | Deux icônes qui existent, ou les libellés « Cartes » / « Liste » affichés. | tous | fait hésiter | chaque ouverture | `app.js:852-853` demande `icon('card')` et `icon('rows')` ; `ui.js:5-50` `PATHS` n'a ni l'un ni l'autre (seuls les squelettes portent ces noms, `ui.js:210-215`) — mise en page | minuscule | 20-decouvrir-carte, 11-quota-sans-badge-atteint |
| 16 | Fiche (depuis le paquet) | Décider depuis la fiche | Le paquet décide avec **trois boutons ronds** ; la fiche décide avec **« Passer / J'aime » en barre native**. Le même geste change de grammaire d'un écran à l'autre. | Les mêmes boutons ronds sous la fiche (ou la barre native sur les deux, mais une seule). | tous | agace | chaque fiche ouverte | `app.js:1595` `SCREENS.person` pose la barre native — parcours | petit | 24-fiche-haut contre 20-decouvrir-carte |
| 17 | Filtres | Appuyer sur « Tout voir » | Le bouton secondaire **enregistre** des filtres remis à zéro (18-99, tout le monde, toute langue, ville effacée) et quitte l'écran, sans le dire. Le libellé se lit comme « afficher tout » et non « remettre à zéro et enregistrer ». | « Tout remettre à zéro » qui remplit les champs, puis « Enregistrer ». | P4 | fait hésiter | rare | `app.js:1575` `secondary: Tout voir → saveFilters({ … })` — texte + règle | minuscule | 22-filtres, code |
| 18 | Vérification | Lire les avantages | « **Proposer un rendez-vous** — Réservé aux profils vérifiés » est annoncé comme un avantage, alors qu'aucun lieu partenaire n'existe (`lieuxIci` est faux partout en production). La liste vide est une décision (§ 3) ; annoncer l'avantage ne l'est pas. | La ligne seulement quand `S.me.options.lieuxIci` est vrai. | tous | fait hésiter (une promesse qu'on ne retrouve nulle part) | chaque inscription | `app.js:1355` la ligne est rendue sans condition — texte | minuscule | 07-apres-profil |
| 19 | Carte, fiche, profil | Lire la jauge | Tout membre réel affiche **« Confiance 1 sur 2 »** pendant trois mois : le second critère est « membre depuis 3 mois », inatteignable avant décembre 2026 pour tout le monde. Seuls les profils de démonstration font 2 sur 2. Une app où chacun est « à moitié » sûr ne rassure pas. | Une jauge qui peut être pleine dès la vérification, ou un libellé qui dit « depuis septembre » plutôt qu'une fraction. | tous | fait hésiter | chaque carte | `server/jauge.js:31` `ANCIENNETE_MS = 90 jours` ; `:41` le critère — règle serveur (et un choix de produit, voir § 5 lot C) | petit | 55-jauge (compte du jour : 1 sur 2), 20-decouvrir-carte (démo : 2 sur 2) |
| 20 | Discussion, réseau coupé | Envoyer | Le comportement est **bon** (bulle retirée, texte rendu, bandeau) mais le bandeau **reste** après le retour du réseau, jusqu'au prochain envoi : on ne sait pas si on peut réessayer. | Le bandeau part quand le réseau revient (ou quand on retape). | P1 | agace | rare | `app.js:3254` et `:3302` posent `S.chat.notice` ; il n'est remis à `null` qu'au prochain envoi (`:3222`, `:3285`) — règle d'écran | minuscule | 44-discussion-envoi-reseau-coupe |

### 2.2 Le détail, friction par friction, et ce que fait le marché

**1 et 2 — l'entrée.** Ce sont deux moitiés du même écran raté pour la politique `badge`. Sous
`gate`, « Plus tard » n'existait pas et l'attente était la seule issue : l'écran était juste.
Le 15 septembre, l'instance est passée sous `badge`, `plusTard` est apparu comme bouton
principal, et personne n'a repris l'écran d'attente. Sur le marché (Hinge, Bumble, Tinder,
2026), la vérification est proposée avec son bouton d'action en principal, « Passer » en texte
petit sous le bouton, et **la vérification se fait en arrière-plan** : on est déjà dans le paquet
quand la décision tombe, avec une pastille dans le coin. C'est exactement ce que `badge`
permet, et que l'écran refuse encore. Correction : à l'écran de vérification, le geste et le
bouton d'abord, les avantages après, « Plus tard » en secondaire fantôme (règle AD) ; après
l'envoi, `go('discover')` avec une pastille « en cours » dans l'onglet Profil et un toast ;
`SCREENS.pending` ne reste que pour `gate`.

**3 — l'erreur hors écran.** Sur toutes les apps de référence, l'erreur est **sous le champ**,
en rouge, et le champ est ramené à l'écran (`scrollIntoView`) avec le clavier ouvert.
Correction minimale : `el.scrollIntoView({ block: 'nearest' })` dans `showError()` et
`aria-live`. Correction juste : l'erreur sous le champ fautif (`stepError()` connaît déjà le
champ). À vérifier aussi clavier ouvert (§ 6.4).

**4 — le bot muet.** Telegram exige que la personne ait écrit au bot ou accordé l'accès. Un
membre arrivé par `t.me/<bot>/<app>?startapp=…` n'a fait ni l'un ni l'autre. Le marché n'a pas
cette contrainte (les apps natives ont leurs notifications) mais toutes demandent la
permission **au premier moment où elle sert** — le premier match — et jamais avant. Ici,
`requestWriteAccess()` appartient à `saveProfile()` (le bot devra écrire dès le premier
« J'aime » reçu) ou, mieux, à l'écran de match, avec une ligne qui dit pourquoi. Sans quoi la
mesure du canal `ref_campus` (§ chiffres) mesurera un canal qui ne retient personne, pour une
raison qui n'a rien à voir avec le canal.

**5 — le paquet vide.** Le cas courant de la bêta : trois inscrits, deux intentions, deux
villes. Le bouton mène à un verrou. Tinder ouvre un vrai réglage de distance ; Hinge dit « on te
préviendra ». Odo a la mécanique de l'arrivée (`nouveaux.js`, 48 h, vingt destinataires) mais
l'écran ne le sait pas, et elle dépend du n° 4 pour joindre les gens. Correction : « Changer de
ville » comme principal, « Inviter » en secondaire, la phrase « On te prévient dès que
quelqu'un arrive ici » — vraie une fois le n° 4 réglé —, et retirer le commentaire périmé.

**6 et 7 — le quota.** Hinge affiche « Out of likes » en feuille avec le pass ; Bumble éteint
le bouton. Odo a déjà la feuille (`expliquerLeQuota()`, PR #131) : il suffit que le 429
`DAILY_LIMIT` l'ouvre au lieu d'un toast, que le ♥ se grise à zéro (`disabled`, comme
« revenir »), et que le message serveur cesse de dire « tu as vu tous tes profils ». Le
« ♥ 0 » du chargement est une ligne : ne pas rendre la pastille tant que `S.quota` est `null`.

**8 — le brouillon.** Toutes les apps reprennent l'inscription où elle en était. Un brouillon
dans `localStorage` (texte seulement, jamais la photo ni l'âge en clair après l'inscription),
effacé à l'enregistrement et à la suppression, avec la même clé de rétention que `form_step`.

**9 — la photo sur réseau lent.** Un envoi de fichier n'a pas le même budget qu'un `GET`. Un
délai de 12 s + 1 s par 10 Ko, ou pas de délai sur les `PUT` de photo (le `fetch` échoue seul
si le réseau tombe), et un message qui distingue « profil enregistré » de « photo à renvoyer ».
À mesurer au téléphone (§ 6.2) : c'est la friction la plus probable sur la cible et la seule
que le harnais ne peut pas dater.

**10 — le mot d'un genre.** `une ${categorie}` : « moyen de paiement » et « besoin d'argent »
sont masculins, « demande de transfert » et « demande de dépannage » féminins. Une table
`{ categorie: phrase }` règle l'accord et permet enfin les deux lignes du constat Q.

**11 et 12 — vendre au mauvais moment.** Aucune app de référence ne montre son abonnement
pendant l'inscription, et aucune ne met la vente au-dessus des discussions quand il n'y a
rien à voir. Le flou de « qui t'a aimé » est une décision (§ 3) ; sa **place** quand `n = 0`
ne l'est pas.

**13 et 14 — les deux écrans de fin.** Un compte fermé est un moment de recours : le titre
doit être vrai et le chemin vers le bot à un appui. Un compte supprimé dans Telegram doit
pouvoir fermer la mini app.

**15 et 16 — la grammaire visuelle.** Le disque blanc n'est pas un défaut de contraste :
`icon('card')` et `icon('rows')` tombent sur une clé absente de `PATHS` et rendent un SVG
vide — le lot 1 de l'audit 15 a nommé deux icônes que personne n'a dessinées, et aucun test
ne refuse un nom d'icône inconnu (c'est le test à ajouter avec la correction). Les boutons de
la fiche sont le reste du même lot, qui a changé le paquet sans changer la fiche.

**17 — « Tout voir ».** Un secondaire qui enregistre et sort est un piège : sur toutes les
apps, « Réinitialiser » remplit les champs et laisse enregistrer.

**18 — un avantage sans lieu.** Une ligne conditionnelle.

**19 — la jauge à moitié.** Ce n'est pas une régression : c'est la conséquence du choix de
P1-5 (ne compter que des critères ouverts) appliqué le jour du lancement, où l'un des deux
critères est inatteignable. Trois options, toutes sans nouvelle donnée : (a) « Vérifié » seul
sur la carte tant que le second critère n'est ouvert à personne, la fraction n'apparaissant
que sur l'écran d'explication ; (b) un troisième critère atteignable (photo modérée ? c'est
déjà exigé pour être montré — donc non) ; (c) garder la fraction et accepter trois mois de
« 1 sur 2 » partout. Le dossier recommande (a).

**20 — le bandeau qui reste.** Une ligne dans le rafraîchissement du fil.

### 2.3 Les appuis

Comptés par le harnais, sombre et clair identiques. « + n » : appuis dans un sélecteur du
système, que l'app ne contrôle pas.

| Tâche | Appuis | Détail | Norme du marché |
|---|---|---|---|
| S'inscrire (du premier appui à l'écran qui suit le profil) | **9** (+ 2 saisies) ; 16 dans le scénario, qui provoque deux erreurs et change de pays | Créer mon profil · Femme · Continuer · Relation sérieuse · une ville · Continuer · une question · Enregistrer, puis la vérification | 8 à 12 chez Hinge et Bumble, hors photos |
| Se faire vérifier | **2** (+ 2 système) | Choisir mon selfie · Envoyer | 2 à 3 |
| Ouvrir une fiche | 1 | le chevron | 1 |
| Aimer | 1 | ♥ | 1 |
| Ouvrir une discussion (après match) | 1 | « Écrire à Brice » | 1 |
| Envoyer un message | 3 | une amorce · le champ · Envoyer | 2 à 3 |
| Répondre à un message | 4 | appui long · Répondre · le champ · Envoyer | 3 à 4 (Telegram : 2 par balayage) |
| Envoyer une photo | 2 (+ 2 système) | trombone · Envoyer (la légende est facultative) | 2 à 3 |
| Retirer un match | 2 | balayer la ligne · Retirer, puis le popup de confirmation compte pour 1 | 2 à 3 |
| Changer de langue | 2 (+ le bouton natif Réglages) | Langue · la langue | 2 à 3 |
| Inviter | 1 (+ le bouton natif Réglages) | Inviter | 1 |

Rien d'anormal. Le seul chiffre à surveiller est l'inscription, où les 16 du scénario
montrent surtout que chaque erreur de saisie coûte deux appuis de plus **quand on la voit**
(n° 3).

---

## 3. Ce qui vient d'une décision, et n'est pas rouvert ici

Ces points ont été vus pendant le parcours. Chacun est la **conséquence d'une décision** du
propriétaire, notée dans `CLAUDE.md`. Ils ne sont pas dans le tableau, et ce dossier ne les
rediscute pas ; il note seulement ce qui, autour d'eux, reste corrigeable sans les rouvrir.

| Ce qu'on voit | La décision | Ce qui reste corrigeable |
|---|---|---|
| Le selfie s'ouvre dans la galerie, pas dans la caméra | Telegram Android ignore `capture` ; formulation honnête choisie (PR #132) | rien — le n° 1 (l'ordre de l'écran) ne touche pas au geste |
| Pas de « vu à telle heure » dans la discussion | jamais de filature | rien |
| Aucun lieu partenaire, donc pas de rendez-vous ni de confirmation | un lieu n'entre qu'avec un accord signé | le n° 18 : ne pas **annoncer** l'avantage tant qu'il n'existe nulle part |
| Pas de garant dans la jauge | P1-6 abandonné | le n° 19 porte sur l'affichage de la fraction, pas sur un critère de plus |
| Pas de champ religion | décision explicite du 15 septembre 2026 | rien |
| Sous « badge », on entre sans être vérifié | modération humaine par une seule personne | les n° 1, 2 et 4 sont précisément ce que `badge` demande à l'interface et qu'elle ne fait pas encore |
| « Qui t'a aimé » flouté sans pass, une tache par personne | décision du 17 septembre 2026 | le n° 12 : la place de la carte quand personne n'a aimé |
| Pas de parrainage, un canal et jamais une personne | décision du 16 septembre 2026 | rien |
| Le rendez-vous et la confirmation demandent le bouclier des deux côtés | promesse de sécurité | rien |

---

## 4. L'audit 15 : les 33 constats, vérifiés

Vérifié = vu dans une capture de ce dossier ou lu dans le code de `main`. Une régression
aurait été une friction ; il n'y en a pas. Deux constats ne sont pas au niveau annoncé.

| Constat | État | Preuve |
|---|---|---|
| A. Six écrans avant le premier visage | livré (profil → vérification → Découvrir) | 07, puis 10 ; `saveProfile()` |
| B. La photo à l'étape 3 | livré (étape 1, grand emplacement) | 03-profil-etape1-vide |
| C. Quatorze pastilles de villes | livré (six) | 04-profil-etape2-vide |
| D. Gouttière de « Tu es » | livré | 03 |
| E. Chevrons sur la langue | livré (coche sur la ligne active) | 02-langue-choix |
| F. La carte dépasse l'écran | livré (`.deck.plein`, 725 px) | 20-decouvrir-carte |
| G. Deux boutons texte | livré (trois ronds) | 20 |
| H. « 5 restants » flotte | livré (pastille, et la feuille depuis #131) | 20-quota-feuille |
| I. Liste → pass plein écran | livré (feuille) | 21-liste-feuille-sans-pass |
| J. « DÉMO » en production | sans objet (`SEED_DEMO = "false"` dans `fly.toml`) | — |
| K. Pas de visages | **non livré, pas du code** | 20 (initiales) |
| L. La fiche est la carte en plus long | livré (blocs, cœur par réponse) | 24-fiche-haut |
| M. Bouton principal sans lieu | livré | 43-discussion-vide-sans-lieu |
| N. Barre de déblocage flottante | livré (ligne sous l'en-tête) | 27 |
| O. Ni réactions ni « Copier » | livré | 29-menu-message |
| P. Photo sans légende | livré | 30-photo-legende |
| Q. Anti-arnaque en cinq lignes | **partiel** : quatre lignes, et une faute (n° 10) | 28-discussion-message-bloque |
| R. « En ligne aujourd'hui » | livré (« Actif aujourd'hui ») | 27 |
| S. Pas d'heure sur les lignes | livré | 33-messages-liste |
| T. Pas d'action sur une ligne | livré (balayage) | 33-messages-ligne-balayee |
| U. Tuile floutée illisible | livré (anneau, cadenas, feuille) | 57-vues-sans-pass |
| V. Trois écrans en un | livré (réglages derrière le bouton natif) | 50, 52 |
| W. Le pass avec la suppression | livré (groupe « Faire connaître ») | 52-reglages-bas |
| X. De la prose sur du vide | livré (pastilles, message, chiffre, onde) | 55, 56, 57, 61 |
| Y. L'étoile en emoji | livré | 58-pass |
| Z. Libellé du bouton sur deux lignes | **partiel** : « Prendre 30 jours · 299 ★ » — une ligne dans le harnais, à confirmer dans le vrai MainButton (§ 6.6) | 58-pass |
| AA. Tailles en pixels | livré (rem) | `styles.css` |
| AB. Eyebrow à 10,5 px | livré | `styles.css` |
| AC. Ambre sur photo | livré (point ambré, texte `--on-photo`) | 20 |
| AD. Trois styles de barre | livré | 22-filtres, 09 |
| AE. Pas de transition directionnelle | livré (`data-entree`) | `go()` |
| AF. Retour calculé trop tôt | livré | `test/interface.test.js` |
| AG. Barre de secours hors Telegram | livré | sans objet ici (harnais dans Telegram) |

---

## 5. Les lots

Ordre : gravité × fréquence, divisé par le coût. Chaque lot est une PR, sans nouvelle donnée,
sans migration, avec ses tests.

### Lot A — L'entrée sous « badge » (n° 1, 2, 3, 11, 18) — une journée

C'est le lot qui décide si la première session finit sur un visage. Vérification : geste et
bouton en haut, avantages dessous, « Plus tard » en secondaire fantôme, la ligne du rendez-vous
conditionnelle à `lieuxIci`. Après l'envoi : Découvrir tout de suite, pastille « en cours »
dans Profil, `SCREENS.pending` réservé à `gate`. `showError()` ramène l'erreur à l'écran (et,
mieux, la pose sous le champ). L'étape 3 ne vend rien à l'inscription. Tests :
`test/interface.test.js` (l'ordre de l'écran, la condition de la ligne, `scrollIntoView`),
`e2e/inscription.spec.js` (après le selfie, on est sur Découvrir), `test/verification-badge.test.js`
(le pending ne s'ouvre plus sous `badge`).

### Lot B — Le bot doit pouvoir écrire (n° 4) — une demi-journée, et le téléphone

`requestWriteAccess()` à l'enregistrement du profil (ou à l'écran de match, avec une phrase).
Si l'accès est refusé, une ligne dans l'onglet Profil : « Le bot ne peut pas te prévenir.
Ouvre-le une fois. » avec `tg.openTelegramLink()`. Un test dans `interface.test.js` refuse que
l'appel ne vive que dans `sendSelfie`. La preuve finale est au téléphone (§ 6.1) : c'est la
seule friction du dossier que seul le vrai bot tranche, et c'est la plus silencieuse.

### Lot C — Le quota et le paquet (n° 5, 6, 7, 15, 19) — une journée

Le 429 ouvre la feuille du quota ; le ♥ se grise à zéro ; le message serveur devient
« Tes « J'aime » du jour sont partis. » ; la pastille attend `S.quota`. Le paquet vide mène à
« Changer de ville » et « Inviter », et promet l'annonce d'arrivée qui existe. Le segment
Cartes/Liste retrouve son icône. Pour la jauge, l'option (a) du § 2.2 : « Vérifié » seul sur la
carte tant qu'aucun second critère n'est atteignable par personne — c'est une décision de
produit, à confirmer par le propriétaire avant la PR. Tests : `test/balayage.test.js` (le
message), `interface.test.js` (le `disabled`, la pastille), `test/jauge.test.js` si (a).

### Lot D — Les mots et les fins (n° 10, 12, 13, 14, 16, 17, 20) — une demi-journée

L'accord de l'anti-arnaque avec une table par catégorie, et les deux lignes de Q. La carte
« qui t'a aimé » après les discussions quand `n = 0`. L'écran du compte fermé avec son titre et
son bouton vers le bot. « Fermer » après la suppression. Les boutons ronds sur la fiche.
« Tout remettre à zéro » dans les filtres. Le bandeau réseau qui part. Tests :
`test/antiscam.test.js` (les quatre catégories, accordées), `test/pages-publiques.test.js`
n'est pas touché, `interface.test.js` pour les boutons de la fiche.

### Lot E — Ce qui se perd (n° 8, 9) — une journée, et le téléphone

Le brouillon d'inscription dans `localStorage` (texte, jamais la photo), effacé à
l'enregistrement et à la suppression. Le délai des envois de photo proportionnel à la taille,
et un message qui sépare « profil enregistré » de « photo à renvoyer ». Mesure avant/après au
téléphone en réseau bridé (§ 6.2), chiffres à ranger dans ce dossier.

Ce que les cinq lots ne touchent pas : aucune donnée nouvelle, aucun changement de politique,
aucune promesse de sécurité affaiblie, aucun des points du § 3.

---

## 6. Ce qu'il faut vérifier au téléphone

Même format que `CONTROLES-TELEPHONE.md`. Un compte de test, l'app en production, Telegram
Android. Les cases marquées **(deux comptes)** demandent un second téléphone.

### 6.1 Le bot muet sans badge (n° 4) **(deux comptes)**

- [ ] Sur un compte qui **n'a jamais écrit au bot**, ouvrir `t.me/<bot>/<app>?startapp=ref_campus`
      (pas `/start`). Créer un profil, appuyer sur « Plus tard » à la vérification.
- [ ] Depuis le second compte, aimer ce profil, puis matcher (le second aime, le premier aime en
      retour) et envoyer un message.
- [ ] **Attendu aujourd'hui** : aucune notification du bot sur le premier téléphone. Dans
      `flyctl logs -a mbolo-miniapp`, une ligne `Notification impossible pour … : Forbidden:
      bot can't initiate conversation with a user`.
- [ ] **Attendu après le lot B** : la demande d'accès apparaît à l'enregistrement du profil, et
      la notification de match arrive.

### 6.2 La photo sur réseau lent (n° 9)

- [ ] Sur Android, Paramètres → Réseau → type de réseau préféré : **2G seulement** (ou l'économiseur
      de données + un endroit à une barre).
- [ ] Modifier le profil, ajouter une photo prise avec le téléphone, Enregistrer. Chronométrer.
- [ ] **Attendu aujourd'hui** : après 12 s, « Pas de connexion. Vérifie ton réseau et réessaie. »,
      le bouton redevient « Enregistrer ». Rouvrir l'onglet Profil : le profil **est** enregistré,
      la photo manque. Noter le temps et le poids (Paramètres → Données de l'app).
- [ ] Recommencer en 3G : noter si 12 s suffisent.

### 6.3 L'inscription perdue (n° 8)

- [ ] Commencer une inscription, remplir l'étape 1, passer à l'étape 2, taper un quartier.
- [ ] Recevoir un message Telegram et l'ouvrir depuis la notification (ou appuyer sur le
      bouton Retour d'Android jusqu'à quitter la mini app). Rouvrir l'app.
- [ ] **Attendu aujourd'hui** : on revient à l'étape 2 (`form_step`), mais tout est vide.

### 6.4 L'erreur de formulaire, clavier ouvert (n° 3)

- [ ] Étape 1 : taper un prénom, laisser l'âge vide, **sans fermer le clavier** appuyer sur
      « Continuer ».
- [ ] **Attendu aujourd'hui** : une vibration, rien de visible. Fermer le clavier, défiler tout en
      bas : « Indique ton âge. » est là.

### 6.5 Après le selfie, sous « badge » (n° 2)

- [ ] Envoyer un selfie. Sur l'écran « Vérification en cours », chercher un chemin vers les
      profils sans fermer l'app.
- [ ] **Attendu aujourd'hui** : il n'y en a pas (Actualiser, Fermer, le bouton retour est absent).
      Fermer l'app, la rouvrir : on arrive sur Découvrir — la découverte était donc ouverte.

### 6.6 Deux choses que le harnais ne voit pas

- [ ] Le libellé du bouton natif sur l'écran du pass (« Prendre 30 jours · 299 ★ ») tient-il sur
      une ligne dans le MainButton de Telegram, en français et en russe ? (constat Z)
- [ ] Le segment Cartes / Liste : le disque blanc montre-t-il un glyphe sur le téléphone ? (n° 15,
      le contraste dépend de l'écran)
- [ ] `t.me/<bot>/<app>?startapp=diag` : envoyer la capture, pour ranger les mesures de la
      WebView dans `audit/14-fluidite.md`.

---

## 7. Soupçons sans preuve

Ce que le parcours fait sentir sans qu'une capture ou une ligne de code le prouve. À vérifier
avec de vraies personnes pendant la bêta, pas à corriger d'ici là.

- **L'onglet « Sécurité »** prend un quart de la barre pour un guide qu'on lit une fois. Sur le
  marché, la sécurité vit dans les réglages et dans le menu de la discussion, où elle sert. Mais
  c'est aussi la promesse de l'app, et l'onglet la rend visible : à trancher avec des chiffres
  (`app_opened` → combien ouvrent l'onglet, et quand).
- **L'accueil fait 825 px** : sur un Android 360 × 640, la quatrième promesse et le bouton se
  chevauchent peut-être. Le harnais tourne en Pixel 5 ; à voir sur un téléphone plus petit.
- **Rien n'indique que la carte se balaie** : les trois boutons suffisent, et le balayage est un
  raccourci. Un « glisse pour décider » une seule fois serait la norme du marché, mais rien ne
  prouve que quelqu'un le cherche.
- **« Liens et numéros à 10 · 0/10 »** est la première ligne qu'un nouveau match lit dans la
  discussion : une restriction avant un mot. C'est le constat N livré tel quel ; à voir si les
  premiers membres la comprennent comme une protection ou comme une interdiction.
- **Les filtres font 1 213 px** avec deux boutons natifs en bas : la tranche d'âge est sous le
  pli, et « Tout voir » à côté d'« Enregistrer » se lit peut-être comme « voir la suite ». Lié au
  n° 17.
- **La feuille du quota** (PR #131) dit quatre phrases : à voir si les gens lisent au-delà de la
  première.
- **« Salut Nadia »** sur l'accueil prend le prénom de Telegram : juste, sauf pour qui a mis un
  pseudo ou un emoji comme prénom Telegram. Aucun cas vu.
- **Les noms de pays en français** (« Côte d'Ivoire », « Afrique du Sud ») viennent d'`Intl` : sur
  un vieil Android, `Intl.DisplayNames` peut manquer et la liste montrer des codes. Non
  reproduit.
- **La discussion sans lieu partenaire n'a aucun bouton natif** (constat M, voulu) : la barre
  du bas est vide, et Telegram réduit alors la fenêtre différemment (la panne du 18 septembre,
  corrigée). À garder à l'œil sur d'autres téléphones que celui du propriétaire.
- **Les profils de démonstration font tous « Actif aujourd'hui »** et « Confiance 2 sur 2 » :
  en production ils sont éteints, mais le jour où une machine de démonstration les rallume, ils
  auront l'air plus vivants et plus sûrs que les vrais membres (n° 19).

---

## 8. Refaire les captures

Le harnais n'est pas versionné avec ce dossier (la consigne était un rapport, sans code). Il
tient en un fichier d'outils (`outil.mjs` : serveur, `initData` signé, pont Android factice,
`etat()` qui lit l'écran, `capturer()`, `tache()` qui compte les appuis) et cinq scénarios
(`entree`, `decouverte`, `vide`, `compte`, `rattrapage`), tous en Playwright. Le refaire depuis
`e2e/aides.js` prend une demi-journée ; le versionner dans `audit/16-harnais/` est le premier
geste à faire si ce dossier doit être rejoué à chaque lot, comme les captures de l'audit 15.
