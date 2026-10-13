# Estado del proyecto

**Fase 02 en revisión.** La red de pruebas y una ventana vacía están construidas: `npm run verificar` y `npm run verificar:todo` dan VERDE con los 8 criterios de H-01 cubiertos. Falta que hagas las pruebas manuales M02.1 a M02.9 (`docs/pruebas-manuales/fase-02.md`). Siguen pendientes tus lecturas de las Fases 00 y 01.

| Fase | Estado |
|---|---|
| Semilla | Hecha (13/10/2026) |
| 00 · Especificación en el repositorio | En revisión: pull request abierto, falta tu lectura |
| 01 · Arquitectura y plan de pruebas | En revisión: pull request abierto (rama `fase-01` sobre `fase-00`), falta tu lectura |
| 02 · Andamiaje y red de pruebas | En revisión: pull request abierto (rama `fase-02` sobre `fase-01`), faltan tus pruebas manuales |
| 03 · Esqueleto caminante instalable | Sigue después de cerrar la 02 |

Orden para cerrar: fusionar la 00, después la 01, después la 02, poniendo en cada una su tag `fase-NN-ok`.

## Qué hay hoy

- `npm run iniciar`: abre Retenia en modo demostración, con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027».
- `npm run verificar`: la red rápida (formato y linter, tipos, capas, código muerto, secretos, pruebas unitarias, de propiedades, de contrato, de integración y estáticas, trazabilidad, cobertura del núcleo). Unos 2 segundos.
- `npm run verificar:todo`: lo anterior más la ventana real de punta a punta, accesibilidad, auditoría de dependencias, Opengrep, los cuatro sabotajes y el freno de cierre. Unos 20 segundos.
- `npm run datos:reiniciar`: deja la carpeta de datos de demostración como nueva.
- `npm run tablero`: abre el tablero en el navegador.
- Además: `npm run sabotaje -- N` (N de 1 a 4), `npm run trazabilidad`, `npm run construir`.
- En Claude Code: cada archivo editado se formatea y se revisa; al terminar un turno con cambios corre la red y frena el cierre si da rojo.
- En git: el commit pasa por la revisión estática y el escáner de secretos; la subida, por `npm run verificar`.
- En GitHub: cada pull request corre la red completa en Windows; una vez por semana, además, los cuatro sabotajes.

Decisiones del 13/10/2026 en `docs/decisiones.md` (sección «Fase 02»).
