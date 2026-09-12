// Compression HTTP : les fichiers du navigateur sont compressés une fois au démarrage,
// les réponses de l'API à la volée au-delà d'un seuil, et jamais en dessous.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const { precompresser, compresserJson, accepteGzip, seuilOctets } = await import('../server/compression.js');

const faussesReponses = () => {
  const res = { entetes: {}, corps: null, type_: null };
  res.type = (t) => { res.type_ = t; return res; };
  res.set = (k, v) => { if (typeof k === 'object') Object.assign(res.entetes, k); else res.entetes[k] = v; return res; };
  res.send = (c) => { res.corps = c; return res; };
  res.json = (c) => { res.corps = c; res.jsonAppele = true; return res; };
  return res;
};
const requete = (gzip) => ({ headers: gzip ? { 'accept-encoding': 'gzip, deflate' } : {} });

test('accepteGzip lit l\'en-tête du navigateur', () => {
  assert.equal(accepteGzip(requete(true)), true);
  assert.equal(accepteGzip(requete(false)), false);
  assert.equal(accepteGzip({ headers: { 'accept-encoding': 'br' } }), false);
});

test('un fichier est servi compressé, et identique une fois décompressé', () => {
  const source = 'body { color: red; }\n'.repeat(200);
  const envoyer = precompresser(source, 'css', 'public, max-age=31536000, immutable');

  const avec = faussesReponses();
  envoyer(requete(true), avec);
  assert.equal(avec.entetes['Content-Encoding'], 'gzip');
  assert.equal(avec.entetes.Vary, 'Accept-Encoding');
  assert.ok(avec.corps.length < Buffer.byteLength(source), 'la version compressée est plus petite');
  assert.equal(zlib.gunzipSync(avec.corps).toString(), source, 'le contenu est intact');
});

test('un navigateur qui ne demande pas gzip reçoit l\'original', () => {
  const source = 'x'.repeat(5000);
  const envoyer = precompresser(source, 'js', 'no-cache');
  const sans = faussesReponses();
  envoyer(requete(false), sans);
  assert.equal(sans.entetes['Content-Encoding'], undefined);
  assert.equal(sans.corps.toString(), source);
});

test('une réponse JSON volumineuse est compressée', () => {
  const res = faussesReponses();
  compresserJson(requete(true), res, () => {});
  const gros = { profiles: Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: 'Nadia', area: 'Bastos' })) };
  res.json(gros);
  assert.equal(res.entetes['Content-Encoding'], 'gzip');
  assert.deepEqual(JSON.parse(zlib.gunzipSync(res.corps).toString()), gros);
});

test('une petite réponse JSON part telle quelle', () => {
  const res = faussesReponses();
  compresserJson(requete(true), res, () => {});
  const petit = { unread: 0, newMatches: 0, likes: 3 };
  assert.ok(Buffer.byteLength(JSON.stringify(petit)) < seuilOctets);
  res.json(petit);
  assert.equal(res.jsonAppele, true, 'la réponse suit le chemin normal');
  assert.equal(res.entetes['Content-Encoding'], undefined);
});
