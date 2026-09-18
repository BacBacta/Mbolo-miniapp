# Ce qu'on vérifie à la main, sur un téléphone

Les tests automatiques passent sur une machine : ils ne voient ni la WebView de Telegram, ni le
vrai bot, ni les notifications, ni le groupe de modération. Cette liste couvre exactement ce
qu'ils ne peuvent pas voir.

À passer **après chaque déploiement qui touche l'interface, le bot ou la modération**. Compte
quarante minutes la première fois, un quart d'heure ensuite.

Les cases marquées **(revue)** existent à cause de la revue du code des 14 et 15 septembre 2026
(`audit/09-revue-code.md`) : ce sont des chemins qui étaient cassés, et qui ne doivent pas le
redevenir sans qu'on s'en aperçoive. Le numéro dit de quel lot elles viennent.

---

## Ce qu'il te faut avant de commencer

- **Deux comptes Telegram**, sur deux téléphones ou un téléphone et un ordinateur. Beaucoup de
  contrôles demandent deux personnes : un match ne se fait pas tout seul. Les cases qui en ont
  besoin sont marquées **(deux comptes)**.
- **Le groupe de modération**, avec ton bot dedans.
- **Quelqu'un d'autre dans ce groupe, qui n'est pas administrateur.** Une seule case en a besoin,
  mais c'est une des plus importantes. Si tu es seul dans le groupe, ajoute un second compte en
  simple membre le temps du test.
- Les deux comptes de test seront supprimés à la fin : ne prends pas ton compte personnel.

---

## 0. Avant de toucher au téléphone

- [ ] `https://mbolo-miniapp.fly.dev/health` répond `{"ok":true}`.
- [ ] `flyctl logs -a mbolo-miniapp` porte, au démarrage :
      `Stockage : PostgreSQL` et `Modération : les selfies et les photos partent vers « … »`.
      *Si le second manque, personne ne pourra être vérifié : le bot n'est pas dans le groupe, ou
      l'identifiant a perdu son tiret.*
- [ ] **(revue, lot 1)** Le journal ne porte **aucune** ligne `Promesse rejetée sans filet`.
      *Elle ne fait plus tomber le serveur, mais elle signale un bogue à corriger.*

---

## 1. Le bot lui-même

- [ ] `/start` dans la discussion du bot : le message d'accueil arrive, avec le bouton
      **Ouvrir Odo**.
      **(revue, lot 2)** *C'est le contrôle le plus important de tous. Le webhook n'est plus
      authentifié par son adresse mais par un en-tête secret : si `WEBHOOK_SECRET` était mal posé,
      le bot serait **entièrement muet**, sans aucune autre trace. Un bot qui répond prouve que le
      secret posé au déploiement est celui que Telegram renvoie.*
- [ ] La fiche du bot affiche **Odo**, pas Mbolo — y compris si ton Telegram est en français.
- [ ] `/aide` répond.

### Le bot doit pouvoir écrire (audit 16, n° 4) **(deux comptes)**

- [ ] Sur un compte qui **n'a jamais écrit au bot**, ouvre `t.me/<bot>/<app>?startapp=ref_campus`
      (pas `/start`). Crée un profil : à l'enregistrement, Telegram demande **« Autoriser le bot à
      t'écrire ? »**. Refuse.
- [ ] Un toast dit que le bot ne pourra pas te prévenir. L'onglet Profil porte la ligne
      **« Le bot ne peut pas te prévenir »**. Touche-la : la mini app se ferme sur la discussion
      du bot, qui dit qu'il peut maintenant t'écrire.
- [ ] Recommence avec un autre compte neuf, et **accepte** cette fois. Depuis le second compte,
      aime ce profil puis matche : la notification de match **arrive** sur le premier téléphone.
      *Avant, elle mourait en silence : `Notification impossible pour … : Forbidden` dans
      `flyctl logs -a mbolo-miniapp`, et rien à l'écran.*

---

### Ce que le bot promet sur l'argent

- [ ] `/start` : « …sans rien te faire payer **pour ça** ». Pas « sans jamais te demander
      d'argent » — cette promesse-là deviendrait fausse au premier pass vendu.
- [ ] `/aide` : « …ne te demandera jamais d'argent **par message**. Si quelqu'un le fait,
      **même en son nom**, c'est une arnaque. » Le canal et le mot doivent y être.
- [ ] Refais les deux avec Telegram dans une autre langue : la précision doit y être aussi.

---

## 2. Accueil (avant toute inscription)

