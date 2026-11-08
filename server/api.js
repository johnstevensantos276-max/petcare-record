// PetCare API: every route and all account logic. Used by server/server.js
// (on this computer) and api/index.js (on Vercel).
//
// Data is kept in one SQLite file on this computer, or in a Turso database
// (SQLite online) when TURSO_DATABASE_URL is set.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');

// Vercel runs in UTC; appointment dates and times are local to the clinic.
if (process.env.VERCEL) {
  process.env.TZ = process.env.PETCARE_TZ || 'Asia/Manila';
}

const DB_FILE = process.env.PETCARE_DB || path.join(__dirname, 'petcare.db');
const REMOTE_URL = process.env.TURSO_DATABASE_URL;
const MAX_BODY = 15 * 1024 * 1024; // pet photos are sent as data URLs
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// Personal data is encrypted in the database with this key, so opening the
// database shows only scrambled text. On this computer it is secret.key (keep
// it private and back it up with petcare.db); online it is PETCARE_SECRET.
// Without it the data cannot be read.
const KEY_FILE = process.env.PETCARE_KEY || path.join(__dirname, 'secret.key');

function loadKey() {
  if (process.env.PETCARE_SECRET) {
    return process.env.PETCARE_SECRET.trim();
  }

  if (process.env.VERCEL) {
    return '';
  }

  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }

  return fs.readFileSync(KEY_FILE, 'utf8').trim();
}

const KEY = Buffer.from(loadKey(), 'hex');

// Online, the app cannot save anything until these settings are added.
const SETUP_MISSING = KEY.length !== 32 || (process.env.VERCEL && !REMOTE_URL);

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

// ---------- Database ----------

