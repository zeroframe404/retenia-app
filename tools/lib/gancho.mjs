// Lee el JSON que Claude Code le pasa a un gancho por la entrada estándar.
export async function leerEntrada() {
  let texto = '';
  for await (const parte of process.stdin) {
    texto += parte;
  }
  if (texto.trim() === '') {
    return {};
  }
  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
}
