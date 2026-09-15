# « Qui s'est arrêté sur ta fiche »

Conception, à la demande du propriétaire (15 septembre 2026), pour que la fonction rejoigne
Odo Plus. **Rien n'est implémenté** : cette fonction crée un usage nouveau de données
personnelles, donc elle attend l'accord explicite du propriétaire (CLAUDE.md §6.1).

---

## 1. La bonne nouvelle : la donnée existe déjà

La table `swipes` enregistre depuis toujours `{ from, to, action, at }` — **chaque fois que
quelqu'un voit une fiche et décide**, qu'il aime ou qu'il passe. `store.swipesTo(userId)` la
lit déjà, c'est ce qui alimente « qui t'a aimé ».

**Aucune nouvelle table, aucune nouvelle collecte.** C'est ce qui rend la fonction acceptable
au regard de la règle 5.4 (donnée minimale) : on ne collecte rien de plus, on **montre**
autrement ce qui est déjà là.

Conséquence sur le nom : ce n'est pas « qui a vu ta fiche » mais **« qui s'est arrêté sur ta
fiche »** — quelqu'un qui fait défiler sans décider n'y est pas. C'est moins de volume, et
c'est plus honnête : ceux qui y sont se sont vraiment arrêtés.

---

## 2. Ce que ça change pour qui

| | Gratuit | Odo Plus |
|---|---|---|
| Nombre de personnes arrêtées sur ta fiche | rien | **arrondi** : « une douzaine cette semaine » |
| Qui | rien | **les 5 dernières fiches** |
| Ce qu'elles ont décidé | — | **jamais montré** |

---

## 3. Trois décisions de conception, et pourquoi

### L'issue n'est jamais montrée

Un « passer » est une décision privée. Afficher « X a vu ta fiche et est passé » serait cruel
sans rien apporter. La liste ne dit que « s'est arrêté ».

### Arrondi et partiel, pas exhaustif

C'est le point le moins évident, et c'est celui qui protège les membres.

Odo Plus voit **aussi** « qui t'a aimé ». Si la liste des personnes arrêtées était exhaustive,
il suffirait de la comparer à celle des likes pour obtenir **la liste de ceux qui ont refusé**.
Le produit fabriquerait une machine à savoir qui ne veut pas de vous.

Un **compte arrondi** et **cinq fiches seulement** rendent cette soustraction impossible tout
en gardant la fonction utile : on sait qu'on intéresse, on voit quelques visages, on ne peut
rien déduire de personne.

### Un réglage pour ne pas y apparaître — gratuit, et symétrique

La Belgique est servie depuis le 14 septembre : le RGPD s'applique, et il donne un droit
d'opposition. Montrer à A que B s'est arrêté sur sa fiche, c'est traiter le comportement de B
et le divulguer à un tiers. Il faut donc pouvoir s'y soustraire — **et ça ne peut pas être
payant** : on ne vend pas le droit de ne pas être surveillé.

Le réglage est donc **gratuit**, et **symétrique** : qui le coche n'apparaît chez personne, et
ne voit la liste chez lui non plus, même avec Plus. C'est la règle de LinkedIn, et c'est la
seule qui ne se retourne pas contre les membres.

---

## 4. Ce qu'il faut écrire

| Où | Quoi |
|---|---|
| `server/routes.js` | `GET /api/vues` — réservé à Plus, lit `store.swipesTo(me.id)`, exclut les comptes fermés, bloqués et opposés, arrondit, coupe à 5 |
| `server/routes.js` | `PUT /api/me/discretion` — le réglage d'opposition, gratuit |
| `public/app.js` | un écran, une ligne dans l'onglet Profil, l'interrupteur dans les réglages |
| `server/legal/confidentialite.html` | **obligatoire** : dire que la décision de s'arrêter sur une fiche est montrée, de façon arrondie, aux membres Plus de cette fiche, et comment s'y opposer |
| `server/store.*.js` | rien — `swipesTo` existe |
| `test/` | l'opposition rend invisible **et** aveugle ; l'issue ne sort jamais ; l'arrondi ne permet pas la soustraction ; un gratuit reçoit 403 |

**Rétention.** Les `swipes` ne sont jamais purgés aujourd'hui (audit 09, exploitation). La
fonction ne lira que les **30 derniers jours** : au-delà, « s'est arrêté il y a huit mois » ne
veut plus rien dire, et la donnée montrée doit être aussi courte que possible.

---

## 5. Ce que ça coûte à surveiller

- **`allUsers()` encore** : la liste croise les swipes reçus avec les profils publics. À faire
  sur `swipesTo` seul, jamais sur toute la table (dette technique n° 3).
- **Le froid** : savoir que douze personnes se sont arrêtées sans qu'aucune n'aime peut
  décourager plus que motiver. À regarder dans les chiffres après la bêta.