function connect() {
  if (REMOTE_URL) {
    return require('@libsql/client/web').createClient({
      url: REMOTE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
  }

  const { DatabaseSync } = require('node:sqlite');
  const file = new DatabaseSync(DB_FILE);

  // The same calls as the online client, for the file on this computer.
  const execute = statement => {
    const { sql, args = [] } = typeof statement === 'string' ? { sql: statement } : statement;
    const prepared = file.prepare(sql);

    if (/^s*(SELECT|PRAGMA)/i.test(sql)) {
      const rows = prepared.all(...args);
      return { rows, columns: Object.keys(rows[0] || {}) };
    }

    const result = prepared.run(...args);
    return {
      rows: [],
      columns: [],
      rowsAffected: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid
    };
  };

  return {
    execute: async statement => execute(statement),
    batch: async statements => statements.map(execute)
  };
}

const client = SETUP_MISSING ? null : connect();

function plainRow(result, row) {
  return row && Object.fromEntries(result.columns.map(column => [column, row[column]]));
}

const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const result = await client.execute({ sql, args });
        return plainRow(result, result.rows[0]);
      },
      async all(...args) {
        const result = await client.execute({ sql, args });
        return result.rows.map(row => plainRow(result, row));
      },
      async run(...args) {
        const result = await client.execute({ sql, args });
        return {
          changes: result.rowsAffected,
          lastInsertRowid: Number(result.lastInsertRowid)
        };
      }
    };
  }
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    accountType TEXT NOT NULL DEFAULT 'email',
    email TEXT,
    securityQuestion TEXT,
    securityAnswer TEXT,
    recoveryCode TEXT,
    recoveryPin TEXT,
    pinFailures INTEGER NOT NULL DEFAULT 0,
    pinLockedUntil INTEGER NOT NULL DEFAULT 0,
    googleId TEXT,
    facebookId TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    petName TEXT NOT NULL,
    petType TEXT NOT NULL,
    breed TEXT NOT NULL DEFAULT '',
    birthday TEXT NOT NULL DEFAULT '',
    ownerName TEXT NOT NULL DEFAULT '',
    vaccinationStatus TEXT NOT NULL DEFAULT '',
    vaccines TEXT NOT NULL DEFAULT '[]',
    photo TEXT,
    passedAwayOn TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    petId INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    petName TEXT NOT NULL,
    doctorName TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    purpose TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    resetAt INTEGER NOT NULL
  )`
];

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS users_googleId ON users(googleId)',
  'CREATE UNIQUE INDEX IF NOT EXISTS users_facebookId ON users(facebookId)'
];

// Brings a petcare.db from an older version up to date. An online database
// is always created with the newest tables, so it never needs this.
async function upgradeLocalFile() {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute('PRAGMA journal_mode = WAL');

  const columnsOf = async table =>
    (await db.prepare(`PRAGMA table_info(${table})`).all()).map(c => c.name);
  const addMissing = async (table, columns) => {
    const existing = await columnsOf(table);

    for (const [column, type] of columns) {
      if (!existing.includes(column)) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
  };

  await addMissing('pets', [['passedAwayOn', 'TEXT']]);
  await addMissing('appointments', [['purpose', 'TEXT']]);
  await addMissing('users', [
    ['accountType', "TEXT NOT NULL DEFAULT 'email'"],
    ['email', 'TEXT'],
    ['securityQuestion', 'TEXT'],
    ['securityAnswer', 'TEXT'],
    ['recoveryCode', 'TEXT'],
    ['recoveryPin', 'TEXT'],
    ['pinFailures', 'INTEGER NOT NULL DEFAULT 0'],
    ['pinLockedUntil', 'INTEGER NOT NULL DEFAULT 0'],
    ['googleId', 'TEXT'],
    ['facebookId', 'TEXT']
  ]);

  const version = async () => (await db.prepare('PRAGMA user_version').get()).user_version;

  // Version 1: encrypt existing personal data and start storing token hashes.
  if (await version() < 1) {
    for (const [table, columns] of Object.entries(SEALED)) {
      for (const row of await db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all()) {
        const values = columns.map(column =>
          typeof row[column] === 'string' && !row[column].startsWith('enc:')
            ? seal(row[column])
            : row[column]
        );

        await db.prepare(
          `UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`
        ).run(...values, row.id);
      }
    }

    // Old sessions and codes were saved in plain text: drop them.
    await client.execute('DELETE FROM sessions');
    await client.execute('DELETE FROM password_resets');
    await client.execute('PRAGMA user_version = 1');
  }

  // Version 2: encrypt emails; keep only lookup codes of emails and IDs.
  if (await version() < 2) {
    for (const user of await db.prepare('SELECT * FROM users').all()) {
      if (user.username.startsWith('h:')) {
        continue;
      }

      await db.prepare(`
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

    await client.execute('PRAGMA user_version = 2');
  }
}

async function init() {
  if (SETUP_MISSING) {
    throw new HttpError(503, 'The PetCare server setup is not finished yet.');
  }

  await client.batch(SCHEMA, 'write');

  if (!REMOTE_URL) {
    await upgradeLocalFile();
  }

  await client.batch(INDEXES, 'write');
}

// A plain explanation of why the database cannot be used. Only the kind of
// problem is shown, never the address or the token.
function databaseProblem(error) {
  const info = `${error.code || ''} ${error.message || ''}`;
  const status = info.match(/HTTP status (d+)/);
  const code = error.code
    ? ` (${error.code}${status ? ' ' + status[1] : ''})`
    : '';

  if (/(401|403)|unauthori[sz]ed|forbidden|JWT|auth/i.test(info)) {
    return 'Database setup: TURSO_AUTH_TOKEN is wrong or expired.' + code;
  }

  if (/URL_|404|not found|ENOTFOUND|EAI_AGAIN|getaddrinfo|Invalid URL/i.test(info)) {
    return 'Database setup: TURSO_DATABASE_URL is wrong.' + code;
  }

  if (/quota|limit|blocked|exceeded/i.test(info)) {
    return 'Database setup: the Turso plan limit was reached.' + code;
  }

  // Turso's own reason, with anything that looks like a key or address removed.
  const reason = String(error.message || '')
    .replace(/[w.-]+.turso.io/g, '[database]')
    .replace(/[w-]{24,}/g, '[hidden]')
    .slice(0, 160);
  const httpStatus = error.cause?.status ? ` HTTP ${error.cause.status}` : '';

  return `Database setup failed.${code || ` (${error.name || 'unknown'})`}${httpStatus}: ${reason}`;
}

