// Admin tool: `npm run reset-password`
// For when a user forgot both their password and their Recovery PIN. Runs
// only on this computer (it needs petcare.db and secret.key), so only the
// owner of the server can use it. It sets a new password and a new PIN.
//
// Keep the hashing below the same as in server.js.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.PETCARE_DB || path.join(__dirname, 'petcare.db');
const KEY_FILE = process.env.PETCARE_KEY || path.join(__dirname, 'secret.key');

if (!fs.existsSync(DB_FILE) || !fs.existsSync(KEY_FILE)) {
  console.log('No PetCare database found yet. Run the app and create an account first.');
  process.exit(1);
}

const KEY = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');

function lookupKey(login) {
  const value = String(login).trim().toLowerCase();
  return 'h:' + crypto.createHmac('sha256', KEY).update('login:' + value).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function unseal(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) {
    return value;
  }

  const raw = Buffer.from(value.slice(4), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()])
    .toString('utf8');
}

function strongPassword(password) {
  return password.length >= 6 && /[a-z]/i.test(password) && /\d/.test(password);
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const db = new DatabaseSync(DB_FILE);

  console.log('\n=== PetCare: reset a user\'s password ===\n');

  const email = (await rl.question('Email of the account: ')).trim();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(lookupKey(email));

  if (!user) {
    console.log('\nNo account uses that email.');
    rl.close();
    process.exit(1);
  }

  console.log(`Found: ${unseal(user.fullName)}\n`);

  let password = '';

  while (!strongPassword(password)) {
    password = await rl.question('New password (6+ characters, letters and numbers): ');

    if (!strongPassword(password)) {
      console.log('  Too weak. Use at least 6 characters with letters and numbers.');
    }
  }

  let pin = '';

  while (!/^\d{4}$/.test(pin)) {
    pin = (await rl.question('New Recovery PIN (4 numbers): ')).trim();

    if (!/^\d{4}$/.test(pin)) {
      console.log('  The PIN must be exactly 4 numbers.');
    }
  }

  rl.close();

  db.prepare(`
    UPDATE users SET passwordHash = ?, recoveryPin = ?, pinFailures = 0, pinLockedUntil = 0
    WHERE id = ?
  `).run(hashPassword(password), hashPassword(pin), user.id);
  // Log out every device that used the old password.
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(user.id);

  console.log('\nDone! The user can now log in with the new password.');
  console.log('Tell them to change it after logging in if you chose it for them.\n');
})();
