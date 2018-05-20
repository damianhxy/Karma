var Promise = require("bluebird");
var nedb = require("nedb");

var questions = new nedb({ filename: "./database/questions", autoload: true });
Promise.promisifyAll(questions);
Promise.promisifyAll(questions.find().constructor.prototype);

var user = require("./user.js");

exports.create = function(asker, photo, subject) {
    return questions.insertAsync({
        asker,
        askee: "-1",
        photo,
        messages: [],
        state: "pending", // Pending, Open, Success, Failure
        subject,
        time: Date.now()
    });
};

exports.accept = function(questionid, askee) {
    return questions.findAsync({ _id: questionid })
    .then(function(question) {
        question.askee = askee;
        question.state = "open";
        return questions.updateAsync({ _id: questionid }, { $set: question });
    });
};

exports.all = function() {
    return questions.findAsync({});
};

exports.resolve = function(questionid, success) {
    return questions.findAsync({ _id: questionid })
    .then(function(question) {
        if (success) question.state = "success";
        else question.state = "failure";
        return questions.updateAsync({ _id: questionid }, { $set: question });
    });
};

exports.addMessage = function(questionid, userid, message, type) {
    return questions.findAsync({ _id: questionid })
    .then(function(question) {
        question.messages.append({
            userid,
            message,
            type
        });
        return questions.updateAsync({ _id: questionid }, { $set: question });
    });
};