let ready;

// Runs once per server start; tried again if it fails.
function whenReady() {
  ready ??= init().catch(error => {
    ready = undefined;
    throw error;
  });
  return ready;
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

function clientIp(req) {
  // Vercel sets x-forwarded-for itself. Behind Cloudflare Tunnel every request
  // comes from this computer.
  if (process.env.VERCEL) {
    return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  }

  return String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress);
}

async function limit(req, name, max, windowMs) {
  const id = sha256(`${name}|${clientIp(req)}`);
  const now = Date.now();

  if (Math.random() < 0.02) {
    await cleanUp(now);
  }

  const entry = await db.prepare('SELECT count, resetAt FROM rate_limits WHERE id = ?').get(id);

  if (!entry || now > entry.resetAt) {
    await db.prepare('INSERT OR REPLACE INTO rate_limits (id, count, resetAt) VALUES (?, 1, ?)')
      .run(id, now + windowMs);
    return;
  }

  if (entry.count + 1 > max) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);
    throw new HttpError(
      429,
      `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`
    );
  }

  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE id = ?').run(id);
}

async function cleanUp(now) {
  await db.prepare('DELETE FROM rate_limits WHERE resetAt < ?').run(now);
  await db.prepare('DELETE FROM sessions WHERE createdAt < ?')
    .run(new Date(now - SESSION_LIFETIME_MS).toISOString());
}

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