- [ ] L'écran s'affiche avec ses deux cartes de profil, le tampon « J'aime » et la bulle de
      message. Le titre est dans une police à empattements (Fraunces), pas dans la police du
      système.
      **(revue, lot 4)** *La politique de sécurité de contenu a été resserrée : plus aucun script
      en ligne, et les polices ne sont autorisées que depuis Google Fonts. Si elle était trop
      stricte, l'écran serait nu ou blanc.*
- [ ] Le jeton de langue, en haut à côté du nom, ouvre la liste des sept langues.
- [ ] Choisis **Русский** : toute l'interface se traduit, et les titres gardent une police à
      empattements (Playfair) au lieu de retomber sur celle du système.
- [ ] Reviens en français.
- [ ] La mention **18+** est visible en bas.

---

## 3. Créer le profil

- [ ] **(audit 15, lot 3)** La première étape est **la photo**, en grand, avec le prénom, l'âge et le
      genre ; puis ce que tu cherches ; puis ta question. Sans photo, ça passe quand même.
- [ ] Prénom, âge, genre, intention : l'écran avance étape par étape.
- [ ] **(audit 16, n° 3)** À l'étape 1, laisse l'âge vide, clavier ouvert, et touche
      « Continuer » : l'erreur « Indique ton âge. » **se voit sans défiler**, et le champ Âge a
      le focus. *Avant, l'erreur s'écrivait sous le pli et le bouton avait l'air mort.*
- [ ] Le champ « ville » n'a **aucune suggestion pré-remplie** dans le champ lui-même.
- [ ] **(revue, lot 4)** Écris comme ville : `Douala 677 12 34 56`. L'enregistrement doit être
      **refusé**, avec : « Ton profil ne doit contenir ni numéro, ni lien, ni pseudo, ni demande
      d'argent. »
      *La ville échappait au filtre : un numéro s'affichait sur la carte de tout le monde, avant
      le moindre échange.*
- [ ] Corrige en `Douala` : l'enregistrement passe.
- [ ] Ajoute une photo : elle se compresse et part en modération.
- [ ] En **Relation sérieuse**, les deux questions facultatives (mariage, enfants) apparaissent.
      En **Amitié**, elles disparaissent.

### Le pays, et les autres choix

C'est le seul endroit où l'app touchait encore au menu déroulant du système : gris, à la
typographie d'Android, sans recherche, et 243 pays à faire défiler depuis l'Afghanistan.

- [ ] Touche **Pays** : un **écran de l'app** s'ouvre, pas une boîte de dialogue grise. Titre
      « Ton pays », champ de recherche en haut.
- [ ] Ton pays est déjà **proposé en haut**, sous « Proposés ».
- [ ] Tape `cam` : la liste se réduit pendant la frappe, et **le clavier reste ouvert**.
      *S'il se referme à chaque lettre, l'écran se reconstruit — c'est le bug de la règle 16.*
- [ ] Tape `cote divoire`, sans accent ni apostrophe : la Côte d'Ivoire doit sortir.
- [ ] Tape `zzzz` : « Aucun pays ne correspond », pas une liste vide.
- [ ] Choisis un pays : retour au formulaire, le nom s'affiche dans la ligne, et la ville
      suggérée suit le nouveau pays.
- [ ] Étape 3 : les sept questions sont des **pastilles visibles d'un coup**, plus un menu.
- [ ] Même chose depuis **Filtres** → **Pays**. Tape d'abord une tranche d'âge, va choisir un
      pays, reviens : **la tranche que tu as tapée est toujours là.**

---

## 4. La jauge de confiance

- [ ] **(audit 15, lot 3)** Après l'enregistrement du profil, l'app va **droit à la vérification** :
      aucun écran ne s'intercale.
- [ ] Sur une carte de Découvrir, touche les **pastilles de confiance** : l'écran d'explication
      s'ouvre ; il annonce **sur 2**, pas sur 3 ; « Compris » ramène **au paquet**.
- [ ] On le retrouve aussi dans les réglages (groupe Sécurité), et le retour y revient.

---

## 5. Vérification par selfie

> **Cette instance tourne sur `VERIFICATION_POLICY = "badge"`** : la vérification n'est plus une
> porte mais un badge. Les cases marquées « badge » n'existent que sous ce réglage ; sous `gate`,
> l'écran de vérification n'a pas de « Plus tard » et rien ne s'ouvre avant la décision.

