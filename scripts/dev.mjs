import { spawn } from 'node:child_process';

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const workspace of ['backend', 'frontend']) {
  const child = spawn('npm', ['run', 'dev', '--workspace', workspace], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
