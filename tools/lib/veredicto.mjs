function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function lineaVerde({ pruebas, cubiertos, total }) {
  return `VERDE · ${plural(pruebas, 'prueba', 'pruebas')} · 0 fallas · 0 salteadas · ${cubiertos} de ${plural(total, 'criterio cubierto', 'criterios cubiertos')}`;
}

export function lineaRoja(fallas) {
  return `ROJO · ${plural(fallas, 'falla', 'fallas')} · copiá desde acá hasta el final y pegáselo a Claude Code`;
}

// Arma el final de la corrida. Cada problema trae su capa, su texto y cuántas fallas suma
// (peso; por defecto 1). Sin problemas es VERDE; con uno solo ya es ROJO.
export function armarVeredicto({ problemas, cuentas, registros }) {
  const fallas = problemas.reduce((suma, p) => suma + (p.peso ?? 1), 0);
  if (fallas === 0) {
    return {
      verde: true,
      fallas,
      lineas: [
        lineaVerde({
          pruebas: cuentas.corridas,
          cubiertos: cuentas.cubiertos,
          total: cuentas.criterios,
        }),
      ],
    };
  }
  return {
    verde: false,
    fallas,
    lineas: [
      lineaRoja(fallas),
      'Resumen de fallas:',
      ...problemas.map((p, i) => `${i + 1}. ${p.capa}: ${p.texto}`),
      `Cuentas: ${plural(cuentas.corridas, 'prueba corrida', 'pruebas corridas')} · ${plural(cuentas.fallaron, 'falló', 'fallaron')} · ${plural(cuentas.salteadas, 'salteada', 'salteadas')} · ${cuentas.cubiertos} de ${plural(cuentas.criterios, 'criterio cubierto', 'criterios cubiertos')}.`,
      `Registros completos de cada herramienta: ${registros}`,
    ],
  };
}

// Prueba marcadas para no correr o para correr solas, encontradas leyendo el código.
const MARCAS =
  /\b(?:it|test|describe|suite|bench)\s*\.\s*(skip|only|todo|fixme|skipIf|runIf)\b|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(/g;

export function buscarMarcas(texto) {
  const marcas = [];
  const renglones = texto.split(/\r?\n/);
  for (let i = 0; i < renglones.length; i++) {
    for (const m of renglones[i].matchAll(MARCAS)) {
      const marca = m[1] ?? m[2];
      marcas.push({
        renglon: i + 1,
        marca,
        tipo: marca === 'only' || marca === 'fit' || marca === 'fdescribe' ? 'only' : 'skip',
      });
    }
  }
  return marcas;
}

// La cantidad de pruebas no puede bajar respecto del último tag fase-NN-ok.
export function comparacionConTag({ actual, enTag, tag }) {
  if (enTag === undefined || enTag === null || actual >= enTag) {
    return null;
  }
  return `bajó la cantidad de pruebas: el tag ${tag} tenía ${enTag} y ahora hay ${actual}. No se borran ni se saltean pruebas para que pase la red.`;
}

// El aviso de pruebas salteadas: las que el corredor salteó y las marcadas en archivos que no
// corrieron. Cada salteada suma una falla.
export function problemaDeSalteadas(salteadas, marcasSinCorrer) {
  const total = salteadas.length + marcasSinCorrer.length;
  if (total === 0) {
    return null;
  }
  const nombres = [
    ...salteadas.map((p) => `«${p.titulo}»`),
    ...marcasSinCorrer.map((m) => `${m.archivo}:${m.renglon} (${m.marca})`),
  ];
  return {
    capa: 'Salteadas',
    peso: total,
    texto: `hay ${total === 1 ? '1 salteada' : `${total} salteadas`}: ${nombres.join(', ')}. Una prueba salteada no comprueba nada: sacale la marca.`,
  };
}
