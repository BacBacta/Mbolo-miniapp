// Profils fictifs, marqués « démo », pour tester le parcours complet avec un seul téléphone.
// Désactiver avec SEED_DEMO=false avant toute ouverture à de vrais utilisateurs.
//
// La population couvre chaque combinaison genre × intention à Yaoundé, pour que le paquet ne soit
// jamais vide quel que soit ton propre profil, plus Douala. Les âges vont de 19 à 30 ans pour
// tester les filtres, les photos vont de zéro à trois pour tester l'affichage et le changement
// de photo, et quelques profils ne rendent pas les « J'aime » pour tester l'attente.
// Voir le README, section « Profils de démonstration », pour savoir qui sert à quoi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { config } from './config.js';
import { cleVille } from './geo.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
// Images abstraites (dégradé et initiale), sans visage : personne n'est représenté.
export const DEMO_PHOTOS_DIR = path.join(ICI, 'demo-photos');

export const DEMO = [
  // ---- Yaoundé, relation sérieuse ----
  { id: 'demo-carine', firstName: 'Carine', age: 24, gender: 'femme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Bastos', promptQ: 'coin', promptA: 'Le marché du Mfoundi, tôt le matin', languages: 'Français, ewondo', photos: 3, trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-laure', firstName: 'Laure', age: 21, gender: 'femme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Mvan', promptQ: 'rire', promptA: 'Mes cousins quand ils imitent notre grand-mère', languages: 'Français', photos: 1, trust: { selfie: true, guarantor: false, seniority: false } },
  { id: 'demo-sandrine', firstName: 'Sandrine', age: 29, gender: 'femme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Nlongkak', promptQ: 'weekend', promptA: 'Un brunch, puis la messe de 18 h', languages: 'Français, anglais', photos: 2, likeBack: false, trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-estelle', firstName: 'Estelle', age: 19, gender: 'femme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Mendong', promptQ: 'supporte', promptA: 'Canon de Yaoundé, depuis toujours', languages: 'Français, pidgin', photos: 0, trust: { selfie: true, guarantor: false, seniority: false } },
  { id: 'demo-junior', firstName: 'Junior', age: 28, gender: 'homme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Mimboman', promptQ: 'weekend', promptA: 'Match des Lions le samedi, église le dimanche', languages: 'Français, bassa', photos: 2, trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-landry', firstName: 'Landry', age: 23, gender: 'homme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Bastos', promptQ: 'coin', promptA: 'La terrasse du lac, en fin de journée', languages: 'Français, anglais', photos: 1, trust: { selfie: true, guarantor: true, seniority: false } },
  { id: 'demo-armand', firstName: 'Armand', age: 30, gender: 'homme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Ekounou', promptQ: 'rire', promptA: 'Les sketchs de Moustik, encore aujourd’hui', languages: 'Français', photos: 0, likeBack: false, trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-thierry', firstName: 'Thierry', age: 26, gender: 'homme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Efoulan', promptQ: 'chanson', promptA: 'Tout Petit Pays, en boucle', languages: 'Français, bamiléké', photos: 1, trust: { selfie: true, guarantor: true, seniority: false } },
  { id: 'demo-kevin', firstName: 'Kevin', age: 22, gender: 'homme', intent: 'serieux', country: 'CM', city: 'Yaoundé', area: 'Nkolbisson', promptQ: 'supporte', promptA: 'Le PSG, et je l\u2019assume', languages: 'Français, anglais', photos: 2, trust: { selfie: true, guarantor: false, seniority: false } },

  // ---- Yaoundé, amitié ----
  { id: 'demo-brice', firstName: 'Brice', age: 27, gender: 'homme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Ngoa-Ekellé', promptQ: 'coin', promptA: 'Le marché Mfoundi le samedi matin', languages: 'Français, anglais', photos: 1, trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-nadege', firstName: 'Nadège', age: 22, gender: 'femme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Essos', promptQ: 'supporte', promptA: 'Les Lionnes indomptables, sans discuter', languages: 'Français, pidgin', photos: 2, trust: { selfie: true, guarantor: true, seniority: false } },
  { id: 'demo-aicha', firstName: 'Aïcha', age: 26, gender: 'femme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Bastos', promptQ: 'weekend', promptA: 'Un tour au marché, puis rien du tout', languages: 'Français, fulfulde', photos: 3, trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-yannick', firstName: 'Yannick', age: 25, gender: 'homme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Biyem-Assi', promptQ: 'weekend', promptA: 'Un tournoi de foot entre quartiers', languages: 'Français', photos: 0, likeBack: false, trust: { selfie: true, guarantor: false, seniority: false } },
  { id: 'demo-serge', firstName: 'Serge', age: 20, gender: 'homme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Mvog-Ada', promptQ: 'rire', promptA: 'Les commentaires des vendeuses au marché', languages: 'Français, ewondo', photos: 1, trust: { selfie: true, guarantor: false, seniority: false } },

  // ---- Yaoundé, amitié (ces trois profils illustraient la sortie en duo, retirée en P1-7) ----
  { id: 'demo-mireille', firstName: 'Mireille', age: 25, gender: 'femme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Biyem-Assi', promptQ: 'weekend', promptA: 'Un karaoké à quatre, avec ma meilleure amie', languages: 'Français', photos: 1, trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-stephane', firstName: 'Stéphane', age: 26, gender: 'homme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Omnisport', promptQ: 'coin', promptA: 'Le parc de la Mefou, puis un poulet DG avec mon pote', languages: 'Français, anglais', photos: 1, trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-patricia', firstName: 'Patricia', age: 23, gender: 'femme', intent: 'amitie', country: 'CM', city: 'Yaoundé', area: 'Nsimeyong', promptQ: 'weekend', promptA: 'Les soirées jeux de société, avec ma sœur', languages: 'Français, anglais', photos: 2, trust: { selfie: true, guarantor: false, seniority: false } },

  // ---- Douala ----
  { id: 'demo-ulrich', firstName: 'Ulrich', age: 27, gender: 'homme', intent: 'serieux', country: 'CM', city: 'Douala', area: 'Bonapriso', promptQ: 'coin', promptA: 'Le front de mer, à Bonanjo', languages: 'Français, duala', photos: 1, trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-chantal', firstName: 'Chantal', age: 24, gender: 'femme', intent: 'serieux', country: 'CM', city: 'Douala', area: 'Akwa', promptQ: 'coin', promptA: 'La rue de la Joie, quand ça sent le braisé', languages: 'Français, anglais', photos: 2, trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-franck', firstName: 'Franck', age: 22, gender: 'homme', intent: 'amitie', country: 'CM', city: 'Douala', area: 'Deido', promptQ: 'supporte', promptA: 'Union de Douala, même dans les mauvaises années', languages: 'Français, pidgin', photos: 1, trust: { selfie: true, guarantor: false, seniority: false } },
];

// Réponses automatiques, dans l'ordre. La dernière laisse la balle dans ton camp.
export const DEMO_REPLIES = [
  'Avec plaisir. Tu es plutôt café en terrasse ou marché le samedi ?',
  "Haha, j'aime bien ta question. Dis-m'en plus sur toi.",
  'Moi je suis du quartier depuis toujours, et toi tu es arrivé quand ?',
  'On pourrait se voir dans un des lieux partenaires, tu connais Le Palmier ?',
  'Propose-moi un jour et une heure, je regarde mon emploi du temps.',
];

// Combien de profils de démonstration aiment chaque vraie personne vérifiée, pour que
// « Ont aimé ton profil » et le tri « ceux qui t'ont liké d'abord » aient quelque chose à montrer.
const LIKES_DEMO_PAR_PERSONNE = 2;

// Copie les images de démonstration dans le dossier des photos et les marque validées.
async function poserPhotos(id, nombre) {
  for (let n = 1; n <= 3; n++) {
    const source = path.join(DEMO_PHOTOS_DIR, `${id}-${n}.jpg`);
    const cible = path.join(config.uploadsDir, `${id}-photo-${n}.jpg`);
    if (n <= nombre && fs.existsSync(source)) {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
      fs.copyFileSync(source, cible);
      await store.setPhoto(id, n, 'approved');
    } else {
      await store.removePhoto(id, n);
    }
  }
}

// Même règle de compatibilité que la découverte : même ville, même intention, et pour
// « relation sérieuse » l'autre genre. Dupliquée ici pour ne pas importer les routes.
function compatibleDemo(me, d) {
  if ((me.profile.country || config.defaultCountry) !== d.country || me.profile.cityKey !== cleVille(d.city) || me.profile.intent !== d.intent) return false;
  if (d.intent === 'serieux' && config.matchPolicy === 'romance_opposite') return me.profile.gender !== d.gender;
  return true;
}

export async function seedDemo() {
  for (const d of DEMO) {
    const u = await store.upsertTelegramUser({ id: d.id, first_name: d.firstName });
    await store.updateUser(u.id, {
      demo: true,
      // Ne rend pas les « J'aime » : sert à tester un like resté sans réponse
      demoLikeBack: d.likeBack !== false,
      verification: 'approved',
      profile: {
        name: d.firstName, age: d.age, gender: d.gender, intent: d.intent,
        country: d.country, city: d.city, cityKey: cleVille(d.city), area: d.area,
        promptQ: d.promptQ, promptA: d.promptA, languages: d.languages, hasPhoto: false, trust: d.trust,
      },
    });
    await poserPhotos(d.id, d.photos);
  }

  // Chaque vraie personne vérifiée reçoit quelques likes de démonstration, sans notification :
  // au redémarrage, ce serait du bruit. Rien n'est refait si la personne a déjà tranché.
  for (const me of await store.allUsers()) {
    if (me.demo || me.verification !== 'approved' || !me.profile) continue;
    // Deux requêtes par personne plutôt qu'une par profil de démonstration.
    const recus = new Set((await store.swipesTo(me.id)).map((s) => s.from));
    const envoyes = new Set((await store.swipesFrom(me.id)).map((s) => s.to));
    let aDonner = LIKES_DEMO_PAR_PERSONNE - DEMO.filter((d) => recus.has(d.id)).length;
    for (const d of DEMO) {
      if (aDonner <= 0) break;
      if (!compatibleDemo(me, d) || d.likeBack === false || recus.has(d.id) || envoyes.has(d.id)) continue;
      await store.addSwipe(d.id, me.id, 'like');
      recus.add(d.id);
      aDonner -= 1;
    }
  }
  console.log(`Profils de démonstration chargés : ${DEMO.length}`);
}