async function checkPin(user, pin) {
  if (Date.now() < user.pinLockedUntil) {
    const minutes = Math.ceil((user.pinLockedUntil - Date.now()) / 60000);
    throw new HttpError(
      429,
      `Too many wrong PINs. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
  }

  if (user.recoveryPin && isPin(pin) && checkPassword(pin, user.recoveryPin)) {
    await db.prepare('UPDATE users SET pinFailures = 0, pinLockedUntil = 0 WHERE id = ?')
      .run(user.id);
    return;
  }

  const failures = user.pinFailures + 1;

  if (failures >= PIN_MAX_FAILURES) {
    await db.prepare('UPDATE users SET pinFailures = 0, pinLockedUntil = ? WHERE id = ?')
      .run(Date.now() + PIN_LOCK_MS, user.id);
    throw new HttpError(429, 'Too many wrong PINs. Please try again in 60 minutes.');
  }

  await db.prepare('UPDATE users SET pinFailures = ? WHERE id = ?').run(failures, user.id);
  throw new HttpError(400, 'Incorrect email or PIN.');
}

async function startSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)')
    .run(sha256(token), user.id, new Date().toISOString());

  return { data: { token, user: publicUser(user) } };
}

async function requireUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = token &&
    await db.prepare('SELECT userId, createdAt FROM sessions WHERE token = ?').get(sha256(token));

  if (!session) {
    throw new HttpError(401, 'Please log in again.');
  }

  // Logins last 30 days, then the user signs in again.
  if (Date.now() - Date.parse(session.createdAt) > SESSION_LIFETIME_MS) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
    throw new HttpError(401, 'Your login has expired. Please log in again.');
  }

  return session.userId;
}

async function ownPet(userId, id) {
  const pet = await db.prepare('SELECT * FROM pets WHERE id = ? AND userId = ?')
    .get(id, userId);

  if (!pet) {
    throw new HttpError(404, 'Pet record not found.');
  }

  return pet;
}

async function ownAppointment(userId, id) {
  const item = await db.prepare('SELECT * FROM appointments WHERE id = ? AND userId = ?')
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

route('POST', '/api/register', async (req, body) => {
  await limit(req, 'register', 10, 60 * 60 * 1000);
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

  if (await db.prepare('SELECT 1 FROM users WHERE username = ?').get(lookupKey(username))) {
    throw new HttpError(409, 'Username is already taken.');
  }

  await db.prepare(
    `INSERT INTO users (fullName, username, email, passwordHash, accountType,
      recoveryPin) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(seal(fullName), lookupKey(username), seal(username), hashPassword(password),
    accountType, hashPassword(recoveryPin));

  return { status: 201 };
});

route('POST', '/api/login', async (req, body) => {
  await limit(req, 'login', 10, 15 * 60 * 1000);
  const username = text(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  const user = await db.prepare('SELECT * FROM users WHERE username = ?')
    .get(lookupKey(username));
  const valid = checkPassword(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !valid) {
    throw new HttpError(401, 'Incorrect username or password.');
  }

  return await startSession(user);
});

// The Google / Facebook buttons: email + password (+ a Recovery PIN the first
// time). The first time, the account is made by itself; after that the same
// password is needed, so no one can get into someone else's account with
// just their email.
route('POST', '/api/login/quick', async (req, body) => {
  await limit(req, 'login', 10, 15 * 60 * 1000);
  const username = text(body.username).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const accountType = ['google', 'facebook'].includes(body.accountType)
    ? body.accountType
    : 'email';
  const user = await db.prepare('SELECT * FROM users WHERE username = ?')
    .get(lookupKey(username));

  if (user) {
    if (!checkPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Incorrect password for this account.');
    }

    return await startSession(user);
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

  const result = await db.prepare(
    'INSERT INTO users (fullName, username, email, passwordHash, accountType, recoveryPin) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(seal(fullName), lookupKey(username), seal(username), hashPassword(password),
    accountType, hashPassword(body.recoveryPin));

  return await startSession(
    await db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
  );
});

route('POST', '/api/logout', async req => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = await db.prepare('SELECT userId FROM sessions WHERE token = ?').get(sha256(token));

  if (session) {
    // Saved here (not by the app), since the app leaves for the login page
    // right away.
    await db.prepare(`
      INSERT INTO history (userId, action, title, details, createdAt)
      VALUES (?, 'logout', ?, ?, ?)
    `).run(session.userId, seal('Logged out'), seal('You logged out of PetCare'),
      new Date().toISOString());
  }

  await db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
  return {};
});

route('GET', '/api/me', async req => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(await requireUser(req));
  return { data: publicUser(user) };
});

// ---------- Profile (while logged in) ----------

// Changing the password or PIN needs the current password OR the Recovery
// PIN, so a forgotten password can be changed without logging out, but
// someone holding an unlocked phone cannot take over the account.
async function verifyOwner(user, value) {
  const secret = typeof value === 'string' ? value : '';

  if (secret && checkPassword(secret, user.passwordHash)) {
    return;
  }

  if (isPin(secret) && user.recoveryPin) {
    try {
      await checkPin(user, secret); // counts toward the lock when wrong
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

route('PUT', '/api/me', async (req, body) => {
  const userId = await requireUser(req);
  const fullName = text(body.fullName);

  if (!fullName || fullName.length > 80) {
    throw new HttpError(400, 'Please enter your name (up to 80 characters).');
  }

  await db.prepare('UPDATE users SET fullName = ? WHERE id = ?').run(seal(fullName), userId);
  return { data: publicUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) };
});

route('POST', '/api/me/password', async (req, body) => {
  const userId = await requireUser(req);
  await limit(req, 'change-password', 10, 15 * 60 * 1000);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const password = typeof body.password === 'string' ? body.password : '';

  await verifyOwner(user, body.verify);

  if (!strongPassword(password)) {
    throw new HttpError(400, WEAK_PASSWORD);
  }

  await db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(password), userId);
  // Other devices must log in with the new password; this one stays in.
  await db.prepare('DELETE FROM sessions WHERE userId = ? AND token != ?').run(userId, currentToken(req));
  await db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, 'password-changed', ?, ?, ?)
  `).run(userId, seal('Password changed'), seal('You changed your password from your profile'),
    new Date().toISOString());

  return {};
});

route('POST', '/api/me/pin', async (req, body) => {
  const userId = await requireUser(req);
  await limit(req, 'change-pin', 10, 15 * 60 * 1000);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  await verifyOwner(user, body.verify);

  if (!isPin(body.pin)) {
    throw new HttpError(400, 'The Recovery PIN must be exactly 4 numbers.');
  }

  await db.prepare(`
    UPDATE users SET recoveryPin = ?, pinFailures = 0, pinLockedUntil = 0 WHERE id = ?
  `).run(hashPassword(body.pin), userId);
  await db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, 'pin-changed', ?, ?, ?)
  `).run(userId, seal('Recovery PIN changed'), seal('You set a new Recovery PIN'),
    new Date().toISOString());

  return {};
});

