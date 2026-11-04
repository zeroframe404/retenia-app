// Los errores de las tarjetas de la Fase 08, con su mensaje en castellano.

export class MeaningQuestionRequiredError extends Error {
  constructor() {
    super('Falta responder si cambió lo que hay que recordar');
    this.name = 'MeaningQuestionRequiredError';
  }
}

export class LinkedCardTextError extends Error {
  constructor() {
    super('El texto de esta tarjeta se edita en su renglón de la nota');
    this.name = 'LinkedCardTextError';
  }
}

export class InverseNotAllowedError extends Error {
  constructor() {
    super('Una tarjeta de completar no tiene inversa');
    this.name = 'InverseNotAllowedError';
  }
}

export class CardPausedError extends Error {
  constructor() {
    super('La tarjeta está en pausa: reanudala para repasarla');
    this.name = 'CardPausedError';
  }
}

// «Deshacer» un repaso que no existe o que es de otra tarjeta (Fase 09).
export class ReviewNotFoundError extends Error {
  constructor() {
    super('No encontré ese repaso de esta tarjeta para deshacerlo');
    this.name = 'ReviewNotFoundError';
  }
}

export class SheetStateNotAllowedError extends Error {
  constructor() {
    super('Ese estado no se puede elegir a mano');
    this.name = 'SheetStateNotAllowedError';
  }
}
