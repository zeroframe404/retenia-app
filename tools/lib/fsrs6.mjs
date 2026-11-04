// La fórmula publicada de FSRS-6, escrita de nuevo a partir del texto del algoritmo y sin usar la
// biblioteca ts-fsrs: es el «revisor a mano» de la tabla de casos del motor
// (docs/especificacion/casos-memoria.md). Si la biblioteca y esta fórmula no dan lo mismo, la
// tabla no se congela y la red da rojo.
//
// Fuente: «The Algorithm», FSRS-6, en la wiki de open-spaced-repetition/fsrs4anki, con los 21
// parámetros por defecto. Notación: G es la calificación (1 «No la sabía», 2 «Con dudas», 3 «La
// sabía», 4 fácil, que Retenia no usa), S la estabilidad en días, D la dificultad de 1 a 10, R la
// probabilidad de recordar y t los días desde el último repaso.
//
// Dos cosas no son de la fórmula sino de cómo la biblioteca arma la agenda, y están marcadas como
// tales: el redondeo a 8 decimales de cada paso y la regla de que «La sabía» nunca vuelva el mismo
// día que «Con dudas» en una tarjeta ya repasada.

/** Los 21 parámetros por defecto de FSRS-6, tal como están publicados. */
export const FSRS6_DEFAULT_PARAMETERS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

const w = FSRS6_DEFAULT_PARAMETERS;
const S_MIN = 0.001;
const S_MAX = 36_500;
const MAX_INTERVAL = 36_500;

/** Redondeo a 8 decimales (de la biblioteca, no de la fórmula). @param {number} x */
const r8 = (x) => Math.round(x * 1e8) / 1e8;
/** @param {number} x @param {number} min @param {number} max */
const clamp = (x, min, max) => Math.min(Math.max(x, min), max);

// DECAY = −w20 y FACTOR = 0,9^(1/DECAY) − 1: así R(S, S) = 0,9.
const DECAY = -(w[20] ?? 0);
const FACTOR = r8(0.9 ** (1 / DECAY) - 1);

/** R(t, S) = (1 + FACTOR · t / S)^DECAY. @param {number} t @param {number} s */
export function retrievability(t, s) {
  return r8((1 + (FACTOR * t) / s) ** DECAY);
}

/** I(r, S) = S / FACTOR · (r^(1/DECAY) − 1), en días enteros, al menos 1. @param {number} s @param {number} retention */
export function interval(s, retention) {
  const modifier = r8((retention ** (1 / DECAY) - 1) / FACTOR);
  return Math.min(Math.max(1, Math.round(s * modifier)), MAX_INTERVAL);
}

/** S₀(G) = w[G−1]. @param {number} g */
function initialStability(g) {
  return Math.max(w[g - 1] ?? 0, 0.1);
}

/** D₀(G) = w4 − e^(w5·(G−1)) + 1. @param {number} g */
function initialDifficulty(g) {
  return r8((w[4] ?? 0) - Math.exp((w[5] ?? 0) * (g - 1)) + 1);
}

/** D' = w7 · D₀(4) + (1 − w7) · (D + ΔD · (10 − D) / 9), con ΔD = −w6 · (G − 3). @param {number} d @param {number} g */
function nextDifficulty(d, g) {
  const delta = -(w[6] ?? 0) * (g - 3);
  const damped = d + r8((delta * (10 - d)) / 9);
  const reverted = r8((w[7] ?? 0) * initialDifficulty(4) + (1 - (w[7] ?? 0)) * damped);
  return clamp(reverted, 1, 10);
}

/**
 * Después de recordar: S' = S · (e^w8 · (11 − D) · S^(−w9) · (e^(w10·(1−R)) − 1) · w15 (si G = 2) + 1).
 * @param {number} d @param {number} s @param {number} r @param {number} g
 */
function recallStability(d, s, r, g) {
  const hardPenalty = g === 2 ? (w[15] ?? 1) : 1;
  const easyBonus = g === 4 ? (w[16] ?? 1) : 1;
  const growth =
    Math.exp(w[8] ?? 0) *
    (11 - d) *
    s ** -(w[9] ?? 0) *
    (Math.exp((w[10] ?? 0) * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return r8(clamp(s * (1 + growth), S_MIN, S_MAX));
}

/**
 * Después de olvidar: S'f = w11 · D^(−w12) · ((S + 1)^w13 − 1) · e^(w14·(1−R)), y en FSRS-6 nunca
 * más que S / e^(w17·w18).
 * @param {number} d @param {number} s @param {number} r
 */
function forgetStability(d, s, r) {
  const forgotten = r8(
    clamp(
      (w[11] ?? 0) *
        d ** -(w[12] ?? 0) *
        ((s + 1) ** (w[13] ?? 0) - 1) *
        Math.exp((w[14] ?? 0) * (1 - r)),
      S_MIN,
      S_MAX,
    ),
  );
  const ceiling = r8(s / Math.exp((w[17] ?? 0) * (w[18] ?? 0)));
  return clamp(ceiling, S_MIN, forgotten);
}

/**
 * @typedef {{ stability: number, difficulty: number }} Memory
 */

/**
 * Un repaso según la fórmula: la memoria nueva y el intervalo hasta el próximo, en días.
 * `previous` nulo es una tarjeta nueva; `t` son los días desde el repaso anterior (al menos 1:
 * Retenia no le pasa al motor un segundo repaso del mismo día).
 * @param {Memory | null} previous @param {number} t @param {1 | 2 | 3} g @param {number} retention
 * @returns {Memory & { interval: number, retrievability: number | null }}
 */
export function review(previous, t, g, retention) {
  if (previous === null) {
    const stability = initialStability(g);
    return {
      stability,
      difficulty: clamp(initialDifficulty(g), 1, 10),
      interval: interval(stability, retention),
      retrievability: null,
    };
  }
  const { stability: s, difficulty: d } = previous;
  const r = retrievability(t, s);
  const difficulty = nextDifficulty(d, g);
  if (g === 1) {
    const stability = forgetStability(d, s, r);
    return { stability, difficulty, interval: interval(stability, retention), retrievability: r };
  }
  // Regla de la biblioteca (no de la fórmula): en una tarjeta ya repasada, «Con dudas» nunca vuelve
  // después que «La sabía», y «La sabía» siempre vuelve al menos un día después que «Con dudas».
  const hard = interval(recallStability(d, s, r, 2), retention);
  const good = interval(recallStability(d, s, r, 3), retention);
  const hardShown = Math.min(hard, good);
  const stability = recallStability(d, s, r, g);
  return {
    stability,
    difficulty,
    interval: g === 2 ? hardShown : Math.max(good, hardShown + 1),
    retrievability: r,
  };
}
