# Decisiones técnicas

Acá se anotan las decisiones técnicas que toma Claude Code, con fecha y el motivo en una línea.

## 13/10/2026 · Semilla

- Las cinco órdenes existen desde ya en un `package.json` mínimo, sin dependencias, y responden «todavía no disponible: llega en la Fase 02». Así los permisos previos ya apuntan a órdenes reales.
- Git usa el nombre `zeroframe404` solo dentro de este proyecto, sin tocar la configuración global.
- Saltos de línea: Git convierte a formato Windows al bajar y a formato universal al subir (`core.autocrlf=true`).
- La carpeta `build/` no está en `.gitignore` porque electron-builder suele guardar ahí íconos del instalador; se ignoran `dist/`, `out/` y `release/`.
- El repositorio se llama `retenia-app` porque `retenia` ya existía en tu cuenta (creado el 18/09/2026, solo con un README.md). Ese no se tocó.
