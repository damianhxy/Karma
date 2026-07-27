/* global io, curUserId */
const socket = io();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

const overall = document.getElementById("overall-container");

const video = document.getElementById("camera-video");
const button = document.getElementById("camera-button");
const canvas = document.getElementById("camera-canvas");
const context = canvas.getContext("2d");
let stream;

const camera2 = document.getElementById("camera2-container");
const video2 = document.getElementById("camera2-video");
const button2 = document.getElementById("camera2-button");
const canvas2 = document.getElementById("camera2-canvas");
const context2 = canvas2.getContext("2d");

const edit = document.getElementById("edit-container");
const closeBtn = document.getElementById("camera-close");
const send = document.getElementById("camera-send");
let currentImage;

const loading = document.getElementById("loading-container");
const loadingSuggestions = document.getElementById("loading-suggestions-container");
const loadingSend = document.getElementById("loading-send");

const rating = document.getElementById("rating-container");
const fivestar = document.getElementById("rating-five");

const chat = document.getElementById("chat-container");
const chatMessages = document.getElementById("chat-messages");
const chatNewSend = document.getElementById("chat-new-send");
const chatNewText = document.getElementById("chat-new-text");
const chatNewPhoto = document.getElementById("chat-new-photo");
const chatExit = document.getElementById("chat-exit");
let curQuestionId = -1;

const teach = document.getElementById("teach-container");

socket.emit("init", curUserId);

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
edit.style.display =
  loading.style.display =
  chat.style.display =
  rating.style.display =
  camera2.style.display =
    "none";
edit.style.zIndex =
  loading.style.zIndex =
  chat.style.zIndex =
  rating.style.zIndex =
  camera2.style.zIndex =
    "-1";

let loadingToggle = 0;
loadingSend.innerHTML = "Find a live tutor!";

function getVideoWidth() {
  if (video.videoWidth / video.videoHeight < window.innerWidth / window.innerHeight) {
    return (video.videoWidth * window.innerHeight) / video.videoHeight;
  }
  return window.innerWidth;
}

function getVideoHeight() {
  if (video.videoWidth / video.videoHeight > window.innerWidth / window.innerHeight) {
    return (video.videoHeight * window.innerWidth) / video.videoWidth;
  }
  return window.innerHeight;
}

function startCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true }).then(function (vid) {
      stream = vid;
      try {
        video.srcObject = stream;
      } catch {
        video.src = URL.createObjectURL(stream);
      }
      video.play();
    });
  }
}

startCamera();

function stopCamera() {
  stream.getTracks()[0].stop();
}

function startCamera2() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true }).then(function (vid) {
      stream = vid;
      try {
        video2.srcObject = stream;
      } catch {
        video2.src = URL.createObjectURL(stream);
      }
      video2.play();
    });
  }
}

window.teachMouse = function (something, event) {
  something.dataset.time = Date.now();
  something.dataset.pos = event.clientX;
};

window.teachUp = function (something, event) {
  if (
    Date.now() - something.dataset.time < 200 &&
    Math.abs(event.clientX - something.dataset.pos) < 20
  ) {
    overall.style.display = "none";
    overall.style.zIndex = "-1";
    chat.style.display = "block";
    chat.style.zIndex = "20";

    curQuestionId = something.dataset.id;

    socket.emit("answer", {
      questionid: something.dataset.id,
      askee: curUserId,
    });

    socket.on("answered", (questions) => {
      const question = questions.find((q) => q._id === curQuestionId);
      if (question === undefined || question.state !== "open") return;

      loading.style.display = "none";
      loading.style.zIndex = "-1";
      chat.style.display = "block";
      chat.style.zIndex = "15";
      updateMessages(question);

      socket.off("answered");

      socket.on("messaged", (questions) => {
        const question = questions.find((q) => q._id === curQuestionId);
        updateMessages(question);
      });

      socket.on("resolve", (questions) => {
        const question = questions.find((q) => q._id === curQuestionId);
        if (question !== undefined && question.state !== "success" && question.state !== "failure")
          return;

        chat.style.display = "none";
        chat.style.zIndex = "-1";

        socket.off("messaged");
        socket.off("resolve");
      });
    });
  }
};

overall.addEventListener("mouseup", function () {
  button.style.display = "none";
  setTimeout(function () {
    button.style.display = "block";
  }, 20);
});

button.addEventListener("click", function () {
  const vidWidth = getVideoWidth();
  const vidHeight = getVideoHeight();
  edit.style.display = "block";
  edit.style.zIndex = "20";
  overall.style.display = "none";
  overall.style.zIndex = "-1";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context.drawImage(
    video,
    (window.innerWidth - vidWidth) / 2,
    (window.innerHeight - vidHeight) / 2,
    getVideoWidth(),
    getVideoHeight(),
  );
  stopCamera();
});

closeBtn.addEventListener("click", function () {
  edit.style.display = "none";
  edit.style.zIndex = "-1";
  overall.style.display = "block";
  overall.style.zIndex = "15";
  startCamera();
});

