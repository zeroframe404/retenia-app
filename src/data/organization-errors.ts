// Los errores de la organización (Fase 07), con su mensaje en castellano.

export class SubjectNotFoundError extends Error {
  constructor() {
    super('No encontré la materia');
    this.name = 'SubjectNotFoundError';
  }
}

export class TopicNotFoundError extends Error {
  constructor() {
    super('No encontré el tema');
    this.name = 'TopicNotFoundError';
  }
}

export class NoteNotFoundError extends Error {
  constructor() {
    super('No encontré la nota');
    this.name = 'NoteNotFoundError';
  }
}

export class InboxItemNotFoundError extends Error {
  constructor() {
    super('No encontré ese elemento de la Bandeja');
    this.name = 'InboxItemNotFoundError';
  }
}

// Los nombres de materias y de temas (dentro de una materia) no se repiten.
export class DuplicateNameError extends Error {
  constructor() {
    super('Ya existe uno con ese nombre');
    this.name = 'DuplicateNameError';
  }
}

export class InvalidImageError extends Error {
  constructor() {
    super('El archivo no es una imagen del tipo que dice ser');
    this.name = 'InvalidImageError';
  }
}

export class ImageNotFoundError extends Error {
  constructor() {
    super('No encontré la imagen');
    this.name = 'ImageNotFoundError';
  }
}

// Un renglón de otra nota no se puede guardar en esta.
export class BlockOwnershipError extends Error {
  constructor() {
    super('Un renglón pertenece a otra nota');
    this.name = 'BlockOwnershipError';
  }
}
