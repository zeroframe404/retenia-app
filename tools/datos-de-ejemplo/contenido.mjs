// El texto de los archivos de ejemplo del elenco (docs/especificacion/elenco.md). Es texto
// propio, escrito para Retenia: no está copiado de ningún libro. Lo usan el generador
// (tools/generar-datos-de-ejemplo.mjs) y las pruebas, que comparan contra estas mismas frases.

// La frase que «Leer PDF de prueba» resalta sobre la imagen de la página 1 (CA-028).
export const HIGHLIGHT_PHRASE =
  'Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.';

// La página 9 del PDF es un escaneo sin capa de texto (CA-029): esto es lo que dice la imagen,
// renglón por renglón, y contra esto se compara lo que reconoce tesseract.js.
export const SCANNED_PAGE = {
  title: 'Capítulo 4 · Pruebas de hipótesis',
  subtitle: '4.1 La hipótesis nula y la alternativa',
  paragraphs: [
    'Una prueba de hipótesis es una forma ordenada de decidir si los datos de una muestra alcanzan para dudar de una afirmación sobre la población.',
    'La afirmación que se pone a prueba se llama hipótesis nula. Suele decir que no hay efecto o que no hay diferencia: por ejemplo, que la media del tiempo de espera sigue siendo de 12 minutos.',
    'La hipótesis alternativa es lo que creeríamos si los datos contradicen a la nula: que la media cambió, o que es mayor, o que es menor.',
    'La prueba nunca demuestra que la nula sea verdadera. Lo único que puede hacer es juntar evidencia en su contra. Por eso, cuando los datos no alcanzan, se dice que no se rechaza la hipótesis nula, y no que se la acepta.',
    'Antes de mirar los datos conviene fijar el nivel de significación, que casi siempre es del 5 %.',
  ],
};

