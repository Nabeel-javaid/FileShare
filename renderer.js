const socket = io("http://localhost:3000"); // Connect to the server

const fileInput = document.getElementById("fileInput");
const sendFileButton = document.getElementById("sendFileButton");
const deviceList = document.getElementById("deviceList");
const status = document.getElementById("status");

let selectedFile;
let availableDevices = [];

// Register the device with the server
socket.emit("register-device", { name: "My Device" }); // Replace with actual device name

// Display devices when the list is updated
socket.on("device-list", (devices) => {
  availableDevices = devices;
  renderDeviceList();
});

// Handle file input
fileInput.addEventListener("change", (event) => {
  selectedFile = event.target.files[0];
});

// Handle file sending
sendFileButton.addEventListener("click", () => {
  if (!selectedFile) {
    alert("Please select a file first.");
    return;
  }
  if (availableDevices.length === 0) {
    alert("No devices available.");
    return;
  }

  const receiver = availableDevices[0]; // Select the first device (you can enhance this later)
  socket.emit("send-file-request", {
    receiverId: receiver.id,
    senderName: "My Device",
    fileName: selectedFile.name,
  });

  status.textContent = `Request sent to ${receiver.name} for file: ${selectedFile.name}`;
});

// Render the list of devices
function renderDeviceList() {
  deviceList.innerHTML = "";
  availableDevices.forEach((device) => {
    const li = document.createElement("li");
    li.textContent = device.name;
    deviceList.appendChild(li);
  });
}

// Handle incoming file requests
socket.on("file-request", (data) => {
  const accept = confirm(`${data.senderName} wants to send you a file: ${data.fileName}. Accept?`);

  if (accept) {
    socket.emit("file-accept", { senderId: data.senderId });
  } else {
    socket.emit("file-reject", { senderId: data.senderId });
  }
});

// Handle file transfer
socket.on("receive-file", (data) => {
  const link = document.createElement("a");
  link.href = `data:application/octet-stream;base64,${data.fileContent}`;
  link.download = data.fileName;
  link.textContent = `Download ${data.fileName}`;
  document.body.appendChild(link);
});
