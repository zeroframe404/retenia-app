# Pruebas manuales · Fase 14 · Importar materiales: escaneos, web y revisión

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`. Al abrir, los dos materiales del elenco se leen solos en unos segundos: en Materiales vas a ver «Inferencia — capítulos 1 a 4» pasar a «Listo». Después: Materiales → tocá «Inferencia — capítulos 1 a 4» en la lista → «Revisión».

Los archivos de ejemplo están en la carpeta `datos-de-ejemplo` del proyecto (`H:\Retenia\datos-de-ejemplo`): `pagina.html` es el de M14.7.

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**, salvo lo que está en «Qué difiere de tu plan», al final. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-14-`.

Yo hice todas estas pruebas (menos la libre) contra el programa de prueba armado, con los datos recién reiniciados, el 20/11/2026: las 14 dieron bien. Al lado de cada una dejo qué vi. Una sola cosa no la pude hacer como la pedís: en M14.8 no desconecté el internet de la PC (es una configuración del sistema); usé «Simular sin conexión» y comprobé que la página se lee entera (leerla nunca usa internet).

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Lo que vi: la cinta exacta y ningún cartel de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Lo que vi: «Todo en orden · 0 diferencias».

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Lo que vi: eso mismo.

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Lo que vi: eso mismo.

## S5 · Humo · La fuente está a un clic

- Hacé: Materiales → «Inferencia — capítulos 1 a 4.pdf» → clic en cualquier cita resaltada → «Ver en el original».
- Tenés que ver: se abre la página del PDF con el pasaje resaltado.
- Aclaración: «Inferencia — capítulos 1 a 4.pdf» → «Leer el original»; ahí las citas son los pasajes subrayados.
- Lo que vi: la página con el pasaje resaltado.

## M14.1 · Tres bloques · CA-113

- Hacé: mirá la pantalla de «Revisión».
- Tenés que ver: «Listo», «Con problemas» con la tabla de la página 7 y la fórmula de la página 11, y «No extraído» con la página 9. Cada problema tiene un botón.
- Lo que vi: «Listo» con la cantidad de secciones, «Con problemas (2)» con «Página 7 · Posible tabla» y «Página 11 · Posible fórmula» (cada una con «Ver original», «Corregir texto», «Marcar como imagen» e «Ignorar») y «No extraído» con «Página 9 · Sin texto: parece un escaneo.» («Intentar reconocimiento» y «Estudiar sin estas páginas»). Abajo, el botón «Leer la sección 1».

## M14.2 · Reconocer el escaneo · CA-114

- Hacé: en la página 9 tocá «Intentar reconocimiento».
- Tenés que ver: después de unos segundos la página sale de «No extraído» y muestra texto legible.
- Lo que vi: tardó 1,3 segundos; «No extraído» quedó en «Nada por acá.» y la página 9 muestra «4.1 La hipótesis nula y la alternativa» y sus párrafos (con alguna marquita suelta como «- -»).

## M14.3 · Corregir sin tocar el original · CA-115

- Hacé: en la tabla de la página 7 tocá «Corregir texto», cambiá un número y guardá. Tocá «Ver original».
- Tenés que ver: el aviso «2 tarjetas usan este texto. ¿Actualizarlas?». El original muestra el número de siempre.
- Aclaración: «Corregir texto» abre el texto original (solo lectura) y, abajo, el texto corregido; «Guardar corrección» muestra el aviso con las dos tarjetas («¿Qué valor crítico z corresponde a un nivel de confianza del 90 %?» y del 95 %) y «Actualizarlas» / «Ahora no». «Ver original» abre la página 7 con el PDF a la izquierda (con el número de siempre) y el texto, con tu corrección, a la derecha.
- Lo que vi: el aviso exacto, con las dos tarjetas; en la página 7 el PDF mantiene el 2,228 y el texto de la derecha dice 2,229.

## M14.4 · La corrección sobrevive · CA-116

- Hacé: en esa página tocá «Reprocesar esta página». Cerrá Retenia, abrilo y volvé a la página.
- Tenés que ver: tu corrección sigue aplicada.
- Aclaración: «Reprocesar esta página» está en la barra de arriba de la página (donde cae «Ver original»). Para volver: Materiales → «Inferencia — capítulos 1 a 4» → «Leer el original» → «Página siguiente» hasta la 7.
- Lo que vi: tras reprocesar, el texto sigue diciendo 2,229; cerré y abrí Retenia y seguía igual.

## M14.5 · Mapa de cobertura · CA-117

- Hacé: abrí el mapa de cobertura del material.
- Tenés que ver: doce casilleros con color y palabra, y un resumen del tipo «11 de 12 páginas listas; 1 requiere revisión».
- Aclaración: en «Revisión», botón «Mapa de cobertura».
- Lo que vi: doce casilleros («Página 1 Lista» … «Página 11 Revisar») y el resumen «11 de 12 páginas listas · 1 para revisar» (ya con la página 9 reconocida y la 7 corregida; al abrir el elenco, sin tocar nada, dice «9 de 12 páginas listas · 2 para revisar · 1 pendiente»). Ver «Qué difiere de tu plan».

## M14.6 · Dejar páginas afuera · CA-118

- Hacé: marcá la página 12 con «Estudiar sin estas páginas».
- Tenés que ver: la página 12 figura «Excluida» en el mapa.
- Aclaración: la página 12 está «Lista», así que ese botón está en la barra de arriba de la página (casilla «Página 12 Lista» del mapa → «Estudiar sin estas páginas»); en «No extraído» está el de la página 9.
- Lo que vi: «Página 12 Excluida» en el mapa y «Volver a incluir esta página» para deshacerlo.

## M14.7 · Una página web desde un archivo · CA-119

