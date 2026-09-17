# 13 · Monétisation : la refonte du 17 septembre 2026

Ce document dit ce qui était cassé dans le pass tel qu'il était posé, ce qu'on a reconstruit à la place, et pourquoi cette forme-là. Il complète `10-modele-economique.md` (le marché) et `11-abonnements.md` (pass contre abonnement) ; il ne les contredit pas, il les termine.

## 1. Ce qui n'allait pas

Le propriétaire l'a dit en une phrase : « l'implémentation du système d'abonnement est très mal posée au niveau de l'UI/UX, et la conception de la monétisation dans l'ensemble est incohérente, avec des faiblesses ». Relu écran par écran, voici ce que ça recouvrait.

| # | Constat | Pourquoi ça fait mal |
|---|---|---|
| 1 | **L'écran du pass ne vendait rien.** Il disait « Le pass n'est pas encore en vente », puis un bouton « Compris » ramenait en arrière. | Une porte fermée qui mène à un mur se lit comme une panne. La personne a voulu quelque chose, on lui répond qu'on ne sait pas encore le lui donner. Chaque `pass_refuse` était une frustration sans issue. |
| 2 | **Dix lignes de catalogue, aucune promesse.** L'écran listait tout ce que le pass touche (zone, liste, photos, voix, questions, langue, ordre…) sur un pied d'égalité. | Personne n'achète dix petites choses. On achète une chose qu'on veut, et le reste vient avec. Le catalogue dilue la seule raison forte : *savoir qui t'a aimé*. |
| 3 | **Un seul message pour toutes les portes.** Le 403 `PASS_REQUIS` disait la même phrase que la porte soit « qui t'a aimé », la vue Liste ou « qui s'est arrêté ». | Un message qui ne dit pas ce qu'on vient de demander oblige à deviner. Et il tombait en *toast d'erreur*, comme une panne réseau. |
| 4 | **Le quota épuisé ne proposait rien.** À « Tes J'aime du jour sont partis », l'écran disait de revenir demain. | C'est le moment exact où quelqu'un est prêt à payer — il vient d'aimer cinq fois, il en veut une sixième — et l'app ne lui offrait que d'attendre. |
| 5 | **Les cadenas étaient nus.** Une ligne grisée avec une icône, sans dire ce qu'il y a derrière ni où ça mène. | Un cadenas sans explication fait chercher ce qu'on a mal fait. |
| 6 | **Pas de caisse du tout.** Le pass s'offrait à la main depuis le groupe de modération, et rien d'autre. | Sans caisse, `pass_refuse` mesure une curiosité, jamais un consentement à payer. On ne pouvait rien apprendre du prix, ni de la conversion, ni de la durée que les gens choisissent. |
| 7 | **Le cahier des charges (section 10) mettait le paiement hors de Telegram.** Mobile money sur un site web, avec agrégateur, authentification web, réconciliation, remboursements… | C'est un chantier de plusieurs semaines pour un canal que la mini app n'a pas le droit de mentionner (règle 7). Pendant ce temps, la caisse que Telegram met à disposition *dans* l'app, sans rien exiger, restait inemployée. |

Le fond : le pass avait été construit **par la contrainte** (ce qu'on retire au gratuit, et où) et jamais **par la promesse** (ce qu'on achète, en une phrase, à quel prix). Et l'interface le montrait : elle expliquait des règles au lieu de vendre une chose.

## 2. Ce qu'on a reconstruit

### 2.1 Le produit

**Un seul produit, une seule promesse, trois durées.**

> **Odo Plus** — *Vois qui t'a aimé, et aime sans compter.*

Tout le reste (tout le pays, la vue Liste, l'ordre du paquet, la langue, six photos, trente secondes de voix, trois questions, qui s'est arrêté sur ta fiche) est **dedans**, mais vient en second, sous « Ce que ça débloque », en cinq lignes. La promesse tient en une phrase parce qu'elle répond à la seule question qu'une personne se pose sur une app de rencontres : *est-ce que je plais, et à qui.*

**Trois durées comme des forfaits data**, parce que c'est la forme que la cible connaît par cœur et qui n'a jamais eu besoin d'être expliquée :