// Las doce páginas de «Inferencia — capítulos 1 a 4.pdf». Cada página es una lista de bloques:
// { h1 }, { h2 }, { p }, { tabla }, { formula } o { escaneo } (la página 9).
export const INFERENCE_PAGES = [
  // Página 1
  [
    { portada: 'Inferencia estadística · capítulos 1 a 4' },
    { h1: 'Capítulo 1 · Población, muestra y estimadores' },
    { h2: '1.1 Población y muestra' },
    {
      p: 'La estadística trabaja casi siempre con información incompleta. Queremos saber algo de un conjunto grande, como todos los estudiantes de una universidad o todas las lámparas que salen de una fábrica, y no podemos mirar cada caso. Ese conjunto completo se llama población.',
    },
    {
      p: HIGHLIGHT_PHRASE,
    },
    {
      p: 'Si la muestra está bien elegida, lo que vemos en ella se parece a lo que pasa en la población, aunque nunca es una copia exacta.',
    },
    {
      p: 'La forma más sencilla de elegir bien es el muestreo al azar: cada integrante de la población tiene la misma chance de quedar en la muestra. Así ningún grupo queda favorecido por la manera de elegir. Una encuesta que solo pregunta a quienes pasan por la puerta de la biblioteca, en cambio, deja afuera a quienes estudian en su casa, y sus conclusiones pueden torcerse sin que nadie lo note.',
    },
    {
      p: 'El tamaño de la muestra también importa. Con pocos casos, el azar pesa mucho y dos muestras de la misma población pueden dar resultados muy distintos. Con muchos casos, las muestras se parecen más entre sí. Pero una muestra grande y mal elegida sigue siendo una mala muestra: el tamaño no corrige un sesgo.',
    },
  ],
  // Página 2
  [
    { h2: '1.2 Parámetros y estadísticos' },
    {
      p: 'Un parámetro es un número que describe a la población: la media de las alturas de todos los estudiantes, por ejemplo. Casi nunca lo conocemos. Un estadístico es un número que se calcula con la muestra: la media de las alturas de los cien estudiantes que medimos. El estadístico sí lo conocemos, y lo usamos para estimar el parámetro.',
    },
    {
      p: 'Para no confundirlos se usan letras distintas. La media de la población se escribe con la letra griega mu y la media de la muestra con una x con una raya encima. El desvío de la población es sigma y el de la muestra es s.',
    },
    { h2: '1.3 La media y el desvío' },
    {
      p: 'La media muestral es la suma de los datos dividida por la cantidad de datos. Es el centro de gravedad de la muestra: si los datos fueran pesas sobre una regla, la regla quedaría en equilibrio apoyada en la media.',
    },
    {
      p: 'El desvío estándar mide cuánto se alejan, en promedio, los datos de la media. Un desvío chico dice que los datos están apretados alrededor del centro; uno grande, que están desparramados. Para calcularlo se suman los cuadrados de las distancias a la media, se divide por la cantidad de datos menos uno y se saca la raíz cuadrada.',
    },
    {
      p: 'Dividir por n menos uno y no por n parece un detalle, pero tiene un motivo: las distancias se miden a la media de la muestra, que está calculada con esos mismos datos y por eso queda un poco más cerca de ellos que la media verdadera. Restar uno compensa ese acercamiento.',
    },
  ],
  // Página 3
  [
    { h2: '1.4 Sesgo y variabilidad' },
    {
      p: 'Un estimador es una regla para calcular un estadístico que se usa en lugar de un parámetro. Se le piden dos cosas. La primera es que no tenga sesgo: si repitiéramos el muestreo muchas veces, el promedio de todas las estimaciones tendría que coincidir con el parámetro. La segunda es que tenga poca variabilidad: que las estimaciones no salten demasiado de una muestra a otra.',
    },
    {
      p: 'Una imagen útil es la de los tiros al blanco. Un tirador con sesgo pega siempre en el mismo lugar, pero corrido del centro. Un tirador con mucha variabilidad reparte los tiros por todo el blanco, aunque en promedio estén bien centrados. Queremos un tirador sin sesgo y con poca variabilidad.',
    },
    {
      p: 'La media muestral cumple las dos condiciones cuando la muestra es al azar: no tiene sesgo y su variabilidad baja a medida que crece la muestra. Esa es una de las razones por las que aparece en todas partes.',
    },
    { h2: '1.5 Qué se lleva este capítulo' },
    {
      p: 'Población es todo lo que nos interesa; muestra es lo que miramos. Los parámetros describen a la población y casi nunca se conocen; los estadísticos describen a la muestra y sirven para estimarlos. Un buen estimador no tiene sesgo y varía poco. El muestreo al azar es la herramienta que hace posible todo lo demás.',
    },
  ],
  // Página 4
  [
    { h1: 'Capítulo 2 · La distribución de la media muestral' },
    { h2: '2.1 Una media que cambia de muestra en muestra' },
    {
      p: 'Si sacamos una muestra de cien estudiantes y calculamos la media de sus alturas, obtenemos un número. Si sacamos otra muestra, obtenemos otro número parecido, pero no igual. La media muestral es, entonces, una variable: cambia con cada muestra. La forma en que se reparten sus valores posibles se llama distribución muestral.',
    },
    {
      p: 'Conocer esa distribución es lo que permite decir cuánto puede equivocarse una estimación. No sabemos si nuestra muestra cayó cerca o lejos del valor verdadero, pero sí sabemos cómo se comportan las muestras en general.',
    },
    { h2: '2.2 El error estándar' },
    {
      p: 'El desvío de la distribución muestral de la media se llama error estándar. Se calcula dividiendo el desvío de los datos por la raíz cuadrada del tamaño de la muestra. Con cuatro veces más datos, el error estándar se reduce a la mitad; con cien veces más, a la décima parte.',
    },
    {
      p: 'Esa raíz cuadrada explica por qué duplicar una encuesta no duplica su precisión. Para ganar una cifra decimal de precisión hacen falta cien veces más casos, y ese costo suele ser el que decide hasta dónde se puede llegar.',
    },
  ],
  // Página 5
  [
    { h2: '2.3 El teorema central del límite' },
    {
      p: 'Hay un resultado que sostiene buena parte de la inferencia: cuando la muestra es grande, la distribución de la media muestral se parece a una campana normal, aunque los datos originales no tengan forma de campana. Da igual que los datos sean tiempos de espera, ingresos o resultados de tirar un dado: sus medias, calculadas con muestras grandes, se acomodan en una campana.',
    },
    {
      p: 'Qué significa «grande» depende de los datos. Si ya tienen una forma parecida a una campana, alcanza con pocos casos. Si son muy asimétricos, como los ingresos, hacen falta más. Una regla práctica habitual es pedir al menos treinta casos, pero conviene mirar los datos antes de confiar en ella.',
    },
    {
      p: 'Gracias a este teorema podemos usar la campana normal para calcular probabilidades sobre la media sin conocer la forma exacta de la población. Esa es la puerta de entrada a los intervalos de confianza y a las pruebas de hipótesis de los capítulos siguientes.',
    },
  ],
  // Página 6
  [
    { h1: 'Capítulo 3 · Intervalos de confianza' },
    { h2: '3.1 Un rango en lugar de un número' },
    {
      p: 'Una estimación puntual da un único número, como «la media es 5». Un intervalo de confianza da un rango de valores plausibles, como «la media está entre 4,2 y 5,8», junto con un nivel de confianza que dice qué tan seguido acierta el procedimiento.',
    },
    {
      p: 'El intervalo se arma con la estimación en el centro y un margen de error a cada lado. El margen es el producto de dos factores: un valor crítico, que depende del nivel de confianza, y el error estándar, que depende de los datos.',
    },
    { h2: '3.2 Qué significa el 95 %' },
    {
      p: 'El 95 % no es la probabilidad de que la media verdadera esté dentro de este intervalo en particular. La media verdadera es un número fijo: está o no está. El 95 % habla del procedimiento: si repitiéramos el muestreo muchas veces y armáramos un intervalo con cada muestra, cerca del 95 % de esos intervalos contendría la media verdadera.',
    },
    {
      p: 'Más confianza exige intervalos más anchos. Un intervalo del 99 % acierta más seguido que uno del 95 %, pero dice menos, porque abarca más valores.',
    },
  ],
  // Página 7: la tabla.
  [
    { h2: '3.3 Valores críticos de la distribución t' },
    {
      p: 'Cuando el desvío de la población no se conoce y se reemplaza por el de la muestra, el valor crítico sale de la distribución t de Student. Depende de los grados de libertad, que para una media son n menos uno. La tabla da los valores para intervalos de dos colas.',
    },
    {
      tabla: {
        encabezado: ['Grados de libertad', '90 %', '95 %', '99 %'],
        filas: [
          ['1', '6,314', '12,706', '63,657'],
          ['2', '2,920', '4,303', '9,925'],
          ['3', '2,353', '3,182', '5,841'],
          ['4', '2,132', '2,776', '4,604'],
          ['5', '2,015', '2,571', '4,032'],
          ['10', '1,812', '2,228', '3,169'],
          ['15', '1,753', '2,131', '2,947'],
          ['20', '1,725', '2,086', '2,845'],
          ['30', '1,697', '2,042', '2,750'],
          ['infinito', '1,645', '1,960', '2,576'],
        ],
      },
    },
    {
      p: 'A medida que crecen los grados de libertad, los valores de t se acercan a los de la campana normal: con infinitos grados de libertad son exactamente 1,645, 1,960 y 2,576.',
    },
  ],
  // Página 8
  [
    { h2: '3.4 Calcular un intervalo paso a paso' },
    { p: 'Paso 1. Calcular la media muestral y el desvío de la muestra.' },
    { p: 'Paso 2. Calcular el error estándar: el desvío dividido por la raíz cuadrada de n.' },
    {
      p: 'Paso 3. Buscar en la tabla el valor crítico de t para el nivel de confianza elegido y n menos uno grados de libertad.',
    },
    {
      p: 'Paso 4. Multiplicar el valor crítico por el error estándar y sumar y restar ese margen a la media.',
    },
    {
      p: 'Ejemplo. Una muestra de 16 tiempos de espera tiene media 5 minutos y desvío 1,5. El error estándar es 1,5 dividido por 4, o sea 0,375. Con 15 grados de libertad y 95 % de confianza, t vale 2,131. El margen es 2,131 por 0,375, cerca de 0,8. El intervalo va de 4,2 a 5,8 minutos.',
    },
    {
      p: 'Antes de informar el intervalo conviene revisar que la muestra sea al azar y que los datos no tengan valores extremos que arrastren la media.',
    },
  ],
  // Página 9: escaneo sin capa de texto.
  [{ escaneo: SCANNED_PAGE }],
  // Página 10
  [
    { h2: '4.2 Dos maneras de equivocarse' },
    {
      p: 'Una prueba puede fallar de dos formas. El error de tipo I es rechazar la hipótesis nula cuando en realidad era verdadera: ver un efecto que no existe. El error de tipo II es no rechazarla cuando era falsa: dejar pasar un efecto que sí existe.',
    },
    {
      p: 'El nivel de significación es la probabilidad de cometer un error de tipo I que estamos dispuestos a aceptar. Con un nivel del 5 %, una de cada veinte pruebas sobre una hipótesis nula verdadera va a dar, por puro azar, un rechazo equivocado.',
    },
    {
      p: 'Bajar el nivel de significación protege contra el error de tipo I, pero aumenta el riesgo del tipo II. La única forma de bajar los dos a la vez es juntar más datos.',
    },
    { h2: '4.3 La potencia' },
    {
      p: 'La potencia de una prueba es la probabilidad de detectar un efecto cuando el efecto existe. Depende del tamaño del efecto, del desvío de los datos, del nivel de significación y del tamaño de la muestra. Un estudio con poca potencia puede no encontrar nada aunque haya algo que encontrar.',
    },
  ],
  // Página 11: la fórmula.
  [
    { h2: '4.4 El estadístico t' },
    {
      p: 'Para poner a prueba una afirmación sobre la media se calcula cuántos errores estándar separan a la media muestral del valor que propone la hipótesis nula:',
    },
    { formula: true },
    {
      p: 'Un valor de t cercano a cero dice que la muestra es compatible con la hipótesis nula. Un valor lejano, positivo o negativo, dice que la muestra sería rara si la nula fuera cierta. Para saber qué tan lejos es «lejos» se compara con los valores críticos de la tabla de la página 7.',
    },
    {
      p: 'Ejemplo. La hipótesis nula dice que la espera media es de 12 minutos. Una muestra de 25 casos da media 13,1 y desvío 2,5. El error estándar es 0,5 y t vale 2,2. Con 24 grados de libertad el valor crítico al 5 % es cerca de 2,06, así que se rechaza la hipótesis nula.',
    },
  ],
  // Página 12
  [
    { h2: '4.5 El valor p' },
    {
      p: 'El valor p es la probabilidad de obtener un resultado al menos tan extremo como el observado si la hipótesis nula fuera verdadera. Un valor p chico indica que el resultado sería sorprendente bajo la nula. Si es menor que el nivel de significación, se rechaza la nula.',
    },
    {
      p: 'El valor p no es la probabilidad de que la hipótesis nula sea cierta, ni mide el tamaño del efecto. Un efecto diminuto puede dar un valor p muy chico si la muestra es enorme. Por eso conviene informar siempre el intervalo de confianza junto con el valor p.',
    },
    { h2: 'Resumen de los cuatro capítulos' },
    {
      p: 'La muestra al azar permite estimar parámetros de la población. La media muestral varía de muestra en muestra con un error estándar que baja con la raíz de n, y por el teorema central del límite su distribución se parece a una campana. Con eso se arman intervalos de confianza, que dan un rango de valores plausibles, y pruebas de hipótesis, que deciden si los datos alcanzan para dudar de una afirmación.',
    },
  ],
];

