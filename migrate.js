const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const legacyDir = path.resolve(process.argv[2] || "database");
const targetPath = path.resolve(process.argv[3] || path.join("database", "karma.db"));

function readJournal(filename) {
  const source = path.join(legacyDir, filename);
  if (!fs.existsSync(source)) throw new Error(`Legacy ${filename} journal not found: ${source}`);
  const records = new Map();
  const lines = fs.readFileSync(source, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`${filename}:${index + 1} is not valid JSON`);
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${filename}:${index + 1} is not a NeDB record`);
    }
    if (record.$$indexCreated || record.$$indexRemoved) continue;
    if (typeof record._id !== "string" || !record._id) {
      throw new Error(`${filename}:${index + 1} has no valid _id`);
    }
    if (record.$$deleted) records.delete(record._id);
    else records.set(record._id, record);
  }
  return [...records.values()];
}

function boundedString(value, field, max, { allowEmpty = true } = {}) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && value.length === 0)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function validateUser(record) {
  const username = boundedString(record.username, `username for user ${record._id}`, 100, {
    allowEmpty: false,
  });
  if ([...username].some((character) => character.charCodeAt(0) <= 31 || character === "\u007f")) {
    throw new Error(`Invalid username for ${record._id}`);
  }
  const hash = boundedString(record.hash, `password hash for user ${record._id}`, 100, {
    allowEmpty: false,
  });
  if (!/^\$2[aby]\$\d\d\$/.test(hash)) throw new Error(`Invalid password hash for ${record._id}`);
  if (!Number.isSafeInteger(record.karma)) throw new Error(`Invalid karma for ${record._id}`);
  if (!Array.isArray(record.subjects) || record.subjects.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid subjects for ${record._id}`);
  }
  return {
    _id: boundedString(record._id, "user ID", 100, { allowEmpty: false }),
    username,
    hash,
    karma: record.karma,
    name: boundedString(record.name || "", `name for user ${record._id}`, 100),
    subjects: record.subjects,
    socket_id: "",
  };
}

function validateMessage(message, questionId) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error(`Invalid message for question ${questionId}`);
  }
  return {
    userid: boundedString(message.userid, `message user for question ${questionId}`, 100, {
      allowEmpty: false,
    }),
    message: boundedString(message.message, `message text for question ${questionId}`, 500),
    ...(typeof message.type === "string" ? { type: message.type.slice(0, 50) } : {}),
  };
}

// Same rule the realtime server applies to new questions: the browser
// interpolates photos into style attributes.
function validatePhoto(value, questionId) {
  const photo = boundedString(value, `photo for question ${questionId}`, 1_900_000);
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)) {
    throw new Error(`Invalid photo for question ${questionId}`);
  }
  return photo;
}

function validateQuestion(record) {
  if (!Array.isArray(record.messages)) throw new Error(`Invalid messages for ${record._id}`);
  if (!["pending", "open", "success", "failure"].includes(record.state)) {
    throw new Error(`Invalid state for ${record._id}`);
  }
  if (!Number.isSafeInteger(record.time) || record.time < 0) {
    throw new Error(`Invalid timestamp for ${record._id}`);
  }
  return {
    _id: boundedString(record._id, "question ID", 100, { allowEmpty: false }),
    asker: boundedString(record.asker, `asker for question ${record._id}`, 100, {
      allowEmpty: false,
    }),
    askee: boundedString(record.askee || "-1", `askee for question ${record._id}`, 100, {
      allowEmpty: false,
    }),
    photo: validatePhoto(record.photo, record._id),
    messages: record.messages.map((message) => validateMessage(message, record._id)),
    state: record.state,
    subject: boundedString(record.subject || "", `subject for question ${record._id}`, 50),
    time: record.time,
  };
}

function digest(record) {
  return crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

const users = readJournal("users").map(validateUser);
const questions = readJournal("questions").map(validateQuestion);

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
const db = new Database(targetPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    _id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    hash TEXT NOT NULL,
    karma INTEGER DEFAULT 0,
    name TEXT DEFAULT '',
    subjects TEXT DEFAULT '[]',
    socket_id TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS questions (
    _id TEXT PRIMARY KEY,
    asker TEXT NOT NULL,
    askee TEXT DEFAULT '-1',
    photo TEXT DEFAULT '',
    messages TEXT DEFAULT '[]',
    state TEXT DEFAULT 'pending',
    subject TEXT DEFAULT '',
    time INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS legacy_imports (
    kind TEXT NOT NULL,
    legacy_id TEXT NOT NULL,
    source_digest TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY (kind, legacy_id)
  );
`);

const findImport = db.prepare(
  "SELECT source_digest FROM legacy_imports WHERE kind = ? AND legacy_id = ?",
);
const recordImport = db.prepare(
  "INSERT INTO legacy_imports (kind, legacy_id, source_digest, imported_at) VALUES (?, ?, ?, ?)",
);
const findUserId = db.prepare("SELECT _id FROM users WHERE _id = ? OR username = ?");
const insertUser = db.prepare(
  "INSERT INTO users (_id, username, hash, karma, name, subjects, socket_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const findQuestionId = db.prepare("SELECT _id FROM questions WHERE _id = ?");
const insertQuestion = db.prepare(
  "INSERT INTO questions (_id, asker, askee, photo, messages, state, subject, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const userExists = db.prepare("SELECT 1 FROM users WHERE _id = ?");

const counts = { usersImported: 0, usersSkipped: 0, questionsImported: 0, questionsSkipped: 0 };

function alreadyImported(kind, record) {
  const sourceDigest = digest(record);
  const previous = findImport.get(kind, record._id);
  if (!previous) return { sourceDigest, imported: false };
  if (previous.source_digest !== sourceDigest) {
    throw new Error(`Previously imported ${kind} ${record._id} differs from this snapshot`);
  }
  return { sourceDigest, imported: true };
}

const migrate = db.transaction(function () {
  for (const record of users) {
    const status = alreadyImported("user", record);
    if (status.imported) {
      counts.usersSkipped += 1;
      continue;
    }
    if (findUserId.get(record._id, record.username)) {
      throw new Error(`User ID or username collision for ${record._id}`);
    }
    insertUser.run(
      record._id,
      record.username,
      record.hash,
      record.karma,
      record.name,
      JSON.stringify(record.subjects),
      record.socket_id,
    );
    recordImport.run("user", record._id, status.sourceDigest, new Date().toISOString());
    counts.usersImported += 1;
  }

  for (const record of questions) {
    const status = alreadyImported("question", record);
    if (status.imported) {
      counts.questionsSkipped += 1;
      continue;
    }
    if (findQuestionId.get(record._id)) throw new Error(`Question ID collision for ${record._id}`);
    if (!userExists.get(record.asker)) throw new Error(`Missing asker for question ${record._id}`);
    if (record.askee !== "-1" && !userExists.get(record.askee)) {
      throw new Error(`Missing askee for question ${record._id}`);
    }
    insertQuestion.run(
      record._id,
      record.asker,
      record.askee,
      record.photo,
      JSON.stringify(record.messages),
      record.state,
      record.subject,
      record.time,
    );
    recordImport.run("question", record._id, status.sourceDigest, new Date().toISOString());
    counts.questionsImported += 1;
  }
});

try {
  migrate();
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error(`SQLite integrity check failed: ${integrity}`);
  console.log(JSON.stringify({ ...counts, integrity }));
} finally {
  db.close();
}
