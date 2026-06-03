import { spawnSync } from 'node:child_process';
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const localEnv = loadEnvFile(resolve(process.cwd(), '.env.local'));
const databaseUrl = localEnv.DATABASE_URL || process.env.DATABASE_URL;
const dbName = localEnv.PICC_AGENT_DB_NAME || process.env.PICC_AGENT_DB_NAME;

if (!databaseUrl || !dbName) {
  console.error('Run npm run worktree:setup first so .env.local has DATABASE_URL and PICC_AGENT_DB_NAME.');
  process.exit(1);
}

run('docker', ['compose', '-p', 'picc-web-app', 'up', '-d', 'postgres']);
run('docker', ['exec', 'picc-postgres', 'sh', '-lc', 'until pg_isready -U postgres -d picc_crm; do sleep 1; done']);
run('docker', [
  'exec',
  'picc-postgres',
  'sh',
  '-lc',
  `psql -U postgres -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1 || createdb -U postgres ${dbName}`,
]);
run('docker', ['exec', 'picc-postgres', 'psql', '-U', 'postgres', '-d', dbName, '-c', 'CREATE EXTENSION IF NOT EXISTS postgis;']);
run('npx', ['prisma', 'db', 'push'], { env: { ...process.env, ...localEnv, DATABASE_URL: databaseUrl } });
run('npx', ['tsx', 'prisma/seed.ts'], { env: { ...process.env, ...localEnv, DATABASE_URL: databaseUrl } });
