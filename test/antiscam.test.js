import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMessage } from '../server/antiscam.js';

const blocked = (t, n = 20) => checkMessage(t, n, 10).code;

test('bloque les demandes d\'argent, même déguisées', () => {
  for (const t of ['Envoie-moi 5000 F par MoMo', 'fais un transfert OM stp', 'M.o.M.o urgent', 'j\'ai besoin de 10 000 fcfa', 'aide moi pour mon visa', 'paye en usdt']) {
    assert.equal(blocked(t), 'MONEY_BLOCKED', t);
  }
});

test('bloque numéros et liens au début de la discussion seulement', () => {
  assert.equal(blocked('mon numéro 6 77 12 34 56', 2), 'CONTACT_TOO_EARLY');
  assert.equal(blocked('ajoute moi sur whatsapp', 2), 'CONTACT_TOO_EARLY');
  assert.equal(blocked('https://exemple.com', 2), 'CONTACT_TOO_EARLY');
  assert.equal(checkMessage('mon numéro 677123456', 12, 10).ok, true);
});

test('laisse passer les messages normaux', () => {
  for (const t of ['Salut, ton ndolé a l\'air bon', 'On se voit samedi à 16 h ?', 'Tu es plutôt Bastos ou Essos ?']) {
    assert.equal(checkMessage(t, 0, 10).ok, true, t);
  }
});

// Corpus de non-régression. Il mesure la cohérence entre les règles et les phrases que j'ai
// écrites, pas le comportement de vrais utilisateurs : l'audit a montré que deux corpus écrits
// à la main donnaient des taux différents d'un facteur 2,8. Sa valeur est de figer chaque cas
// nommé, pour qu'aucun ne reparte en arrière. Il est à remplacer par les messages réellement
// signalés pendant la bêta.
const LEGITIMES = [
  'Salut, ça va ? Tu fais quoi ce weekend ?',
  'Je prends le taxi, ça me coûte 300 F pour venir',
  'Je fais un crédit pour ma moto, galère',
  'Les frais de scolarité sont chers cette année',
  "J'ai plus de crédit sur mon téléphone",
  'Mon oncle m a dépanné pour le déménagement',
  'Envoie-moi une photo de ton chien',
  'La carte du restaurant est bien',
  'Je viens en moto, 500 F depuis Essos',
  'Le concert coûte 2000 francs',
  'Ma sœur travaille à la douane',
  'On partage l addition, ça te va ?',
];
const ARNAQUES = [
  'Envoie moi 5000 F par MoMo stp',
  'Tu peux me dépanner un peu ?',
  'Envoie sur mon Orange Money',
  'Je te rembourse demain juré, envoie juste 10k',
  'Achete moi une carte de recharge',
  'Mon papa est malade il faut 50 mille',
  'paie juste la douane et je viens',
  'Small small helep me, even 2000 na ok',
  'envoie des unités sur ce numéro',
  'tu peux me prêter 20 mille ?',
  'verse sur mon compte, je te donne le RIB',
  'il me manque 15k pour le transport',
  'recharge moi 1000 F',
];

test('parler d\'argent reste possible : aucun de ces messages n\'est bloqué', () => {
  for (const m of LEGITIMES) assert.equal(checkMessage(m, 20, 10).ok, true, m);
});

test('en demander ne l\'est pas : chacun de ces messages est bloqué', () => {
  for (const m of ARNAQUES) assert.equal(checkMessage(m, 20, 10).code, 'MONEY_BLOCKED', m);
});

test('le message de blocage nomme ce qui l\'a déclenché', () => {
  const r = checkMessage('Envoie moi 5000 F par MoMo', 20, 10);
  assert.equal(r.categorie, 'moyen de paiement');
  assert.match(r.message, /moyen de paiement/);
  assert.ok(!r.message.includes('!'), 'aucun point d\'exclamation dans les messages système');
});
