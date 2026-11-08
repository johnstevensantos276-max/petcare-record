// PetCare API server: keeps every account's data in one SQLite file so the
// same account works on any device that can reach this computer.
//
// Run with `npm run server` (Node.js 22.13+ for the built-in node:sqlite).
// It also serves the built app from ../www, so after `npm run build` phones
// on the same Wi-Fi can open http://<this-computer's-IP>:3000.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.PETCARE_DB || path.join(__dirname, 'petcare.db');
const WEB_ROOT = path.join(__dirname, '..', 'www');
const MAX_BODY = 15 * 1024 * 1024; // pet photos are sent as data URLs
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// Personal data is encrypted in the database file with this key, so opening
// petcare.db shows only scrambled text. Keep secret.key private and back it
// up together with petcare.db: without it the data cannot be read.
const KEY_FILE = process.env.PETCARE_KEY || path.join(__dirname, 'secret.key');

if (!fs.existsSync(KEY_FILE)) {
  fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}

const KEY = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');

function seal(value) {
  if (value === null || value === undefined) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return 'enc:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
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

// Columns kept encrypted in each table.
const SEALED = {
  users: ['fullName', 'email', 'securityQuestion'],
  pets: ['petName', 'petType', 'breed', 'birthday', 'ownerName', 'passedAwayOn',
    'vaccinationStatus', 'vaccines', 'photo'],
  appointments: ['petName', 'doctorName', 'purpose'],
  history: ['title', 'details']
};

function unsealRow(table, row) {
  if (!row) {
    return row;
  }

  const result = { ...row };
  SEALED[table].forEach(column => (result[column] = unseal(result[column])));
  return result;
}

// The email (and Google/Facebook ID) is saved encrypted; `username` holds
// only this one-way code of it, so logins can still be looked up.
function lookupKey(login) {
  const value = String(login).trim().toLowerCase();
  return 'h:' + crypto.createHmac('sha256', KEY).update('login:' + value).digest('hex');
}

// Passwords need 6+ characters with at least one letter and one number.
function strongPassword(password) {
  return password.length >= 6 && /[a-z]/i.test(password) && /\d/.test(password);
}

const WEAK_PASSWORD =
  'Password must be at least 6 characters and include letters and numbers.';

// Session tokens and reset codes are stored only as hashes.
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    petName TEXT NOT NULL,
    petType TEXT NOT NULL,
    breed TEXT NOT NULL DEFAULT '',
    birthday TEXT NOT NULL DEFAULT '',
    ownerName TEXT NOT NULL DEFAULT '',
    vaccinationStatus TEXT NOT NULL DEFAULT '',
    vaccines TEXT NOT NULL DEFAULT '[]',
    photo TEXT
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    petId INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    petName TEXT NOT NULL,
    doctorName TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending'
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

// Added after the first release: which kind of account the user picked.
// Memories: the day a pet passed away (empty while it is alive).
const petColumns = db.prepare('PRAGMA table_info(pets)').all().map(c => c.name);

if (!petColumns.includes('passedAwayOn')) {
  db.exec('ALTER TABLE pets ADD COLUMN passedAwayOn TEXT');
}

// What the appointment is for (Check-up, Vaccination, ...).
const appointmentColumns = db.prepare('PRAGMA table_info(appointments)').all().map(c => c.name);

if (!appointmentColumns.includes('purpose')) {
  db.exec('ALTER TABLE appointments ADD COLUMN purpose TEXT');
}

const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);

if (!userColumns.includes('accountType')) {
  db.exec("ALTER TABLE users ADD COLUMN accountType TEXT NOT NULL DEFAULT 'email'");
}

// The encrypted email (see lookupKey).
if (!userColumns.includes('email')) {
  db.exec('ALTER TABLE users ADD COLUMN email TEXT');
}

