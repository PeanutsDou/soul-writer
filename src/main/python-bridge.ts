// Python 后端子进程管理
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import http from 'http';

let pythonProcess: ChildProcess | null = null;
let apiPort: number = 8720;

function getServerDir(): string {
  // In dev mode, server is in project root
  // In packaged app, server is in resources/
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    return path.join(__dirname, '../../server');
  }
  return path.join(process.resourcesPath, 'server');
}

export function getApiBaseUrl(): string {
  return `http://127.0.0.1:${apiPort}`;
}

export async function startPythonBackend(): Promise<void> {
  if (pythonProcess) return;
  
  const serverDir = getServerDir();
  const pythonCmd = 'python';
  
  return new Promise((resolve, reject) => {
    pythonProcess = spawn(pythonCmd, ['main.py'], {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: String(apiPort),
        SOUL_WRITER_DATA: path.join(
          require('electron').app.getPath('userData'),
          'data'
        ),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      console.log('[Python]', data.toString().trim());
    });

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Python:err]', data.toString().trim());
    });

    pythonProcess.on('error', (err) => {
      console.error('[Python] Failed to start:', err.message);
      reject(err);
    });

    pythonProcess.on('exit', (code) => {
      console.log('[Python] Exited with code', code);
      pythonProcess = null;
    });

    // Wait for the server to be ready
    waitForServer(apiPort, 30)
      .then(() => {
        console.log('[Python] Backend ready on port', apiPort);
        resolve();
      })
      .catch(reject);
  });
}

function waitForServer(port: number, maxRetries: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const tryConnect = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (retries < maxRetries) {
          retries++;
          setTimeout(tryConnect, 500);
        } else {
          reject(new Error('Python backend failed to start'));
        }
      });
      req.on('error', () => {
        if (retries < maxRetries) {
          retries++;
          setTimeout(tryConnect, 500);
        } else {
          reject(new Error('Python backend failed to start'));
        }
      });
    };
    tryConnect();
  });
}

export function stopPythonBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}
