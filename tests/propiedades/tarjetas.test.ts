import fc from 'fast-check';
import { afterAll, describe, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { cardsCreateRequest } from '../../src/preload/contract/cards';
import { tempDataFolder } from '../apoyo/base';

const SEED = 20270315;
const data = tempDataFolder();
const db = openDatabase(data.file);
const store = createCardsStore(db, demoClock());
afterAll(() => {
  db.close();
  data.remove();
});

// Texto como lo escribe o pega una persona: letras de cualquier idioma, emoji, saltos de línea,
// espacios raros, caracteres de control. Los surrogados sueltos no son texto válido (un
// teclado o un portapapeles no los producen) y no entran.
const text = fc
  .string({ unit: 'grapheme', minLength: 1, maxLength: 400 })
  .filter((value) => value.trim() !== '');

describe('tarjetas: cualquier texto se guarda y se lee igual', () => {
  it('lo que se guarda es lo que se escribió, sin los espacios de los bordes', () => {
    fc.assert(
      fc.property(text, text, (question, answer) => {
        const request = cardsCreateRequest.parse({ question, answer });
        const created = store.create(request);
        const [first] = store.list();
        return (
          first?.id === created.id &&
          first.question === question.trim() &&
          first.answer === answer.trim() &&
          created.question === first.question
        );
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('una pregunta que es solo espacios, saltos o tabulaciones nunca se acepta', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r', ' ', ' ', '　'), {
          minLength: 0,
          maxLength: 30,
        }),
        (spaces) =>
          !cardsCreateRequest.safeParse({ question: spaces.join(''), answer: 'x' }).success,
      ),
      { seed: SEED, numRuns: 200 },
    );
  });
});
