# src/ai

Todo lo que habla con la IA: la compuerta, los prompts, las rúbricas y los verificadores. Es la única carpeta que usa el SDK de Anthropic (regla de capas R9). Llegó en la Fase 19.

- `gate.ts`: la compuerta. Recibe un puerto con operaciones solo sobre sus tablas (`src/core/ai/ports.ts`, que implementa `src/data/ai.ts`): no tiene cómo escribir en tarjetas, repasos, historial ni dominio.
- `provider.ts`: la interfaz de un proveedor (`complete`, `testConnection`) y sus errores. Otro proveedor se suma con un archivo nuevo en `providers/`.
- `providers/anthropic.ts`: el de Anthropic, con el SDK 0.133.0 (salida con esquema, sin reintentos propios, sin leer variables de entorno).
- `adapters/recorded.ts`: la IA simulada (respuestas grabadas, «responder mal», demora con reloj inyectado). La usan la demostración y la red de pruebas.
- `functions/explain-fragment.ts`: «Explicar un fragmento»: el esquema Zod de la salida, el armado del pedido y la verificación de citas y números.
- `prompts/`: el prompt de sistema fijo y versionado; `versiones.json` guarda la huella de cada versión (una prueba controla que no cambie sin subir la versión).
- `request.ts`, `schema-api.ts`, `parse.ts`: el pasaje delimitado como dato, el esquema que acepta la API y la lectura de la salida.
- `models.ts` y `precios.json`: el modelo de cada función y los precios con su fecha.

Las reglas puras (costo, tope, mes de Buenos Aires, citas, números, niveles de consecuencia, orden del pedido) viven en `src/core/ai/`.