send.addEventListener("click", function () {
  currentImage = canvas.toDataURL();
  edit.style.display = "none";
  edit.style.zIndex = "-1";
  loading.style.display = "block";
  loading.style.zIndex = "15";
  socket.emit("getRelatedQuestions", "Mathematics");
  socket.on("relatedQuestions", (questions) => {
    if (questions.length === 0 || questions[0].subject !== "Mathematics") return;

    let newHTML = "";
    for (const q of questions) {
      newHTML += `<div class="loading-suggestion" style="background-image: url(${escapeHtml(q.photo)})" data-id="${escapeHtml(q._id)}"></div>`;
    }
    loadingSuggestions.innerHTML = newHTML;
  });
});

button2.addEventListener("click", function () {
  const vidWidth = getVideoWidth();
  const vidHeight = getVideoHeight();
  canvas2.style.display = "block";
  canvas2.style.zIndex = "20";
  video2.style.display = "none";
  video2.style.zIndex = "-1";
  button2.style.display = "none";
  button2.style.zIndex = "-1";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context2.drawImage(
    video,
    (window.innerWidth - vidWidth) / 2,
    (window.innerHeight - vidHeight) / 2,
    getVideoWidth(),
    getVideoHeight(),
  );
  stopCamera();
});

loadingSend.addEventListener("click", function () {
  if (loadingToggle === 0) {
    loadingToggle = 1;
    loadingSend.innerHTML = "Searching... Click to cancel";

    socket.emit("create", {
      userid: curUserId,
      photo: currentImage,
      subject: "Mathematics",
    });

    socket.off("created");
    socket.on("created", (questions, id) => {
      const question = questions.find((q) => q._id === id);
      if (question === undefined || question.asker !== curUserId) return;

      curQuestionId = id;

      socket.off("created");
    });

    socket.on("answered", (questions) => {
      const question = questions.find((q) => q._id === curQuestionId);
      if (question === undefined || question.state !== "open") return;

      loading.style.display = "none";
      loading.style.zIndex = "-1";
      chat.style.display = "block";
      chat.style.zIndex = "15";
      updateMessages(question);

      socket.off("answered");

      socket.on("messaged", (questions) => {
        const question = questions.find((q) => q._id === curQuestionId);
        updateMessages(question);
      });

      socket.on("resolve", (questions) => {
        const question = questions.find((q) => q._id === curQuestionId);
        if (question !== undefined && question.state !== "success" && question.state !== "failure")
          return;

        chat.style.display = "none";
        chat.style.zIndex = "-1";

        socket.off("messaged");
        socket.off("resolve");
      });
    });
  } else {
    loadingToggle = 0;
    loadingSend.innerHTML = "Find a live tutor!";
  }
});

chatNewSend.addEventListener("click", () => {
  socket.emit("message", {
    questionid: curQuestionId,
    userid: curUserId,
    message: chatNewText.value,
  });
  chatNewText.value = "";
});

chatNewPhoto.addEventListener("click", () => {
  startCamera2();
});

chatExit.addEventListener("click", () => {
  chat.style.display = "none";
  chat.style.zIndex = "-1";
  rating.style.display = "block";
  rating.style.zIndex = "15";
});

fivestar.addEventListener("click", () => {
  rating.style.display = "none";
  rating.style.zIndex = "-1";
  overall.style.display = "block";
  overall.style.zIndex = "15";
  startCamera();
});

function updateMessages(question) {
  let newHTML;
  if (question.asker === curUserId) {
    newHTML = `<div class="message sent-message"><img class="image-message" id="mine" style="background-image:url(${question.photo})"></div>`;
  } else {
    newHTML = `<div class="message received-message"><img class="image-message" id="mine" src="background-image:url(${question.photo})"></div>`;
  }
  for (const msg of question.messages) {
    const { userid, message } = msg;
    const safeMessage = escapeHtml(message);
    if (userid === curUserId) {
      newHTML += `<div class="message sent-message"><span>${safeMessage}</span></div>`;
    } else {
      newHTML += `<div class="message received-message"><span>${safeMessage}</span></div>`;
    }
  }
  chatMessages.innerHTML = newHTML;
}

socket.on("connected", () => console.log("Connected to server."));

socket.on("populateQuestions", (questions) => {
  populateQuestions(questions);
});

socket.on("created", (questions) => {
  populateQuestions(questions);
});

function populateQuestions(questions) {
  let newHtml = "";
  for (const question of questions) {
    const safePhoto = escapeHtml(question.photo);
    const safeId = escapeHtml(question._id);
    const safeSubject = escapeHtml(question.subject);
    newHtml += `<div class="teach-card" style="background-image: url(${safePhoto}" data-id="${safeId}" onmousedown="teachMouse(this, event)" onmouseup="teachUp(this, event)"><p>${safeSubject}</p></div>`;
  }
  teach.innerHTML = newHtml;
}
