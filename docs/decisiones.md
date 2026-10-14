# Decisiones técnicas

Acá se anotan las decisiones técnicas que toma Claude Code, con fecha y el motivo en una línea.

## 13/10/2026 · Semilla

- Las cinco órdenes existen desde ya en un `package.json` mínimo, sin dependencias, y responden «todavía no disponible: llega en la Fase 02». Así los permisos previos ya apuntan a órdenes reales.
- Git usa el nombre `zeroframe404` solo dentro de este proyecto, sin tocar la configuración global.
- Saltos de línea: Git convierte a formato Windows al bajar y a formato universal al subir (`core.autocrlf=true`).
- La carpeta `build/` no está en `.gitignore` porque electron-builder suele guardar ahí íconos del instalador; se ignoran `dist/`, `out/` y `release/`.
- El repositorio se llama `retenia-app` porque `retenia` ya existía en tu cuenta (creado el 18/09/2026, solo con un README.md). Ese no se tocó.

## 13/10/2026 · Fase 00

- La especificación vive en `docs/especificacion/` en ocho archivos Markdown, uno por tema, para que cada fase lea solo el que necesita y los cambios se vean renglón por renglón en los pull requests.
- Cada criterio va en tres renglones (Dado / cuando / entonces) con su identificador en negrita (`- **CA-NNN**`), para que un script pueda contarlos, detectar huecos y, desde la Fase 02, cruzarlos con las pruebas que los cubren.
- Los números que no cerraban se cerraron con reglas explícitas (estimación de duración con 1 minuto fijo, escenarios fijos de la meta, intervalo de Wilson, mayor resto para las hebras); están en la sección 4 de `decisiones-conciliadas.md` y se pueden revisar si la medición real de una fase no se parece.
- El motor de memoria usa FSRS-6 (ts-fsrs) sin pasos de aprendizaje de corto plazo: los pasos harían que una tarjeta nueva volviera en minutos y los criterios piden días. La repetición dentro de la sesión la maneja Retenia.
- Las fórmulas se muestran con una biblioteca de render matemático que no ejecuta nada (KaTeX o equivalente, se confirma en la Fase 01); el texto de la fórmula es dato.
- Las imágenes pegadas se guardan como archivos dentro de la carpeta de datos, con nombre por huella, y el apunte las referencia; así entran en copias y exportaciones sin duplicarse.
- Los enlaces entre notas se guardan por identificador, no por nombre, para que renombrar una nota no los rompa (CA-376).
- Las pruebas manuales de cada fase se guardan en `docs/pruebas-manuales/fase-NN.md`, con una tabla de registro para anotar el resultado.