| Durée | Stars | Par jour | Rôle |
|---|---|---|---|
| 7 jours | 99 | 14 | Essayer. Un petit prix pour lever le doute, et pour qu'un premier achat soit facile. |
| **30 jours** | **299** | 10 | **Le choix conseillé**, présélectionné, marqué « Le plus choisi ». |
| 90 jours | 699 | 8 | S'installer. Le meilleur prix par jour, pour qui a déjà vu que ça marche. |

Les prix sont ceux du démarrage, dans `PLUS_PRIX_STARS`, et **nulle part ailleurs** : ni dans le code, ni dans l'interface, ni dans les dictionnaires. Ils changeront avec la bêta — et changer un prix est une ligne de `fly.toml`, pas un déploiement.

Ordre de grandeur : une Star coûte entre 0,013 et 0,02 $ selon où on l'achète (dans l'app de Telegram, ou sur Fragment) ; 299 Stars font donc 4 à 6 $, soit 2 400 à 3 600 FCFA — le prix d'un forfait data de quelques jours à Yaoundé, et la moitié du prix d'entrée des apps de référence. L'app reçoit les Stars et les convertit par Fragment, à une valeur un peu inférieure au prix d'achat : c'est la part de Telegram et des boutiques.

**Pas d'abonnement, toujours.** Le raisonnement d'`11-abonnements.md` tient : une reconduction tacite suppose un moyen de paiement gardé, une date que la personne oublie, et un jour où elle découvre un prélèvement qu'elle n'a pas décidé. Un pass à durée fixe se comprend en une ligne : *ça s'arrête à cette date, rien ne repart sans ton geste.* Il **s'empile** : pris pendant qu'un autre court, il repousse la fin.

**Pas de boosts, pas de super likes, pas de crédits à l'unité.** Un seul produit, ou l'écran redevient un catalogue. Et rien de ce que le pass vend ne touche à la sécurité : aucun contact, aucune photo privée, aucune exception à la modération, aucune place différente dans le paquet des autres (« qui t'a aimé passe devant » vaut pour tout le monde, pass ou pas — le pass dit *qui*, il ne change pas *l'ordre*).

### 2.2 La caisse : Telegram Stars, dans l'app

C'est la seule caisse qu'une mini app ait le droit d'avoir (règle 7), et c'est celle qui ne demande rien : ni numéro, ni carte, ni agrégateur, ni structure juridique. La personne paie dans la fenêtre de Telegram, par-dessus l'app, avec le moyen qu'elle a déjà lié à Telegram — y compris, dans beaucoup de pays, du mobile money via les fournisseurs de Telegram. Telegram encaisse, retient sa part, et reverse.

```
écran du pass ──POST /api/plus/facture──▶ serveur ──createInvoiceLink (XTR)──▶ Telegram
      │                                                                          │
      ◀── tg.openInvoice(url) : la fenêtre de paiement de Telegram ◀─────────────┘
                                   │ paiement
      bot ◀── pre_checkout_query ──┤   (on revérifie : cette durée, à ce prix, ce compte)
      bot ◀── successful_payment ──┘   → table paiements, pass posé, reçu envoyé
```

Ce qui compte dans ce dessin :

- **Le bot pose le pass, jamais le navigateur.** Quand `openInvoice` dit « payé », l'app *relit* son compte jusqu'à voir le pass ; elle ne le déclare pas. Le client ne dit rien que le serveur croie (règle 5.1).
- **`pre_checkout_query` revérifie le prix du jour.** Une facture porte la durée dans sa charge utile (`plus:1:<jours>:<compte>`) ; au moment de payer, on vérifie que cette durée est encore en vente **à ce montant-là**. Une grille changée entre la facture et le paiement fait refuser le paiement, jamais encaisser un mauvais prix.
- **Idempotent par référence.** Telegram peut livrer deux fois le même `successful_payment`. La table `paiements` (migration 006) est unique par `charge_id` : la seconde livraison ne crédite rien et ne fait pas tomber la première.
- **Le pass va au payeur.** Pas au compte écrit dans la charge utile : c'est le `from` du message de paiement qui reçoit, pour qu'une facture transmise ne crédite pas quelqu'un d'autre.
- **Rien ne se perd en silence.** Un paiement qui arrive sans pass possible (charge illisible, durée retirée de la vente, compte fermé entre-temps) prévient le groupe de modération avec la référence à rembourser.
- **La ligne comptable survit à la personne.** À la suppression du compte, `paiements.user_id` se vide et la ligne reste : un paiement encaissé se garde comme une facture, sans plus personne derrière. La page de confidentialité le dit.

