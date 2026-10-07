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
  socket.emit("populateQuestions", question.pending());

  socket.on("create", function (data) {
    try {
      const created = question.create(userId, data.photo, data.subject);
      socket.join(`question:${created._id}`);
      io.emit("created", question.pending(), created._id);
    } catch (err) {
      console.error("Error creating question:", err);
    }
  });

  socket.on("answer", function (data) {
    try {
      const accepted = question.accept(data.questionid, userId);
      const room = `question:${accepted._id}`;
      socket.join(room);
      io.in(`user:${accepted.asker}`).socketsJoin(room);
      io.to(room).emit("answered", [accepted]);
      io.emit("populateQuestions", question.pending());
    } catch (err) {
      console.error("Error accepting question:", err);
    }
  });

  socket.on("message", function (data) {
    try {
      const updated = question.addMessage(data.questionid, userId, data.message);
      io.to(`question:${updated._id}`).emit("messaged", [updated]);
    } catch (err) {
      console.error("Error adding message:", err);
    }
  });

  socket.on("resolve", function (data) {
    try {
      const updated = question.resolve(data.questionid, userId, data.success);
      io.to(`question:${updated._id}`).emit("resolved", [updated]);
    } catch (err) {
      console.error("Error resolving question:", err);
    }
  });
});

server.listen(settings.PORT);
console.info(`Listening on port ${settings.PORT} in ${app.get("env")} mode.`);