- Hacé: Materiales → «Agregar material» → elegí «pagina.html».
- Tenés que ver: el texto principal, limpio, sin menús ni botones, con la fecha de guardado.
- Aclaración: «Agregar material» → «Elegir archivo» → `pagina.html`. El material se llama «El teorema central del límite, sin fórmulas» (el título de la página). Tocalo → «Leer el original».
- Lo que vi: «Instantánea guardada el 15/03/2027»; el texto «Imaginá que tirás un dado cien veces…» y la sección «Por qué importa», sin «Inicio», «Contacto» ni «Suscribite al boletín». Con «Instantánea» se ve la página guardada dentro de un marco.

## M14.8 · Una página web real · CA-119

- Hacé: «Agregar material» → pegá la dirección https://es.wikipedia.org/wiki/Mediana_(estadística). Cuando esté «Listo», desconectá internet y abrila.
- Tenés que ver: se lee completa sin conexión, con su dirección y su fecha. Reconectá al terminar.
- Aclaración: «Agregar material» → «Dirección web» → pegá la dirección → «Agregar» (también sirve pegarla en «Pegar texto»). Tocá el material → «Leer el original».
- Lo que vi: llegó a «Listo» en unos segundos; con «Simular sin conexión» se leyó entera: 76 bloques, unas 2.300 palabras, «Instantánea de https://es.wikipedia.org/wiki/Mediana_(estadística) · guardada el 15/03/2027».

## M14.9 · Sin conexión · CA-121

- Hacé: Ajustes → «Demostración» → activá «Simular sin conexión». Pegá cualquier dirección web como material. Desactivá el interruptor.
- Tenés que ver: primero «Pendiente: se descarga cuando haya conexión»; al desactivar, se descarga sola y pasa a «Listo».
- Lo que vi: «Pendiente: se descarga cuando haya conexión» y, al desactivar el interruptor, «Listo» sola, sin tocar nada.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Cosas para probar que no están en tu lista: corregir la fórmula de la página 11 y tocar «Deshacer»; «Marcar como imagen» e «Ignorar» en un problema; corregir el mismo bloque dos veces; «Ahora no» al aviso de las tarjetas y después Estudiar → una tarjeta del 90 % o 95 % (después de «Mostrar respuesta» dice «El origen cambió»); agregar una dirección que no existe o una que pide iniciar sesión (queda «Error» con su motivo); pegar una dirección que redirige; las flechas y Tab en el mapa de cobertura.

## Textos nuevos

Estos textos no estaban en tu lista: los puse yo y salen del catálogo de textos.

- Revisión: «Revisión», «Volver al material», «Volver a la revisión», «Nada por acá.», «Página 7», «Texto original», «Texto corregido», «Guardar corrección», «Cancelar», «Corrección guardada. El original no cambió.», «Actualizarlas» (o «Actualizarla»), «Ahora no», «Actualicé 2 tarjetas.», «Deshacer», «Volver a incluir esta página», «Reconociendo el texto…».
- Señales (siempre «posible»): «Posible tabla», «Posible fórmula», «Posibles caracteres raros», «Posible texto faltante», «Reconocimiento dudoso».
- Estados de un problema: «Corregido», «Marcado como imagen», «Ignorado», «En conflicto» (con «El texto de base de esta página cambió después de tu corrección.», «Tu corrección», «Texto nuevo de la página», «Mantener mi corrección» y «Usar el texto nuevo»).
- Motivos de «No extraído»: «Sin texto: parece un escaneo.», «Casi sin texto para el tamaño de la página.», «Todavía se está leyendo.», «No se pudo leer esta página.».
- Mapa: «Mapa de cobertura», «Cerrar el mapa», «Lista», «Revisar», «Pendiente», «Error», «Excluida», el resumen («· 2 para revisar», «· 1 pendiente», «· 1 con error», «· 1 excluida») y «Estado por sección» (Lista, En proceso, Con problemas, Excluida).
- Páginas web: «Dirección web», «Dirección de la página», «Pegá una dirección que empiece con http:// o https://.», «Instantánea», «Texto», «Instantánea guardada el 15/03/2027», «Instantánea de https://… · guardada el 15/03/2027» y los motivos de «Error»: «Esta página pide iniciar sesión o pagar. Retenia no se salta eso: pegá el texto o elegí un archivo.», «Esta dirección no es una página web que Retenia pueda guardar.», «Esta página no tiene texto que guardar.», «No pudimos bajar esta página: no existe o no responde.».
- En la sesión y en la ficha de una tarjeta cuyo texto de origen se corrigió: «El origen cambió».

## Qué difiere de tu plan

1. **M14.5, el texto del resumen.** Tu lista decía «del tipo «11 de 12 páginas listas; 1 requiere revisión»». Dejé el formato del criterio CA-117 (que ya había corregido la Fase 00): «9 de 12 páginas listas · 2 para revisar · 1 pendiente» al abrir el elenco, y «11 de 12 páginas listas · 1 para revisar» después de M14.2 y M14.3. Las palabras son «para revisar» (no «requiere revisión») y el separador es « · ». Si preferís las de tu lista, es un cambio de dos líneas del catálogo de textos.
2. **M14.1 a M14.6 dicen cómo llegar** a cosas que tu lista no nombra: tocar el material de la lista y «Revisión»; «Reprocesar esta página» y, para páginas «Listas», «Estudiar sin estas páginas» están en la barra de arriba de cada página del visor; el mapa se abre con «Mapa de cobertura».
3. **M14.8, «desconectá internet».** Con «Simular sin conexión» en lugar de desconectar la PC. La lectura nunca usa internet, así que es lo mismo para Retenia; el interruptor corta, además, toda salida a internet.
4. **M14.7 y M14.8 suman un paso** («Elegir archivo» y «Dirección web» dentro de «Agregar material»).
