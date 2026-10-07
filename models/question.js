const crypto = require("crypto");
const db = require("../utils/db");

function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

const stmts = {
  insertQuestion: db.prepare(
    "INSERT INTO questions (_id, asker, askee, photo, messages, state, subject, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  findById: db.prepare("SELECT * FROM questions WHERE _id = ?"),
  findPending: db.prepare(
    "SELECT _id, asker, photo, subject, time FROM questions WHERE state = 'pending' ORDER BY time DESC",
  ),
  findRelated: db.prepare(
    "SELECT _id, asker, photo, subject, time FROM questions WHERE state = 'pending' AND subject = ? ORDER BY time DESC LIMIT 20",
  ),
  acceptPending: db.prepare(
    "UPDATE questions SET askee = ?, state = 'open' WHERE _id = ? AND state = 'pending' AND asker != ?",
  ),
  updateMessages: db.prepare("UPDATE questions SET messages = ? WHERE _id = ?"),
  resolveOpen: db.prepare(
    "UPDATE questions SET state = ? WHERE _id = ? AND state = 'open' AND asker = ?",
  ),
};

function hydrate(row) {
  if (!row) return null;
  return { ...row, messages: JSON.parse(row.messages || "[]") };
}

exports.create = function (asker, photo, subject) {
  const id = generateId();
  stmts.insertQuestion.run(id, asker, "-1", photo, "[]", "pending", subject, Date.now());
  return stmts.findById.get(id);
};

exports.accept = function (questionid, askee) {
  const result = stmts.acceptPending.run(askee, questionid, askee);
  if (result.changes !== 1) throw new Error("Question is not available");
  return hydrate(stmts.findById.get(questionid));
};

exports.pending = function () {
  return stmts.findPending.all();
};

exports.related = function (subject) {
  return stmts.findRelated.all(subject);
};

exports.get = function (questionid) {
  return hydrate(stmts.findById.get(questionid));
};

exports.resolve = function (questionid, userid, success) {
  const result = stmts.resolveOpen.run(success ? "success" : "failure", questionid, userid);
  if (result.changes !== 1) throw new Error("Question cannot be resolved");
  return hydrate(stmts.findById.get(questionid));
};

exports.addMessage = function (questionid, userid, message) {
  const update = db.transaction(function () {
    const current = hydrate(stmts.findById.get(questionid));
    if (!current || current.state !== "open") throw new Error("Question is not open");
    if (current.asker !== userid && current.askee !== userid) {
      throw new Error("Not a question participant");
    }
    current.messages.push({ userid, message });
    stmts.updateMessages.run(JSON.stringify(current.messages), questionid);
    return current;
  });
  return update();
};
