import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateInitData } from '../server/auth.js';

const TOKEN = '123456:TEST_TOKEN';

// Reproduit la signature que Telegram calcule pour initData
function sign(fields, token = TOKEN) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Aline', language_code: 'fr' });
const now = () => String(Math.floor(Date.now() / 1000));

test('accepte des données signées valides', () => {
  const r = validateInitData(sign({ auth_date: now(), query_id: 'AAA', user }), TOKEN);
  assert.equal(r.ok, true);
  assert.equal(r.user.id, 42);
});

test('accepte le format avec champ signature', () => {
  const r = validateInitData(sign({ auth_date: now(), signature: 'xyz', user }), TOKEN);
  assert.equal(r.ok, true);
});

test('refuse une donnée modifiée', () => {
  const data = sign({ auth_date: now(), user }).replace('Aline', 'Pirate');
  assert.equal(validateInitData(data, TOKEN).reason, 'bad_signature');
});

test('refuse un autre jeton de bot', () => {
  assert.equal(validateInitData(sign({ auth_date: now(), user }), '999:OTHER').ok, false);
});

test('refuse des données expirées', () => {
  const old = String(Math.floor(Date.now() / 1000) - 3 * 24 * 3600);
  assert.equal(validateInitData(sign({ auth_date: old, user }), TOKEN).reason, 'expired');
});
