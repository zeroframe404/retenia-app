import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../src/data/ids';
import { closeSpaces } from '../apoyo/espacio';
import {
  type AiSpace,
  explanation,
  FIRST_SENTENCE,
  MATERIAL_TEXT,
  openAiSpace,
  TRAP_TEXT,
} from '../apoyo/ia';

// La compuerta de IA de punta a punta del lado del principal (Fase 19): el puente real, la base
// real y un material leído de verdad; la IA es la simulada (doble declarado), «como IA remota» para
// probar permiso, costo, tope y «Qué se envió». Ningún camino deja que la IA escriba en el
// historial, en los repasos ni en el dominio: la huella de todo lo que no es de la compuerta no
// cambia.

const spaces: AiSpace[] = [];
async function open(options: Parameters<typeof openAiSpace>[0] = {}): Promise<AiSpace> {
  const space = await openAiSpace(options);
  spaces.push(space);
  return space;
}

afterEach(() => {
  for (const space of spaces.splice(0)) {
    space.bridge.close();
  }
  closeSpaces();
});

// Pide la explicación de un pasaje, con permiso «Solo esta vez», y espera la respuesta.
async function explainOnce(space: AiSpace, text = FIRST_SENTENCE) {
  const asked = await space.api['ai.explain']({
    materialId: space.materialId,
    selection: space.select(text),
    permission: 'once',
  });
  await space.bridge.ai.drain();
  if (asked.state !== 'pending') {
    return asked;
  }
  return space.api['ai.outcome']({ requestId: asked.requestId });
}

describe('[CA-167] sin IA conectada', () => {
  it('[CA-167] las funciones de IA dicen que hay que conectarla y no se manda nada (simulado)', async () => {
    const space = await open({ connected: false });
    const before = space.learningPrint();
    const outcome = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
    });
    expect(outcome).toMatchObject({ state: 'blocked', reason: 'not_connected' });
    expect(space.remote.calls).toHaveLength(0);
    expect(space.rows('ai_queue')).toHaveLength(0);
    expect(space.learningPrint()).toBe(before);
    expect((await space.api['ai.status']({})).provider).toBe('none');
  });
});

describe('[CA-170] «Modo solo local»', () => {
  it('[CA-170] nada sale de la PC: el pedido no se arma, no queda renglón y lo dice (simulado)', async () => {
    const space = await open();
    await space.api['ai.setLocalOnly']({ on: true });
    const outcome = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    await space.bridge.ai.drain();
    expect(outcome).toMatchObject({ state: 'blocked', reason: 'local_only' });
    expect(space.remote.calls).toHaveLength(0);
    expect(space.rows('ai_queue')).toHaveLength(0);
    expect(space.rows('ai_requests')).toHaveLength(0);
    expect((await space.api['ai.sentLog']({})).rows).toEqual([]);
  });

  it('[CA-170] también corta lo que ya estaba guardado y la prueba de conexión (simulado)', async () => {
    const space = await open();
    expect(await explainOnce(space)).toMatchObject({ state: 'done' });
    await space.api['ai.setLocalOnly']({ on: true });
    const again = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
    });
    expect(again).toMatchObject({ state: 'blocked', reason: 'local_only' });
    expect((await space.api['ai.testConnection']({})).result).toBe('local_only');
    expect(space.remote.calls).toHaveLength(1);
  });

  it('[CA-170] al prenderlo, lo que estaba pendiente se cancela y no sale nunca (simulado)', async () => {
    const space = await open();
    space.net.setOffline(true);
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    expect(asked).toMatchObject({ state: 'pending', reason: 'offline' });
    await space.api['ai.setLocalOnly']({ on: true });
    space.net.setOffline(false);
    await space.bridge.ai.drain();
    if (asked.state !== 'pending') {
      throw new Error('no quedó pendiente');
    }
    expect(await space.api['ai.outcome']({ requestId: asked.requestId })).toMatchObject({
      state: 'failed',
      reason: 'cancelled',
    });
    expect(space.remote.calls).toHaveLength(0);
  });

  it('[CA-170] una página web que se agrega con «Modo solo local» queda pendiente y dice por qué (simulado)', async () => {
    const space = await open();
    await space.api['ai.setLocalOnly']({ on: true });
    const added = await space.api['materials.addUrl']({
      subjectId: space.subjectId,
      address: 'https://example.com/apunte',
    });
    if (added.outcome !== 'added') {
      throw new Error('no se agregó la página');
    }
    await space.bridge.materials.whenIdle();
    const detail = await space.api['materials.get']({ materialId: added.materialId });
    expect(detail.state).toEqual({ kind: 'pendingNetwork', localOnly: true });
    const listed = await space.api['materials.list']({ subjectId: space.subjectId });
    expect(listed.materials.find((item) => item.id === added.materialId)?.state).toEqual({
      kind: 'pendingNetwork',
      localOnly: true,
    });
  });

  it('[CA-170] la puerta a internet también corta las páginas web y lo demás (simulado)', async () => {
    const space = await open();
    await space.api['ai.setLocalOnly']({ on: true });
    expect(space.net.isOffline()).toBe(true);
    await expect(space.net.fetch('https://example.com/')).rejects.toThrow();
    await space.api['ai.setLocalOnly']({ on: false });
    expect(space.net.isOffline()).toBe(false);
  });
});