Les remboursements se font **à la main**, depuis le groupe : `/rembourser <ref>` (les six derniers caractères de la référence, ceux du reçu) appelle `refundStarPayment`, retire les jours du pass, marque la ligne, prévient la personne. Côté membre, `/paysupport` — que Telegram exige de tout bot qui vend en Stars — montre les reçus et la marche à suivre, et `/aidepaiement <texte>` porte une réclamation au groupe.

### 2.3 L'interface : une seule porte, et elle dit où elle mène

Le principe : **une personne n'arrive jamais sur le pass par hasard, elle y arrive parce qu'elle a voulu quelque chose.** L'écran doit donc d'abord lui dire que *cette chose-là* est derrière.

- **`porteDuPass({ quoi, titre, sous })`** remplace chaque cadenas. C'est une carte, à l'ambre du pass, qui dit ce qu'il y a derrière (« Voir qui t'a aimé — Ces personnes passent déjà devant dans ton paquet. Le pass les nomme. ») et qui mène à l'écran. Plus aucun cadenas nu.
- **`ouvrirLePass(quoi)`** ouvre l'écran avec la phrase de **cette** porte en accroche (`PLUS_CONTEXTES` : likes, quota, pays, liste, ordre, langue, vues, photos, questions) et retient d'où l'on vient, pour y revenir.
- **Un 403 `PASS_REQUIS` porte `quoi`** et ouvre le même écran, **sans toast d'erreur** : buter sur une porte n'est pas une panne, c'est une proposition.
- **Le quota épuisé propose le pass** en second bouton (« Continuer avec Odo Plus »), et en premier si la vérification n'est pas le chemin gratuit. C'est le moment où l'envie est la plus forte ; on ne le laisse plus retomber sur « reviens demain ».
- **L'écran lui-même** : l'accroche, les trois durées en pastilles (la conseillée marquée et présélectionnée, le prix par jour écrit sous chacune), « Ce que ça débloque » en cinq lignes, une phrase en petit qui dit la règle qui compte (*aucune reconduction, paiement en Stars dans Telegram*), les reçus s'il y en a, et **un bouton qui paie** : « Prendre 30 jours · 299 ⭐ ». Avec un pass en cours : la date de fin, les jours restants, et le bouton devient « Prolonger ».
- **Hors de Telegram** (navigateur de développement), le bouton explique que le paiement se fait dans Telegram, au lieu de rien faire.

Ce que l'écran ne fait **pas** : pas de compte à rebours, pas de « offre limitée », pas de croix qu'on cherche, pas de prix barré. La cible a des forfaits data limités et un réseau instable ; ce qu'elle a en abondance, c'est la méfiance envers ce qui pousse à payer. Un écran calme qui dit son prix est ce qui se vend le mieux ici.

### 2.4 Ce qu'on mesure maintenant

Quatre événements de plus (`pass_vu`, `pass_facture`, `pass_achat`, `pass_rembourse`), et `npm run chiffres` répond enfin aux questions qu'on ne pouvait pas poser : combien de personnes ouvrent l'écran, par quelle porte ; combien demandent une facture ; combien paient, quelle durée, combien de Stars restent après remboursements ; et la **conversion** des personnes qui ont vu l'écran — annoncée comme une borne basse, parce que l'écran s'ouvre aussi par curiosité depuis l'onglet Profil.

La première chose à lire, après deux semaines : **la porte qui convertit**. Si c'est « likes » (depuis Messages), la promesse est la bonne. Si c'est « quota », c'est le compteur qui vend, et il faudra se demander si cinq par jour est le bon nombre. Si personne ne convertit depuis « pays », c'est que la zone ne manque à personne — ou qu'elle manque à tout le monde et qu'ils partent avant l'écran : `deck_empty` le dira.

