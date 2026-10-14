// Instantes escritos como los dice una persona: «16/03/2027 02:30», hora de Buenos Aires.
// Buenos Aires está en UTC−3 todo el año desde 2009.
export function inBuenosAires(text: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) {
    throw new Error(`Fecha mal escrita en la prueba: «${text}» (se espera dd/mm/aaaa hh:mm)`);
  }
  const [, day, month, year, hour, minute, second = '00'] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
}