// Forgot Password: the email + the 4-digit Recovery PIN set a new password.
route('POST', '/api/password-reset', async (req, body) => {
  await limit(req, 'reset', 10, 15 * 60 * 1000);
  const user = await db.prepare('SELECT * FROM users WHERE username = ?')
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

  await checkPin(user, body.pin);

  if (!strongPassword(password)) {
    throw new HttpError(400, WEAK_PASSWORD);
  }

  await db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?')
    .run(hashPassword(password), user.id);
  // Log out every device that used the old password.
  await db.prepare('DELETE FROM sessions WHERE userId = ?').run(user.id);
  await db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, 'password-reset', ?, ?, ?)
  `).run(user.id, seal('Password reset'),
    seal('Your password was changed using your Recovery PIN'), new Date().toISOString());

  return {};
});

// Pets

route('GET', '/api/pets', async req => {
  const rows = await db.prepare('SELECT * FROM pets WHERE userId = ? ORDER BY id')
    .all(await requireUser(req));
  return { data: rows.map(petFromRow) };
});

route('GET', '/api/pets/:id', async (req, body, params) => {
  return { data: petFromRow(await ownPet(await requireUser(req), params.id)) };
});

route('POST', '/api/pets', async (req, body) => {
  const userId = await requireUser(req);
  const pet = petFields(body);
  const result = await db.prepare(`
    INSERT INTO pets (userId, petName, petType, breed, birthday, ownerName,
      vaccinationStatus, vaccines, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, pet.petName, pet.petType, pet.breed, pet.birthday,
    pet.ownerName, pet.vaccinationStatus, pet.vaccines, pet.photo);

  return { status: 201, data: { id: Number(result.lastInsertRowid) } };
});

route('PUT', '/api/pets/:id', async (req, body, params) => {
  const userId = await requireUser(req);
  await ownPet(userId, params.id);
  const pet = petFields(body);

  await db.prepare(`
    UPDATE pets SET petName = ?, petType = ?, breed = ?, birthday = ?,
      ownerName = ?, vaccinationStatus = ?, vaccines = ?, photo = ?
    WHERE id = ?
  `).run(pet.petName, pet.petType, pet.breed, pet.birthday, pet.ownerName,
    pet.vaccinationStatus, pet.vaccines, pet.photo, params.id);

  // Appointments keep a copy of the pet's name.
  await db.prepare('UPDATE appointments SET petName = ? WHERE petId = ?')
    .run(seal(pet.plainName), params.id);

  return {};
});

// Marks a pet as passed away (it moves to Memories), or brings it back with
// passedAwayOn: null. Its upcoming appointments are cancelled; past ones stay.
route('PATCH', '/api/pets/:id', async (req, body, params) => {
  await ownPet(await requireUser(req), params.id);
  const date = body.passedAwayOn;

  if (date === null) {
    await db.prepare('UPDATE pets SET passedAwayOn = NULL WHERE id = ?').run(params.id);
    return {};
  }

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, 'Please choose a valid date.');
  }

  await db.prepare('UPDATE pets SET passedAwayOn = ? WHERE id = ?').run(seal(date), params.id);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const removed = await db.prepare(
    "DELETE FROM appointments WHERE petId = ? AND status = 'Pending' AND date >= ?"
  ).run(params.id, today);

  return { data: { cancelledAppointments: Number(removed.changes) } };
});

