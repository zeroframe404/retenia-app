// Textos de la variante de prueba. Viven aparte del catálogo general para que la versión real
// no los lleve consigo.

const oneDecimal = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const demoTexts = {
  ribbon: (longDate: string) => `DEMOSTRACIÓN · hoy es ${longDate}`,
  // Ajustes › «Demostración».
  section: 'Demostración',
  advance: { 1: '+1 día', 7: '+7 días', 35: '+35 días' },
  reset: 'Restablecer fecha',
  failed: 'No pude cambiar la fecha. Probá de nuevo.',
  offline: 'Simular sin conexión',
  // Ajustes › «Demostración» › «Laboratorio» (H-07).
  lab: {
    open: 'Laboratorio',
    title: 'Laboratorio',
    intro: 'Probá en esta PC las piezas delicadas de Retenia. Cada bloque dice cuánto tardó.',
    back: 'Volver a Ajustes',
    // Menos de 10 segundos, con un decimal; nunca «0 s».
    elapsed: (ms: number) => {
      const seconds = ms / 1000;
      return seconds >= 10
        ? `Tardó ${Math.round(seconds)} s`
        : `Tardó ${oneDecimal.format(Math.max(0.1, seconds))} s`;
    },
    heard: (text: string) => `Entendí: “${text}”`,
    voice: {
      title: 'Voz',
      download: 'Descargar modelos',
      missing:
        'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.',
      downloading: (percent: number) => `Bajando los modelos: ${Math.round(percent)} %`,
      progressLabel: 'Descarga de los modelos',
      ready: 'Modelos listos',
      wait: 'Esperá a que terminen de bajar los modelos.',
      corrupt: 'Un archivo llegó dañado y lo descarté. Tocá «Descargar modelos» de nuevo.',
      server: 'No pude bajar los modelos. Probá de nuevo en un rato.',
      disk: 'No hay lugar en el disco para los modelos: hacen falta unos 560 MB libres.',
      phrase: 'Frase en inglés',
      voices: 'Voz que habla',
      voiceNames: [
        'Mujer, Estados Unidos',
        'Hombre, Estados Unidos',
        'Mujer, Reino Unido',
        'Hombre, Reino Unido',
      ],
      speak: 'Decir en voz alta',
      speaking: 'Preparando el audio…',
      emptyPhrase: 'Escribí una frase en inglés.',
      failed: 'No pude decir la frase. Probá de nuevo.',
      player: 'Audio de la frase',
    },
    transcription: {
      title: 'Transcripción',
      record: 'Grabar',
      stop: 'Detener',
      recording: (seconds: number) => `Grabando… ${seconds} s. Decí la frase y tocá «Detener».`,
      transcribing: 'Transcribiendo…',
      field: 'Lo que entendí (podés corregirlo)',
      nothing: 'No escuché nada. Probá de nuevo, más cerca del micrófono.',
      blocked: 'Sin acceso al micrófono no podemos escucharte',
      howTo: 'Cómo habilitarlo',
      steps: [
        'Abrí Configuración de Windows › Privacidad y seguridad › Micrófono.',
        'Activá «Acceso al micrófono» y «Permitir que las aplicaciones de escritorio accedan al micrófono».',
        'Volvé a Retenia y tocá «Grabar».',
      ],
      openSettings: 'Abrir la configuración del micrófono',
      noMicrophone: 'No encontramos ningún micrófono. Conectá uno y tocá «Grabar» de nuevo.',
      failed: 'No pude transcribir la grabación. Probá de nuevo.',
    },
    pdf: {
      title: 'PDF',
      read: 'Leer PDF de prueba',
      reading: 'Leyendo el PDF…',
      pageText: 'Texto de la página 1',
      pageImage: 'Página 1 con la frase resaltada',
      highlight: 'Frase resaltada',
      phrase: (phrase: string) => `Frase resaltada: “${phrase}”`,
      failed: 'No pude leer el PDF de prueba.',
    },
    scan: {
      title: 'Escaneo',
      read: 'Leer página escaneada',
      reading: 'Reconociendo la página 9…',
      text: 'Texto reconocido de la página 9',
      failed: 'No pude leer la página escaneada.',
    },
    notice: {
      title: 'Aviso',
      send: 'Probar aviso',
      sending: 'Mandando el aviso…',
      sent: 'Aviso enviado. Minimizá Retenia y tocalo: Retenia vuelve al frente.',
      failed: 'Windows no mostró el aviso. Revisá que las notificaciones estén activadas.',
    },
    // El aviso de Windows: «Retenia · Esto es una prueba».
    notificationTitle: 'Retenia',
    notificationBody: 'Esto es una prueba',
  },
};
