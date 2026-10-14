import { z } from 'zod';
import sample from '../../../datos-de-ejemplo/elenco/tarjetas-minimas.json';
import type { CardsStore } from '../../data/cards';
import { cardsCreateRequest } from '../../preload/contract/cards';

// Las tres tarjetas de ejemplo de la Fase 03 (el elenco completo se arma en las fases
// siguientes). Se siembran una sola vez, cuando la base todavía no tiene ninguna tarjeta; la
// primera del archivo queda primera en la lista.
const sampleCards = z.array(cardsCreateRequest).length(3).parse(sample);

// Devuelve cuántas tarjetas sembró (cero si ya había alguna).
export function seedDemoCards(store: CardsStore): number {
  if (store.count() > 0) {
    return 0;
  }
  for (const card of [...sampleCards].reverse()) {
    store.create(card);
  }
  return sampleCards.length;
}
