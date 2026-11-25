import type { SamplePolicy } from './plan';

export const firstOrderSamplePolicy: SamplePolicy = {
  unitPriceCents: 1,
  preRollCap: 5,
  preRollBrands: ['Ichi Roll', 'Juan Roll', 'Sushi Hash', 'State of Mind', 'O-yeah', 'Smack', 'Chopsticks'],
  brandAliases: {
    'O-yeah': ['Oh Yeah'],
    Smack: ['Smack Bag'],
    'Nom Nom': ['Nom Nom Edible Co', 'Nom Noms'],
    Champs: ['Champs Cannabis'],
  },
  exclusions: ['Champs'],
  gummyBrand: 'Nom Nom',
  gummyGroups: [
    { label: 'rosin', terms: ['rosin'] },
    { label: 'mood-based', terms: ['mood', 'balance', 'sleep', 'energy'] },
  ],
};
