// Los modelos de voz que Retenia baja una sola vez a su carpeta de datos (docs/versiones.md,
// «Modelos y datos que se descargan una sola vez»). Cada archivo sale de una versión fija (la
// revisión del repositorio de modelos, que no cambia) y se acepta solo si su tamaño y su huella
// SHA-256 coinciden con los de acá. Fuente: los modelos oficiales del proyecto sherpa-onnx
// (k2-fsa) en Hugging Face. Elegidos y medidos en la Fase 05 (docs/laboratorio.md):
// - Kokoro 82M int8 multilingüe v1.0 (Apache-2.0): solo lo que usa el inglés, con las cuatro
//   voces del Laboratorio y las demás voces en inglés del mismo archivo.
// - Whisper small multilingüe int8 (MIT): codificador, decodificador y tokens.
// Este archivo no importa nada: lo leen también las herramientas de la red (tools/preparar.mjs).

export interface ModelFile {
  // Dónde queda dentro de la carpeta de modelos.
  path: string;
  // El repositorio de modelos, su revisión y el archivo adentro de esa revisión.
  source: string;
  revision: string;
  file: string;
  size: number;
  sha256: string;
}

export const MODELS_ORIGIN = 'https://huggingface.co';

const KOKORO = {
  source: 'csukuangfj/kokoro-int8-multi-lang-v1_0',
  revision: '2a360693d79b88b49b88e29aec2b53577f41f206',
};
const WHISPER = {
  source: 'csukuangfj/sherpa-onnx-whisper-small',
  revision: '8f3c18b358db4d1f2fc1eae49d75cd20989e4309',
};

const kokoro = (file: string, size: number, sha256: string): ModelFile => ({
  path: `kokoro/${file}`,
  ...KOKORO,
  file,
  size,
  sha256,
});
const whisper = (file: string, size: number, sha256: string): ModelFile => ({
  path: `whisper/${file}`,
  ...WHISPER,
  file,
  size,
  sha256,
});

export const MODEL_FILES: readonly ModelFile[] = [
  kokoro(
    'model.int8.onnx',
    114_203_756,
    '4b86207ef680e394d8343bee22dfc4c512e5c707c6d9578e3f35ab09bffd6b36',
  ),
  kokoro(
    'voices.bin',
    28_200_960,
    '1c5a5b983d3d50d8586d437a51f3faa2da7919ce76a013c081e65671a3447c29',
  ),
  kokoro('tokens.txt', 687, '6ebb6bb288f20f3ae8d004d3c2ca27697da27c037d75e81a60e2a6a663f95425'),
  kokoro(
    'lexicon-us-en.txt',
    5_956_885,
    '7daaab53a181be9885b853a8582bf1838186317e5dadacbcef9c426d6fa0da14',
  ),
  kokoro(
    'lexicon-gb-en.txt',
    6_366_635,
    'c4cbb37316f62210dff52718a7afcaae24f50c032cc75ab47ae67b831d1049e7',
  ),
  kokoro('LICENSE', 11_358, 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'),
  kokoro(
    'espeak-ng-data/phontab',
    55_796,
    '886f3fa402cb0ba73d483aa8ad000af47a6b7cc06293c75a97913fba68a530f6',
  ),
  kokoro(
    'espeak-ng-data/phonindex',
    39_074,
    '3ca7b8fa3b42624e4b0f152707e7a39245fce569aa99ea47c055d9e622fcf0c4',
  ),
  kokoro(
    'espeak-ng-data/phondata',
    550_424,
    '4e0288957874029a8c3c9f41a8f517ad4bf18127046decbdd4b9d1d6807ce3a3',
  ),
  kokoro(
    'espeak-ng-data/intonations',
    2_040,
    '3f8af65fd3eda9759a10f021d61361c120871f463515229c925995c7f90918cc',
  ),
  kokoro(
    'espeak-ng-data/en_dict',
    166_944,
    '71bd330ba8a2e3e8076e631508208ef49449d6147c17b7bd2b4b1e1468292e35',
  ),
  kokoro(
    'espeak-ng-data/lang/gmw/en',
    140,
    '4605d5330801de3641c6e366d15f129ea1f5ffbce8722642aba01ace07ab9c83',
  ),
  kokoro(
    'espeak-ng-data/lang/gmw/en-US',
    257,
    '41534c2a22df5dd4f1052ff9e1a33a3ea7bff5a26b5c02bdad5ba8ddb7524704',
  ),
  kokoro(
    'espeak-ng-data/lang/gmw/en-GB-x-rp',
    249,
    'd0625af7f58561b1b8cf96fd7f93eee6553bcb3eadb9020ae0757bf96e5115e5',
  ),
  whisper(
    'small-encoder.int8.onnx',
    112_442_483,
    '4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9',
  ),
  whisper(
    'small-decoder.int8.onnx',
    262_226_114,
    'acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee',
  ),
  whisper(
    'small-tokens.txt',
    816_730,
    'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126',
  ),
];