// «Apunte 3.pdf»: un apunte breve de dos páginas (CA-106).
export const APUNTE_3_PAGES = [
  [
    { portada: 'Apunte 3 · Estadística básica' },
    { h1: 'Errores en las pruebas de hipótesis' },
    {
      p: 'Toda decisión basada en una muestra puede salir mal. En una prueba de hipótesis hay dos errores posibles y conviene tenerlos presentes antes de mirar los datos.',
    },
    {
      p: 'Error de tipo I: rechazar una hipótesis nula verdadera. Su probabilidad es el nivel de significación, que elegimos nosotros.',
    },
    {
      p: 'Error de tipo II: no rechazar una hipótesis nula falsa. Su probabilidad depende del tamaño del efecto y de cuántos datos tengamos.',
    },
  ],
  [
    { h2: 'Para repasar' },
    {
      p: 'Un detector de humo muy sensible suena aunque solo se queme una tostada: comete errores de tipo I.',
    },
    { p: 'Un detector poco sensible no suena con un incendio chico: comete errores de tipo II.' },
    { p: 'Con más datos, la prueba puede ser exigente con los dos errores a la vez.' },
  ],
];

export const NOTES_MD = `# Notas de estadística

Notas sueltas de la cursada, para pasar en limpio.

## Medidas de centro

- La **media** es la suma de los datos dividida por la cantidad.
- La **mediana** deja el 50 % de los datos por debajo.
- La **moda** es el valor que más se repite.

## Dispersión

El desvío estándar mide cuánto se alejan los datos de la media. El error estándar de la media es s / sqrt(n).

## Para la próxima clase

1. Repasar el teorema central del límite.
2. Traer la calculadora.
3. Hacer los ejercicios 4 a 9 de la guía.
`;

