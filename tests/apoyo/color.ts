// Cuentas de color para las pruebas del sistema de diseño: contraste según WCAG y tono.

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Color inválido: «${hex}»`);
  }
  return [
    Number.parseInt(match[1] ?? '', 16),
    Number.parseInt(match[2] ?? '', 16),
    Number.parseInt(match[3] ?? '', 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// La relación de contraste entre dos colores (de 1 a 21).
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// Tono (0 a 360), saturación y luminosidad (0 a 1) de un color.
export function hsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const [r, g, b] = parseHex(hex).map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness };
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }
  return { hue: (hue + 360) % 360, saturation, lightness };
}

// Un color que se lee como rojo: tono entre 345° y 12° con color de verdad (ni gris ni casi blanco
// o casi negro). El naranja de «atención» (21°) no lo es.
export function isRed(hex: string): boolean {
  const { hue, saturation, lightness } = hsl(hex);
  return (hue >= 345 || hue <= 12) && saturation >= 0.3 && lightness >= 0.12 && lightness <= 0.9;
}
