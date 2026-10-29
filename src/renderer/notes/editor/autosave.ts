export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface AutosaverOptions {
  delay: number;
  // Guarda lo que hay en pantalla en el momento de llamarla (lee los datos al empezar).
  save: () => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  onSaved: () => void;
}

// El guardado automático: pasan `delay` milisegundos desde el último cambio y se guarda; cada
// cambio reinicia el reloj. Se guarda de a una vez: lo que cambia mientras se guarda espera a que
// termine. Si falla, lo escrito queda pendiente y se vuelve a intentar con el próximo cambio o al
// pedir que se guarde ya (`flush`).
export class Autosaver {
  private readonly options: AutosaverOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private dirty = false;

  constructor(options: AutosaverOptions) {
    this.options = options;
  }

  touch() {
    this.dirty = true;
    this.options.onStatus('saving');
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.onTimer();
    }, this.options.delay);
  }

  // Se cumplieron los dos segundos: se guarda lo pendiente, después de un guardado en curso si lo
  // hay. Lo que cambió mientras tanto y todavía no cumplió sus propios dos segundos espera su turno.
  private async onTimer() {
    if (this.inFlight !== null) {
      await this.inFlight;
    }
    if (this.dirty && this.timer === null && this.inFlight === null) {
      await this.run();
    }
  }

  // Guarda lo pendiente ahora, esperando antes un guardado que esté en curso. Dice si quedó todo
  // guardado.
  async flush(): Promise<boolean> {
    this.clearTimer();
    for (;;) {
      if (this.inFlight !== null) {
        if (!(await this.inFlight)) {
          return false;
        }
        continue;
      }
      if (!this.dirty) {
        return true;
      }
      if (!(await this.run())) {
        return false;
      }
    }
  }

  private run(): Promise<boolean> {
    this.dirty = false;
    const attempt = (async () => {
      try {
        await this.options.save();
        return true;
      } catch {
        return false;
      }
    })();
    this.inFlight = attempt.then((saved) => {
      this.inFlight = null;
      if (saved) {
        this.options.onSaved();
        // Si llegó un cambio mientras se guardaba, el indicador sigue en «Guardando…».
        if (!this.dirty) {
          this.options.onStatus('saved');
        }
      } else {
        this.dirty = true;
        this.options.onStatus('failed');
      }
      return saved;
    });
    return this.inFlight;
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
