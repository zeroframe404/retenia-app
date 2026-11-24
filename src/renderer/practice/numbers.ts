// Cómo se lee un número en «Valor» y «Margen» del editor de la ficha. La ventana no puede importar
// el núcleo, así que esta es una copia de su regla (`parseNumber`, en src/core/evaluation/numeric.ts),
// sin unidad. Una prueba de propiedades las mantiene iguales: con una sola clase de marca, si aparece
// una vez es la decimal y si aparece varias son de miles (de a tres cifras); un solo punto seguido de
// exactamente tres cifras también es de miles («1.500» es mil quinientos); con las dos, la última es
// la decimal.

const SIGNS = new Set(['+', '-', '−']);

function groupsAreThousands(integer: string, separator: string): boolean {
  const [first, ...rest] = integer.split(separator);
  return (
    first !== undefined &&
    /^[0-9]{1,3}$/.test(first) &&
    rest.length > 0 &&
    rest.every((group) => /^[0-9]{3}$/.test(group))
  );
}

function readDigits(text: string): number | null {
  const dots = text.split('.').length - 1;
  const commas = text.split(',').length - 1;
  let integer = text;
  let fraction = '';
  if (dots > 0 && commas > 0) {
    const decimal = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    const at = text.lastIndexOf(decimal);
    if (text.split(decimal).length - 1 !== 1) {
      return null;
    }
    integer = text.slice(0, at);
    fraction = text.slice(at + 1);
    if (!groupsAreThousands(integer, thousands)) {
      return null;
    }
    integer = integer.split(thousands).join('');
  } else if (dots + commas === 1) {
    const at = Math.max(text.indexOf('.'), text.indexOf(','));
    integer = text.slice(0, at);
    fraction = text.slice(at + 1);
    if (dots === 1 && fraction.length === 3 && /^[1-9][0-9]{0,2}$/.test(integer)) {
      integer += fraction;
      fraction = '';
    }
  } else if (dots + commas > 1) {
    const separator = dots > 0 ? '.' : ',';
    if (!groupsAreThousands(text, separator)) {
      return null;
    }
    integer = text.split(separator).join('');
  }
  if (!/^[0-9]*$/.test(integer) || !/^[0-9]*$/.test(fraction) || integer + fraction === '') {
    return null;
  }
  return Number(`${integer === '' ? '0' : integer}.${fraction === '' ? '0' : fraction}`);
}

export function readEditorNumber(raw: string): number | null {
  let text = raw.trim();
  let negative = false;
  const first = text.charAt(0);
  if (SIGNS.has(first)) {
    negative = first !== '+';
    text = text.slice(1);
  }
  if (!/^[0-9.,]+$/.test(text)) {
    return null;
  }
  const value = readDigits(text);
  return value === null ? null : negative ? -value : value;
}
