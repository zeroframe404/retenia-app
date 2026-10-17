import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractFile, listPackage } from '@electron/asar';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../tools/lib/proceso.mjs';

// Lo que arma «npm run construir» (y la red, en verificar:todo): el programa sin instalar de
// cada variante, en release/<variante>/win-unpacked. Estas pruebas leen ese paquete tal cual
// quedó, sin volver a armarlo.
const PACKAGES = {
  prueba: { folder: join(ROOT, 'release', 'prueba', 'win-unpacked'), exe: 'Retenia (prueba).exe' },
  real: { folder: join(ROOT, 'release', 'real', 'win-unpacked'), exe: 'Retenia.exe' },
};

function requirePackage(variant: keyof typeof PACKAGES) {
  const { folder, exe } = PACKAGES[variant];
  if (!existsSync(join(folder, exe))) {
    throw new Error(
      `Falta el programa de la variante «${variant}» en ${relative(ROOT, folder)}. Armalo con «npm run construir».`,
    );
  }
  return { folder, exe: join(folder, exe) };
}

const BINARY = /\.(node|dll|exe|pak|dat|bin|png|ico|ttf|woff2?|icns)$/i;

// El empaquetador escribe las letras con tilde como secuencias de escape (la «Ó» de
// «DEMOSTRACIÓN» queda como barra, u y 00d3) en el código de la ventana: se buscan también
// decodificadas, para que una cinta escondida así no pase.
const ESCAPES = [
  {
    pattern: /\\u\{([0-9a-fA-F]+)\}/g,
    decode: (hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)),
  },
  {
    pattern: /\\u([0-9a-fA-F]{4})/g,
    decode: (hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  },
  {
    pattern: /\\x([0-9a-fA-F]{2})/g,
    decode: (hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  },
];

function decodeEscapes(text: string): string {
  return ESCAPES.reduce(
    (current, { pattern, decode }) => current.replace(pattern, (_, hex: string) => decode(hex)),
    text,
  );
}

// El texto tal cual y, a continuación, decodificado.
function withDecoded(text: string): string {
  return `${text}\n${decodeEscapes(text)}`;
}

interface PackageFile {
  path: string;
  text: string | null;
}

// Todo lo que hay en el paquete: cada archivo de app.asar (con su contenido, si es de texto) y
// cada archivo suelto de la carpeta de recursos.
function readPackage(folder: string): PackageFile[] {
  const files: PackageFile[] = [];
  const asar = join(folder, 'resources', 'app.asar');
  for (const entry of listPackage(asar, { isPack: false })) {
    // En Windows asar lee las rutas con barras invertidas y sin la barra del principio.
    const inside = entry.replace(/^[\\/]/, '');
    const path = inside.split('\\').join('/');
    let text: string | null = null;
    if (!BINARY.test(path)) {
      try {
        text = withDecoded(extractFile(asar, inside).toString('utf8'));
      } catch {
        text = null; // una carpeta
      }
    }
    files.push({ path: `app.asar/${path}`, text });
  }
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const path = relative(join(folder, 'resources'), full).split('\\').join('/');
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name !== 'app.asar') {
        files.push({
          path,
          text: BINARY.test(name) ? null : withDecoded(readFileSync(full, 'utf8')),
        });
      }
    }
  };
  walk(join(folder, 'resources'));
  return files;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value.length >= 8) {
      out.push(value);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectStrings(item, out);
    }
  }
}

// Lo que no puede estar en el paquete de uso real: la fecha de demostración, la cinta, los
// canales de demostración y el elenco (sus textos y los nombres de sus archivos).
function demoMarks(): string[] {
  const marks = [
    '15/03/2027',
    '2027-03-15',
    'DEMOSTRACIÓN',
    'demo.',
    'Inferencia — capítulos 1 a 4',
    'A weekend in Bariloche',
  ];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith('.json')) {
        collectStrings(JSON.parse(readFileSync(full, 'utf8')), marks);
      }
    }
  };
  walk(join(ROOT, 'datos-de-ejemplo'));
  return [...new Set(marks)];
}

function sampleFileNames(): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'LEEME.md') {
        continue;
      }
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        names.push(name);
      }
    }
  };
  walk(join(ROOT, 'datos-de-ejemplo'));
  return names;
}

function findMarks(files: PackageFile[], marks: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    for (const mark of marks) {
      if (file.text?.includes(mark) || file.path.includes(mark)) {
        found.push(`${file.path} contiene «${mark}»`);
      }
    }
  }
  return found;
}