describe('[CA-172] el permiso por material', () => {
  it('[CA-172] la primera vez pregunta, sin mandar nada todavía (simulado)', async () => {
    const space = await open();
    const outcome = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
    });
    expect(outcome).toEqual({ state: 'needs_permission' });
    expect(space.remote.calls).toHaveLength(0);
    expect(space.rows('ai_queue')).toHaveLength(0);
  });

  it('[CA-172] «Solo esta vez» manda una vez y la próxima vuelve a preguntar (simulado)', async () => {
    const space = await open();
    expect(await explainOnce(space)).toMatchObject({ state: 'done' });
    const next = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select('Cuando la muestra crece, la estimación varía menos.'),
    });
    expect(next).toEqual({ state: 'needs_permission' });
    expect((await space.api['ai.permissions']({})).rows).toEqual([]);
  });

  it('[CA-172] «Siempre para este material» queda guardado y no vuelve a preguntar (simulado)', async () => {
    const space = await open();
    await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'always',
    });
    await space.bridge.ai.drain();
    const next = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select('Cuando la muestra crece, la estimación varía menos.'),
    });
    expect(next).toMatchObject({ state: 'pending' });
    expect((await space.api['ai.permissions']({})).rows).toEqual([
      { materialId: space.materialId, title: 'Apunte de inferencia.md', scope: 'always' },
    ]);
    // «Quitar permiso» vuelve a la pregunta.
    await space.api['ai.revokePermission']({ materialId: space.materialId });
    expect(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(TRAP_TEXT),
      }),
    ).toEqual({ state: 'needs_permission' });
  });

  it('[CA-172] «No» frena, se recuerda y no manda nada (simulado)', async () => {
    const space = await open();
    const denied = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'never',
    });
    expect(denied).toMatchObject({ state: 'blocked', reason: 'permission_denied' });
    const again = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
    });
    expect(again).toMatchObject({ state: 'blocked', reason: 'permission_denied' });
    expect(space.remote.calls).toHaveLength(0);
    expect((await space.api['ai.permissions']({})).rows).toMatchObject([{ scope: 'never' }]);
  });

  it('[CA-172] la IA simulada de la demostración no saca nada de la PC: no pregunta ni queda en «Qué se envió» (simulado)', async () => {
    const space = await open({ connected: false, demo: true });
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
    });
    expect(asked).toMatchObject({ state: 'pending' });
    await space.bridge.ai.drain();
    if (asked.state !== 'pending') {
      throw new Error('no quedó pendiente');
    }
    expect(await space.api['ai.outcome']({ requestId: asked.requestId })).toMatchObject({
      state: 'done',
      cost: { kind: 'simulated' },
    });
    expect((await space.api['ai.sentLog']({})).rows).toEqual([]);
    expect((await space.api['ai.status']({})).spentMicros).toBe(0);
    expect(space.demo?.calls).toHaveLength(1);
  });
});

