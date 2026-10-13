// Regla de capas (docs/arquitectura.md, sección 2). Cada regla lleva «capas» en su nombre
// para que la red la nombre así al dar rojo (CA-006).

const STORAGE_OR_NETWORK =
  'better-sqlite3|drizzle-orm|@anthropic-ai/sdk|sherpa-onnx-node|pdfjs-dist|tesseract\\.js|mammoth|jsdom|yauzl|yazl';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'capas-R1-ventana',
      severity: 'error',
      comment:
        'La ventana (renderer) solo puede hablar con el puente: importa de renderer o de preload/contract.',
      from: { path: '^src/renderer/' },
      to: {
        pathNot: ['^src/renderer/', '^src/preload/contract/', '^node_modules/'],
      },
    },
    {
      name: 'capas-R1-ventana-paquetes',
      severity: 'error',
      comment:
        'La ventana no puede usar Electron, Node ni paquetes con disco o red: todo pasa por el puente.',
      from: { path: '^src/renderer/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'capas-R1-ventana-paquetes-prohibidos',
      severity: 'error',
      comment:
        'La ventana no puede usar Electron, Node ni paquetes con disco o red: todo pasa por el puente.',
      from: { path: '^src/renderer/' },
      to: { path: `^node_modules/(electron|${STORAGE_OR_NETWORK})/` },
    },
    {
      name: 'capas-R2-puente',
      severity: 'error',
      comment: 'El puente (preload) solo usa preload, electron y zod.',
      from: { path: '^src/preload/' },
      to: {
        pathNot: ['^src/preload/', '^node_modules/(electron|zod)/'],
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'capas-R2-puente-node',
      severity: 'error',
      comment: 'El puente (preload) no usa módulos de Node: corre con sandbox.',
      from: { path: '^src/preload/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'capas-R3-nucleo',
      severity: 'error',
      comment:
        'El núcleo (core) son reglas puras: no importa de otras carpetas, ni Electron, ni Node, ni paquetes con disco o red.',
      from: { path: '^src/core/' },
      to: { pathNot: ['^src/core/', '^node_modules/(ts-fsrs|zod)/'] },
    },
    {
      name: 'capas-R3-nucleo-node',
      severity: 'error',
      comment: 'El núcleo (core) no usa módulos de Node.',
      from: { path: '^src/core/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'capas-R4-datos',
      severity: 'error',
      comment:
        'Los datos (data) no importan de la ventana, del principal, de la IA ni de materiales.',
      from: { path: '^src/data/' },
      to: { path: '^src/(renderer|main|ai|ingest)/' },
    },
    {
      name: 'capas-R5-ia',
      severity: 'error',
      comment: 'La IA (ai) no importa de la ventana, de los datos ni del principal.',
      from: { path: '^src/ai/' },
      to: { path: '^src/(renderer|data|main)/' },
    },
    {
      name: 'capas-R6-materiales',
      severity: 'error',
      comment:
        'Materiales (ingest) no importa de la ventana, del principal, de los datos ni de la IA.',
      from: { path: '^src/ingest/' },
      to: { path: '^src/(renderer|main|data|ai)/' },
    },
    {
      name: 'capas-R7-principal',
      severity: 'error',
      comment: 'El principal (main) no importa de la ventana.',
      from: { path: '^src/main/' },
      to: { path: '^src/renderer/' },
    },
    {
      name: 'capas-R8-solo-datos-toca-sqlite',
      severity: 'error',
      comment: 'Solo data toca SQLite (better-sqlite3, drizzle-orm).',
      from: { pathNot: '^src/data/' },
      to: { path: '^node_modules/(better-sqlite3|drizzle-orm)/' },
    },
    {
      name: 'capas-R9-solo-ia-habla-con-la-ia',
      severity: 'error',
      comment: 'Solo ai usa el SDK de Anthropic.',
      from: { pathNot: '^src/ai/' },
      to: { path: '^node_modules/@anthropic-ai/sdk/' },
    },
    {
      name: 'capas-R10-procesos-de-trabajo',
      severity: 'error',
      comment: 'Voz, escaneos y lectores de materiales solo en main/workers e ingest.',
      from: { path: '^src/', pathNot: '^src/(main/workers|ingest)/' },
      to: {
        path: '^node_modules/(sherpa-onnx-node|tesseract\\.js|mammoth|jsdom|@mozilla/readability|dompurify|yauzl|yazl)/',
      },
    },
    {
      name: 'capas-R11-demostracion',
      severity: 'error',
      comment: 'Solo main/demo y renderer/demo usan los datos de ejemplo.',
      from: { path: '^src/', pathNot: '^src/(main|renderer)/demo/' },
      to: { path: '^datos-de-ejemplo/' },
    },
    {
      name: 'capas-R12-sin-ciclos',
      severity: 'error',
      comment: 'Ningún ciclo de importaciones en src.',
      from: { path: '^src/' },
      to: { circular: true },
    },
    {
      name: 'capas-importacion-rota',
      severity: 'error',
      comment: 'Una importación apunta a algo que no existe.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: '^node_modules' },
    // Las copias de la red enlazan node_modules: se lee por su ruta, sin seguir el enlace.
    preserveSymlinks: true,
    parser: 'swc',
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