// Forgot Password: the hash of the user's 4-digit Recovery PIN, and a lock
// after too many wrong PINs. (securityQuestion, securityAnswer and
// recoveryCode are from earlier versions and no longer used.)
for (const [column, type] of [
  ['securityQuestion', 'TEXT'],
  ['securityAnswer', 'TEXT'],
  ['recoveryCode', 'TEXT'],
  ['recoveryPin', 'TEXT'],
  ['pinFailures', 'INTEGER NOT NULL DEFAULT 0'],
  ['pinLockedUntil', 'INTEGER NOT NULL DEFAULT 0']
]) {
  if (!userColumns.includes(column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
  }
}

// Used by accounts from the first Google / Facebook login version.
for (const column of ['googleId', 'facebookId']) {
  if (!userColumns.includes(column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
  }

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_${column} ON users(${column})`);
}

// Version 1: encrypt existing personal data and start storing token hashes.
if (db.prepare('PRAGMA user_version').get().user_version < 1) {
  db.exec('BEGIN');

  for (const [table, columns] of Object.entries(SEALED)) {
    for (const row of db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all()) {
      const values = columns.map(column =>
        typeof row[column] === 'string' && !row[column].startsWith('enc:')
          ? seal(row[column])
          : row[column]
      );

      db.prepare(
        `UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`
      ).run(...values, row.id);
    }
  }

  // Old sessions and codes were saved in plain text: drop them.
  db.exec('DELETE FROM sessions; DELETE FROM password_resets; PRAGMA user_version = 1');
  db.exec('COMMIT');
}

// Version 2: encrypt emails; keep only lookup codes of emails and IDs.
if (db.prepare('PRAGMA user_version').get().user_version < 2) {
  db.exec('BEGIN');

  for (const user of db.prepare('SELECT * FROM users').all()) {
    if (user.username.startsWith('h:')) {
      continue;
    }

    db.prepare(`
      UPDATE users SET email = ?, username = ?, googleId = ?, facebookId = ?
      WHERE id = ?
    `).run(
      seal(user.username),
      lookupKey(user.username),
      user.googleId ? lookupKey('google:' + user.googleId) : null,
      user.facebookId ? lookupKey('facebook:' + user.facebookId) : null,
      user.id
    );
  }

  db.exec('PRAGMA user_version = 2');
  db.exec('COMMIT');
}

// ---------- Helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Compared against when the email does not exist, so a wrong email takes
// as long as a wrong password and does not reveal which emails have accounts.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- Rate limits (stop password / code guessing) ----------

const hits = new Map();

function clientIp(req) {
  // Behind Cloudflare Tunnel every request comes from this computer.
  return String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress);
}

function limit(req, name, max, windowMs) {
  const key = `${name}|${clientIp(req)}`;
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (++entry.count > max) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);
    throw new HttpError(
      429,
      `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`
    );
  }
}

setInterval(() => {
  const now = Date.now();
  hits.forEach((entry, key) => now > entry.resetAt && hits.delete(key));
  db.prepare('DELETE FROM sessions WHERE createdAt < ?')
    .run(new Date(now - SESSION_LIFETIME_MS).toISOString());
}, 10 * 60 * 1000).unref();

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: unseal(user.fullName),
    username: unseal(user.email),
    accountType: user.accountType,
    hasPin: !!user.recoveryPin
  };
}

function petFromRow(row) {
  const pet = unsealRow('pets', row);
  return {
    ...pet,
    vaccines: JSON.parse(pet.vaccines || '[]'),
    photo: pet.photo ?? undefined,
    passedAwayOn: pet.passedAwayOn ?? undefined
  };
}

function petFields(body) {
  const petName = text(body.petName);
  const petType = text(body.petType);

  if (!petName || !petType) {
    throw new HttpError(400, 'Pet name and type are required.');
  }

  // Only real images may be saved as the photo.
  const photo = typeof body.photo === 'string' && body.photo.startsWith('data:image/')
    ? body.photo
    : null;

  return {
    petName: seal(petName),
    petType: seal(petType),
    breed: seal(text(body.breed)),
    birthday: seal(text(body.birthday)),
    ownerName: seal(text(body.ownerName)),
    vaccinationStatus: seal(text(body.vaccinationStatus)),
    vaccines: seal(JSON.stringify(Array.isArray(body.vaccines) ? body.vaccines : [])),
    photo: seal(photo),
    plainName: petName
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;

      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request is too large.'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Never keep account data in browser or proxy caches.
    'Cache-Control': 'no-store'
  });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// A 4-digit PIN only has 10,000 choices, so each account is locked for an
// hour after 5 wrong PINs, whatever device the guesses come from.
const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 60 * 60 * 1000;

function isPin(value) {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

function checkPin(user, pin) {
  if (Date.now() < user.pinLockedUntil) {
    const minutes = Math.ceil((user.pinLockedUntil - Date.now()) / 60000);
    throw new HttpError(
      429,
      `Too many wrong PINs. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
  }

  if (user.recoveryPin && isPin(pin) && checkPassword(pin, user.recoveryPin)) {
    db.prepare('UPDATE users SET pinFailures = 0, pinLockedUntil = 0 WHERE id = ?')
      .run(user.id);
    return;
  }

  const failures = user.pinFailures + 1;

  if (failures >= PIN_MAX_FAILURES) {
    db.prepare('UPDATE users SET pinFailures = 0, pinLockedUntil = ? WHERE id = ?')
      .run(Date.now() + PIN_LOCK_MS, user.id);
    throw new HttpError(429, 'Too many wrong PINs. Please try again in 60 minutes.');
  }

  db.prepare('UPDATE users SET pinFailures = ? WHERE id = ?').run(failures, user.id);
  throw new HttpError(400, 'Incorrect email or PIN.');
}

function startSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)')
    .run(sha256(token), user.id, new Date().toISOString());

  return { data: { token, user: publicUser(user) } };
}

function requireUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = token &&
    db.prepare('SELECT userId, createdAt FROM sessions WHERE token = ?').get(sha256(token));

  if (!session) {
    throw new HttpError(401, 'Please log in again.');
  }

  // Logins last 30 days, then the user signs in again.
  if (Date.now() - Date.parse(session.createdAt) > SESSION_LIFETIME_MS) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
    throw new HttpError(401, 'Your login has expired. Please log in again.');
  }

  return session.userId;
}

function ownPet(userId, id) {
  const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND userId = ?')
    .get(id, userId);

  if (!pet) {
    throw new HttpError(404, 'Pet record not found.');
  }

  return pet;
}

function ownAppointment(userId, id) {
  const item = db.prepare('SELECT * FROM appointments WHERE id = ? AND userId = ?')
    .get(id, userId);

  if (!item) {
    throw new HttpError(404, 'Appointment not found.');
  }

  return item;
}

// ---------- Routes ----------

const routes = [];

function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '(\\d+)';
    }) + '$'
  );

  routes.push({ method, regex, keys, handler });
}

// Accounts

route('POST', '/api/register', (req, body) => {
  limit(req, 'register', 10, 60 * 60 * 1000);
  const fullName = text(body.fullName);
  const username = text(body.username).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  // Which sign-in button made the account (the Google/Facebook ones are a
  // look-alike sign-in for this app, not connected to the real services).
  const accountType = ['google', 'facebook'].includes(body.accountType)
    ? body.accountType
    : 'email';
  const recoveryPin = body.recoveryPin;

  if (!fullName || !username || !password || !recoveryPin) {
    throw new HttpError(400, 'Please complete all fields.');
  }

  if (!isPin(recoveryPin)) {
    throw new HttpError(400, 'The Recovery PIN must be exactly 4 numbers.');
  }

  if (!isEmail(username)) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }

  if (!strongPassword(password)) {
    throw new HttpError(400, WEAK_PASSWORD);
  }

  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(lookupKey(username))) {
    throw new HttpError(409, 'Username is already taken.');
  }

  db.prepare(
    `INSERT INTO users (fullName, username, email, passwordHash, accountType,
      recoveryPin) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(seal(fullName), lookupKey(username), seal(username), hashPassword(password),
    accountType, hashPassword(recoveryPin));

  return { status: 201 };
});

route('POST', '/api/login', (req, body) => {
  limit(req, 'login', 10, 15 * 60 * 1000);
  const username = text(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?')
    .get(lookupKey(username));
  const valid = checkPassword(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !valid) {
    throw new HttpError(401, 'Incorrect username or password.');
  }

  return startSession(user);
});

// The Google / Facebook buttons: email + password (+ a Recovery PIN the first
// time). The first time, the account is made by itself; after that the same
// password is needed, so no one can get into someone else's account with
// just their email.
route('POST', '/api/login/quick', (req, body) => {
  limit(req, 'login', 10, 15 * 60 * 1000);
  const username = text(body.username).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const accountType = ['google', 'facebook'].includes(body.accountType)
    ? body.accountType
    : 'email';
  const user = db.prepare('SELECT * FROM users WHERE username = ?')
    .get(lookupKey(username));

  if (user) {
    if (!checkPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Incorrect password for this account.');
    }

    return startSession(user);
  }

  // Facebook also allows a username or mobile number; it is not connected to
  // the real Facebook, so any login of 3+ characters works (same as the app).
  const validLogin = isEmail(username) ||
    (accountType === 'facebook' && /^\S{3,60}$/.test(username));

  if (!validLogin) {
    throw new HttpError(
      400,
      accountType === 'facebook'
        ? 'Please enter your Facebook email, username or mobile number.'
        : 'Please enter a valid email address.'
    );
  }

  if (!strongPassword(password)) {
    throw new HttpError(400, 'New account: ' + WEAK_PASSWORD);
  }

  if (!isPin(body.recoveryPin)) {
    throw new HttpError(400, 'New account: please add a 4-number Recovery PIN.');
  }

  // Name from the email: juan.dela-cruz@gmail.com -> "Juan Dela Cruz".
  const fullName = username.split('@')[0]
    .split(/[._\-+\d]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ') || 'PetCare User';

  const result = db.prepare(
    'INSERT INTO users (fullName, username, email, passwordHash, accountType, recoveryPin) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(seal(fullName), lookupKey(username), seal(username), hashPassword(password),
    accountType, hashPassword(body.recoveryPin));

  return startSession(
    db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
  );
});

route('POST', '/api/logout', req => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = db.prepare('SELECT userId FROM sessions WHERE token = ?').get(sha256(token));

  if (session) {
    // Saved here (not by the app), since the app leaves for the login page
    // right away.
    db.prepare(`
      INSERT INTO history (userId, action, title, details, createdAt)
      VALUES (?, 'logout', ?, ?, ?)
    `).run(session.userId, seal('Logged out'), seal('You logged out of PetCare'),
      new Date().toISOString());
  }

  db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
  return {};
});

route('GET', '/api/me', req => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(requireUser(req));
  return { data: publicUser(user) };
});

// ---------- Profile (while logged in) ----------

// Changing the password or PIN needs the current password OR the Recovery
// PIN, so a forgotten password can be changed without logging out, but
// someone holding an unlocked phone cannot take over the account.
function verifyOwner(user, value) {
  const secret = typeof value === 'string' ? value : '';

  if (secret && checkPassword(secret, user.passwordHash)) {
    return;
  }

  if (isPin(secret) && user.recoveryPin) {
    try {
      checkPin(user, secret); // counts toward the lock when wrong
      return;
    } catch (error) {
      // Keep the "too many tries" message; reword the plain wrong-PIN one.
      if (error.status === 429) {
        throw error;
      }
    }
  }

  throw new HttpError(400, 'Incorrect current password or Recovery PIN.');
}

function currentToken(req) {
  return sha256((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
}

route('PUT', '/api/me', (req, body) => {
  const userId = requireUser(req);
  const fullName = text(body.fullName);

  if (!fullName || fullName.length > 80) {
    throw new HttpError(400, 'Please enter your name (up to 80 characters).');
  }

  db.prepare('UPDATE users SET fullName = ? WHERE id = ?').run(seal(fullName), userId);
  return { data: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) };
});

route('POST', '/api/me/password', (req, body) => {
  const userId = requireUser(req);
  limit(req, 'change-password', 10, 15 * 60 * 1000);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const password = typeof body.password === 'string' ? body.password : '';

  verifyOwner(user, body.verify);

  if (!strongPassword(password)) {
    throw new HttpError(400, WEAK_PASSWORD);
  }

  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(password), userId);
  // Other devices must log in with the new password; this one stays in.
  db.prepare('DELETE FROM sessions WHERE userId = ? AND token != ?').run(userId, currentToken(req));
  db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, 'password-changed', ?, ?, ?)
  `).run(userId, seal('Password changed'), seal('You changed your password from your profile'),
    new Date().toISOString());

  return {};
});

