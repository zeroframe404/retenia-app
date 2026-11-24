# Pruebas manuales · Fase 16 · Evaluación sin IA: preguntas, ayuda y desacuerdo

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`. Apuntes → «Tarjetas» → buscá el ejercicio «Un intervalo de confianza del 95 %…» y tocá «Practicar ahora».

Para encontrar los ejercicios: están al final de la lista de «Tarjetas» (no cambian el orden que ya tenía). Lo más rápido es elegir **Tipo › «Ejercicio»**: quedan los cinco solos. También se encuentran con Ctrl+K («Practicar ahora» abajo del resultado marcado).

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen letra por letra, salvo lo que está en «Qué difiere de tu plan», al final. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-16-`.

Yo hice S1 a S5, M16.1 a M16.11 y un rato de uso libre contra el programa de prueba armado, con una carpeta de datos nueva (lo mismo que deja `npm run datos:reiniciar`), en este orden, el 24/11/2026: todas dieron bien. Al lado de cada una dejo qué vi. Lo que no pude hacer como vos: manejé la ventana con un guion (Playwright) en vez de con el mouse, y no probé con el lector de pantalla.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Lo que vi: la ventana «Retenia», la cinta exacta, Estudiar y ningún error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Lo que vi: «Todo en orden · 0 diferencias» (también al final de todo, después de las correcciones y el «Deshacer»).

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Lo que vi: eso mismo, con «¿Qué mide el desvío estándar?». Ahora la sesión también trae la barra de ayuda debajo de «Tu respuesta…».

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Lo que vi: el resultado aparece; Esc cierra y sigo en Estudiar.

## S5 · Humo · La fuente está a un clic

- Hacé: Materiales → «Inferencia — capítulos 1 a 4.pdf» → clic en cualquier cita resaltada → «Ver en el original».
- Tenés que ver: se abre la página del PDF con el pasaje resaltado.
- Lo que vi: la página con el pasaje resaltado.

## M16.1 · Corregirme por unidades · CA-129

- Hacé: escribí una respuesta cualquiera y tocá «Enviar». Marcá 2 de las 3 unidades de idea.
- Tenés que ver: la respuesta modelo separada en 3 unidades con casillas y el resultado «Vas bien.».
- Lo que vi: «Respuesta modelo», «Marcá las ideas que cubriste» y 3 casillas («La cubrí: idea 1», «2» y «3»); con 2 marcadas, el resultado «Vas bien.». Al enviar, la pantalla baja sola hasta la corrección.

## M16.2 · Bajar sí, subir no · CA-130

- Hacé: en «Cambiar resultado», intentá elegir «Correcto.» y después «Todavía no.».
- Tenés que ver: subirlo no se puede; bajarlo sí.
- Lo que vi: «Correcto.» aparece apagado y no se puede elegir; «Todavía no.» sí, y el resultado pasa a «Todavía no.».

## M16.3 · Respuesta corta · CA-131

- Hacé: practicá «Capital de Francia». Respondé paris. Después practicala de nuevo y respondé Paría.
- Tenés que ver: con «paris», «Correcto.». Con «Paría», «Todavía no.» y la diferencia marcada letra por letra.
- Lo que vi: «paris» → «Correcto.»; «Paría» → «Todavía no.», «Revisá las letras marcadas: escribiste «Paría» y la respuesta es «París».», y debajo «Tu respuesta» y «La respuesta» con la última letra subrayada (en color, nunca rojo).

## M16.4 · Numérica · CA-132

- Hacé: practicá «La media de 2, 4 y 9». Respondé 5,0. Otra vez con 5.3.
- Tenés que ver: «5,0» es correcta; «5.3» no.
- Lo que vi: «5,0» → «Correcto.»; «5.3» → «Todavía no.» y «La respuesta es 5, con un margen de 0,05.».

## M16.5 · Opciones · CA-133

- Hacé: practicá la pregunta de opciones («¿Qué medida de centro cambia menos si aparece un valor extremo?») y elegí una equivocada a propósito.
- Tenés que ver: tres opciones y, al fallar, la explicación de por qué esa no era.
- Lo que vi: 3 opciones (mezcladas cada vez que la abrís); con «La media»: «Todavía no.», «La media usa todos los valores: un valor extremo la arrastra.» y «La correcta: La mediana».

## M16.6 · La pista espera al intento · CA-135

- Hacé: abrí el ejercicio abierto y, sin escribir nada, mirá el botón «Pista». Después escribí una palabra.
- Tenés que ver: primero aparece apagado; al escribir, se habilita.
- Lo que vi: «Pista», «Ver un ejemplo» y «Fuente» apagados; al escribir se prenden los tres y desaparece «No sé por dónde empezar».

## M16.7 · La escalera de pistas · CA-136