- [ ] **(badge)** L'écran de vérification montre **d'abord le geste et le bouton de la galerie**,
      et annonce ensuite ce que le bouclier donne : le bouclier sur la fiche et plus de profils
      par jour. La ligne du rendez-vous n'y est **pas** tant qu'aucun lieu partenaire n'existe
      dans ta ville (audit 16, n° 18).
- [ ] **(badge)** Il n'y a **aucun bouton natif** tant que le selfie n'est pas choisi. « Plus
      tard » est un lien texte sous la carte du geste : touche-le, tu arrives sur **Découvrir**,
      avec les onglets, sans être vérifié (audit 16, n° 1).
- [ ] **(badge)** Selfie choisi, le bouton natif dit « Envoyer pour vérification ». Envoie : tu
      arrives **sur Découvrir**, avec un toast « Selfie envoyé », pas sur un écran d'attente
      (audit 16, n° 2). Quand la modération valide, un toast dit que le bouclier est sur ta
      fiche, sans changer d'écran si tu es dans une discussion.
- [ ] **(badge)** Depuis l'onglet Profil, la ligne **« Faire vérifier mon profil »** est toujours
      là et ramène ici. Pendant l'attente, elle devient « Vérification en cours » et ouvre
      l'écran d'attente, dont le bouton principal est « Découvrir en attendant ».
- [ ] **(badge)** Dans **Découvrir**, les profils avec le bouclier passent devant ceux qui ne
      l'ont pas — mais les deux sont visibles.
- [ ] **(badge)** Dans **Filtres**, l'interrupteur « Profils vérifiés seulement » ne laisse plus
      que les profils au bouclier ; le retirer les fait revenir.
- [ ] **(badge)** Sans bouclier, **Proposer un rendez-vous** mène à un écran qui l'explique et
      propose de se faire vérifier, jamais à un formulaire qui finit en erreur. Vérifie-toi, puis
      recommence avec un second compte **non vérifié** : l'écran nomme alors l'autre personne.
