const crypto = require("crypto");
const settings = require("../controllers/settings.js");
const bcrypt = require("bcryptjs");
const db = require("../utils/db");

function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

const stmts = {
  insertUser: db.prepare(
    "INSERT INTO users (_id, username, hash, karma, name, subjects, socket_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  findByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  findById: db.prepare("SELECT * FROM users WHERE _id = ?"),
  findBySocketId: db.prepare("SELECT * FROM users WHERE socket_id = ?"),
  updateSocketId: db.prepare("UPDATE users SET socket_id = ? WHERE _id = ?"),
  clearAll: db.prepare("DELETE FROM users"),
};

exports.add = function (req, username, password) {
  username = username.trim();
  const existing = stmts.findByUsername.get(username);
  if (existing) throw new Error("User already exists");
  const hash = bcrypt.hashSync(password, settings.HASH_ROUNDS);
  const id = generateId();
  stmts.insertUser.run(id, username, hash, 0, req.body.name || "", "[]", "");
  return stmts.findById.get(id);
};

exports.authenticate = function (username, password) {
  const user = stmts.findByUsername.get(username);
  if (!user) throw new Error("User does not exist");
  const match = bcrypt.compareSync(password, user.hash);
  if (!match) throw new Error("Wrong password");
  return user;
};

exports.get = function (id) {
  return stmts.findById.get(id) || null;
};

exports.setSocketID = function (id, socketid) {
  stmts.updateSocketId.run(socketid, id);
};

exports.clearSocketID = function (socketid) {
  stmts.updateSocketId.run("", socketid);
};

exports.clear = function () {
  stmts.clearAll.run();
};