### 2.5 Ajout du même jour : les listes floutées

Une fois la caisse en place, le propriétaire a demandé ce que fait tout le marché : **sans pass, on voit quand même qu'on a plu, et à combien — en flouté.** Tinder, Bumble et Hinge montrent des vignettes brouillées ; c'est le déclencheur d'achat le plus efficace qu'ils aient, parce qu'il pose la question exacte à laquelle le pass répond.

Ce qui a été décidé en le faisant :

- **Le flou est fabriqué sur le serveur**, pas par une règle CSS. Une règle CSS se retire d'un geste, et l'adresse de la photo entière resterait dans la page. `flouDe()` réduit la miniature à **dix pixels de côté** et l'envoie en `data:` dans la réponse : ce qui part est déjà méconnaissable, et rien ne se redemande par une adresse.
- **La réponse ne nomme personne.** Ni prénom, ni identifiant public, ni adresse — `profiles` reste vide, donc la fiche, `profilConnu()` et `/photos/:id` n'ont rien à ouvrir. Sans photo, une tuile neutre : pas d'initiale, qui dirait la première lettre du prénom.
- **Le compteur se dit à tout le monde.** Il valait `null` sans pass ; il vaut maintenant le nombre, parce que c'est lui qui fait ouvrir l'onglet Messages, et l'onglet qui fait ouvrir le pass.
- **« Se sont arrêtés sur ta fiche » suit la même règle** : l'arrondi, cinq tuiles au plus, floutées. Les trois refus tiennent : l'issue ne sort toujours pas, l'arrondi reste, l'opposition reste gratuite.
- **La fuite acceptée, en connaissance de cause** : « une personne t'a aimé » à côté d'un paquet qui met cette personne en tête fait un nom, et une tache de couleur se rapproche d'une carte. C'est la fuite de tout le marché, et c'est une fuite vers le haut — on apprend qui *veut* de soi, jamais qui n'en veut pas.

Ce qui reste fermé sans pass est exactement ce qui **nomme** : la fiche derrière la tuile, la pastille « T'a liké » sur la carte et dans la vue Liste.

## 3. Ce qu'on n'a pas fait, et pourquoi

- **Le mobile money hors Telegram** (section 10 du cahier des charges, P0-6). Ce n'est pas abandonné, c'est un autre canal : un site web, une authentification web, un agrégateur, une structure juridique. Il vaut le coup le jour où les Stars auront montré que des gens paient — pas avant. Et il ne changera rien dans la mini app, qui n'a pas le droit d'en parler.
- **Une table `entitlements` séparée.** Le droit reste dans `users.data.plus` avec `estPlus()` pour seul lecteur ; `paiements` dit ce qui a été payé, le compte dit ce qui est ouvert. Deux sources de vérité pour un seul droit, c'est une de trop tant qu'un seul canal vend.
- **Des prix par pays.** Les Stars ont un prix unique au monde ; Telegram gère la conversion. Une grille par pays viendra si la bêta montre que 299 Stars sont trop, ou trop peu, quelque part.
- **Un essai gratuit automatique.** `/pass` à la main suffit pour offrir ; un essai automatique demande une règle anti-abus qu'on n'a pas encore de raison d'écrire.

## 4. Ce qui attend le propriétaire

- **Le prix.** 99 / 299 / 699 sont des points de départ raisonnables, pas une étude. Ils se changent dans `fly.toml`.
- **Les conditions et la confidentialité** portent maintenant un paragraphe sur les paiements — à faire relire par le juriste avec le reste.
- **BotFather** : rien à déclarer pour les Stars, pas de fournisseur de paiement à lier. La commande `/paysupport` existe déjà dans le bot.
- **Un premier achat réel**, sur son propre téléphone, avant d'ouvrir : la fenêtre de paiement de Telegram, le reçu du bot, le pass qui apparaît, puis `/rembourser` depuis le groupe pour vérifier le chemin retour.
