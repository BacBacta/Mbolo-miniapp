# Modèle économique

Écrit le 15 septembre 2026. Ce document **n'est pas une décision** : c'est l'état des
contraintes, ce que le code peut facturer aujourd'hui, et une proposition à trancher.
Aucune ligne de code de paiement n'existe (`server/` ne contient ni `XTR`, ni `invoice`,
ni `paysupport` — vérifié), et rien ne sera écrit sans accord explicite du propriétaire.

---

## 1. Le fait qui commande tout le reste

Odo dit à chaque membre, **en sept langues**, deux phrases (`server/bot.js:379` et `:389`,
traduites dans `server/i18n.js`) :

> « {app} te fait rencontrer des personnes vérifiées de ta ville, **sans jamais te demander
> d'argent**. »
>
> « {app} **ne te demandera jamais d'argent**. Si quelqu'un le fait, signale-le depuis la
> discussion dans l'app. »

La seconde n'est pas une promesse commerciale : **c'est une consigne anti-arnaque**. Elle
apprend au membre une règle simple et sauvable — *si ça demande de l'argent, c'est une
arnaque*. C'est exactement l'heuristique qui protège une étudiante de Yaoundé d'un faux
profil qui réclame « 5 000 pour le transport ».

Vendre un pass sans toucher à cette phrase la rend fausse. La retirer purement et simplement
émousse la seule règle que les membres retiendront.

**Ce n'est pas un détail de rédaction : c'est la contrainte principale du modèle économique.**

### La sortie proposée

Ne pas supprimer la promesse : la **préciser sur le canal qui compte**.

> « Odo ne te demandera jamais d'argent **dans une discussion**. Si quelqu'un le fait, c'est
> une arnaque — signale-le. »

La consigne reste tranchante là où le danger est (la conversation), et un pass vendu sur un
écran de l'app, clairement identifié, ne la contredit plus. **À valider avant toute ligne de
code de paiement** — c'est cette phrase qui décide si un modèle payant est possible du tout.

---

## 2. Ce que les règles interdisent

| Règle | Source | Conséquence |
|---|---|---|
| Biens numériques payés **exclusivement en Telegram Stars** dans la mini app, aucun prestataire tiers pour ces biens, `/paysupport` obligatoire | conditions développeurs Telegram (`audit/00-benchmark.md`, C21) | Le mobile money ne peut servir qu'**hors** de Telegram (version web), ou pour des **services physiques** |
| Aucune crypto, aucun jeton, aucun « tap-to-earn » | CLAUDE.md §5.8 (zone grise CEMAC) | Ferme toute une famille de modèles |
| Aucune publicité tierce dans les écrans de rencontre | CLAUDE.md §5.9 | Ferme le modèle publicitaire classique |
| Parcours cœur gratuit, **tout ce qui relève de la sécurité compris** ; pas de reconduction tacite ; prix et durée affichés avant l'engagement | `audit/00-benchmark.md`, C21, niveau 2 | Le paywall ne peut porter que sur du confort |
| Cloisonnement par origine : aucun prix en FCFA ni lien de paiement externe atteignable depuis Telegram | CLAUDE.md §10.2 | Double interface, double grille |

**La recette dominante du marché est donc fermée.** Verrouiller « qui t'a aimé » derrière un
paywall est la principale source de revenu des concurrents ; c'est aussi le seul signal qui
protège d'un vivier vide, et le benchmark le note déjà **0 sur 2** en C21.

---

## 3. Ce que le code peut facturer aujourd'hui

C'est la partie que personne n'avait encore posée noir sur blanc.

| Ligne prévue (CLAUDE.md §5.9) | Facturable aujourd'hui ? |
|---|---|
| Pass premium en Stars (Telegram) | **Non** — aucune route de paiement n'existe. À écrire. |
| Pass premium en mobile money (web) | **Non** — la version web n'existe pas (P0-6, non commencé). |
| Lieux partenaires payés **au rendez-vous confirmé** | **Non, et pas pour une raison de code manquant** |
| Fonctions sponsorisées | **Oui**, techniquement : rien à construire côté paiement |
| Services physiques en mobile money | **Oui** — hors app, donc hors règle Telegram |

