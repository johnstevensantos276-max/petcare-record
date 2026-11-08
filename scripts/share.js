// `npm start`: builds the app and keeps rebuilding it when files change,
// starts the PetCare server (restarting itself when server.js changes) and a
// Cloudflare Tunnel, then prints the https link to send to other people.
// Keep this window open while they use the app; the link stays the same
// until it is closed. Ctrl + C stops everything.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const LOCAL_URL = `http://localhost:${PORT}`;

function findCloudflared() {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')
  ];

  return candidates.find(file => fs.existsSync(file)) || 'cloudflared';
}

// Any answer from the server (even "please log in") means it is running.
// Puts the link on the Windows clipboard so it can be pasted right away.
function copyToClipboard(value) {
  if (process.platform !== 'win32') {
    return false;
  }

  try {
    require('node:child_process').execSync('clip', { input: value });
    return true;
  } catch {
    return false;
  }
}

// Opens the app on this computer (set PETCARE_NO_BROWSER=1 to skip).
function openInBrowser(url) {
  if (process.platform === 'win32' && !process.env.PETCARE_NO_BROWSER) {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
  }
}

async function serverIsUp() {
  try {
    await fetch(`${LOCAL_URL}/api/me`);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    if (await serverIsUp()) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return false;
}

const children = [];

function stopAll() {
  children.forEach(child => child.kill());
  process.exit(0);
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const ROOT = path.join(__dirname, '..');

// Rebuilds the app whenever a file in src/ changes. The server reads the
// built files on every request, so users get the update on their next
// refresh, through the same link.
function watchApp() {
  return new Promise(resolve => {
    const ng = spawn(
      process.execPath,
      [path.join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'build', '--watch'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    children.push(ng);

    let firstBuild = true;
    const report = chunk => {
      const output = String(chunk);

      if (/Application bundle generation complete/.test(output)) {
        if (firstBuild) {
          firstBuild = false;
          resolve();
        } else {
          console.log(`[${new Date().toLocaleTimeString()}] App updated. Users see it when they refresh.`);
        }
      }

      if (/\bERROR\b|\[ERROR\]|✘/.test(output)) {
        console.log(output.trim());
        console.log('The app has an error; the link keeps showing the last working version.');

        if (firstBuild && fs.existsSync(path.join(ROOT, 'www', 'index.html'))) {
          firstBuild = false;
          resolve();
        }
      }
    };

    ng.stdout.on('data', report);
    ng.stderr.on('data', report);
  });
}

(async () => {
  console.log('Building the app (about 20 seconds)...');
  await watchApp();

  if (await serverIsUp()) {
    console.log(`PetCare server is already running at ${LOCAL_URL}`);
    console.log('(Close that window and start again so server changes also load by themselves.)');
  } else {
    console.log('Starting the PetCare server...');
    // --watch restarts the server by itself when server.js changes.
    const server = spawn(process.execPath, ['--watch', path.join(ROOT, 'server', 'server.js')], {
      stdio: 'inherit'
    });
    children.push(server);
    server.on('exit', code => {
      console.log(`\nThe PetCare server stopped (code ${code}).`);
      stopAll();
    });

    if (!(await waitForServer())) {
      console.log('The PetCare server did not start. Check the messages above.');
      stopAll();
    }
  }

  console.log('Creating the https link (this takes a few seconds)...');
  const tunnel = spawn(findCloudflared(), ['tunnel', '--url', LOCAL_URL], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(tunnel);

  tunnel.on('error', () => {
    console.log('\nCloudflare Tunnel is not installed. Run this once, then try again:');
    console.log('  winget install --id Cloudflare.cloudflared');
    stopAll();
  });

  let shown = false;
  const watch = chunk => {
    const match = !shown && String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);

    if (match) {
      shown = true;
      const copied = copyToClipboard(match[0]);
      console.log('\n==============================================================');
      console.log('  SEND THIS LINK TO THE OTHER USERS:');
      console.log(`\n  ${match[0]}\n`);

      if (copied) {
        console.log('  The link is already COPIED. Just paste it (Ctrl + V)');
        console.log('  in Messenger, Viber or text and press Send.');
      }

      console.log('\n  Keep this window open while they use the app.');
      console.log('  Changes to the app load by themselves: no need to restart,');
      console.log('  and the link stays the same. Closing this window turns it off.');
      console.log('==============================================================\n');
      openInBrowser(LOCAL_URL);
    }
  };

  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);
  tunnel.on('exit', code => {
    console.log(`\nThe link was turned off (Cloudflare Tunnel stopped, code ${code}).`);
    stopAll();
  });
})();