- Hacé: tocá «Pista» tres veces, leyendo cada una. Tocá una vez más.
- Tenés que ver: tres pistas cada vez más concretas y después la pregunta «La próxima pista muestra la respuesta completa. ¿Querés intentarlo una vez más?».
- Lo que vi: en el panel de la derecha, «Pregunta orientadora: ¿El 95 % habla de este intervalo o de la forma de construirlo?», «Pista de concepto: Un intervalo de confianza sale de un procedimiento que se puede repetir con otras muestras.» y «Pista de paso: Imaginá 100 muestras, cada una con su intervalo: ¿cuántos contendrían la media?»; después, la pregunta exacta con «Intentarlo una vez más» y «Ver la solución».

## M16.8 · Lo escrito no se borra · CA-138

- Hacé: con texto escrito en la respuesta, abrí «Fuente» y cerrala.
- Tenés que ver: tu texto sigue completo.
- Lo que vi: el texto completo. El panel de «Fuente» muestra el párrafo del 95 % de la página 6 del PDF, sin «Ver en el original» (ese botón te sacaba del ejercicio y perdías lo escrito; para ir al PDF, cerrá el ejercicio y usá Materiales).

## M16.9 · Logrado con pista · CA-137

- Hacé: después de usar hasta la pista de concepto, enviá y marcá las 3 unidades.
- Aclaración: abrí el ejercicio de nuevo con «Practicar ahora» y tocá «Pista» dos veces (si seguís desde M16.7, con tres pistas, dice «Logrado con pista de paso»).
- Tenés que ver: «Logrado con pista de concepto» y el rótulo «PRÁCTICA CON AYUDA». No dice «Correcto.» a secas.
- Lo que vi: «Logrado con pista de concepto», «Usaste la pista de concepto.», «Te la vuelvo a pedir sin ayuda otro día.» y el rótulo «PRÁCTICA CON AYUDA». En la pantalla del ejercicio queda «Comprobación sin ayuda pendiente: martes 16/03/2027».

## M16.10 · Discrepo · CA-140

- Antes (cambio que elegiste): Ajustes → «Demostración» → «+1 día». La cinta dice «hoy es martes 16/03/2027».
- Hacé: practicá «Capital de Francia», respondé Ciudad de París, tocá «Discrepo» → «Mi respuesta era correcta».
- Tenés que ver: el resultado pasa a «Correcto.» y aparece el aviso con «Todavía no → Correcto», el nuevo próximo repaso y «Deshacer».
- Lo que vi: «Todavía no.» → «Correcto.» y el aviso «Todavía no → Correcto», «Próximo repaso: miércoles 17/03/2027 → martes 23/03/2027», «Entendido» y «Deshacer».

## M16.11 · Deshacer la corrección · CA-141

- Hacé: en ese aviso tocá «Deshacer». Abrí el «Historial» de la tarjeta.
- Tenés que ver: vuelve «Todavía no.» y el historial muestra las dos calificaciones, sin haber borrado ninguna.
- Lo que vi: vuelve «Todavía no.» (y aparece «Corrección deshecha.»). El historial: «15/03/2027 · Correcto.», «15/03/2027 · Todavía no. · Otro repaso del mismo día: no cambió la fecha» y «16/03/2027 · Todavía no.» con debajo «Antes: ~~Correcto.~~ corrección deshecha».

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Lo que hice: «Nuevo ejercicio» numérico en modo «Evaluación» (aviso «Esta actividad es una evaluación: las ayudas aparecen después de enviar.», sin barra de ayuda, «Enviar» apagado sin respuesta); «tres» → «No reconocí un número en tu respuesta.»; «Reintentar» pasa a «PRÁCTICA AUTÓNOMA» (esto lo arreglé: seguía diciendo «EVALUACIÓN»); con 3 → «Correcto.». Al final, «Verificar datos»: «Todo en orden · 0 diferencias».

## Qué difiere de tu plan

1. M16.1 dice «Vas bien»; en pantalla dice **«Vas bien.»**, con punto, como «Correcto.» y «Todavía no.» (unificado en la Fase 00).
2. La tarea 5 decía «Ver ejemplo»; el botón se llama **«Ver un ejemplo»** (unificado en la Fase 00).
3. M16.9: la aclaración de abrir de nuevo y usar dos pistas (no cambia tu texto).
4. M16.10: el paso «+1 día» antes, que elegiste.
5. «La referencia es incorrecta» deja la tarjeta «En revisión» (CA-142), no «En pausa».
6. El aviso también trae «Entendido» (lo pide CA-141).
7. Para encontrar el ejercicio, Tipo › «Ejercicio» o Ctrl+K: los ejercicios quedan al final de la lista. Con ese filtro, el contador dice «5 ejercicios».
8. En el buscador (Ctrl+K) los ejercicios figuran como «Tarjeta», no como «Ejercicio»; «Practicar ahora» funciona igual.
9. «Discrepo» › «La referencia está incompleta» abre «Editar ficha» con el cursor en la parte a corregir (en el ejercicio abierto, «Unidad de idea 1»).
10. En «Practicar ahora», el panel «Fuente» no trae «Ver en el original» (ver M16.8).
11. Dos capturas de referencia cambian a propósito y esperan tu aprobación: Apuntes › «Tarjetas» y la pregunta de la sesión de Estudiar (ahora con la barra de ayuda). Están en `docs/pruebas-manuales/capturas/fase-16-referencia-*-nueva.png`.
