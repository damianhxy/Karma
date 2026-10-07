const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const settings = require("./controllers/settings.js");

const user = require("./models/user.js");
const question = require("./models/question.js");
const auth = require("./middlewares/auth.js");

require("./controllers/config.js")(app, express);

app.get("/", function (req, res) {
  const error = req.session.error;
  delete req.session.error;
  res.render("index", {
    layout: false,
    user: req.user,
    error,
  });
});

app.get("/register", function (req, res) {
  const error = req.session.error;
  delete req.session.error;
  res.render("register", {
    layout: false,
    error,
  });
});

app.get("/clear", auth, function (req, res) {
  try {
    user.clear();
    question.clear();
    res.send("Database cleared");
  } catch (err) {
    console.error("Failed to clear database:", err);
    res.status(500).send("Error clearing database");
  }
});

app.use("/users", require("./controllers/users.js"));

app.use(function (req, res) {
  res.status(404).send("Not found");
});

app.use(function (err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && err.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Invalid CSRF token.");
  }
  console.error("Request failed:", err);
  res.status(500).send("Internal server error.");
});

io.on("connection", function (socket) {
  console.log("Client connected");

  const socketId = socket.id;

  socket.on("init", function (userId) {
    try {
      user.setSocketID(userId, socketId);
      const questions = question.all();
      io.emit("populateQuestions", questions);
    } catch (err) {
      console.error("Error on init:", err);
    }
  });

  socket.on("disconnect", function () {
    try {
      user.clearSocketID(socketId);
    } catch (err) {
      console.error("Error on disconnect:", err);
    }
  });

  socket.on("create", function (data) {
    try {
      const created = question.create(data.userid, data.photo, data.subject);
      const questions = question.all();
      io.emit("created", questions, created._id);
    } catch (err) {
      console.error("Error creating question:", err);
    }
  });

  socket.on("answer", function (data) {
    try {
      question.accept(data.questionid, data.askee);
      const questions = question.all();
      io.emit("answered", questions);
    } catch (err) {
      console.error("Error accepting question:", err);
    }
  });

  socket.on("message", function (data) {
    try {
      question.addMessage(data.questionid, data.userid, data.message, data.type);
      const questions = question.all();
      io.emit("messaged", questions);
    } catch (err) {
      console.error("Error adding message:", err);
    }
  });

  socket.on("resolve", function (data) {
    try {
      question.resolve(data.questionid, data.success);
      const questions = question.all();
      io.emit("resolved", questions);
    } catch (err) {
      console.error("Error resolving question:", err);
    }
  });
});

server.listen(settings.PORT);
console.info(`Listening on port ${settings.PORT} in ${app.get("env")} mode.`);
