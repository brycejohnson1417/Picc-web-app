import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const localEnv = loadEnvFile(resolve(process.cwd(), '.env.local'));
const port = process.env.PICC_AGENT_DEV_PORT || localEnv.PICC_AGENT_DEV_PORT || process.env.PORT || '3010';
const child = spawn('npx', ['next', 'dev', '--hostname', '127.0.0.1', '--port', port], {
  stdio: 'inherit',
  env: { ...process.env, ...localEnv, PICC_AGENT_DEV_PORT: port, PORT: port },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
