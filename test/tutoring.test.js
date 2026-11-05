const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test, before, after } = require("node:test");
const { start, Client } = require("./helpers/app.js");
const { connect } = require("./helpers/socket.js");

// The tutoring flow runs over Socket.IO. Each user here signs in over HTTP, then connects with
// the session cookie and sends the payloads public/script.js sends: the asker takes a photo and
// creates a question, a tutor picks it from the list and answers it, and both chat.

// A 1x1 PNG, the shape of the canvas.toDataURL() photo the page sends.
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const findQuestion = (questions, id) => questions.find((q) => q._id === id);

// Each describe block gets its own app: sign-up POSTs count towards the 20-per-15-minutes auth
// rate limit.
let app;
let sockets;
function freshApp() {
  before(async () => {
    app = await start();
    sockets = [];
  });
  after(async () => {
    await Promise.all(sockets.map((s) => s.close()));
    await app.stop();
  });
}

let users = 0;

// Signs up a fresh user and opens their page's socket, as loading the home page does.
async function user() {
  const client = new Client(app.baseUrl);
  const { userId } = await client.signUp("user" + ++users);
  const socket = await connect(app.baseUrl, client.cookieHeader);
  sockets.push(socket);
  socket.emit("init", userId);
  return { client, userId, socket };
}

async function ask(asker, subject = "Mathematics") {
  const created = asker.socket.next("created", (questions, id) =>
    Boolean(findQuestion(questions, id)?.asker === asker.userId),
  );
  asker.socket.emit("create", { userid: asker.userId, photo: PHOTO, subject });
  const [questions, id] = await created;
  return { id, questions };
}

async function answer(tutor, id, ...watchers) {
  const answered = [tutor, ...watchers].map((u) =>
    u.socket.next("answered", (questions) => findQuestion(questions, id)?.state === "open"),
  );
  tutor.socket.emit("answer", { questionid: id, askee: tutor.userId });
  return Promise.all(answered);
}

async function say(from, id, message, ...watchers) {
  const messaged = [from, ...watchers].map((u) =>
    u.socket.next("messaged", (questions) =>
      findQuestion(questions, id)?.messages.some((m) => m.message === message),
    ),
  );
  from.socket.emit("message", { questionid: id, userid: from.userId, message });
  return Promise.all(messaged);
}

describe("page", () => {
  freshApp();

  test("the page loads the Socket.IO client and the page script", async () => {
    const client = new Client(app.baseUrl);
    await client.signUp("pageuser");
    const home = await client.get("/");
    assert.match(home.text, /<script src="\/socket.io\/socket.io.js"><\/script>/);
    assert.match(home.text, /<script src="script.js"><\/script>/);
    for (const url of ["/socket.io/socket.io.js", "/script.js", "/style.css"]) {
      assert.equal((await client.get(url)).status, 200, url);
    }
  });

  test("a signed-in page's socket connects", async () => {
    const { socket } = await user();
    assert.ok(socket.isOpen);
  });
});

describe("asking and answering", () => {
  freshApp();

  test("a new question reaches the asker and the tutors' lists", async () => {
    const asker = await user();
    const tutor = await user();
    const seen = tutor.socket.next("created");
    const { id, questions } = await ask(asker);
    const question = findQuestion(questions, id);
    assert.equal(question.asker, asker.userId);
    assert.equal(question.photo, PHOTO);
    assert.equal(question.subject, "Mathematics");
    const [tutorList, tutorId] = await seen;
    assert.equal(tutorId, id);
    assert.equal(findQuestion(tutorList, id).photo, PHOTO);
  });

  test("a tutor who opens the page later finds pending questions in the list", async () => {
    const asker = await user();
    const { id } = await ask(asker, "Physics");
    const client = new Client(app.baseUrl);
    const { userId } = await client.signUp("latecomer");
    const socket = await connect(app.baseUrl, client.cookieHeader);
    sockets.push(socket);
    socket.emit("init", userId);
    const [questions] = await socket.seen("populateQuestions", (list) =>
      Boolean(findQuestion(list, id)),
    );
    assert.equal(findQuestion(questions, id).subject, "Physics");
    // Newest first.
    const times = questions.map((q) => q.time);
    assert.deepEqual(
      times,
      [...times].sort((a, b) => b - a),
    );
  });

  test("answering opens the question for the asker and the tutor", async () => {
    const asker = await user();
    const tutor = await user();
    const { id } = await ask(asker);
    const [[forTutor], [forAsker]] = await answer(tutor, id, asker);
    for (const questions of [forTutor, forAsker]) {
      const question = findQuestion(questions, id);
      assert.equal(question.state, "open");
      assert.equal(question.askee, tutor.userId);
      assert.equal(question.asker, asker.userId);
    }
  });

  test.todo(
    "3.9 authorisation: socket identity comes from the session, not the userid/askee in the payload",
  );
  test.todo(
    "3.9 authorisation: only pending questions can be answered, and not by their own asker",
  );
  test.todo(
    "3.9 input validation: create rejects a photo that is not an image data URL, or an empty subject",
  );
  test.todo(
    "Karma: getRelatedQuestions has a server handler, so the suggestions under the photo load",
  );
});

