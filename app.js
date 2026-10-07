const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server, { maxHttpBufferSize: 2_000_000 });
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

function validId(value) {
  return (
    typeof value === "string" && (/^[a-f0-9]{24}$/.test(value) || /^[A-Za-z0-9]{16}$/.test(value))
  );
}

function validSubject(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 50;
}

function validPhoto(value) {
  return (
    typeof value === "string" &&
    value.length <= 1_900_000 &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

function onEvent(socket, event, handler) {
  socket.on(event, function (data) {
    try {
      handler(data);
    } catch (err) {
      console.error(`Socket ${event} failed:`, err.message);
      socket.emit("operationError", { event, message: "Invalid request" });
    }
  });
}

io.on("connection", function (socket) {
  const userId = socket.data.userId;
  const userRoom = `user:${userId}`;
  socket.join(userRoom);
  socket.emit("populateQuestions", question.pending());

  onEvent(socket, "getRelatedQuestions", function (subject) {
    if (!validSubject(subject)) throw new Error("Invalid subject");
    socket.emit("relatedQuestions", question.related(subject.trim()));
  });

  onEvent(socket, "create", function (data) {
    if (!data || !validPhoto(data.photo) || !validSubject(data.subject)) {
      throw new Error("Invalid question");
    }
    const created = question.create(userId, data.photo, data.subject.trim());
    socket.join(`question:${created._id}`);
    io.emit("created", question.pending(), created._id);
  });

  onEvent(socket, "answer", function (data) {
    if (!data || !validId(data.questionid)) throw new Error("Invalid question ID");
    const accepted = question.accept(data.questionid, userId);
    const room = `question:${accepted._id}`;
    socket.join(room);
    io.in(`user:${accepted.asker}`).socketsJoin(room);
    io.to(room).emit("answered", [accepted]);
    io.emit("populateQuestions", question.pending());
  });

  onEvent(socket, "message", function (data) {
    if (
      !data ||
      !validId(data.questionid) ||
      typeof data.message !== "string" ||
      data.message.trim().length === 0 ||
      data.message.length > 500
    ) {
      throw new Error("Invalid message");
    }
    const updated = question.addMessage(data.questionid, userId, data.message.trim());
    io.to(`question:${updated._id}`).emit("messaged", [updated]);
  });

  onEvent(socket, "resolve", function (data) {
    if (!data || !validId(data.questionid) || typeof data.success !== "boolean") {
      throw new Error("Invalid resolution");
    }
    const updated = question.resolve(data.questionid, userId, data.success);
    io.to(`question:${updated._id}`).emit("resolved", [updated]);
  });
});

server.listen(settings.PORT);
console.info(`Listening on port ${settings.PORT} in ${app.get("env")} mode.`);