export const SUMMARY_DOCX = {
  title: 'Resumen: intervalos de confianza',
  sections: [
    {
      heading: 'Qué es un intervalo de confianza',
      paragraphs: [
        'Es un rango de valores plausibles para un parámetro, armado con los datos de una muestra.',
        'Se calcula como la estimación más y menos un margen de error.',
      ],
    },
    {
      heading: 'Cómo se interpreta',
      paragraphs: [
        'El nivel de confianza describe al procedimiento: con muchas muestras, cerca del 95 % de los intervalos del 95 % contiene al parámetro.',
        'No es la probabilidad de que este intervalo en particular contenga al parámetro.',
      ],
    },
  ],
};

export const WEB_PAGE_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>El teorema central del límite, sin fórmulas</title>
  </head>
  <body>
    <header>
      <nav>
        <a href="#inicio">Inicio</a> · <a href="#notas">Notas</a> · <a href="#contacto">Contacto</a>
      </nav>
    </header>
    <aside>
      <p>Suscribite al boletín semanal de estadística para principiantes.</p>
    </aside>
    <main>
      <article>
        <h1>El teorema central del límite, sin fórmulas</h1>
        <p>Imaginá que tirás un dado cien veces y anotás el promedio. Después repetís lo mismo otras mil veces. Cada promedio es distinto, pero casi todos andan cerca de 3,5.</p>
        <p>Si hacés un gráfico con esos mil promedios, aparece una campana, aunque el dado no tenga nada de campana: cada cara sale con la misma frecuencia.</p>
        <p>Eso dice el teorema central del límite: los promedios de muestras grandes se reparten en forma de campana, sea cual sea la forma de los datos originales.</p>
        <h2>Por qué importa</h2>
        <p>Gracias a esa campana se pueden calcular márgenes de error para encuestas y experimentos sin conocer la forma exacta de la población.</p>
      </article>
    </main>
    <footer>
      <p>Texto escrito para los datos de ejemplo de Retenia.</p>
    </footer>
  </body>
</html>
`;

export const NOT_A_PDF =
  'Este archivo se llama «no-es-un-pdf.pdf» pero no es un PDF: es texto común con otro nombre.\nSirve para comprobar que Retenia avisa que no lo puede leer, sin trabarse.\n';

// Lo que dice el audio de ejemplo de la transcripción (CA-026).
export const GOOD_MORNING = 'Good morning.';