- [ ] **(audit 15, lot 4 — panne du 18 septembre 2026)** Ouvre une discussion **sans lieu partenaire
  dans ta ville** (c'est le cas en production) : aucun bouton natif en bas, et le champ « Écris ton
  message » avec son bouton d'envoi sont **visibles au-dessus de la barre de navigation du
  téléphone**, sans faire défiler. Tape un message, envoie-le. Puis ouvre
  `https://t.me/<bot>/<app>?startapp=diag` : l'écran « Mesures de la fenêtre » s'affiche, et
  `--tg-viewport-height` ne dépasse pas la hauteur de la fenêtre de plus de quelques pixels.
  Si le champ manque encore, envoie une capture de cet écran-là.
- [ ] **(18 septembre 2026)** Sur Découvrir, touche la pastille **« ♥ n »** de la barre : une feuille
  « Tes « J'aime » du jour » dit combien il t'en reste, que passer ne coûte rien, et propose
  « Me faire vérifier » si tu n'as pas le badge, « Voir le pass » sinon. « D'accord » la referme
  sans rien changer au nombre.
- [ ] **(badge)** Aime cinq profils d'affilée sans être vérifié : le sixième doit dire que la
      limite du jour est atteinte, et proposer de se faire vérifier.
- [ ] **(badge)** Ouvre `/conditions` depuis l'onglet Profil : la page ne doit **pas** dire « tant
      que tu n'es pas vérifié, tu ne vois personne ». Elle doit parler du bouclier.

- [ ] L'écran demande un geste aléatoire et dit l'ordre réel : prendre le selfie **puis** le
      choisir. Le bouton dit « Choisir mon selfie dans la galerie », une ligne dit que l'appareil
      photo ne s'ouvre pas d'ici (18 septembre 2026 : la galerie qui s'ouvrait avait été prise
      pour une panne). Le mot « caméra » n'y figure pas.
- [ ] Le sélecteur ouvre la galerie. *C'est normal : la WebView de Telegram sur Android ignore
      toute demande d'ouvrir la caméra. C'est le geste qui vérifie, pas l'appareil.*
- [ ] Le selfie arrive dans le groupe de modération, avec la légende (prénom, âge, geste demandé)
      et les boutons **Valider** / **Refuser**.
- [ ] **(revue, lot 2)** Fais toucher **Valider** par un membre du groupe **qui n'est pas
      administrateur**. Il doit lire : « Action réservée aux administrateurs du groupe. » et
      **rien ne doit changer** sur le compte.
      *Avant, tout membre du groupe validait les selfies et fermait les comptes.*
- [ ] Touche **Valider** en tant qu'administrateur : le compte est vérifié.
- [ ] **(revue, lot 3)** La photo **disparaît** du groupe, remplacée par une ligne de texte
      « Vérification validée par … ». Aucune image ne reste dans la discussion.
- [ ] La personne reçoit la notification « Ton profil est vérifié ».
- [ ] **Une arrivée s'annonce.** Un **autre** compte, de la même ville et de la même intention,
      qui n'a pas ouvert l'app depuis une demi-heure, reçoit « quelqu'un vient d'arriver à … et
      correspond à ce que tu cherches ». Le bouton ouvre **Découvrir**, et la carte y est.
      *Les trois pièges, dans l'ordre où ils se manifestent :* un compte qui vient d'ouvrir l'app
      ne doit **rien** recevoir (la carte arrive seule dans son paquet) ; une deuxième arrivée le
      même jour ne doit **pas** faire un second message (48 h entre deux) ; et la nouvelle ne doit
      **nommer personne** — ni prénom, ni photo.
- [ ] Refais valider le **même** selfie après l'avoir remis en attente : personne ne reçoit
      « quelqu'un vient d'arriver » une seconde fois. *Une arrivée ne s'annonce qu'une fois.*

---

## 6. Présentation vocale

- [ ] **(audit 15, lot 3)** Juste après la vérification, l'app va **droit à Découvrir** : la
      présentation vocale attend dans l'onglet Profil, sous la fiche.
- [ ] Le bouton ouvre la **discussion du bot**, pas un navigateur, et l'écran ne fige pas.
- [ ] Le bot dit le geste en premier : « Appuie sur le micro, en bas de cette discussion. »
- [ ] Enregistre un vocal de moins de 15 s (30 s avec un pass, et la consigne du bot doit dire le bon nombre) : il arrive dans le groupe de modération avec ses
      boutons, et l'app affiche « En attente ».
- [ ] Valide-le depuis le groupe : l'app affiche « Validée · 0:12 ».

---

## 7. Découvrir

- [ ] **(audit 15, lot 1)** La carte remplit l'écran entre la barre du haut et les trois boutons
      ronds ; la question et la jauge sont **sur la photo** ; aucun bouton natif en bas. Le
      chevron en haut à droite du prénom ouvre la fiche entière ; le retour natif revient au paquet.
- [ ] **(audit 15, lot 2)** La fiche est une **suite de blocs** : la photo de tête (le prénom, l'âge,
      le bouclier, le quartier), puis la question dans sa propre carte, puis une autre photo, une
      autre question, « En bref » (intention, langues, compatibilité, le bouton d'écoute), et la
      ligne de confiance qui ouvre l'explication. Sur un profil à trois photos, fais défiler :
      la troisième n'arrive qu'en approchant de l'écran, sans à-coup. La photo de tête ne réagit
      pas au toucher — les photos sont des blocs, plus un carrousel. « J'aime » et « Passer »
      restent les boutons natifs du bas, et la fiche d'un match ne les propose pas.
- [ ] **(audit 15, lot 2)** Sur la fiche, chaque réponse porte un **cœur**. Touche-le : une feuille
      monte avec la réponse en titre et un champ « Un mot pour l'accompagner » ; le clavier
      s'ouvre et la feuille reste visible au-dessus. « Annuler » ne fait rien. Écris un mot et
      « Envoyer le J'aime » : avec un profil de démonstration, c'est un match, et ton mot est le
      **premier message** de la discussion. Écris « envoie-moi 5000 FCFA » : refusé avec la même
      explication qu'un message, et la fiche n'a pas bougé. Depuis l'autre compte (un vrai
      match), l'écran de match dit « {prénom} a aimé ta réponse à … » avec le mot, et la carte
      d'ouverture de la discussion le redit.
- [ ] Passe une carte avec le bouton ✕ : la suivante arrive, le bouton **revenir** s'allume ; touche-le,
      la carte passée revient en tête. Aime une carte avec ♥ (l'aura à l'appui) : le compteur de
      la pastille baisse d'un ; reviens, il remonte. Après un **match**, revenir est éteint.
- [ ] Sans pass, touche « Liste » : une **feuille du bas** monte, la carte reste derrière ; « Plus
      tard » la ferme, « Voir le pass » ouvre le pass.

- [ ] Des cartes apparaissent (avec un second compte vérifié dans la même ville).
- [ ] **(revue, lot 4)** **Les photos des autres se chargent.**
      *C'est le contrôle visible du changement le plus profond de la revue : l'API ne désigne plus
      personne par son identifiant Telegram mais par un identifiant public aléatoire. Les photos
      passent par lui. Si la résolution avait cassé, les cartes seraient sans photo — et rien
      d'autre ne le dirait.*
- [ ] Le bouton d'écoute de la présentation vocale est **dans le corps de la carte**, pas sur la
      photo. Il joue le son, un seul à la fois.
- [ ] Le balayage fonctionne dans les deux sens ; le tampon « J'aime » apparaît au like.
- [ ] **(audit 16, n° 6)** Épuise tes « J'aime » du jour (2 sans badge, 5 avec) : la pastille dit
      « ♥ 0 », le ♥ **s'éteint** mais reste un bouton. Touche-le : la feuille du quota s'ouvre
      (« Tes « J'aime » du jour sont partis »), avec « Me faire vérifier » en premier si tu n'as
      pas le badge. *Avant, un toast disait « tu as vu tous tes profils », et passer marchait.*
- [ ] **(n° 7)** À l'ouverture de Découvrir sur un réseau lent, la pastille ne dit jamais « ♥ 0 »
      pendant le chargement : elle est vide et pâle, puis le nombre arrive.
- [ ] **(n° 5)** Sur un paquet vide, le bouton principal dit « Changer de ville » et le
      secondaire « Inviter » ; le texte promet que le bot prévient quand quelqu'un arrive.
- [ ] **(n° 15)** Le sélecteur **Cartes / Liste** en haut de Découvrir montre deux icônes (une carte,
      trois lignes), pas un disque blanc vide.
- [ ] **(n° 16)** Ouvre une fiche par le chevron : en bas de la fiche, les **deux mêmes ronds**
      (× et ♥) que sous le paquet, et **aucun bouton natif** « J'aime / Passer ».
- [ ] **(n° 17)** Dans **Filtres**, « Tout remettre à zéro » remplit les champs (18–99, tout le
      monde) **sans quitter l'écran** ; rien n'est enregistré tant que tu n'as pas touché
      « Enregistrer ».
- [ ] La jauge (pastilles) s'ouvre sur l'écran d'explication.
- [ ] Le compteur du jour descend ; à 20 likes, l'écran dit de revenir demain.

---

### Les cartes elles-mêmes

- [ ] L'initiale au fond de l'image est **centrée**, et aucun cercle ne lui passe dessus.
      *Les images de démonstration posaient la lettre trop haut, avec un cercle en travers.*
- [ ] Sur un profil à plusieurs photos (la barre en haut est coupée en deux ou trois), touche la
      **moitié droite** de l'image : la photo doit **visiblement** changer — le motif et la
      teinte changent ensemble.
- [ ] Le prénom et la ville se lisent bien en bas, sur toutes les cartes : le bas de chaque image
      est assez sombre.

---

## 8. Filtres

- [ ] Tranche d'âge et zone de recherche se règlent, et le paquet suit.
- [ ] Le bouton **Ma position : {pays}** propose le pays deviné, sans jamais demander le GPS.
- [ ] Le segment **Tout le monde / Femmes / Hommes** est présent, dans les deux intentions.
      *Cette instance tourne sur `MATCH_POLICY = "open"`. Sous la politique par défaut, le segment
      n'apparaîtrait qu'en Amitié.*
- [ ] « Tout voir » remet tout à zéro.

---

## 9. Match et liste des messages **(deux comptes)**

- [ ] Deux likes réciproques : l'écran de match s'affiche, avec l'aura.
- [ ] Les deux comptes reçoivent la notification « Nouveau match » du bot.
- [ ] Dans l'onglet Messages, la discussion apparaît avec « Nouveau match, écris le premier
      message ».
- [ ] **(audit 15, lot 3)** Balaie une ligne de Messages vers la gauche : « Retirer » apparaît ;
      un appui sur la ligne la referme sans ouvrir la discussion ; « Retirer » demande
      confirmation, puis la ligne disparaît. Un défilement vertical n'ouvre rien.
- [ ] **(revue, lot 4)** Envoie un message, puis reviens à la liste : l'aperçu est précédé de
      **« Toi : »**. Depuis l'autre compte, le même aperçu s'affiche **sans** « Toi : ».
      *L'auteur de chaque message ne sort plus du serveur ; seul « c'est de moi » voyage. Si ce
      calcul avait cassé, « Toi : » serait absent des deux côtés, ou présent des deux.*

---

### Les fins (audit 16, n° 13 et 14)

- [ ] Depuis le groupe de modération, ferme ton compte de test. Rouvre l'app : l'écran dit
      **« Ton compte est fermé »**, sans « Réessayer », avec un bouton **« Écrire au bot »** qui
      ferme la mini app sur la discussion du bot, lequel répond comme à `/aide`. Rouvre le compte
      depuis le groupe.
- [ ] Supprime un compte de test : l'écran de confirmation porte un bouton natif **« Fermer »**
      qui ferme la mini app.

## 10. Discussion — le contrôle le plus important de la revue

- [ ] **(revue, lot 6) (deux comptes)** Avec **deux discussions ouvertes** : ouvre la première,
      reviens tout de suite à la liste, ouvre la seconde **sans attendre**. Le prénom en tête doit
      être celui de la **seconde**, et le message que tu envoies doit arriver chez la **seconde**.
      *À refaire deux ou trois fois, et si possible en réseau lent (mode avion coupé juste avant).
      C'est exactement la course qui envoyait un message à la mauvaise personne.*
- [ ] **(revue, lot 6)** Touche **Proposer un rendez-vous**, puis reviens à la discussion avant
      que l'écran ne s'affiche, et tape dans le champ. L'écran du rendez-vous **ne doit pas**
      prendre la place, et le clavier ne doit pas se fermer.
- [ ] Pendant que tu tapes, fais arriver un message depuis l'autre compte : il s'affiche **sans**
      fermer le clavier ni effacer ce que tu as écrit.
- [ ] Le compteur de déblocage des contacts affiche la progression vers **10 messages de chaque
      côté**.
- [ ] **(deux comptes)** Les deux discussions ouvertes : l'en-tête de chacune dit **En ligne**.
      Ferme l'app sur l'un des deux téléphones : chez l'autre, « En ligne » disparaît en quelques
      secondes et la tranche d'activité revient.
- [ ] **(deux comptes)** Tape sans envoyer sur le premier téléphone : sur le second, une **bulle
      de trois points** apparaît au bas du fil et l'en-tête dit **écrit…**. Efface tout : la bulle
      disparaît au bout de quelques secondes. *À refaire une fois en coupant le réseau du premier
      téléphone quelques secondes avant de taper : la frappe doit passer même quand un seul des
      deux flux est vivant.*
- [ ] **(deux comptes)** Envoie un message : chez toi, la bulle porte une **horloge**, puis **une
      coche**, puis **deux coches en ambre** dès que l'autre l'a sous les yeux. Mets l'autre
      téléphone en arrière-plan avant d'envoyer : la seconde coche n'arrive qu'au retour.
- [ ] **(audit 15, lot 0)** Depuis une discussion, touche le drapeau « Se protéger » puis le
      bouton **Retour** natif : tu dois revenir **dans la discussion**, pas sur Découvrir.
      *La première fois, l'app renvoyait sur Découvrir avec « J'aime » en bouton principal.*
- [ ] Onglet Messages : chaque ligne porte **l'heure** du dernier message (ou « Hier », ou le jour).
- [ ] Écran du pass : l'étoile est **dessinée** comme les autres icônes, jamais l'emoji jaune du
      téléphone, et le bouton natif tient sur **une ligne** (« Prendre 30 jours · 299 ★ »).
- [ ] **(deux comptes)** **Appui long** sur un message de l'autre : le menu natif de Telegram
      s'ouvre avec **Répondre** et **Copier** — pas « Supprimer ». Copier, puis colle dans le
      champ : le texte est là. Répondre : la citation apparaît
      au-dessus du champ, le clavier reste ouvert, et le message envoyé porte la citation **chez
      les deux**. Toucher la citation remonte au message cité.
- [ ] **(deux comptes)** Appui long sur **un de tes messages**, **Supprimer** : la bulle dit
      « Message supprimé » **chez toi et chez l'autre** (quelques secondes au plus), à la même
      place, et la liste Messages le dit aussi. Le compteur de non lus de l'autre ne le compte pas.
- [ ] **(deux comptes)** L'icône image à gauche du champ ouvre la galerie ; choisis une photo :
      chez toi elle s'affiche tout de suite avec l'horloge puis la coche, chez l'autre elle arrive
      **voilée** avec « Toucher pour voir » ; un appui la dévoile, un second l'ouvre en grand, un
      appui referme. Retire-la : elle disparaît des deux côtés. *Rien d'autre qu'une image ne doit
      pouvoir être choisi.*
- [ ] **(revue, lot 6)** Passe l'interface en russe, puis rouvre la discussion : les séparateurs
      de jour affichent **Сегодня / Вчера**, et les heures sont au format russe.
      *Ils étaient écrits « Aujourd'hui » et « Hier » en français, quelle que soit la langue.*

### Anti-arnaque **(revue, lot 5)**

Envoie ces messages dans la discussion. **Chacun doit être refusé**, avec un message qui dit ce
qui l'a déclenché :

- [ ] `prête-moi 5000`
- [ ] `jai besoin dargent`
- [ ] `envoie 5 000`
- [ ] `tu peux m'aider avec 5000 fcfa`
- [ ] `je suis sur wa`
- [ ] `mon ig c paul237`
- [ ] `677 12 34 56`

Et ceux-ci doivent **passer** — c'est le vrai risque, tuer une conversation ordinaire :

- [ ] `un homme tel que toi`
- [ ] `on se voit samedi, envoie une photo`
- [ ] `je prends le taxi, ça me coûte 300 F`
- [ ] `j'ai eu mon visa pour la France`

---

## 10 ter. Finition **(audit 15, lot 5)**

- [ ] Règle la taille de police du téléphone sur « grand » : le texte de l'app grandit (listes,
      bulles, titres) ; le prénom sur la photo et les tampons ne bougent pas.
- [ ] Sur une carte, « Cette semaine » est blanc avec un point ambré devant, pas ambre.
- [ ] La jauge (depuis les pastilles) montre deux grandes pastilles qui se remplissent ; la voix
      montre une onde ; la personne de confiance, un aperçu du message ; les vues, le nombre en
      grand. Avec « réduire les animations » dans Android, rien ne bouge.

## 10 bis. Réactions, légende, déblocage **(audit 15, lot 4)**

- [ ] Appui long sur un message : une ligne de six emoji au-dessus du menu. Touche ❤️ : le chip
      apparaît au coin de la bulle tout de suite ; l'autre compte le voit sans avoir rien reçu du
      bot. Touche 🔥 : il remplace ❤️. Retouche 🔥 : il part.
- [ ] Envoie une photo : une feuille montre l'aperçu et propose une légende ; « Annuler » ne
      fait rien ; « Envoyer » part avec la légende sous l'image.
- [ ] La ligne « Liens et numéros à 10 · 3/10 » est **sous l'en-tête**, fine ; elle disparaît au
      dixième échange.
- [ ] Sans lieu partenaire dans ta ville (c'est le cas au lancement), la discussion n'a **aucun
      bouton principal** ; avec une personne de confiance, « Je pars au rendez-vous » reste.
- [ ] Onglet Messages sans pass : la tuile floutée a un anneau doré et un cadenas ; l'appui monte
      une feuille (« Voir le pass » / « Plus tard »), pas l'écran du pass.

---

## 11. Rendez-vous

- [ ] L'écran dit : « Pas encore de lieu partenaire dans ton pays… Vous pouvez convenir d'un lieu
      public dans la discussion. » *La liste des lieux est vide, et c'est voulu : aucun café n'a
      signé d'accord.*
- [ ] Aucune promesse de réduction n'apparaît nulle part.

---

## 12. Signaler et bloquer **(deux comptes)**

- [ ] Depuis la discussion, **Bloquer** : la discussion disparaît des deux côtés, sans que l'autre
      soit prévenu.
- [ ] **(revue, lot 2)** Depuis le compte bloqué, ouvre Découvrir : la personne qui a bloqué
      **n'apparaît plus**, et aucune notification ne part chez elle.
      *Un seul like par identifiant recréait le match et envoyait « Nouveau match : … » à la
      personne qui venait de bloquer. Le blocage devenait un canal de harcèlement nominatif.*
- [ ] **Signaler** avec un motif : la modération reçoit le signalement avec le bouton
      **Fermer ce compte**.
- [ ] **(revue, lot 6)** Dans l'espace de modération web, le signalement porte **Lire le fil**, et
      le fil ouvert est bien celui **des deux personnes concernées**.
      *Le client pouvait désigner n'importe laquelle de ses discussions, y compris avec un tiers.*

---

## 13. Personne de confiance **(deux comptes)**

- [ ] Onglet Profil → **Personne de confiance** → l'invitation part par le partage Telegram.
- [ ] **(revue, lot 2)** La personne ouvre le lien : le bot lui dit ce qu'elle recevra et ce
      qu'on garde d'elle, **avant** tout enregistrement. Elle accepte : l'app affiche son prénom.
      *Le bouton porte maintenant le code d'invitation. Si ce parcours marche de bout en bout, le
      changement est bon ; s'il refusait « Cette invitation n'est plus valable », il ne l'est pas.*
- [ ] Rouvre le même lien : il est refusé. Un lien ne sert qu'une fois.
- [ ] Depuis une discussion, **Je pars au rendez-vous** : la personne de confiance reçoit le
      message, **sans le prénom de l'autre membre**.
- [ ] `/retirer` dans le bot, côté personne de confiance : elle est retirée, et le membre est
      prévenu.

---

## 14. Onglet Profil et réglages

- [ ] **(audit 15, lot 3)** L'onglet Profil tient en un écran : en-tête, complétion, la fiche, la
      voix. Les réglages sont derrière le bouton **⋯ → Réglages** de Telegram (SettingsButton) :
      quatre groupes — Compte, Sécurité, Odo Plus, Faire connaître Odo — puis « Supprimer mon
      compte ». Ce qu'on ouvre depuis les réglages y revient au retour.
- [ ] **Tester les notifications** : `/test` dans le bot ; le message arrive, et son bouton rouvre le bon écran.
- [ ] **Confidentialité** et **Conditions** s'ouvrent dans un navigateur par-dessus l'app, sans
      figer l'écran.
- [ ] **(revue, lot 4)** La page de confidentialité contient bien le passage sur le **genre
      recherché** — cette instance tourne sur la politique ouverte, et la page doit le dire.
- [ ] La langue se change depuis les réglages aussi, et le retour renvoie aux réglages.

---

## 15. Supprimer le compte **(revue, lot 3)** — à faire en dernier

- [ ] Onglet Profil → **Supprimer mon compte et mes données** → confirme.
- [ ] L'écran affiche : « Ton compte et tes données ont été supprimés. » et
      « Pour recommencer, ferme Odo et rouvre-le depuis le bot. »
- [ ] **Attends une minute sur cet écran**, puis rouvre l'app : elle doit repartir à
      l'**inscription**, comme un nouveau venu. Ni profil, ni matchs, ni messages.
      *C'est le cœur du contrôle : l'app se rappelait au serveur juste après la suppression, et
      chaque appel recréait le compte. La promesse de la page de confidentialité était fausse.*
- [ ] Depuis l'autre compte, la discussion avec le compte supprimé a disparu.
- [ ] Si le compte supprimé était personne de confiance de quelqu'un, ce quelqu'un reçoit
      « Ta personne de confiance a supprimé son compte », **sans nom**.

---

## 16. Espace de modération web

- [ ] `/moderation` dans le groupe : le lien arrive **en privé**, jamais dans le groupe.
- [ ] Le lien ouvre les quatre vues : accueil, vérifications, signalements, comptes fermés.
- [ ] **Aucun selfie** n'apparaît nulle part dans ces vues.
- [ ] **(revue, lot 2)** Rouvre le **même lien** : il est refusé. Un lien ne sert qu'une fois.
- [ ] **(revue, lot 6)** Ferme la session, puis reviens en arrière dans le navigateur ou recharge
      la page : tu dois être **dehors**. *Avant, fermer la session n'effaçait que le cookie du
      navigateur ; une copie du cookie valait encore douze heures.*
- [ ] Depuis un compte qui n'est pas administrateur du groupe, `/moderation` répond que c'est
      réservé aux administrateurs.

---

## 17. Après tout ça

- [ ] `https://mbolo-miniapp.fly.dev/health` répond toujours `{"ok":true}`.
      **(revue, lot 1)** *Le serveur a encaissé une heure de manipulations, dont plusieurs cas
      limites. Trois d'entre eux l'éteignaient avant la revue.*
- [ ] `flyctl logs -a mbolo-miniapp` ne porte aucune ligne `Promesse rejetée sans filet`, et la
      machine n'a pas redémarré pendant la session.
- [ ] Supprime les comptes de test qui restent.

---

## Si quelque chose rate

Note **l'écran, le geste exact et l'heure**, puis regarde le journal à cette heure-là :

```powershell
flyctl logs -a mbolo-miniapp
```

Un contrôle marqué **(revue)** qui échoue veut dire qu'un correctif de la revue n'a pas tenu :
`audit/09-revue-code.md` dit, pour chaque constat, quel fichier porte le remède et quel test le
fige. C'est là qu'il faut commencer, pas dans l'écran où le symptôme apparaît.
