// Los diálogos de Windows para elegir qué importar y dónde guardar (Fase 15). La ventana nunca manda
// una ruta: las elige la persona en el diálogo del principal. En las pruebas son un doble declarado
// en docs/plan-de-pruebas.md (anotan el pedido y devuelven una ruta fija).

interface FileFilter {
  name: string;
  extensions: string[];
}

export interface Dialogs {
  // Nulo si se canceló.
  chooseFile(input: { title: string; filters: FileFilter[] }): Promise<string | null>;
  chooseFolder(input: { title: string }): Promise<string | null>;
  chooseSave(input: {
    title: string;
    defaultName: string;
    filters: FileFilter[];
  }): Promise<string | null>;
}

// Los de Electron: modales de la ventana de Retenia.
export function electronDialogs(
  dialog: Pick<typeof import('electron').dialog, 'showOpenDialog' | 'showSaveDialog'>,
  ownerWindow: () => import('electron').BaseWindow | null,
): Dialogs {
  const parent = () => ownerWindow() ?? undefined;
  return {
    async chooseFile({ title, filters }) {
      const options = { title, filters, properties: ['openFile' as const] };
      const owner = parent();
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async chooseFolder({ title }) {
      const options = { title, properties: ['openDirectory' as const] };
      const owner = parent();
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async chooseSave({ title, defaultName, filters }) {
      const options = { title, defaultPath: defaultName, filters };
      const owner = parent();
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      return result.canceled ? null : (result.filePath ?? null);
    },
  };
}
