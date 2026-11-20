import { describe, expect, it } from 'vitest';
import { extensionFor, identifyContent } from '../../src/core/materials/signature';
import { decodeText } from '../../src/core/materials/text';

// El tipo de un material sale de lo que tiene adentro, no de cómo se llama (H-25, CA-108).

const bytes = (text: string) => new TextEncoder().encode(text);
const of = (head: Uint8Array, name: string, size = head.length) =>
  identifyContent({ head, size, name });

const PDF = bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('el tipo sale del contenido', () => {
  it('un PDF es PDF aunque se llame «notas.txt»', () => {
    expect(of(PDF, 'Apunte 3.pdf')).toEqual({ ok: true, kind: 'pdf' });
    expect(of(PDF, 'notas.txt')).toEqual({ ok: true, kind: 'pdf' });
    expect(of(PDF, 'sin extensión')).toEqual({ ok: true, kind: 'pdf' });
  });

  it('la firma del PDF puede venir después de unos bytes de basura (hasta 1024)', () => {
    const late = new Uint8Array([...new Uint8Array(300).fill(0x20), ...PDF]);
    expect(of(late, 'raro.pdf')).toEqual({ ok: true, kind: 'pdf' });
  });

  it('[CA-108] un texto con nombre de PDF no es un PDF', () => {
    const text = bytes(
      'Este archivo se llama «no-es-un-pdf.pdf» pero no es un PDF: es texto común con otro nombre.\n',
    );
    expect(of(text, 'no-es-un-pdf.pdf')).toEqual({ ok: false, problem: 'notPdf' });
    expect(of(text, 'NO-ES-UN-PDF.PDF')).toEqual({ ok: false, problem: 'notPdf' });
  });

  it('un comprimido con nombre de PDF tampoco es un PDF', () => {
    expect(of(ZIP, 'trampa.pdf')).toEqual({ ok: false, problem: 'notPdf' });
  });

  it('un comprimido es un posible Word (lo confirma la validación); con nombre de Word y sin serlo, no', () => {
    expect(of(ZIP, 'resumen.docx')).toEqual({ ok: true, kind: 'docx' });
    expect(of(ZIP, 'sin-nombre')).toEqual({ ok: true, kind: 'docx' });
    expect(of(bytes('hola'), 'resumen.docx')).toEqual({ ok: false, problem: 'notWord' });
    expect(of(PDF, 'resumen.docx')).toEqual({ ok: false, problem: 'notWord' });
  });

  it('Markdown: por el nombre o por sus marcas; texto común si no tiene ninguna', () => {
    expect(of(bytes('# Notas\n\nHola.'), 'notas.md')).toEqual({ ok: true, kind: 'md' });
    expect(of(bytes('# Notas\n\nHola.'), 'pegado.txt')).toEqual({ ok: true, kind: 'md' });
    expect(of(bytes('Sin títulos.\n\nDos párrafos.'), 'notas.md')).toEqual({
      ok: true,
      kind: 'md',
    });
    expect(of(bytes('Sin títulos.\n\nDos párrafos.'), 'pegado.txt')).toEqual({
      ok: true,
      kind: 'text',
    });
  });

  it('una foto, un audio o una página web no son de los tipos que se leen', () => {
    expect(of(PNG, 'foto.png')).toEqual({ ok: false, problem: 'unsupported' });
    expect(of(JPEG, 'foto.jpg')).toEqual({ ok: false, problem: 'unsupported' });
    expect(of(JPEG, 'foto.txt')).toEqual({ ok: false, problem: 'unsupported' });
    expect(of(bytes('RIFF\u0000\u0000\u0000\u0000WAVEfmt '), 'audio.wav')).toEqual({
      ok: false,
      problem: 'unsupported',
    });
    expect(of(bytes('<!doctype html>\n<html><body>Hola</body></html>'), 'pagina.html')).toEqual({
      ok: false,
      problem: 'unsupported',
    });
  });

  it('una foto con nombre de PDF es un PDF que no se puede leer', () => {
    expect(of(PNG, 'foto.pdf')).toEqual({ ok: false, problem: 'notPdf' });
  });

  it('un archivo vacío dice que está vacío', () => {
    expect(of(new Uint8Array(), 'vacio.pdf', 0)).toEqual({ ok: false, problem: 'empty' });
    expect(of(new Uint8Array(), 'vacio.txt', 0)).toEqual({ ok: false, problem: 'empty' });
  });

  it('bytes de control en un texto: no es texto', () => {
    expect(of(new Uint8Array([0x48, 0x6f, 0x00, 0x01, 0x02, 0x6c, 0x61]), 'raro.txt')).toEqual({
      ok: false,
      problem: 'unsupported',
    });
  });

  it('el principio de un texto largo puede cortar una letra a la mitad: sigue siendo texto', () => {
    const full = bytes(`${'á'.repeat(5000)}`);
    const head = full.slice(0, 8191);
    expect(identifyContent({ head, size: full.length, name: 'largo.txt' })).toEqual({
      ok: true,
      kind: 'text',
    });
  });

  it('cada tipo se guarda con su extensión', () => {
    expect(extensionFor('pdf')).toBe('pdf');
    expect(extensionFor('docx')).toBe('docx');
    expect(extensionFor('md')).toBe('md');
    expect(extensionFor('text')).toBe('txt');
  });
});

describe('leer un texto', () => {
  it('UTF-8 con o sin marca inicial, UTF-16 con marca; queda en forma NFC y con saltos \\n', () => {
    expect(decodeText(bytes('﻿Hola\r\nmundo'))).toBe('Hola\nmundo');
    const decomposed = 'México';
    expect(decodeText(bytes(decomposed))).toBe('México');
    const le = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0xed, 0x00]);
    expect(decodeText(le)).toBe('Hí');
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0xed]);
    expect(decodeText(be)).toBe('Hí');
  });

  it('lo que no es UTF-8 válido no es texto', () => {
    expect(decodeText(new Uint8Array([0xc3, 0x28, 0x41]))).toBeNull();
  });
});

describe('textos que mencionan «%PDF-» y textos raros', () => {
  it('[CA-108] un Markdown o un texto que menciona «%PDF-» en su primer renglón sigue siendo texto', () => {
    const md = bytes('# Formatos\n\nTodo PDF empieza con %PDF-1.7 y después viene lo demás.\n');
    expect(of(md, 'formatos.md')).toEqual({ ok: true, kind: 'md' });
    const txt = bytes('Dato curioso: los PDF empiezan con %PDF- seguido de la versión.\n');
    expect(of(txt, 'curioso.txt')).toEqual({ ok: true, kind: 'text' });
  });

  it('un archivo que solo tiene espacios y renglones vacíos está vacío', () => {
    expect(of(bytes('   \n\n\t  \r\n'), 'en-blanco.txt')).toEqual({ ok: false, problem: 'empty' });
  });

  it('un texto guardado en ANSI (Latin-1 de Windows) se lee igual, con sus eñes y tildes', () => {
    const latin = new Uint8Array([
      ...bytes('El a'),
      0xf1,
      ...bytes('o pasado vimos la media y la desviaci'),
      0xf3,
      ...bytes('n.\r\n'),
    ]);
    expect(of(latin, 'apunte viejo.txt')).toEqual({ ok: true, kind: 'text' });
    expect(decodeText(latin)).toBe('El año pasado vimos la media y la desviación.\n');
  });
});
