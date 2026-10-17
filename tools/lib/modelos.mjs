// La carpeta de modelos de voz que usan el desarrollo y la red de pruebas (no la de Retenia
// instalado, que los baja a su propia carpeta de datos). Vive fuera del proyecto para que las
// copias del proyecto que arma la red (los sabotajes) la encuentren igual, y para que
// «npm run datos:reiniciar» no la borre. RETENIA_MODELOS_DESARROLLO la cambia.
import { join, resolve } from 'node:path';

const localAppData =
  process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '.', 'AppData', 'Local');

export const DEV_MODELS_DIR = process.env.RETENIA_MODELOS_DESARROLLO
  ? resolve(process.env.RETENIA_MODELOS_DESARROLLO)
  : join(localAppData, 'Retenia-desarrollo', 'modelos');
