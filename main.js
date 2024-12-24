const { app, BrowserWindow } = require("electron");
const { networkInterfaces } = require("os");
const Bonjour = require("bonjour");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

let mainWindow;

// Start Bonjour for device discovery
const bonjour = new Bonjour();
bonjour.publish({ name: "FileTransferApp", type: "http", port: 3000 });

const devices = {};
const server = http.createServer();
const io = socketIo(server);

// Handle socket.io events
io.on("connection", (socket) => {
  console.log("A new device connected!");

  socket.on("register-device", (data) => {
    devices[socket.id] = data;
    socket.broadcast.emit("device-list", Object.values(devices));
  });

  socket.on("send-file-request", (data) => {
    const { receiverId, senderName, fileName } = data;
    io.to(receiverId).emit("file-request", { senderName, fileName, senderId: socket.id });
  });

  socket.on("file-accept", (data) => {
    io.to(data.senderId).emit("file-accepted", { receiverId: socket.id });
  });

  socket.on("file-reject", (data) => {
    io.to(data.senderId).emit("file-rejected");
  });

  socket.on("send-file", (data) => {
    const { receiverId, fileName, fileContent } = data;
    io.to(receiverId).emit("receive-file", { fileName, fileContent });
  });

  socket.on("disconnect", () => {
    delete devices[socket.id];
    socket.broadcast.emit("device-list", Object.values(devices));
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});

// Electron app setup
app.on("ready", () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "renderer.js"),
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile("index.html");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
