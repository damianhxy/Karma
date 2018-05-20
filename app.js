var express = require("express");
var app = express();
var server = require("http").Server(app);
var io = require("socket.io")(server);
var settings = require("./controllers/settings.js");

var user = require("./models/user.js");
var question = require("./models/question.js");

require("./controllers/config.js")(app, express);

app.get("/", function(req, res) {
    res.render("index", {
        layout: false,
        user: req.user
    })
});

app.use("/users", require("./controllers/users.js"));

io.on("connection", function(socket) {
    console.log("Client connected");

    const id = socket.id;

    socket.on("init", function(userId) { // Sends user_id
        user.setSocketID(userId, id);
        console.log(userId);
    });

    socket.on("disconnect", function() {
        user.clearSocketID(id);
    });
/*
    socket.on("disconnect", function() {
        user.setSocketID(userId, "");
    });
*/
    // Questions
    socket.on("create", function(data) {
        var id;
        question.create(data.userid, data.photo, data.subject)
        .then((ret) => {
            id = ret._id;
            return question.all();
        })
        .then((questions) => {
            return {
                questions,
                id
            }
        })
        .then(function({questions, id}) {
            io.emit("created", questions, id);
        });
    });

    socket.on("answer", function(data) {
        question.accept(data.questionid, data.askee)
        .then(function() {
            return question.all();
        })
        .then(function(questions) {
            io.emit("answered", questions);
        });
    });

    socket.on("message", function(data) {
        question.addMessage(data.questionid, data.userid, data.message, data.type)
        .then(function() {
            return question.all();
        })
        .then(function(questions) {
            io.emit("messaged", questions);
        });
    });

    socket.on("resolve", function(data) {
        question.resolve(data.questionid, data.success)
        .then(function() {
            return question.all();
        })
        .then(function(questions) {
            io.emit("resolved", questions);
        });
    });
});

server.listen(settings.PORT);
console.info("Listening on port " + settings.PORT + " in " + app.get("env") + " mode.");
