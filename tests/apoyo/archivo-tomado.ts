import { spawn } from 'node:child_process';

// Un archivo tomado por otro programa, como lo dejan a veces el antivirus o el indexador de
// Windows: un PowerShell lo abre sin compartirlo con nadie (ni para leer ni para borrar) y lo
// suelta recién cuando se le pide. Es Windows de verdad, no un doble.
export interface HeldFile {
  release(): Promise<void>;
}

export function holdFile(path: string): Promise<HeldFile> {
  const quoted = path.replaceAll("'", "''");
  const script = [
    `$archivo = [System.IO.File]::Open('${quoted}', 'Open', 'ReadWrite', 'None')`,
    "[Console]::Out.WriteLine('tomado')",
    '[Console]::Out.Flush()',
    '[Console]::In.ReadLine() | Out-Null',
    '$archivo.Close()',
  ].join('; ');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  return new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('tomado')) {
        resolve({
          release: async () => {
            child.stdin.end();
            await exited;
          },
        });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errors += chunk.toString();
    });
    child.once('exit', (code) => {
      if (!output.includes('tomado')) {
        reject(new Error(`PowerShell no pudo tomar el archivo (código ${code}): ${errors}`));
      }
    });
    child.once('error', reject);
  });
}
