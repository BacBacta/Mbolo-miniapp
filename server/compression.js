import zlib from 'node:zlib';

// Compression HTTP, sans dépendance. Deux besoins distincts :
//
// 1. Les fichiers du navigateur (app.js, styles.css, tg.js, ui.js) sont connus au démarrage et ne
//    changent jamais en cours d'exécution : on les compresse une fois, au niveau maximal, et on
//    sert le résultat tel quel. Coût par requête : zéro.
// 2. Les réponses de l'API changent à chaque appel : on les compresse à la volée, seulement
//    au-dessus d'un seuil, sinon l'en-tête coûte plus cher que ce qu'il économise.
//
// Le seuil de 1 024 octets est le réglage habituel : en dessous, gzip fait souvent grossir la
// réponse, et un paquet réseau en transporte déjà autant.
const SEUIL_OCTETS = 1024;
const NIVEAU_FICHIERS = zlib.constants.Z_BEST_COMPRESSION;

export const accepteGzip = (req) => /\bgzip\b/.test(req.headers['accept-encoding'] || '');

// Compresse une fois pour toutes et renvoie une fonction d'envoi. Si la version compressée n'est
// pas plus petite (cas rare, fichier minuscule), on renvoie l'original sans en-tête.
export function precompresser(contenu, type, cacheControl) {
  const brut = Buffer.from(contenu);
  const gz = zlib.gzipSync(brut, { level: NIVEAU_FICHIERS });
  const gagne = gz.length < brut.length;
  return (req, res) => {
    res.type(type).set('Cache-Control', cacheControl).set('Vary', 'Accept-Encoding');
    if (gagne && accepteGzip(req)) return res.set('Content-Encoding', 'gzip').send(gz);
    res.send(brut);
  };
}

// Compresse les réponses JSON au-delà du seuil. Appliqué au routeur de l'API uniquement :
// les erreurs, les redirections et les images ne passent pas par res.json.
export function compresserJson(req, res, next) {
  const json = res.json.bind(res);
  res.json = (corps) => {
    const texte = JSON.stringify(corps);
    if (!accepteGzip(req) || Buffer.byteLength(texte) < SEUIL_OCTETS) return json(corps);
    const gz = zlib.gzipSync(texte);
    return res
      .type('application/json')
      .set('Content-Encoding', 'gzip')
      .set('Vary', 'Accept-Encoding')
      .send(gz);
  };
  next();
}

export const seuilOctets = SEUIL_OCTETS;