route('DELETE', '/api/pets/:id', async (req, body, params) => {
  await ownPet(await requireUser(req), params.id);
  await db.prepare('DELETE FROM appointments WHERE petId = ?').run(params.id);
  await db.prepare('DELETE FROM pets WHERE id = ?').run(params.id);
  return {};
});

// Appointments

route('GET', '/api/appointments', async req => {
  const rows = await db.prepare(
    'SELECT * FROM appointments WHERE userId = ? ORDER BY date, time'
  ).all(await requireUser(req));
  return { data: rows.map(row => unsealRow('appointments', row)) };
});

route('POST', '/api/appointments', async (req, body) => {
  const userId = await requireUser(req);
  const pet = await ownPet(userId, Number(body.petId));
  const petName = unseal(pet.petName);
  const doctorName = text(body.doctorName);
  const purpose = text(body.purpose);
  const date = text(body.date);
  const time = text(body.time);

  if (!doctorName || !purpose || !date || !time) {
    throw new HttpError(400, 'Please complete all fields.');
  }

  const duplicate = await db.prepare(
    'SELECT 1 FROM appointments WHERE petId = ? AND date = ? AND time = ?'
  ).get(pet.id, date, time);

  if (duplicate) {
    throw new HttpError(
      409,
      `${petName} already has an appointment at that date and time.`
    );
  }

  const result = await db.prepare(`
    INSERT INTO appointments (userId, petId, petName, doctorName, purpose, date, time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
  `).run(userId, pet.id, seal(petName), seal(doctorName), seal(purpose), date, time);

  return { status: 201, data: { id: Number(result.lastInsertRowid) } };
});

// Reschedule a missed appointment: new doctor, date and time, and it is
// pending again. Pending and completed ones cannot be changed this way.
route('PUT', '/api/appointments/:id', async (req, body, params) => {
  const item = await ownAppointment(await requireUser(req), params.id);
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

  const duplicate = await db.prepare(
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

  await db.prepare(`
    UPDATE appointments SET doctorName = ?, purpose = ?, date = ?, time = ?, status = 'Pending'
    WHERE id = ?
  `).run(seal(doctorName), purpose, date, time, item.id);

  return {};
});

route('PATCH', '/api/appointments/:id', async (req, body, params) => {
  await ownAppointment(await requireUser(req), params.id);

  if (body.status !== 'Completed' && body.status !== 'Missed') {
    throw new HttpError(400, 'Invalid status.');
  }

  await db.prepare('UPDATE appointments SET status = ? WHERE id = ?')
    .run(body.status, params.id);
  return {};
});

route('DELETE', '/api/appointments/:id', async (req, body, params) => {
  await ownAppointment(await requireUser(req), params.id);
  await db.prepare('DELETE FROM appointments WHERE id = ?').run(params.id);
  return {};
});

// History

route('GET', '/api/history', async req => {
  const rows = await db.prepare(
    'SELECT * FROM history WHERE userId = ? ORDER BY createdAt DESC, id DESC'
  ).all(await requireUser(req));
  return { data: rows.map(row => unsealRow('history', row)) };
});

route('POST', '/api/history', async (req, body) => {
  const userId = await requireUser(req);
  await db.prepare(`
    INSERT INTO history (userId, action, title, details, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, text(body.action), seal(text(body.title)), seal(text(body.details)),
    new Date().toISOString());
  return { status: 201 };
});

route('DELETE', '/api/history', async req => {
  await db.prepare('DELETE FROM history WHERE userId = ?').run(await requireUser(req));
  return {};
});

// ---------- Requests ----------

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

// Handles one /api/ request. On Vercel, vercel.json passes the path in __path.
async function handle(req, res) {
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

  const url = new URL(req.url, 'http://localhost');
  const forwarded = url.searchParams.get('__path');
  const pathname = forwarded === null ? url.pathname : '/api/' + forwarded;

  try {
    await whenReady().catch(error => {
      if (error instanceof HttpError) {
        throw error;
      }

      console.error('Database setup failed:', error);
      throw new HttpError(503, databaseProblem(error));
    });

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
}

module.exports = { handle, send, DB_FILE };
