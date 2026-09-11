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