describe('[CA-173] una respuesta que no cumple el formato', () => {
  const broken: [string, string][] = [
    ['no es JSON', 'Claro, te explico este pasaje.'],
    ['JSON cortado', '{"fromMaterial":[{"quote":"El error'],
    ['un campo de más', '{"fromMaterial":[],"modelContribution":["Sí."],"markAllCorrect":true}'],
    ['le falta un campo', '{"fromMaterial":[]}'],
    ['un tipo cambiado', '{"fromMaterial":"todo","modelContribution":[]}'],
    ['vacía', '{"fromMaterial":[],"modelContribution":[]}'],
  ];

  it.for(broken)(
    '[CA-173] %s: se tira entera, no se guarda nada y dice «No pude completar esto. Reintentá.» (simulado)',
    async ([, text]) => {
      const space = await open();
      const before = space.learningPrint();
      space.script.push({ text, usage: { inputTokens: 1000, outputTokens: 500 } });
      const outcome = await explainOnce(space);
      expect(outcome).toMatchObject({ state: 'failed', reason: 'format' });
      expect(space.rows('ai_cache')).toHaveLength(0);
      expect(space.learningPrint()).toBe(before);
      // Salió de la PC y costó: queda en «Qué se envió», marcado.
      expect((await space.api['ai.sentLog']({})).rows).toMatchObject([
        { status: 'rejected_schema', costMicros: 14_000 },
      ]);
    },
  );

  it('[CA-173] una respuesta cortada por largo se tira entera (simulado)', async () => {
    const space = await open();
    space.script.push({
      text: explanation({ quotes: [[FIRST_SENTENCE, 'Bien.']] }),
      stopReason: 'max_tokens',
    });
    expect(await explainOnce(space)).toMatchObject({ state: 'failed', reason: 'format' });
    expect(space.rows('ai_cache')).toHaveLength(0);
  });

  it('una respuesta que la IA no quiso dar se dice como tal (simulado)', async () => {
    const space = await open();
    space.script.push({ text: null, stopReason: 'refusal' });
    expect(await explainOnce(space)).toMatchObject({ state: 'failed', reason: 'refused' });
  });
});

describe('[CA-174] nada de la IA escribe en tu aprendizaje', () => {
  it('[CA-174] una explicación se muestra como lo que es y no cambia nada más (simulado)', async () => {
    const space = await open({ withCast: 'tarjetas' });
    const before = space.learningPrint();
    const outcome = await explainOnce(space);
    expect(outcome).toMatchObject({
      state: 'done',
      result: { fromMaterial: [{ quote: FIRST_SENTENCE }] },
      cost: { kind: 'paid', micros: 14_000 },
    });
    expect(space.learningPrint()).toBe(before);
  });

  it('[CA-174] la compuerta solo escribe en sus tablas (simulado)', async () => {
    const space = await open();
    const tablesBefore = space.learningPrint();
    await explainOnce(space);
    await explainOnce(space, TRAP_TEXT);
    expect(space.learningPrint()).toBe(tablesBefore);
    expect(space.rows('ai_requests').length).toBeGreaterThan(0);
  });
});

