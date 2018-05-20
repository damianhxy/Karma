// CAMERA CODE

var pageState = "main";

const overall = document.getElementById("overall-container");

const video = document.getElementById("camera-video");
const button = document.getElementById("camera-button");
const canvas = document.getElementById("camera-canvas");
const context = canvas.getContext("2d");
var stream;

const edit = document.getElementById("edit-container");
const close = document.getElementById("camera-close");
const send = document.getElementById("camera-send");
var currentImage;

const loading = document.getElementById("loading-container");
const loadingSuggestions = document.getElementById("loading-suggestions-container");
const loadingSend = document.getElementById("loading-send");

const chat = document.getElementById("chat-container");

// const socket = io();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
edit.style.display = loading.style.display = chat.style.display = "none";
edit.style.zIndex = loading.style.zIndex = chat.style.zIndex = "-1";

var loadingToggle = 0;
var hardcodedTimeout;
loadingSend.innerHTML = "Find a live tutor!";

function getVideoWidth() {
	if(video.videoWidth / video.videoHeight < window.innerWidth / window.innerHeight) {
		return video.videoWidth * window.innerHeight / video.videoHeight;
	}
	else return window.innerWidth;
}

function getVideoHeight() {
	if(video.videoWidth / video.videoHeight > window.innerWidth / window.innerHeight) {
		return video.videoHeight * window.innerWidth / video.videoWidth;
	}
	else return window.innerHeight;
}

// access to camera
function startCamera() {
	if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia({ video: true }).then(function(vid) {
			stream = vid;
			try {
				video.srcObject = stream;
			} catch (error) {
				video.src = URL.createObjectURL(stream);
			}
			video.play();
		});
	}
} // initiate on startup

startCamera();

function stopCamera() {
	stream.getTracks()[0].stop();
}

function teachMouse(something, event) {
	something.dataset.time = Date.now();
	something.dataset.pos = event.clientX;
}

function teach(something, event) {
	if(Date.now() - something.dataset.time < 200 && Math.abs(event.clientX - something.dataset.pos) < 20){
		// click
		console.log(something.dataset.teachid);
		overall.style.display = "none";
		overall.style.zIndex = "-1";
	}
}

function readSuggestion(suggestion) {
	// 
}

// CAMERA LISTENERS
overall.addEventListener("mouseup", function() {
	button.style.display = "none";
	setTimeout(function() { button.style.display = "block"; }, 20);
})

button.addEventListener("click", function() {
	var vidWidth = getVideoWidth();
	var vidHeight = getVideoHeight();
	edit.style.display = "block";
	edit.style.zIndex = "20";
	overall.style.display = "none";
	overall.style.zIndex = "-1";
	context.drawImage(video, (window.innerWidth-vidWidth)/2, (window.innerHeight-vidHeight)/2, getVideoWidth(), getVideoHeight());
	stopCamera();
	pageState = "edit";
});

close.addEventListener("click", function() {
	edit.style.display = "none";
	edit.style.zIndex = "-1";
	overall.style.display = "block";
	overall.style.zIndex = "15";
	startCamera();
	pageState = "main";
});

send.addEventListener("click", function() {
	// do something with canvas.toDataURL();
	currentImage=canvas.toDataURL();
	// load the loading page
	edit.style.display = "none";
	edit.style.zIndex = "-1";
	loading.style.display = "block";
	loading.style.zIndex = "15";
	pageState = "loading";
	// socket.off('')
	// socket.on('', (questions) => {
	// 	// Populate similar questions
	// 	loadingSuggestions.innerHTML = "";
	// 	for (question of questions) {
	// 		loadingSuggestions.innerHTML += `<div class="loading-suggestion" style="background-image: url(`;
	// 	}
	// });
});

loadingSend.addEventListener("click", function() {
	if(loadingToggle == 0){
		loadingToggle = 1;
		loadingSend.innerHTML = "Searching... Click to cancel";
		// send out the query
		hardcodeTimeout = setTimeout(function(){
			// transition to chat 
			loading.style.display = "none";
			loading.style.zIndex = "-1";
			chat.style.display = "block";
			chat.style.zIndex = "15";
			pageState = "chat";
			document.getElementById("mine").style.backgroundImage = "url('" + currentImage.replace(/(\r\n|\n|\r)/gm, "") + "')"
			console.log(currentImage.replace(/(\r\n|\n|\r)/gm, ""));
		}, 100);
	}
	else {
		loadingToggle = 0;
		loadingSend.innerHTML = "Find a live tutor!";
		// cancel the query
	}
});

// socket.on("connected", () => console.log("Connected to server."));
