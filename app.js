const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const settings = require("./controllers/settings.js");

const user = require("./models/user.js");
const question = require("./models/question.js");

const { sessionMiddleware } = require("./controllers/config.js")(app, express);

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

io.engine.use(sessionMiddleware);
io.use(function (socket, next) {
  const userId = socket.request.session?.passport?.user;
  if (!userId || !user.get(userId)) return next(new Error("Unauthorized"));
  socket.data.userId = userId;
  next();
});

io.on("connection", function (socket) {
  const userId = socket.data.userId;
  const userRoom = `user:${userId}`;
  socket.join(userRoom);
  socket.emit("populateQuestions", question.all());

  socket.on("create", function (data) {
    try {
      const created = question.create(userId, data.photo, data.subject);
      const questions = question.all();
      io.emit("created", questions, created._id);
    } catch (err) {
      console.error("Error creating question:", err);
    }
  });

  socket.on("answer", function (data) {
    try {
      question.accept(data.questionid, userId);
      const questions = question.all();
      io.emit("answered", questions);
    } catch (err) {
      console.error("Error accepting question:", err);
    }
  });

  socket.on("message", function (data) {
    try {
      question.addMessage(data.questionid, userId, data.message);
      const questions = question.all();
      io.emit("messaged", questions);
    } catch (err) {
      console.error("Error adding message:", err);
    }
  });

  socket.on("resolve", function (data) {
    try {
      question.resolve(data.questionid, userId, data.success);
      const questions = question.all();
      io.emit("resolved", questions);
    } catch (err) {
      console.error("Error resolving question:", err);
    }
  });
});

server.listen(settings.PORT);
console.info(`Listening on port ${settings.PORT} in ${app.get("env")} mode.`);