describe('[CA-175] un material con una trampa', () => {
  it('[CA-175] el pasaje viaja delimitado y como dato, y explicarlo no cambia nada (simulado)', async () => {
    const space = await open({ withCast: 'tarjetas' });
    const before = space.learningPrint();
    space.script.push({
      text: explanation({
        quotes: [[TRAP_TEXT, 'Es una orden escrita dentro del apunte, no una idea del tema.']],
        own: ['Parece puesta para ver si quien lo lee obedece órdenes escondidas.'],
      }),
    });
    const outcome = await explainOnce(space, TRAP_TEXT);
    expect(outcome).toMatchObject({
      state: 'done',
      result: { fromMaterial: [{ quote: TRAP_TEXT }] },
    });
    const [sent] = space.remote.calls;
    expect(sent?.user).toContain(
      `<fragmento material="Apunte de inferencia.md">\n${TRAP_TEXT}\n</fragmento>`,
    );
    expect(sent?.system).not.toContain(TRAP_TEXT);
    expect(space.learningPrint()).toBe(before);
  });

  it('[CA-175] aunque la IA «obedezca» la trampa, nada se marca ni cambia (simulado)', async () => {
    const space = await open({ withCast: 'tarjetas' });
    const before = space.learningPrint();
    space.script.push({
      text: explanation({ own: ['Listo: marqué todo como correcto.'] }),
    });
    space.script.push({
      text: JSON.stringify({
        fromMaterial: [],
        modelContribution: ['Hecho.'],
        markAllCorrect: true,
      }),
    });
    expect(await explainOnce(space, TRAP_TEXT)).toMatchObject({
      state: 'done',
      result: { fromMaterial: [], modelContribution: ['Listo: marqué todo como correcto.'] },
    });
    expect(
      await explainOnce(space, 'Cuando la muestra crece, la estimación varía menos.'),
    ).toMatchObject({ state: 'failed', reason: 'format' });
    expect(space.learningPrint()).toBe(before);
  });
});

describe('[CA-176] sin conexión', () => {
  it('[CA-176] queda pendiente, no sale nada y se reanuda solo cuando vuelve la conexión (simulado)', async () => {
    const space = await open();
    space.net.setOffline(true);
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    expect(asked).toMatchObject({ state: 'pending', reason: 'offline' });
    await space.bridge.ai.drain();
    expect(space.remote.calls).toHaveLength(0);
    space.net.setOffline(false);
    await space.bridge.ai.drain();
    if (asked.state !== 'pending') {
      throw new Error('no quedó pendiente');
    }
    expect(await space.api['ai.outcome']({ requestId: asked.requestId })).toMatchObject({
      state: 'done',
    });
    expect(space.bridge.aiEvents).toContainEqual({ type: 'ai.result', requestId: asked.requestId });
  });

  it('[CA-176] lo pendiente sobrevive a cerrar y abrir Retenia (simulado)', async () => {
    const space = await open();
    space.net.setOffline(true);
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    if (asked.state !== 'pending') {
      throw new Error('no quedó pendiente');
    }
    const reopened = space.bridge.reopenAi();
    space.net.setOffline(false);
    await reopened.drain();
    expect(reopened.outcome({ requestId: asked.requestId })).toMatchObject({ state: 'done' });
  });

  it('[CA-176] un error técnico se reintenta solo hasta 3 veces y después se dice como error técnico (simulado)', async () => {
    const space = await open();
    space.script.push({ error: 'server' }, { error: 'busy' });
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    if (asked.state !== 'pending') {
      throw new Error('no quedó pendiente');
    }
    await space.bridge.ai.drain();
    expect(await space.api['ai.outcome']({ requestId: asked.requestId })).toMatchObject({
      state: 'pending',
      reason: 'retrying',
    });
    await space.bridge.ai.drain();
    await space.bridge.ai.drain();
    expect(await space.api['ai.outcome']({ requestId: asked.requestId })).toMatchObject({
      state: 'done',
    });
    space.script.push({ error: 'server' }, { error: 'server' }, { error: 'timeout' });
    const failing = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(TRAP_TEXT),
      permission: 'once',
    });
    if (failing.state !== 'pending') {
      throw new Error('no quedó pendiente');
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      await space.bridge.ai.drain();
    }
    expect(await space.api['ai.outcome']({ requestId: failing.requestId })).toMatchObject({
      state: 'failed',
      reason: 'technical',
    });
    expect(space.remote.calls).toHaveLength(6);
  });

  it('[CA-176] mientras la IA tarda se puede seguir estudiando (simulado)', async () => {
    const latch = Promise.withResolvers<void>();
    const held = latch.promise;
    const release = () => latch.resolve();
    const space = await open({ withCast: 'tarjetas', hold: () => held });
    const asked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    expect(asked).toMatchObject({ state: 'pending', reason: 'sending' });
    const sessionId = newId();
    const session = await space.api['study.start']({ sessionId });
    expect(session.progress.total).toBeGreaterThan(0);
    expect(session.current).not.toBeNull();
    const graded = await space.api['study.grade']({
      sessionId,
      activityId: session.current?.activityId ?? '',
      attemptId: newId(),
      grade: 'good',
      answer: null,
    });
    expect(graded.progress.done).toBe(1);
    expect(
      await space.api['ai.outcome']({
        requestId: asked.state === 'pending' ? asked.requestId : '',
      }),
    ).toMatchObject({ state: 'pending' });
    release();
    await space.bridge.ai.drain();
  });
});

