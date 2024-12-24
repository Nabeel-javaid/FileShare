const { app, BrowserWindow } = require("electron");
const { networkInterfaces } = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const socketIo = require("socket.io");
const fs = require('fs');

let mainWindow;
let server;
let io;

function createServer() {
    const expressApp = express();
    server = http.createServer(expressApp);

    // Serve static files from public directory
    expressApp.use(express.static(path.join(__dirname, 'public')));

    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    const devices = new Map();
    const pendingTransfers = new Map();

    io.on("connection", (socket) => {
        console.log("New device connected:", socket.id);

        socket.on("register-device", (data) => {
            const deviceInfo = {
                id: socket.id,
                name: data.name || 'Unknown Device',
                type: data.type || 'unknown',
                lastSeen: Date.now()
            };
            
            devices.set(socket.id, deviceInfo);
            io.emit("device-list", Array.from(devices.values()));
            console.log("Device registered:", deviceInfo);
        });

        // Handle initial file transfer request
        socket.on("file-transfer-request", (data) => {
            const { receiverId, fileName, fileSize, fileType, content } = data;
            const sender = devices.get(socket.id);
            const receiver = devices.get(receiverId);

            if (!sender || !receiver) {
                socket.emit("transfer-error", { message: "Invalid sender or receiver" });
                return;
            }

            const transferId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            
            // Store transfer info
            pendingTransfers.set(transferId, {
                senderId: socket.id,
                senderName: sender.name,
                receiverId: receiverId,
                fileName: fileName,
                fileSize: fileSize,
                fileType: fileType,
                content: content,
                status: 'pending'
            });

            // Send request to receiver
            io.to(receiverId).emit("file-request", {
                transferId,
                senderName: sender.name,
                fileName,
                fileSize
            });

            console.log(`File transfer request sent: ${transferId}`);
        });

        // Handle receiver's response
        socket.on("file-response", (data) => {
            const { transferId, accepted } = data;
            const transfer = pendingTransfers.get(transferId);

            if (!transfer) {
                socket.emit("transfer-error", { message: "Invalid transfer ID" });
                return;
            }

            if (accepted) {
                try {
                    // Create Downloads/FileTransfer directory
                    const downloadPath = path.join(app.getPath('downloads'), 'FileTransfer');
                    if (!fs.existsSync(downloadPath)) {
                        fs.mkdirSync(downloadPath, { recursive: true });
                    }

                    // Save the file
                    const filePath = path.join(downloadPath, transfer.fileName);
                    fs.writeFileSync(filePath, Buffer.from(transfer.content));

                    // Notify both parties
                    io.to(transfer.senderId).emit("transfer-complete", {
                        message: `${transfer.fileName} was sent successfully`
                    });
                    io.to(transfer.receiverId).emit("transfer-complete", {
                        fileName: transfer.fileName,
                        filePath: filePath
                    });

                    console.log(`File saved: ${filePath}`);
                } catch (error) {
                    console.error("File save error:", error);
                    io.to(transfer.senderId).emit("transfer-error", {
                        message: "Failed to save file"
                    });
                }
            } else {
                // Notify sender that transfer was rejected
                io.to(transfer.senderId).emit("transfer-rejected", {
                    fileName: transfer.fileName
                });
            }

            // Clean up
            pendingTransfers.delete(transferId);
        });

        socket.on("disconnect", () => {
            console.log("Device disconnected:", socket.id);
            devices.delete(socket.id);
            io.emit("device-list", Array.from(devices.values()));

            // Clean up any pending transfers
            for (const [transferId, transfer] of pendingTransfers.entries()) {
                if (transfer.senderId === socket.id || transfer.receiverId === socket.id) {
                    const otherParty = transfer.senderId === socket.id ? 
                        transfer.receiverId : transfer.senderId;
                    
                    io.to(otherParty).emit("transfer-cancelled", {
                        transferId,
                        reason: "Other party disconnected"
                    });
                    pendingTransfers.delete(transferId);
                }
            }
        });
    });

    const port = 3000;
    server.listen(port, "0.0.0.0", () => {
        const localIP = getLocalIP();
        console.log(`Server running at http://${localIP}:${port}`);
    });
}

function getLocalIP() {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return '127.0.0.1';
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile("index.html");
    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createServer();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        if (server) {
            server.close();
        }
        app.quit();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});