var express = require("express");
var app = express();
var settings = require("./controllers/settings.js");

const server = require('http').Server(app);
const io = require('socket.io')(server);

require("./controllers/config.js")(app, express);
app.use(require("./controllers/routes.js"));

const connectedIds = [];
io.on('connection', socket => {
    connectedIds.push(socket.id);
    socket.on('disconnect', () => connectedIds.splice(connectedIds.findIndex(socket.id), 1));
    socket.on('question', data => {
        // Store the question data into the database of existing questions
    });
});

server.listen(settings.PORT);
console.info("Listening on port " + settings.PORT + " in " + app.get("env") + " mode.");
