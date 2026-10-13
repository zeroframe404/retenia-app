export interface Clock {
  now(): Date;
}

export function systemClock(): Clock {
  throw new Error('sin implementar');
}

export function fixedClock(_instant: Date): Clock {
  throw new Error('sin implementar');
}

export function demoClock(): Clock {
  throw new Error('sin implementar');
}