describe('lo que encontró el revisor: lo que pudo salir de la PC', () => {
  const pending = (outcome: { state: string; requestId?: string }) => {
    if (outcome.state !== 'pending' || outcome.requestId === undefined) {
      throw new Error('no quedó pendiente');
    }
    return outcome.requestId;
  };

  it('[CA-171] un pedido que pudo haber llegado a la IA (la conexión se cortó después de mandarlo) queda en «Qué se envió», cuenta lo máximo que pudo costar y se reintenta hasta 3 veces (simulado)', async () => {
    const space = await open();
    space.script.push({ error: 'connection' }, { error: 'connection' }, { error: 'connection' });
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'once',
      }),
    );
    for (let round = 0; round < 5; round++) {
      await space.bridge.ai.drain();
    }
    expect(await space.api['ai.outcome']({ requestId })).toMatchObject({
      state: 'failed',
      reason: 'technical',
    });
    expect(space.remote.calls).toHaveLength(3);
    const { rows } = await space.api['ai.sentLog']({});
    expect(rows.map((row) => row.status)).toEqual(['unanswered', 'unanswered', 'unanswered']);
    expect(rows.every((row) => row.costMicros > 0)).toBe(true);
    expect((await space.api['ai.status']({})).spentMicros).toBe(
      rows.reduce((sum, row) => sum + row.costMicros, 0),
    );
  });

  it('[CA-171] con el adaptador de Anthropic, si la red corta el pedido con la conexión andando, no se reenvía sin fin y queda en «Qué se envió» (simulado)', async () => {
    const posts: string[] = [];
    const space = await open({
      anthropicFetch: async (input, init) => {
        if ((init?.method ?? 'GET') === 'GET') {
          return new Response(
            JSON.stringify({
              type: 'model',
              id: 'claude-opus-5-5',
              display_name: 'Claude Opus 5.5',
              created_at: '2026-01-01T00:00:00Z',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        posts.push(String(input));
        throw new TypeError('fetch failed', { cause: new Error('other side closed') });
      },
    });
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'once',
      }),
    );
    for (let round = 0; round < 5; round++) {
      await space.bridge.ai.drain();
    }
    expect(posts).toHaveLength(3);
    expect(await space.api['ai.outcome']({ requestId })).toMatchObject({
      state: 'failed',
      reason: 'technical',
    });
    expect((await space.api['ai.sentLog']({})).rows).toHaveLength(3);
  });

  it('[CA-171] un pedido que se estaba mandando cuando se cerró Retenia queda en «Qué se envió» con lo máximo que pudo costar y cuenta como un intento (simulado)', async () => {
    let holding = true;
    const never = new Promise<void>(() => undefined);
    const space = await open({ hold: () => (holding ? never : Promise.resolve()) });
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'once',
      }),
    );
    void space.bridge.ai.drain();
    await vi.waitFor(() => expect(space.remote.calls).toHaveLength(1));
    // Se corta Retenia con el pedido en camino; al volver a abrir, sigue.
    holding = false;
    const reopened = space.bridge.reopenAi();
    reopened.start();
    await reopened.drain();
    expect(reopened.outcome({ requestId })).toMatchObject({ state: 'done' });
    const { rows } = await space.api['ai.sentLog']({});
    expect(rows.map((row) => row.status).sort()).toEqual(['ok', 'unanswered']);
    expect(rows.find((row) => row.status === 'unanswered')?.costMicros).toBeGreaterThan(0);
    reopened.stop();
  });
});

