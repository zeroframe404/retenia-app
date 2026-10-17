// Bloqueo de red para la capa de pruebas «sin-red» (vitest.config.ts la carga con --require en
// cada proceso de pruebas, y Node la vuelve a cargar en cada hilo que ese proceso abra, como los
// del reconocimiento de escaneos). Cualquier intento de salir a la red falla con un error que
// empieza con «SIN RED»: si algo del Laboratorio necesitara internet, su prueba daría rojo.
const dns = require('node:dns');
const net = require('node:net');
const tls = require('node:tls');

const blocked = (what) => new Error(`SIN RED: ${what} intentó salir a la red`);

net.Socket.prototype.connect = function connect() {
  throw blocked('una conexión');
};
tls.connect = () => {
  throw blocked('una conexión segura');
};
dns.lookup = (host, _options, callback) => {
  const done = typeof _options === 'function' ? _options : callback;
  process.nextTick(() => done(blocked(`la búsqueda de ${host}`)));
};
dns.promises.lookup = async (host) => {
  throw blocked(`la búsqueda de ${host}`);
};
globalThis.fetch = async (url) => {
  throw blocked(`un pedido a ${String(url)}`);
};
