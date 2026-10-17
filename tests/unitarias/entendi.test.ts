import { describe, expect, it } from 'vitest';
import { heardText } from '../../src/core/speech';
import { demoTexts } from '../../src/preload/contract/demo-texts';

// Lo que muestra «Entendí: “…”» a partir de lo que devuelve Whisper: sin el punto final que
// agrega solo y con minúscula al empezar, salvo que la primera palabra vaya siempre en
// mayúscula (I, una sigla).

describe('lo que entendió la transcripción', () => {
  it('[CA-026] «Good morning.» se muestra como «Entendí: “good morning”»', () => {
    expect(heardText('Good morning.')).toBe('good morning');
    expect(demoTexts.lab.heard(heardText(' Good morning. '))).toBe('Entendí: “good morning”');
  });

  it('[CA-026] saca los signos del final y junta los espacios, pero deja los del medio', () => {
    expect(heardText('Hello,   world!')).toBe('hello, world');
    expect(heardText('Is it raining?')).toBe('is it raining');
    expect(heardText('good morning...')).toBe('good morning');
    expect(heardText('Wait… what?!')).toBe('wait… what');
  });

  it('[CA-026] respeta la mayúscula de «I» y de las siglas', () => {
    expect(heardText('I have been living in Buenos Aires for three years.')).toBe(
      'I have been living in Buenos Aires for three years',
    );
    expect(heardText("I'm fine, thanks.")).toBe("I'm fine, thanks");
    expect(heardText('BBC news.')).toBe('BBC news');
    expect(heardText('A cat.')).toBe('a cat');
  });

  it('[CA-026] las marcas que pone Whisper para lo que no es voz no cuentan como palabras', () => {
    expect(heardText('[BLANK_AUDIO]')).toBe('');
    expect(heardText(' [MUSIC] Good morning. ')).toBe('good morning');
    expect(heardText('(silence)')).toBe('');
    expect(heardText('Good morning. [ Silence ]')).toBe('good morning');
    expect(heardText('*coughs* Hello there.')).toBe('hello there');
  });

  it('[CA-026] sin palabras queda vacío', () => {
    expect(heardText('')).toBe('');
    expect(heardText('  . ')).toBe('');
  });
});