describe('lo que encontró el revisor: lo que espera en la cola', () => {
  const pending = (outcome: { state: string; requestId?: string }) => {
    if (outcome.state !== 'pending' || outcome.requestId === undefined) {
      throw new Error('no quedó pendiente');
    }
    return outcome.requestId;
  };

  it('[CA-172] quitar el permiso frena lo que esperaba la conexión: no sale (simulado)', async () => {
    const space = await open();
    space.net.setOffline(true);
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'always',
      }),
    );
    await space.api['ai.revokePermission']({ materialId: space.materialId });
    space.net.setOffline(false);
    await space.bridge.ai.drain();
    expect(space.remote.calls).toHaveLength(0);
    expect(await space.api['ai.outcome']({ requestId })).toMatchObject({
      state: 'failed',
      reason: 'cancelled_permission',
    });
  });

  it('suspender la función frena lo que esperaba la conexión: no sale (simulado)', async () => {
    const space = await open();
    space.net.setOffline(true);
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'once',
      }),
    );
    await space.api['ai.setFunctionState']({ functionId: 'explain_fragment', suspended: true });
    space.net.setOffline(false);
    await space.bridge.ai.drain();
    expect(space.remote.calls).toHaveLength(0);
    expect(await space.api['ai.outcome']({ requestId })).toMatchObject({
      state: 'failed',
      reason: 'cancelled_suspended',
    });
  });

  it('[CA-172] si cambia la IA conectada mientras un pedido espera, se cancela: no sale por otra IA sin preguntar ni se guarda con la huella de otra (simulado)', async () => {
    const space = await open({ demo: true });
    space.net.setOffline(true);
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
      }),
    );
    space.setDemo(false);
    space.net.setOffline(false);
    await space.bridge.ai.drain();
    expect(space.remote.calls).toHaveLength(0);
    expect(await space.api['ai.outcome']({ requestId })).toMatchObject({
      state: 'failed',
      reason: 'cancelled_ai_changed',
    });
    expect((await space.api['ai.sentLog']({})).rows).toHaveLength(0);
  });

  it('lo mismo pedido dos veces mientras va en camino no se paga dos veces: el segundo pedido espera al primero (simulado)', async () => {
    const latch = Promise.withResolvers<void>();
    const space = await open({ hold: () => latch.promise });
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'always',
      }),
    );
    const draining = space.bridge.ai.drain();
    await vi.waitFor(() => expect(space.remote.calls).toHaveLength(1));
    expect(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
      }),
    ).toMatchObject({ state: 'pending', requestId });
    latch.resolve();
    await draining;
    await space.bridge.ai.drain();
    expect(space.remote.calls).toHaveLength(1);
    expect((await space.api['ai.sentLog']({})).rows).toHaveLength(1);
  });

  it('cancelar un pedido que ya está en camino lo deja cancelado: no se reintenta ni se muestra, y queda en «Qué se envió» (simulado)', async () => {
    const latch = Promise.withResolvers<void>();
    const space = await open({ hold: () => latch.promise });
    const requestId = pending(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'once',
      }),
    );
    const draining = space.bridge.ai.drain();
    await vi.waitFor(() => expect(space.remote.calls).toHaveLength(1));
    await space.api['ai.cancel']({ requestId });
    latch.resolve();
    await draining;
    await space.bridge.ai.drain();
    expect(await space.api['ai.outcome']({ requestId })).toMatchObject({
      state: 'failed',
      reason: 'cancelled',
    });
    expect(space.remote.calls).toHaveLength(1);
    expect((await space.api['ai.sentLog']({})).rows).toHaveLength(1);
  });

  it('[CA-170] con «Modo solo local» ni siquiera se lee el pasaje: se corta antes de armar el pedido (simulado)', async () => {
    const space = await open();
    await space.api['ai.setLocalOnly']({ on: true });
    expect(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: {
          from: { blockId: newId(), offset: 0 },
          to: { blockId: newId(), offset: 5 },
        },
      }),
    ).toMatchObject({ state: 'blocked', reason: 'local_only' });
  });
});

