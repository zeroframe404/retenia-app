import { z } from 'zod';
import sample from '../../../datos-de-ejemplo/elenco/tarjetas-minimas.json';
import type { CardsStore } from '../../data/cards';
import { cardsCreateRequest } from '../../preload/contract/cards';

// Las tres tarjetas de ejemplo de la Fase 03 (el elenco completo se arma en las fases
// siguientes). Se siembran una sola vez, cuando la base todavía no tiene ninguna tarjeta; la
// primera del archivo queda primera en la lista. Nada se ejecuta al cargar el módulo: así, en
// la versión real, el empaquetador descarta este archivo y el JSON de ejemplo con él.
// Devuelve cuántas tarjetas sembró (cero si ya había alguna).
export function seedDemoCards(store: CardsStore): number {
  if (store.count() > 0) {
    return 0;
  }
  const cards = z.array(cardsCreateRequest).length(3).parse(sample);
  for (const card of [...cards].reverse()) {
    store.create(card);
  }
  return cards.length;
}
