// Los cuatro sabotajes de la Fase 02 (H-01). Cada uno rompe algo a propósito para demostrar
// que la red lo detecta: aplicar() lo rompe y devuelve cómo revertirlo.
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function reemplazar(texto, antes, despues) {
  if (!texto.includes(antes)) {
    throw new Error(`El sabotaje no encontró lo que tenía que cambiar: «${antes}»`);
  }
  return texto.replace(antes, despues);
}

// Una clave con el formato real de Anthropic, armada en el momento para que no quede escrita
// en ningún archivo del repositorio. No sirve para nada: es falsa.
function claveFalsa() {
  return `sk-ant-${'api03'}-${'Sabotaje2NoEsReal'.repeat(5)}${'x'.repeat(8)}AA`;
}

export const SABOTAJES = {
  1: {
    nombre: 'una regla rota: el día de estudio corta a las 00:00 en vez de a las 04:00',
    espera: 'día de estudio',
    cambios: [
      {
        archivo: 'src/core/study-day/index.ts',
        cambiar: (t) =>
          reemplazar(t, 'const STUDY_DAY_CUTOFF_HOUR = 4;', 'const STUDY_DAY_CUTOFF_HOUR = 0;'),
      },
    ],
  },
  2: {
    nombre: 'una clave falsa escrita en un archivo del proyecto',
    espera: 'secreto',
    cambios: [
      {
        archivo: 'ajustes-ia.json',
        cambiar: () => `${JSON.stringify({ anthropicApiKey: claveFalsa() }, null, 2)}\n`,
      },
    ],
  },
  3: {
    nombre: 'una prueba salteada',
    espera: '1 salteada',
    cambios: [
      {
        archivo: 'tests/unitarias/study-day.test.ts',
        cambiar: (t) =>
          reemplazar(
            t,
            "it('[CA-002] el día de estudio no depende",
            `it.${'skip'}('[CA-002] el día de estudio no depende`,
          ),
      },
    ],
  },
  4: {
    nombre: 'capas mezcladas: la ventana importa directamente la base de datos',
    espera: 'capas',
    cambios: [
      {
        archivo: 'src/data/database.ts',
        cambiar: () =>
          "// Sabotaje 4: una base de datos que la ventana nunca debería tocar.\nexport function openDatabase(): string {\n  return 'retenia.db';\n}\n",
      },
      {
        archivo: 'src/renderer/App.tsx',
        cambiar: (t) =>
          reemplazar(
            reemplazar(
              t,
              "import { texts } from '../preload/contract/texts';",
              "import { openDatabase } from '../data/database';\nimport { texts } from '../preload/contract/texts';",
            ),
            '<main className={styles.main}>',
            '<main className={styles.main} data-base={openDatabase()}>',
          ),
      },
    ],
  },
};

function respaldo(raiz) {
  return join(raiz, '.cache', 'sabotaje', 'en-curso.json');
}

// Si una corrida anterior quedó cortada con un sabotaje puesto, lo deshace.
export function restaurarSiQuedoAlgo(raiz) {
  const ruta = respaldo(raiz);
  if (!existsSync(ruta)) {
    return false;
  }
  for (const { archivo, original } of JSON.parse(readFileSync(ruta, 'utf8'))) {
    const destino = join(raiz, archivo);
    if (original === null) {
      rmSync(destino, { force: true });
      try {
        rmdirSync(dirname(destino));
      } catch {
        // La carpeta ya existía con otras cosas: queda como estaba.
      }
    } else {
      writeFileSync(destino, original);
    }
  }
  rmSync(ruta, { force: true });
  return true;
}

export function aplicarSabotaje(numero, raiz) {
  const sabotaje = SABOTAJES[numero];
  if (!sabotaje) {
    throw new Error(`No existe el sabotaje ${numero}: hay del 1 al 4.`);
  }
  restaurarSiQuedoAlgo(raiz);
  const originales = sabotaje.cambios.map(({ archivo }) => {
    const ruta = join(raiz, archivo);
    return { archivo, original: existsSync(ruta) ? readFileSync(ruta, 'utf8') : null };
  });
  mkdirSync(dirname(respaldo(raiz)), { recursive: true });
  writeFileSync(respaldo(raiz), JSON.stringify(originales));
  for (const [i, { archivo, cambiar }] of sabotaje.cambios.entries()) {
    const ruta = join(raiz, archivo);
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, cambiar(originales[i].original ?? ''));
  }
  return {
    archivos: sabotaje.cambios.map((c) => c.archivo),
    revertir: () => restaurarSiQuedoAlgo(raiz),
  };
}