describe('lo que encontró el revisor: restaurar una copia', () => {
  it('[CA-169] [CA-171] restaurar una copia no borra «Qué se envió» ni lo gastado en el mes (simulado)', async () => {
    const space = await open();
    const copy = await space.api['backups.createNow']({});
    await explainOnce(space);
    await explainOnce(space, TRAP_TEXT);
    const spent = (await space.api['ai.status']({})).spentMicros;
    const sent = (await space.api['ai.sentLog']({})).rows;
    expect(sent).toHaveLength(2);
    await space.api['backups.restore']({ backupId: copy.created.id });
    expect((await space.api['ai.status']({})).spentMicros).toBe(spent);
    expect((await space.api['ai.sentLog']({})).rows).toEqual(sent);
  });
});

describe('[CA-177] una cita que no está en el material', () => {
  it('[CA-177] se muestra como «Aporte del modelo, no verificado» y nunca como cita (simulado)', async () => {
    const space = await open();
    space.script.push({
      text: explanation({
        quotes: [
          ['El error estándar es la varianza dividida por n.', 'Una cita inventada.'],
          [FIRST_SENTENCE, 'Dice cómo se calcula.'],
        ],
      }),
    });
    const outcome = await explainOnce(space, `${FIRST_SENTENCE} Con n = 25 y s = 10, da 2.`);
    expect(outcome).toMatchObject({
      state: 'done',
      result: {
        fromMaterial: [{ quote: FIRST_SENTENCE, start: 0 }],
        modelContribution: ['Una cita inventada.'],
      },
    });
    expect(JSON.stringify(outcome)).not.toContain('la varianza dividida por n');
  });
});

describe('[CA-169] el tope del mes', () => {
  // Cada respuesta cuesta USD 2 (500.000 unidades de entrada a USD 4 el millón).
  const twoDollars = () => ({
    text: explanation({ own: ['Un aporte.'] }),
    usage: { inputTokens: 500_000, outputTokens: 0 },
  });

  it('[CA-169] avisa al 80 % y frena al 100 % con el contador del mes (simulado)', async () => {
    const space = await open();
    const sentences = [
      'Error estándar',
      FIRST_SENTENCE,
      TRAP_TEXT,
      'Cuando la muestra crece, la estimación varía menos.',
      'Con n = 25 y s = 10, da 2.',
    ];
    const outcomes = [];
    for (const sentence of sentences) {
      space.script.push(twoDollars());
      outcomes.push(await explainOnce(space, sentence));
    }
    expect(outcomes[3]).toMatchObject({ state: 'done', percentUsed: 80 });
    expect(await space.api['ai.status']({})).toMatchObject({
      spentMicros: 10_000_000,
      capCents: 1000,
      capState: 'reached',
    });
    const blocked = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
      permission: 'once',
    });
    expect(blocked).toEqual({
      state: 'blocked',
      reason: 'cap_reached',
      spentMicros: 10_000_000,
      capCents: 1000,
    });
    expect(space.remote.calls).toHaveLength(5);
  });

  it('[CA-169] frena antes si la consulta siguiente podría pasar el tope (simulado)', async () => {
    const space = await open();
    await space.api['ai.setCap']({ capCents: 1 });
    // Una consulta de USD 0,014 ya deja el mes en USD 0,014 de 0,01.
    expect(await explainOnce(space)).toMatchObject({ state: 'blocked', reason: 'cap_reached' });
    expect(space.remote.calls).toHaveLength(0);
  });
});