describe('paquete de uso real: nada de demostración', () => {
  const real = readPackage(requirePackage('real').folder);

  it('[CA-013] no contiene el elenco, la fecha de demostración ni la cinta', () => {
    // Que la búsqueda lea de verdad el contenido: el archivo principal y la ventana tienen que
    // haberse podido abrir (si no, no encontrar nada no probaría nada).
    expect(real.length).toBeGreaterThan(10);
    const readable = real.filter((file) => file.text !== null).map((file) => file.path);
    expect(readable).toEqual(
      expect.arrayContaining([
        'app.asar/package.json',
        'app.asar/out/real/main/index.js',
        'app.asar/out/real/preload/index.cjs',
        'app.asar/out/real/renderer/index.html',
      ]),
    );
    const manifest = real.find((file) => file.path === 'app.asar/package.json')?.text ?? '';
    expect(manifest).toContain('out/real/main/index.js');
    expect(findMarks(real, demoMarks())).toEqual([]);
  });

  it('[CA-013] no trae ningún archivo de datos-de-ejemplo ni el programa de la cinta', () => {
    const names = sampleFileNames();
    expect(names.length).toBeGreaterThan(0);
    const present = real
      .filter((file) => names.some((name) => file.path.endsWith(`/${name}`) || file.path === name))
      .map((file) => file.path);
    expect(present).toEqual([]);
    expect(real.filter((file) => /demo|ribbon/i.test(file.path)).map((file) => file.path)).toEqual(
      [],
    );
  });

  it('[CA-013] el control: el paquete de prueba sí los tiene, así que esta búsqueda sabe encontrarlos', () => {
    const prueba = readPackage(requirePackage('prueba').folder);
    const marks = [
      'DEMOSTRACIÓN',
      '2027-03-15',
      'demo.state',
      'demo.advanceDays',
      'demo.resetDate',
      'Restablecer fecha',
      '¿Qué mide el desvío estándar?',
    ];
    for (const mark of marks) {
      expect(
        prueba.some((file) => file.text?.includes(mark)),
        `la variante de prueba tendría que contener «${mark}»`,
      ).toBe(true);
    }
  });

  it('[CA-013] el programa real no trae los canales de demostración en el puente ni en el principal', () => {
    const leaks = real
      .filter((file) => file.path.startsWith('app.asar/out/real/'))
      .filter((file) =>
        /demo\.state|demo\.advanceDays|demo\.resetDate|demoChannels|createDemoHandlers|createDemoDate|seedDemoCards|Restablecer fecha/.test(
          file.text ?? '',
        ),
      );
    expect(leaks.map((file) => file.path)).toEqual([]);
  });
});

const WATCHED_FUSES = {
  runAsNode: FuseV1Options.RunAsNode,
  cookieEncryption: FuseV1Options.EnableCookieEncryption,
  nodeOptions: FuseV1Options.EnableNodeOptionsEnvironmentVariable,
  cliInspect: FuseV1Options.EnableNodeCliInspectArguments,
  asarIntegrity: FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
  onlyLoadFromAsar: FuseV1Options.OnlyLoadAppFromAsar,
} as const;

async function fuses(exe: string) {
  const wire = await getCurrentFuseWire(exe);
  return Object.fromEntries(
    Object.entries(WATCHED_FUSES).map(([name, option]) => [
      name,
      wire[option] === FuseState.ENABLE,
    ]),
  );
}

describe('paquete: fuses de seguridad (docs/arquitectura.md, sección 4)', () => {
  it('la versión real: sin Node como ejecutable, sin variables ni inspección, con cookies cifradas, solo desde el asar y con su integridad', async () => {
    expect(await fuses(requirePackage('real').exe)).toEqual({
      runAsNode: false,
      cookieEncryption: true,
      nodeOptions: false,
      cliInspect: false,
      asarIntegrity: true,
      onlyLoadFromAsar: true,
    });
  });

  it('la variante de prueba: lo mismo, salvo la inspección, que Playwright necesita encendida', async () => {
    expect(await fuses(requirePackage('prueba').exe)).toEqual({
      runAsNode: false,
      cookieEncryption: true,
      nodeOptions: false,
      cliInspect: true,
      asarIntegrity: true,
      onlyLoadFromAsar: true,
    });
  });

  it('el módulo nativo de la base viaja fuera del asar, listo para cargarse', () => {
    for (const variant of ['prueba', 'real'] as const) {
      const { folder } = requirePackage(variant);
      const native = join(
        folder,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'better-sqlite3',
        'prebuilds',
        'win32-x64.node',
      );
      expect(existsSync(native), variant).toBe(true);
    }
  });
});
