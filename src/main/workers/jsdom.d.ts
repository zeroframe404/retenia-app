// jsdom no trae tipos. Retenia solo lo usa en `web.ts`, que declara acá mismo la parte del DOM que
// toca; la ventana de jsdom se trata como un objeto opaco y se convierte allá.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: object;
  }
}
