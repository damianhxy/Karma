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
  findAll: db.prepare("SELECT * FROM questions ORDER BY time DESC"),
  deleteAll: db.prepare("DELETE FROM questions"),
};

exports.create = function (asker, photo, subject) {
  const id = generateId();
  stmts.insertQuestion.run(id, asker, "-1", photo, "[]", "pending", subject, Date.now());
  return stmts.findById.get(id);
};

exports.accept = function (questionid, askee) {
  const question = stmts.findById.get(questionid);
  if (!question) throw new Error("Question not found");
  db.prepare("UPDATE questions SET askee = ?, state = 'open' WHERE _id = ?").run(askee, questionid);
};

exports.all = function () {
  const rows = stmts.findAll.all();
  return rows.map(function (row) {
    row.messages = JSON.parse(row.messages || "[]");
    return row;
  });
};

exports.resolve = function (questionid, success) {
  const question = stmts.findById.get(questionid);
  if (!question) throw new Error("Question not found");
  db.prepare("UPDATE questions SET state = ? WHERE _id = ?").run(
    success ? "success" : "failure",
    questionid,
  );
};

exports.addMessage = function (questionid, userid, message, type) {
  const question = stmts.findById.get(questionid);
  if (!question) throw new Error("Question not found");
  const messages = JSON.parse(question.messages || "[]");
  messages.push({ userid, message, type });
  db.prepare("UPDATE questions SET messages = ? WHERE _id = ?").run(
    JSON.stringify(messages),
    questionid,
  );
};

exports.clear = function () {
  stmts.deleteAll.run();
};