### Pourquoi le B2B au rendez-vous confirmé est bloqué

Le code d'un lieu partenaire est une empreinte HMAC — imprévisible, mais **fixe**
(`server/lieux.js`, dette technique n° 4). Il prouve « j'ai vu ce QR », jamais « j'y suis en
ce moment ». Qui l'a scanné une fois peut le réutiliser des mois plus tard depuis chez lui.

**On ne peut donc pas facturer un café au rendez-vous confirmé** : la facture reposerait sur
un chiffre qu'un membre peut gonfler depuis son lit. `npm run chiffres` l'écrit déjà à côté
de la métrique phare — « borne haute, pas une preuve ».

Le débloquer demande **un code tournant affiché par le lieu** (P1-10) ou un horodatage réel
sur le rendez-vous (`slot` est du texte libre aujourd'hui, « Samedi, 11 h » — aucune fenêtre
horaire n'en est calculable). C'est la dépendance technique n° 1 de tout le modèle B2B.

---

## 4. Ce que ça coûte vraiment

Deux coûts, d'ordres de grandeur très différents.

**Le serveur ne coûte presque rien.** Une machine `shared-cpu-1x` de 256 Mo et une base
PostgreSQL non gérée sur Fly (`fly.toml:76-77`). De l'ordre de quelques dollars par mois —
*à vérifier sur la facture réelle, ce chiffre n'est pas mesuré ici*.

**La modération coûte tout.** Un humain regarde **chaque** selfie, **chaque** photo (jusqu'à
trois par profil) et **écoute chaque présentation vocale**. À 1 000 membres, c'est de l'ordre
de 4 000 actes de modération. Ce coût est du **travail**, il croît avec les inscriptions, et
c'est lui qui a imposé le passage en `VERIFICATION_POLICY = "badge"` le 15 septembre.

> **Conséquence directe** : le premier poste que le revenu doit financer n'est pas
> l'hébergement, c'est **la modération**. Et un modèle qui croît avec les *inscriptions*
> (le pass) finance mal un coût qui croît avec les *inscriptions* aussi. Un modèle qui croît
> avec les *rendez-vous* (le B2B) le finance bien mieux — d'où l'importance du point 3.

**Le seuil d'équilibre de l'infrastructure est de l'ordre d'une poignée de membres payants,
pas de milliers.** C'est la bonne nouvelle de ce document : Odo n'a pas besoin d'un gros
modèle, il a besoin d'un petit modèle qui ne trahit pas sa promesse.

---

## 5. Le modèle proposé : trois lignes, dans cet ordre

### Ligne 1 — Lieux partenaires (B2B) · *la seule qui aligne revenu et coût*

Un café gagne deux consommations à une heure connue. C'est la valeur la plus réelle du
produit, et elle ne vient pas de la poche du membre.

- **Phase A — gratuit.** Les premiers lieux entrent sans payer, avec un accord signé. On leur
  apporte du passage, ils nous apportent la confirmation d'arrivée. Personne ne facture un
  chiffre qu'il ne peut pas défendre.
- **Phase B — forfait mensuel de présence**, une fois qu'on peut *montrer* le passage. On
  vend une présence vérifiable (être dans la liste, afficher son avantage), pas une métrique
  falsifiable.
- **Phase C — au rendez-vous confirmé**, seulement après le **code tournant** (P1-10).

### Ligne 2 — Pass de confort pour les membres · *après la phrase du §1*

Ce qui reste **gratuit, sans exception** : la vérification, le badge, « qui t'a aimé », les
messages, le signalement, le blocage, la personne de confiance, le rendez-vous.

Ce qui peut se vendre :

| Avantage | Pourquoi c'est acceptable |
|---|---|
| **Zone élargie** (plusieurs villes, tout le pays) | Pur confort, ne retire rien à personne — et dans un vivier mince, c'est l'avantage le plus réel |
| **Filtres fins** (langues, tranches précises) | Confort de tri |
| **Présentation vocale de 30 s** au lieu de 15 | Confort — mais coûte du temps de modération, à arbitrer |

**Ce qu'il ne faut pas vendre, même si c'est tentant** : le quota de « J'aime ». Il est
aujourd'hui un **levier de sécurité** (5 sans badge, 20 avec) qui ralentit un faux compte
avant qu'un humain l'ait vu. Le vendre convertirait une barrière de sécurité en levier de
revenu — c'est précisément ce que C21 note **0**.

### Ligne 3 — Services physiques · *la plus sous-explorée*

Hors mini app, donc **hors règle Telegram** : payable en mobile money sans contorsion. Une
soirée organisée, un « premier rendez-vous » monté avec un lieu partenaire. C'est la ligne
qui colle le mieux à l'économie locale et celle qui demande le moins de code.

---

## 6. Grille de prix : une hypothèse, jamais un objectif

> **Le benchmark est formel** : *aucun repère de consentement à payer pour une app de
> rencontres au Cameroun n'a été trouvé* (`audit/00-benchmark.md`, C21). Toute grille est une
> hypothèse à tester, et la première version sera probablement fausse.

**Ancrer sur la data, pas sur les abonnements occidentaux.** Au Cameroun, 500 FCFA achètent
de l'ordre de 500 à 750 Mo (benchmark, indicatif). Le SMIG est relayé à 60 000 FCFA par mois.
Un abonnement à 5 000 FCFA, c'est 8 % du SMIG — inenvisageable. Le bon ordre de grandeur est
**celui d'une recharge data**.

| Pass | Hypothèse Cameroun | Part du SMIG | Parité Stars |
|---|---|---|---|
| 7 jours | 500 FCFA | 0,8 % | à calculer |
| 30 jours | 1 500 FCFA | 2,5 % | à calculer |

La parité Stars ne peut pas être fixée ici : **la valeur d'une Star n'est pas vérifiée dans
le dépôt** (benchmark, liste des sources non revérifiées). À établir au moment de la grille.

**La Belgique change le tableau.** Cette instance sert aussi Bruxelles depuis le 14 septembre
(`MATCH_POLICY = "open"`). Le pouvoir d'achat n'a rien à voir, et une grille unique servirait
mal les deux. Une grille par pays est possible côté web ; en Stars, Telegram fixe une devise
unique. **À trancher avant d'écrire quoi que ce soit.**

---

## 7. Ce qu'on refuse, et pourquoi

- **Le paywall sur « qui t'a aimé »** — la recette du marché. Rend payant le seul signal qui
  protège d'un vivier vide, et contredit la promesse. C21 = 0.
- **La publicité tierce dans les écrans de rencontre** — CLAUDE.md §5.9.
- **Les boosts de visibilité** — jeu à somme nulle : ce qu'un payeur gagne, un autre membre
  le perd dans son paquet. Dégrade le produit pour ceux qui ne paient pas.
- **Crypto, jetons, tap-to-earn** — CLAUDE.md §5.8.
- **La reconduction tacite** — C21 l'exclut, et c'est aussi ce qui fait les mauvaises
  réputations sur un marché où l'on compte chaque franc.

---

## 8. Dépendances techniques, dans l'ordre

1. **Trancher la phrase du §1.** Zéro ligne de code. Bloque tout le reste.
2. **Code tournant des lieux** (P1-10) — ouvre la ligne 1 phase C.
3. **`slot` en horodatage réel** plutôt qu'en texte libre — sans quoi aucune fenêtre horaire
   n'est calculable, ni pour le check-in, ni pour la facturation.
4. **P0-6 (version web + mobile money)** — gros chantier, à ne lancer que quand une hypothèse
   de prix aura été testée sur de vraies personnes.
5. **`/paysupport` et procédure de remboursement écrite** — exigés par Telegram dès la
   première Star vendue.

---

## 9. Ce que ce document ne sait pas

- **Le consentement à payer**, au Cameroun comme en Belgique. Aucune donnée. À mesurer par un
  sondage aux premiers membres, pas par une grille décrétée.
- **Le coût réel de l'hébergement** : lire la facture Fly.
- **La valeur d'une Star** en FCFA, et si Telegram autorise une grille par pays.
- **Le temps de modération par acte** : personne ne l'a chronométré. C'est pourtant le coût
  qui décide de tout le reste.
- **Rien de tout ceci ne vaut à 1 compte réel.** Le modèle se teste à partir de quelques
  dizaines de membres actifs, pas avant.