route('POST', '/api/me/pin', (req, body) => {
  const userId = requireUser(req);
  limit(req, 'change-pin', 10, 15 * 60 * 1000);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  verifyOwner(user, body.verify);

  if (!isPin(body.pin)) {
    throw new HttpError(400, 'The Recovery PIN must be exactly 4 numbers.');
  }

  db.prepare(`
    UPDATE users SET recoveryPin = ?, pinFailures = 0, pinLockedUntil = 0 WHERE id = ?
  `).run(hashPassword(body.pin), userId);
  db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, 'pin-changed', ?, ?, ?)
  `).run(userId, seal('Recovery PIN changed'), seal('You set a new Recovery PIN'),
    new Date().toISOString());

  return {};
});

// Forgot Password: the email + the 4-digit Recovery PIN set a new password.
route('POST', '/api/password-reset', (req, body) => {
  limit(req, 'reset', 10, 15 * 60 * 1000);
  const user = db.prepare('SELECT * FROM users WHERE username = ?')
    .get(lookupKey(text(body.username)));
  const password = typeof body.password === 'string' ? body.password : '';

  if (!user) {
    // Same time and answer as a wrong PIN, so emails cannot be tested.
    checkPassword('0000', DUMMY_HASH);
    throw new HttpError(400, 'Incorrect email or PIN.');
  }

  if (!user.recoveryPin) {
    throw new HttpError(
      400,
      'This account has no Recovery PIN. Please ask the admin to reset your password.'
    );
  }

  checkPin(user, body.pin);

  if (!strongPassword(password)) {
    throw new HttpError(400, WEAK_PASSWORD);
  }

  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?')
    .run(hashPassword(password), user.id);
  // Log out every device that used the old password.
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(user.id);
  db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, 'password-reset', ?, ?, ?)
  `).run(user.id, seal('Password reset'),
    seal('Your password was changed using your Recovery PIN'), new Date().toISOString());

  return {};
});

