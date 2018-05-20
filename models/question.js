var Promise = require("bluebird");
var nedb = require("nedb");

var questions = new nedb({ filename: "./database/questions", autoload: true });
Promise.promisifyAll(questions);
Promise.promisifyAll(questions.find().constructor.prototype);

exports.create = function(asker, photo) {
    return questions.insertAsync({
        asker,
        askee: "-1",
        photo,
        messages: [],
        state: "pending", // Pending, Open, Success, Failure
        time: Date.now()
    });
};

exports.accept = function(questionid, askee) {
    return questions.findAsnyc({ _id: questionid })
    .then(function(question) {
        question.askee = askee;
        question.state = "open";
        return questions.updateAsync({ _id: questionid }, { $set: question });
    });
};

exports.getPending = function(askee) {
    return questions.findAsync({ $where: function() {
        return this.state === "pending" || (this.state === "open" && this.askee === askee);
    }});
}

exports.resolve = function(questionid, success) {
    return questions.findAsnyc({ _id: questionid })
    .then(function(question) {
        if (success) question.state = "success";
        else question.state = "failure";
        return questions.updateAsync({ _id: questionid }, { $set: question });
    });
};

exports.addMessage = function(questionid, userid, message) {
    return questions.findAsnyc({ _id: questionid })
    .then(function(question) {
        question.messages.append({
            userid,
            message
        });
        return questions.updateAsync({ _id: questionid }, { $set: question });
    });
}