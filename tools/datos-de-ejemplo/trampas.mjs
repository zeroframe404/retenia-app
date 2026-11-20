// Archivos trampa para las pruebas de seguridad de los materiales (CA-337, Fase 13): un PDF con
// código adentro, un Word con rutas que salen de la carpeta, un Word con entidades XML y un Word
// «bomba» (chico comprimido, enorme descomprimido). Los arma el generador de datos de ejemplo y
// también las pruebas, que los crean en el momento en una carpeta propia.
import { zip } from './zip.mjs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** @param {string} body */
const documentXml = (body, doctype = '') =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${doctype}<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;

/** @param {string} text */
const paragraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** @param {{ name: string, data: Buffer }[]} extra */
function wordWith(document, extra = []) {
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES) },
    { name: '_rels/.rels', data: Buffer.from(RELS) },
    { name: 'word/document.xml', data: Buffer.from(document) },
    ...extra,
  ]);
}

// Un Word que, además de lo suyo, trae entradas con rutas hacia afuera: subir de carpeta,
// absolutas, con unidad y con barras invertidas.
export function trapPathsZip() {
  return wordWith(documentXml(paragraph('Un Word con rutas trampa.')), [
    { name: '../../fuera-de-retenia.txt', data: Buffer.from('no tendría que existir') },
    { name: '/raiz-de-retenia.txt', data: Buffer.from('no tendría que existir') },
    { name: 'C:/Users/Public/unidad-de-retenia.txt', data: Buffer.from('no tendría que existir') },
    { name: 'word\\..\\..\\barra-de-retenia.txt', data: Buffer.from('no tendría que existir') },
  ]);
}

// Un Word con una entidad externa que apunta a un archivo de Windows.
export function trapEntitiesDocx() {
  const doctype =
    '<!DOCTYPE w:document [<!ENTITY robo SYSTEM "file:///C:/Windows/win.ini"><!ENTITY risa "ja">]>';
  return wordWith(documentXml(paragraph('Hola &robo; &risa;'), doctype));
}

// Un Word chico comprimido y enorme descomprimido: `megabytes` de espacios adentro de un párrafo.
export function trapBombDocx(megabytes = 210) {
  const filler = ' '.repeat(1024 * 1024);
  const body = `<w:p><w:r><w:t xml:space="preserve">${filler.repeat(megabytes)}</w:t></w:r></w:p>`;
  return wordWith(documentXml(body));
}

// Un PDF de una página con una acción de JavaScript al abrir: intenta mostrar un aviso y mandar
// un formulario a `url`. Retenia lo tiene que leer como dato sin que nada de eso pase.
export function trapCodePdf(url = 'http://127.0.0.1:9/robo') {
  const js = `app.alert('hola'); this.submitForm('${url}'); app.launchURL('${url}', true);`;
  const escaped = js.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const content = 'BT /F1 18 Tf 72 760 Td (Un PDF con codigo adentro.) Tj ET';
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R /Names << /JavaScript << /Names [(robo) 4 0 R] >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> /AA << /O 4 0 R >> >>',
    `<< /Type /Action /S /JavaScript /JS (${escaped}) >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
