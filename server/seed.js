// Profils fictifs, marqués « démo », pour tester le parcours complet avec un seul téléphone.
// Désactiver avec SEED_DEMO=false avant toute ouverture à de vrais utilisateurs.
import { store } from './store.js';

const DEMO = [
  { id: 'demo-carine', firstName: 'Carine', age: 24, gender: 'femme', intent: 'serieux', city: 'Yaoundé', area: 'Bastos', promptQ: 'Mon plat du dimanche', promptA: 'Le ndolé plantain de ma tante', languages: 'Français, ewondo', trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-junior', firstName: 'Junior', age: 28, gender: 'homme', intent: 'serieux', city: 'Yaoundé', area: 'Mimboman', promptQ: 'Mon week-end idéal', promptA: 'Match des Lions le samedi, église le dimanche', languages: 'Français, bassa', trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-brice', firstName: 'Brice', age: 27, gender: 'homme', intent: 'amitie', city: 'Yaoundé', area: 'Ngoa-Ekellé', promptQ: 'Mon coin préféré', promptA: 'Le marché Mfoundi le samedi matin', languages: 'Français, anglais', trust: { selfie: true, guarantor: false, seniority: true } },
  { id: 'demo-nadege', firstName: 'Nadège', age: 22, gender: 'femme', intent: 'amitie', city: 'Yaoundé', area: 'Essos', promptQ: 'Je supporte', promptA: 'Les Lionnes indomptables, sans discuter', languages: 'Français, pidgin', trust: { selfie: true, guarantor: true, seniority: false } },
  { id: 'demo-mireille', firstName: 'Mireille', age: 25, gender: 'femme', intent: 'duo', city: 'Yaoundé', area: 'Biyem-Assi', promptQ: 'Avec ma meilleure amie, on cherche', promptA: 'Un duo sympa pour un karaoké', languages: 'Français', trust: { selfie: true, guarantor: true, seniority: true } },
  { id: 'demo-stephane', firstName: 'Stéphane', age: 26, gender: 'homme', intent: 'duo', city: 'Yaoundé', area: 'Omnisport', promptQ: 'Avec mon pote, on propose', promptA: 'Un après-midi à Mefou, puis poulet DG', languages: 'Français, anglais', trust: { selfie: true, guarantor: false, seniority: true } },
];

export const DEMO_REPLIES = [
  'Avec plaisir. Tu es plutôt café en terrasse ou marché le samedi ?',
  "Haha, j'aime bien ta question. Dis-m'en plus sur toi.",
];

export function seedDemo() {
  for (const d of DEMO) {
    const u = store.upsertTelegramUser({ id: d.id, first_name: d.firstName });
    store.updateUser(u.id, {
      demo: true,
      verification: 'approved',
      profile: {
        name: d.firstName, age: d.age, gender: d.gender, intent: d.intent, city: d.city, area: d.area,
        promptQ: d.promptQ, promptA: d.promptA, languages: d.languages, hasPhoto: false, trust: d.trust,
      },
    });
  }
  console.log(`Profils de démonstration chargés : ${DEMO.length}`);
}