describe("chat", () => {
  freshApp();

  test("messages reach both participants in order, with their sender", async () => {
    const asker = await user();
    const tutor = await user();
    const { id } = await ask(asker);
    await answer(tutor, id, asker);
    await say(asker, id, "How do I start this?", tutor);
    const [, [toAsker]] = await say(tutor, id, "Factorise the left side first.", asker);
    assert.deepEqual(
      findQuestion(toAsker, id).messages.map(({ userid, message }) => ({ userid, message })),
      [
        { userid: asker.userId, message: "How do I start this?" },
        { userid: tutor.userId, message: "Factorise the left side first." },
      ],
    );
  });

  test("message text is stored as typed, markup included", async () => {
    const asker = await user();
    const tutor = await user();
    const { id } = await ask(asker);
    await answer(tutor, id, asker);
    const text = `x < 3 && y > "4" <b>bold</b>`;
    const [[questions]] = await say(asker, id, text, tutor);
    assert.equal(findQuestion(questions, id).messages[0].message, text);
  });

  test("a participant whose socket reconnects still receives the chat", async () => {
    const asker = await user();
    const tutor = await user();
    const { id } = await ask(asker);
    await answer(tutor, id, asker);
    await asker.socket.close();
    asker.socket = await connect(app.baseUrl, asker.client.cookieHeader);
    sockets.push(asker.socket);
    asker.socket.emit("init", asker.userId);
    await say(tutor, id, "Still there?", asker);
  });

  test.todo(
    "3.9 authorisation: chat and question updates go only to the question's participants, and only participants can message",
  );
  test.todo("3.9 input validation: empty or overlong messages are rejected");
});

describe("resolving", () => {
  freshApp();

  test("resolving a question records success or failure", async () => {
    for (const success of [true, false]) {
      const asker = await user();
      const tutor = await user();
      const { id } = await ask(asker);
      await answer(tutor, id, asker);
      const resolved = asker.socket.next(
        "resolved",
        (questions) => findQuestion(questions, id)?.state !== "open",
      );
      asker.socket.emit("resolve", { questionid: id, success });
      const [questions] = await resolved;
      assert.equal(findQuestion(questions, id).state, success ? "success" : "failure");
    }
  });

  test.todo(
    "Karma: the rating screen sends resolve, and the chat listens for resolved (it listens for resolve, which the server never emits)",
  );
  test.todo("3.9 authorisation: only the asker can resolve, and only an open question");
});

describe("client rendering", () => {
  test("the page script escapes question and message text before inserting it", () => {
    const script = fs.readFileSync(path.join(__dirname, "..", "public", "script.js"), "utf8");
    assert.match(script, /function escapeHtml\(/);
    for (const field of ["question.photo", "question._id", "question.subject", "message"]) {
      assert.match(script, new RegExp(`escapeHtml\\(${field.replace(".", "\\.")}\\)`), field);
    }
  });

  test.todo(
    "3.9 client-side HTML: escapeHtml escapes quotes, so a crafted photo cannot break out of the style attribute",
  );
});