describe('lo ya preguntado no se vuelve a pagar', () => {
  it('la misma pregunta sale de lo guardado, sin costo y sin mandar nada (simulado)', async () => {
    const space = await open();
    expect(await explainOnce(space)).toMatchObject({ state: 'done', cost: { kind: 'paid' } });
    const again = await space.api['ai.explain']({
      materialId: space.materialId,
      selection: space.select(FIRST_SENTENCE),
    });
    expect(again).toMatchObject({ state: 'done', cost: { kind: 'cached' } });
    expect(space.remote.calls).toHaveLength(1);
    expect((await space.api['ai.sentLog']({})).rows).toHaveLength(1);
  });
});

describe('[CA-171] «Qué se envió»', () => {
  it('[CA-171] cada envío queda con su fecha, la función, el material, la cantidad de fragmentos y el costo (simulado)', async () => {
    const space = await open();
    await explainOnce(space);
    expect((await space.api['ai.sentLog']({})).rows).toEqual([
      {
        id: expect.any(String),
        day: '2027-03-15',
        purpose: 'explain_fragment',
        materialTitle: 'Apunte de inferencia.md',
        fragmentCount: 1,
        costMicros: 14_000,
        status: 'ok',
      },
    ]);
  });

  it('[CA-171] un material que vino de un archivo figura con el nombre del archivo, como «Inferencia — capítulos 1 a 4.pdf»; uno pegado, con su título (simulado)', async () => {
    const fromFile = await open({ fileName: 'Apunte de muestreo.md' });
    await explainOnce(fromFile);
    expect((await fromFile.api['ai.sentLog']({})).rows.map((row) => row.materialTitle)).toEqual([
      'Apunte de muestreo.md',
    ]);
    const pasted = await open({ title: 'Lo que pegué' });
    await explainOnce(pasted);
    expect((await pasted.api['ai.sentLog']({})).rows.map((row) => row.materialTitle)).toEqual([
      'Lo que pegué',
    ]);
  });

  it('[CA-171] el registro solo se agrega: no se puede cambiar ni borrar (simulado)', async () => {
    const space = await open();
    await explainOnce(space);
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(space.bridge.file);
    try {
      expect(() => db.prepare('UPDATE ai_requests SET usd_micros = 0').run()).toThrow();
      expect(() => db.prepare('DELETE FROM ai_requests').run()).toThrow();
    } finally {
      db.close();
    }
  });

  it('el registro no guarda el texto del pasaje ni la respuesta, y las trazas se borran a los 90 días (simulado)', async () => {
    const space = await open();
    await explainOnce(space);
    const stored = JSON.stringify([space.rows('ai_requests'), space.rows('ai_traces')]);
    expect(stored).not.toContain('s / raíz(n)');
    expect(stored).not.toContain('Dice cómo se calcula');
    expect(space.rows('ai_traces').length).toBeGreaterThan(0);
    const later = space.bridge.reopenAi({ days: 91 });
    later.start();
    later.stop();
    expect(space.rows('ai_traces')).toHaveLength(0);
    expect(space.rows('ai_requests')).toHaveLength(1);
  });
});

describe('el estado de cada función', () => {
  it('una función suspendida no manda nada hasta que la habilitás (simulado)', async () => {
    const space = await open();
    const status = await space.api['ai.setFunctionState']({
      functionId: 'explain_fragment',
      suspended: true,
    });
    expect(status.functions).toEqual([{ id: 'explain_fragment', state: 'suspended' }]);
    expect(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(FIRST_SENTENCE),
        permission: 'once',
      }),
    ).toMatchObject({ state: 'blocked', reason: 'suspended' });
    await space.api['ai.setFunctionState']({ functionId: 'explain_fragment', suspended: false });
    expect(await explainOnce(space)).toMatchObject({ state: 'done' });
  });

  it('un pasaje de más de 4.000 letras no se manda (simulado)', async () => {
    const long = `${'Una oración larga sobre muestras y poblaciones. '.repeat(90)}Fin.`;
    const space = await open({ text: `${MATERIAL_TEXT}\n\n${long}` });
    expect(
      await space.api['ai.explain']({
        materialId: space.materialId,
        selection: space.select(long.trim()),
        permission: 'once',
      }),
    ).toMatchObject({ state: 'blocked', reason: 'too_long' });
  });
});
