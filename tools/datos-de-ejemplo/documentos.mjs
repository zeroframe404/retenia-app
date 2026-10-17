// Arma el HTML de los PDF de ejemplo y el .docx de «resumen.docx» a partir de contenido.mjs.
import { zip } from './zip.mjs';

/** @param {string} text */
function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const PAGE_CSS = `
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #161616; background: #ffffff; }
.pagina { width: 210mm; height: 297mm; box-sizing: border-box; padding: 22mm 24mm 22mm; position: relative; overflow: hidden; break-after: page; }
.pagina:last-child { break-after: auto; }
.portada { font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; color: #555555; margin: 0 0 6mm; }
h1 { font-size: 17pt; margin: 0 0 5mm; }
h2 { font-size: 13pt; margin: 6mm 0 3mm; }
p { line-height: 1.5; margin: 0 0 3.2mm; text-align: left; }
.numero { position: absolute; left: 0; right: 0; bottom: 11mm; text-align: center; font-size: 9pt; color: #555555; }
.escaneo { padding: 0; }
.escaneo img { display: block; width: 210mm; height: 297mm; }
table { border-collapse: collapse; margin: 5mm auto 6mm; }
th, td { border: 0.6pt solid #333333; padding: 1.6mm 6mm; text-align: right; }
th { background: #eeeeee; }
td:first-child, th:first-child { text-align: left; }
.formula { display: flex; align-items: center; justify-content: center; gap: 4mm; font-family: 'Times New Roman', serif; font-size: 20pt; margin: 8mm 0; }
.fraccion { display: inline-flex; flex-direction: column; align-items: center; }
.fraccion .num { padding: 0 2mm 1mm; border-bottom: 0.9pt solid #161616; }
.fraccion .den { padding: 1mm 2mm 0; }
.raiz { border-top: 0.9pt solid #161616; padding-left: 0.5mm; }
`;

/** @param {any} block @param {(name: string) => string} image */
function blockHtml(block, image) {
  if (block.portada) {
    return `<p class="portada">${escapeXml(block.portada)}</p>`;
  }
  if (block.h1) {
    return `<h1>${escapeXml(block.h1)}</h1>`;
  }
  if (block.h2) {
    return `<h2>${escapeXml(block.h2)}</h2>`;
  }
  if (block.p) {
    return `<p>${escapeXml(block.p)}</p>`;
  }
  if (block.tabla) {
    const head = block.tabla.encabezado.map(
      (/** @type {string} */ c) => `<th>${escapeXml(c)}</th>`,
    );
    const rows = block.tabla.filas.map(
      (/** @type {string[]} */ row) =>
        `<tr>${row.map((c) => `<td>${escapeXml(c)}</td>`).join('')}</tr>`,
    );
    return `<table><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  if (block.formula) {
    return `<div class="formula"><span>t</span><span>=</span><span class="fraccion"><span class="num">x&#772; &minus; &mu;<sub>0</sub></span><span class="den">s / &radic;<span class="raiz">n</span></span></span></div>`;
  }
  if (block.escaneo) {
    return `<img alt="" src="${image('escaneo')}" />`;
  }
  throw new Error(`Bloque desconocido: ${JSON.stringify(block)}`);
}

// Un documento de varias páginas A4, cada una con su número abajo (menos el escaneo, que es
// una imagen entera).
/** @param {string} title @param {any[][]} pages @param {(name: string) => string} image */
export function documentHtml(title, pages, image) {
  const body = pages
    .map((blocks, index) => {
      const scanned = blocks.some((b) => b.escaneo);
      const inner = blocks.map((b) => blockHtml(b, image)).join('\n');
      return scanned
        ? `<section class="pagina escaneo">${inner}</section>`
        : `<section class="pagina">${inner}<div class="numero">${index + 1}</div></section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;
}

// La página escaneada: texto con letra de imprenta, papel algo amarillento, un poco torcida,
// apenas borrosa y con puntitos, como una fotocopia pasada por el escáner. El ruido sale de una
// semilla fija, así la imagen sale siempre igual.
// Se dibuja en un lienzo del tamaño de la hoja (no en la ventana, que Windows achica a la
// pantalla) y queda como JPEG en `window.escaneo`.
/** @param {{ title: string, subtitle: string, paragraphs: string[] }} page @param {number} width @param {number} height */
export function scanHtml(page, width, height) {
  const data = JSON.stringify(page).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
<canvas id="hoja" width="${width}" height="${height}"></canvas>
<script>
const page = ${data};
const W = ${width};
const H = ${height};
let seed = 20270315;
const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const c = document.getElementById('hoja').getContext('2d');
c.fillStyle = '#f2efe6';
c.fillRect(0, 0, W, H);
c.save();
c.translate(W / 2, H / 2);
c.rotate(0.4 * Math.PI / 180);
c.translate(-W / 2, -H / 2);
c.filter = 'blur(0.5px)';
c.fillStyle = '#1d1d1d';
c.textBaseline = 'alphabetic';
const left = 200;
const maxWidth = W - 2 * left;
let y = 260;
const line = (text, size, weight, height) => {
  c.font = weight + ' ' + size + 'px "Times New Roman", Times, serif';
  const words = text.split(' ');
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (c.measureText(candidate).width > maxWidth && current) {
      c.fillText(current, left, y);
      y += height;
      current = word;
    } else {
      current = candidate;
    }
  }
  c.fillText(current, left, y);
  y += height;
};
line(page.title, 54, 'bold', 70);
y += 20;
line(page.subtitle, 44, 'bold', 60);
y += 34;
for (const paragraph of page.paragraphs) {
  line(paragraph, 38, 'normal', 58);
  y += 26;
}
c.restore();
const shade = c.createLinearGradient(0, 0, 130, 0);
shade.addColorStop(0, 'rgba(60,55,45,0.30)');
shade.addColorStop(1, 'rgba(60,55,45,0)');
c.fillStyle = shade;
c.fillRect(0, 0, 130, H);
for (let i = 0; i < 90000; i++) {
  const g = Math.floor(next() * 90);
  c.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + (0.04 + next() * 0.14) + ')';
  c.fillRect(next() * W, next() * H, 1 + next() * 1.6, 1 + next() * 1.6);
}
for (let i = 0; i < 45; i++) {
  c.fillStyle = 'rgba(30,30,30,0.55)';
  c.beginPath();
  c.arc(next() * W, next() * H, 1 + next() * 2.5, 0, 6.3);
  c.fill();
}
window.escaneo = document.getElementById('hoja').toDataURL('image/jpeg', 0.72);
document.title = 'listo';
</script></body></html>`;
}

// «resumen.docx»: un Word mínimo con título, subtítulos y párrafos, con estilos que reconoce
// cualquier lector (Title, Heading1).
/** @param {{ title: string, sections: { heading: string, paragraphs: string[] }[] }} doc */
export function docx(doc) {
  const paragraph = (/** @type {string} */ text, /** @type {string | null} */ style) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const body = [
    paragraph(doc.title, 'Title'),
    ...doc.sections.flatMap((s) => [
      paragraph(s.heading, 'Heading1'),
      ...s.paragraphs.map((p) => paragraph(p, null)),
    ]),
  ].join('');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
  };
  return zip(
    Object.entries(files).map(([name, text]) => ({ name, data: Buffer.from(text, 'utf8') })),
  );
}
