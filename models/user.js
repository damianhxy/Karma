var settings = require("../controllers/settings.js");

var Promise = require("bluebird");
var nedb = require("nedb");
var bcryptjs = require("bcryptjs");
var users = new nedb({ filename: "./database/users", autoload: true });
Promise.promisifyAll(users);
Promise.promisifyAll(users.find().constructor.prototype);

Promise.promisifyAll(bcryptjs);

exports.add = function(req, username, password) {
    username = username.trim();
    return users.findOneAsync({ username: username })
    .then(function(user) {
        if (user) throw Error("User already exists");
        return bcryptjs.hashAsync(password, settings.HASH_ROUNDS)
        .then(function(hash) {
            return users.insertAsync({
                "username": username,
                "hash": hash,
                "karma": 0,
                "name": req.body.name,
                "subjects": [],
                "socket_id": ""
            });
        });
    });
};

exports.authenticate = function(username, password) {
    return users.findOneAsync({ username: username })
    .then(function(user) {
        if (!user) throw Error("User does not exist");
        return bcryptjs.compareAsync(password, user.hash)
        .then(function(res) {
            if (!res) throw Error("Wrong password");
            return user;
        });
    });
};

exports.get = function(id) {
    return users.findOneAsync({ _id: id });
};

exports.setSocketID = function(id, socketid) {
    return users.findOneAsync({ _id: id })
    .then(function(user) {
        user.socket_id = socketid;
        users.updateAsync({ _id: id }, { $set: user });
    });
};