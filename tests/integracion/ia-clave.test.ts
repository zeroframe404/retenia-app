import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findSecret } from '../../tools/lib/buscar-clave.mjs';
import { TEST_KEY, testSecretBox } from '../apoyo/caja-segura';
import { closeSpaces } from '../apoyo/espacio';
import { type AiSpace, FIRST_SENTENCE, openAiSpace } from '../apoyo/ia';

// La clave de la IA (CA-168): se guarda solo cifrada por el almacén seguro (en estas pruebas, el
// doble declarado: AES con una clave fija de prueba) y nunca aparece en claro en la carpeta de datos
// (base, ajustes, lo de Chromium), en una copia, en una exportación ni en lo que llega a la ventana.

const spaces: AiSpace[] = [];
const folders: string[] = [];
async function open(options: Parameters<typeof openAiSpace>[0] = {}): Promise<AiSpace> {
  const space = await openAiSpace(options);
  spaces.push(space);
  return space;
}
function outside(): string {
  const folder = mkdtempSync(join(tmpdir(), 'retenia-clave-'));
  folders.push(folder);
  return folder;
}

afterEach(() => {
  for (const space of spaces.splice(0)) {
    space.bridge.close();
  }
  closeSpaces();
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe('[CA-168] la clave de la IA', () => {
  it('[CA-168] «Probar conexión» con la clave da «Conexión correcta» y la guarda cifrada (simulado)', async () => {
    const space = await open({ connected: false });
    const tested = await space.api['ai.testConnection']({ key: TEST_KEY });
    expect(tested).toMatchObject({
      result: 'ok',
      status: { provider: 'anthropic', keySaved: true, secureStorage: true },
    });
    expect(space.keysUsed).toEqual([TEST_KEY]);
    const stored = readFileSync(join(space.bridge.dataDir, 'clave.bin'));
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.includes(Buffer.from(TEST_KEY))).toBe(false);
    // Lo que vuelve a la ventana nunca la trae.
    expect(JSON.stringify(tested)).not.toContain(TEST_KEY);
    expect(JSON.stringify(await space.api['ai.status']({}))).not.toContain(TEST_KEY);
  });

  it('[CA-168] no aparece en ningún archivo de la carpeta de datos, en una copia ni en una exportación (simulado)', async () => {
    const space = await open();
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    await space.bridge.ai.drain();
    expect(asked.state).toBe('pending');
    await space.api['backups.createNow']({});
    const exportFile = join(outside(), 'Retenia.zip');
    space.bridge.answerDialogs({ save: exportFile });
    expect(await space.api['exports.all']({})).toMatchObject({ outcome: 'exported' });
    const hits = await findSecret(TEST_KEY, [space.bridge.dataDir, exportFile]);
    expect(hits).toEqual([]);
    // Ni un pedazo: los primeros y los últimos 12 caracteres tampoco.
    expect(await findSecret(TEST_KEY.slice(0, 12), [space.bridge.dataDir, exportFile])).toEqual([]);
    expect(await findSecret(TEST_KEY.slice(-12), [space.bridge.dataDir, exportFile])).toEqual([]);
  });

  it('[CA-168] el buscador sí la encuentra si estuviera en claro, también adentro de una copia o de un comprimido (simulado)', async () => {
    const folder = outside();
    const { writeFileSync } = await import('node:fs');
    const { gzipSync } = await import('node:zlib');
    writeFileSync(join(folder, 'suelta.txt'), `antes ${TEST_KEY} después`);
    writeFileSync(join(folder, 'copia.retenia-copia'), gzipSync(Buffer.from(TEST_KEY)));
    writeFileSync(join(folder, 'ancha.txt'), Buffer.from(TEST_KEY, 'utf16le'));
    const hits = await findSecret(TEST_KEY, [folder]);
    expect(
      hits.map((hit) => [hit.file.endsWith('.txt') || hit.file.endsWith('copia'), hit.inside]),
    ).toEqual([
      [true, null],
      [true, '(comprimido)'],
      [true, null],
    ]);
  });

  it('[CA-168] una clave que no funciona no se guarda (simulado)', async () => {
    const space = await open({ connected: false });
    space.remote.failConnection('auth');
    const tested = await space.api['ai.testConnection']({ key: TEST_KEY });
    expect(tested).toMatchObject({ result: 'invalid_key', status: { keySaved: false } });
    expect(existsSync(join(space.bridge.dataDir, 'clave.bin'))).toBe(false);
  });

  it('[CA-168] sin conexión tampoco se guarda, y lo dice (simulado)', async () => {
    const space = await open({ connected: false });
    space.net.setOffline(true);
    expect((await space.api['ai.testConnection']({ key: TEST_KEY })).result).toBe('offline');
    expect(existsSync(join(space.bridge.dataDir, 'clave.bin'))).toBe(false);
  });

  it('[CA-168] si Windows no puede cifrarla, no se guarda en ningún lado y la IA queda apagada (simulado)', async () => {
    const space = await open({ connected: false, box: testSecretBox({ available: false }) });
    const tested = await space.api['ai.testConnection']({ key: TEST_KEY });
    expect(tested).toMatchObject({
      result: 'insecure',
      status: { provider: 'none', keySaved: false, secureStorage: false },
    });
    expect(existsSync(join(space.bridge.dataDir, 'clave.bin'))).toBe(false);
    expect(await findSecret(TEST_KEY, [space.bridge.dataDir])).toEqual([]);
  });

  it('[CA-168] «Borrar clave» la saca y la IA queda sin conectar (simulado)', async () => {
    const space = await open();
    const status = await space.api['ai.deleteKey']({});
    expect(status).toMatchObject({ provider: 'none', keySaved: false });
    expect(existsSync(join(space.bridge.dataDir, 'clave.bin'))).toBe(false);
  });

  it('[CA-168] una clave con espacios se rechaza sin repetirla en el error', async () => {
    const space = await open({ connected: false });
    const pasted = `${TEST_KEY} con espacios`;
    await expect(space.api['ai.testConnection']({ key: pasted })).rejects.toThrow(
      /^(?!.*sk-ant).*$/s,
    );
  });
});
