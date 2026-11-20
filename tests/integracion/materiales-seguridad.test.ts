import { closeSync, openSync, readdirSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { systemStopwatch } from '../../src/core/clock';
import { MAX_MATERIAL_BYTES } from '../../src/main/materials/receive';
import {
  trapBombDocx,
  trapCodePdf,
  trapEntitiesDocx,
  trapPathsZip,
} from '../../tools/datos-de-ejemplo/trampas.mjs';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import {
  copySample,
  openMaterials,
  removeTempFolders,
  statisticsSubject,
  tempFolder,
} from '../apoyo/materiales';

// Archivos trampa (H-25, no-funcionales.md): nada de lo que trae un material se ejecuta ni
// escribe fuera de la carpeta de datos. Lo que no se puede leer queda en «Error» con su motivo.

afterEach(() => {
  closeSpaces();
  removeTempFolders();
});

// Todo lo que hay debajo de una carpeta, para comparar antes y después.
function everything(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function addOne(path: string) {
  const space = openSpace();
  const subjectId = statisticsSubject(space);
  const { service, executed } = openMaterials(space);
  const { results } = await service.addFiles({ paths: [path], subjectId });
  const [result] = results;
  if (result?.outcome !== 'added') {
    throw new Error('no se agregó');
  }
  await service.whenIdle();
  return { space, service, executed, materialId: result.materialId };
}

describe('Word con trampas', () => {
  it('un comprimido con rutas que salen de la carpeta se rechaza y no escribe nada en ningún lado', async () => {
    const folder = tempFolder();
    const file = join(folder, 'trampa-rutas.docx');
    writeFileSync(file, trapPathsZip());
    const around = dirname(folder);
    const before = everything(folder);
    const { space, service, materialId } = await addOne(file);
    expect(service.get({ materialId }).state).toEqual({ kind: 'error', problem: 'wordUnreadable' });
    expect(everything(folder)).toEqual(before);
    for (const name of [
      'fuera-de-retenia.txt',
      'raiz-de-retenia.txt',
      'unidad-de-retenia.txt',
      'barra-de-retenia.txt',
    ]) {
      expect(everything(space.dataDir).some((path) => path.endsWith(name))).toBe(false);
      expect(readdirSync(around)).not.toContain(name);
    }
  });

  it('un Word con entidades XML se rechaza', async () => {
    const folder = tempFolder();
    const file = join(folder, 'entidades.docx');
    writeFileSync(file, trapEntitiesDocx());
    const { service, materialId } = await addOne(file);
    expect(service.get({ materialId }).state).toEqual({ kind: 'error', problem: 'wordUnreadable' });
  });

  it('un Word «bomba» (más de 200 MB descomprimido) se rechaza sin descomprimirlo entero', async () => {
    const folder = tempFolder();
    const file = join(folder, 'bomba.docx');
    writeFileSync(file, trapBombDocx(210));
    const { service, materialId } = await addOne(file);
    expect(service.get({ materialId }).state).toEqual({ kind: 'error', problem: 'wordUnreadable' });
  });
});

describe('PDF con código', () => {
  it('se lee como dato: su texto llega a «Listo» y su JavaScript no hace nada', async () => {
    const calls: string[] = [];
    const server = createServer((request, response) => {
      calls.push(request.url ?? '');
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const folder = tempFolder();
      const file = join(folder, 'trampa-codigo.pdf');
      writeFileSync(file, trapCodePdf(`http://127.0.0.1:${port}/robo`));
      const { service, materialId } = await addOne(file);
      expect(service.get({ materialId }).state).toEqual({ kind: 'ready' });
      const texts = service.page({ materialId, unit: 1 }).blocks.map((block) => block.text);
      expect(texts).toContain('Un PDF con codigo adentro.');
      expect(calls).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('tamaño y tipo', () => {
  it('un archivo de más de 1 GB: «demasiado grande», sin leerlo ni copiarlo', async () => {
    expect(MAX_MATERIAL_BYTES).toBe(1024 * 1024 * 1024);
    const folder = tempFolder();
    const file = join(folder, 'trampa-gigante.pdf');
    // Se agranda sin escribir nada: el sistema no llega a llenar el disco.
    const handle = openSync(file, 'w');
    closeSync(handle);
    truncateSync(file, MAX_MATERIAL_BYTES + 1);
    const elapsed = systemStopwatch().start();
    const { space, service, materialId, executed } = await addOne(file);
    expect(elapsed()).toBeLessThan(5000);
    expect(service.get({ materialId }).state).toEqual({ kind: 'error', problem: 'tooLarge' });
    expect(executed).toEqual([]);
    expect(everything(join(space.dataDir, 'tmp'))).toEqual([]);
  });

  it('una foto con nombre de PDF no es un PDF: «Error», sin original guardado', async () => {
    const { space, service, materialId } = await addOne(copySample('campana.png', 'foto.pdf'));
    expect(service.get({ materialId }).state).toEqual({ kind: 'error', problem: 'notPdf' });
    expect(readRows(space.file, 'SELECT original_sha256 FROM materials')).toEqual([
      { original_sha256: null },
    ]);
  });
});
