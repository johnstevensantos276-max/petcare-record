// Stops whatever is still listening on the dev port (e.g. an old `npm run dev`)
// so a new dev server can start without the "Port 4200 is already in use" error.
const { execSync } = require('child_process');

const port = process.argv[2] || '4200';

function pidsOnPort() {
  try {
    if (process.platform === 'win32') {
      // No "-p tcp": that hides IPv6 listeners such as [::1]:4200.
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      return [...new Set(
        out.split(/\r?\n/)
          .map(line => line.trim().split(/\s+/))
          .filter(cols => cols[1] && cols[1].endsWith(`:${port}`) && cols[3] === 'LISTENING')
          .map(cols => cols[4])
      )];
    }

    return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

for (const pid of pidsOnPort()) {
  if (!pid || pid === '0' || pid === String(process.pid)) {
    continue;
  }

  try {
    execSync(
      process.platform === 'win32' ? `taskkill /PID ${pid} /T /F` : `kill -9 ${pid}`,
      { stdio: 'ignore' }
    );
    console.log(`Stopped old server on port ${port} (PID ${pid}).`);
  } catch {
    console.warn(`Could not stop PID ${pid} on port ${port}.`);
  }
}
