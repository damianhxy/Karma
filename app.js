var express = require("express");
var app = express();
var server = require("http").Server(app);
var io = require("socket.io")(server);
var settings = require("./controllers/settings.js");

var user = require("./models/user.js");
var question = require("./models/question.js");

require("./controllers/config.js")(app, express);

app.use("/users", require("./controllers/users.js"));

io.on("connection", function(socket) {
    console.log("Client connected");

    socket.on("init", function(data) { // Sends user_id
        user.setSocketID(data, socket.id);
    });

    socket.on("disconnect", function() {
        user.setSocketID(data, "");
    });

    // Questions
    socket.on("create", function(data) {
        question.create(data.userid, photo)
        .then(function() {
            return question.getPending();
        })
        .then(function(questions) {
            io.emit(questions);
        });
    });

    socket.on("answer", function(data) {
        question.accept(data.questionid, data.askee)
        .then(function() {
            return question.getPending();
        })
        .then(function(questions) {
            io.emit(questions);
        });
    });

    socket.on("message", function(data) {
        question.addMessage(data.questionid, data.userid, data.message)
        .then(function() {
            return question.getPending();
        })
        .then(function(questions) {
            io.emit(questions);
        });
    });

    socket.on("resolve", function(data) {
        question.resolve(data.questionid, data.success)
        .then(function() {
            return question.getPending();
        })
        .then(function(questions) {
            io.emit(questions);
        });
    });
});

server.listen(settings.PORT);
console.info("Listening on port " + settings.PORT + " in " + app.get("env") + " mode.");