// Pets

route('GET', '/api/pets', req => {
  const rows = db.prepare('SELECT * FROM pets WHERE userId = ? ORDER BY id')
    .all(requireUser(req));
  return { data: rows.map(petFromRow) };
});

route('GET', '/api/pets/:id', (req, body, params) => {
  return { data: petFromRow(ownPet(requireUser(req), params.id)) };
});

route('POST', '/api/pets', (req, body) => {
  const userId = requireUser(req);
  const pet = petFields(body);
  const result = db.prepare(`
    INSERT INTO pets (userId, petName, petType, breed, birthday, ownerName,
      vaccinationStatus, vaccines, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, pet.petName, pet.petType, pet.breed, pet.birthday,
    pet.ownerName, pet.vaccinationStatus, pet.vaccines, pet.photo);

  return { status: 201, data: { id: Number(result.lastInsertRowid) } };
});

route('PUT', '/api/pets/:id', (req, body, params) => {
  const userId = requireUser(req);
  ownPet(userId, params.id);
  const pet = petFields(body);

  db.prepare(`
    UPDATE pets SET petName = ?, petType = ?, breed = ?, birthday = ?,
      ownerName = ?, vaccinationStatus = ?, vaccines = ?, photo = ?
    WHERE id = ?
  `).run(pet.petName, pet.petType, pet.breed, pet.birthday, pet.ownerName,
    pet.vaccinationStatus, pet.vaccines, pet.photo, params.id);

  // Appointments keep a copy of the pet's name.
  db.prepare('UPDATE appointments SET petName = ? WHERE petId = ?')
    .run(seal(pet.plainName), params.id);

  return {};
});

// Marks a pet as passed away (it moves to Memories), or brings it back with
// passedAwayOn: null. Its upcoming appointments are cancelled; past ones stay.
route('PATCH', '/api/pets/:id', (req, body, params) => {
  ownPet(requireUser(req), params.id);
  const date = body.passedAwayOn;

  if (date === null) {
    db.prepare('UPDATE pets SET passedAwayOn = NULL WHERE id = ?').run(params.id);
    return {};
  }

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, 'Please choose a valid date.');
  }

  db.prepare('UPDATE pets SET passedAwayOn = ? WHERE id = ?').run(seal(date), params.id);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const removed = db.prepare(
    "DELETE FROM appointments WHERE petId = ? AND status = 'Pending' AND date >= ?"
  ).run(params.id, today).changes;

  return { data: { cancelledAppointments: Number(removed) } };
});

route('DELETE', '/api/pets/:id', (req, body, params) => {
  ownPet(requireUser(req), params.id);
  // Its appointments are removed by ON DELETE CASCADE.
  db.prepare('DELETE FROM pets WHERE id = ?').run(params.id);
  return {};
});

// Appointments

route('GET', '/api/appointments', req => {
  const rows = db.prepare(
    'SELECT * FROM appointments WHERE userId = ? ORDER BY date, time'
  ).all(requireUser(req));
  return { data: rows.map(row => unsealRow('appointments', row)) };
});

route('POST', '/api/appointments', (req, body) => {
  const userId = requireUser(req);
  const pet = ownPet(userId, Number(body.petId));
  const petName = unseal(pet.petName);
  const doctorName = text(body.doctorName);
  const purpose = text(body.purpose);
  const date = text(body.date);
  const time = text(body.time);

  if (!doctorName || !purpose || !date || !time) {
    throw new HttpError(400, 'Please complete all fields.');
  }

  const duplicate = db.prepare(
    'SELECT 1 FROM appointments WHERE petId = ? AND date = ? AND time = ?'
  ).get(pet.id, date, time);

  if (duplicate) {
    throw new HttpError(
      409,
      `${petName} already has an appointment at that date and time.`
    );
  }

  const result = db.prepare(`
    INSERT INTO appointments (userId, petId, petName, doctorName, purpose, date, time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
  `).run(userId, pet.id, seal(petName), seal(doctorName), seal(purpose), date, time);

  return { status: 201, data: { id: Number(result.lastInsertRowid) } };
});

// Reschedule a missed appointment: new doctor, date and time, and it is
// pending again. Pending and completed ones cannot be changed this way.
route('PUT', '/api/appointments/:id', (req, body, params) => {
  const item = ownAppointment(requireUser(req), params.id);
  // Same rule as the app: pending ones whose day is over count as missed.
  const missed = item.status === 'Missed' ||
    (item.status === 'Pending' && new Date(`${item.date}T23:59:59.999`) < new Date());

  if (!missed) {
    throw new HttpError(400, 'Only missed appointments can be rescheduled.');
  }

  const doctorName = text(body.doctorName);
  const date = text(body.date);
  const time = text(body.time);

  if (!doctorName || !date || !time) {
    throw new HttpError(400, 'Please complete all appointment details.');
  }

  if (!(new Date(`${date}T${time}`) > new Date())) {
    throw new HttpError(400, 'Please choose a future date and time.');
  }

  const duplicate = db.prepare(
    'SELECT 1 FROM appointments WHERE petId = ? AND date = ? AND time = ? AND id != ?'
  ).get(item.petId, date, time, item.id);

  if (duplicate) {
    throw new HttpError(
      409,
      `${unseal(item.petName)} already has an appointment at that date and time.`
    );
  }

  // The purpose may also change; if none is sent, the old one stays.
  const purpose = text(body.purpose) ? seal(text(body.purpose)) : item.purpose;

  db.prepare(`
    UPDATE appointments SET doctorName = ?, purpose = ?, date = ?, time = ?, status = 'Pending'
    WHERE id = ?
  `).run(seal(doctorName), purpose, date, time, item.id);

  return {};
});

route('PATCH', '/api/appointments/:id', (req, body, params) => {
  ownAppointment(requireUser(req), params.id);

  if (body.status !== 'Completed' && body.status !== 'Missed') {
    throw new HttpError(400, 'Invalid status.');
  }

  db.prepare('UPDATE appointments SET status = ? WHERE id = ?')
    .run(body.status, params.id);
  return {};
});

route('DELETE', '/api/appointments/:id', (req, body, params) => {
  ownAppointment(requireUser(req), params.id);
  db.prepare('DELETE FROM appointments WHERE id = ?').run(params.id);
  return {};
});

// History

route('GET', '/api/history', req => {
  const rows = db.prepare(
    'SELECT * FROM history WHERE userId = ? ORDER BY createdAt DESC, id DESC'
  ).all(requireUser(req));
  return { data: rows.map(row => unsealRow('history', row)) };
});

route('POST', '/api/history', (req, body) => {
  const userId = requireUser(req);
  db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, text(body.action), seal(text(body.title)), seal(text(body.details)),
    new Date().toISOString());
  return { status: 201 };
});

route('DELETE', '/api/history', req => {
  db.prepare('DELETE FROM history WHERE userId = ?').run(requireUser(req));
  return {};
});

// ---------- Static app (www) ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

function serveApp(req, res, pathname) {
  if (!fs.existsSync(WEB_ROOT)) {
    send(res, 404, { error: 'App not built yet. Run `npm run build` first.' });
    return;
  }

  let file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));

  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) {
    send(res, 403, { error: 'Forbidden' });
    return;
  }

  // Angular routes like /dashboard fall back to index.html.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(WEB_ROOT, 'index.html');
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'
  });
  fs.createReadStream(file).pipe(res);
}

// ---------- Server ----------

function isAllowedOrigin(origin) {
  if (['capacitor://localhost', 'http://localhost', 'https://localhost'].includes(origin)) {
    return true;
  }

  try {
    return new URL(origin).port === '4200';
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  // Basic browser protections for every response.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Only the app itself may call the API from a browser: the page this server
  // serves (same address), `ng serve` on port 4200, or the phone app.
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, 'http://localhost');

  if (!pathname.startsWith('/api/')) {
    serveApp(req, res, pathname);
    return;
  }

  try {
    for (const r of routes) {
      const match = r.method === req.method && r.regex.exec(pathname);

      if (!match) {
        continue;
      }

      const params = {};
      r.keys.forEach((key, i) => (params[key] = Number(match[i + 1])));

      const body = await readBody(req);
      const result = (await r.handler(req, body, params)) || {};
      send(res, result.status || 200, result.data);
      return;
    }

    throw new HttpError(404, 'Not found.');
  } catch (error) {
    if (!(error instanceof HttpError)) {
      console.error(error);
    }

    send(res, error.status || 500, {
      error: error instanceof HttpError ? error.message : 'Server error.'
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(require('node:os').networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => `  http://${item.address}:${PORT}`);

  console.log(`PetCare server running. Database: ${DB_FILE}`);
  console.log(`  http://localhost:${PORT}`);
  addresses.forEach(line => console.log(line));
});
