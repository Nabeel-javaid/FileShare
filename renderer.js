const socket = io('http://localhost:3000');
const deviceList = document.getElementById('deviceList');
const networkStatus = document.getElementById('networkStatus');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectedFiles = document.getElementById('selectedFiles');
const notifications = document.getElementById('notifications');

let selectedFilesList = new Set();

// Connection handling
socket.on('connect', () => {
    networkStatus.textContent = 'Connected';
    networkStatus.className = 'status-badge online';
    
    // Register this device
    socket.emit('register-device', {
        name: require('os').hostname(),
        type: 'desktop-app'
    });
});

socket.on('disconnect', () => {
    networkStatus.textContent = 'Disconnected';
    networkStatus.className = 'status-badge offline';
    deviceList.innerHTML = '';
});

// Device list handling
socket.on('device-list', (devices) => {
    deviceList.innerHTML = '';
    devices.forEach(device => {
        if (device.id !== socket.id) { // Don't show ourselves
            const deviceElement = createDeviceElement(device);
            deviceList.appendChild(deviceElement);
        }
    });
});

function createDeviceElement(device) {
    const div = document.createElement('div');
    div.className = 'device-item';
    div.innerHTML = `
        <div class="device-info">
            <div class="device-name">${device.name}</div>
            <div class="device-status">${device.type}</div>
        </div>
        <button class="send-button" onclick="sendFilesToDevice('${device.id}')">
            Send Files
        </button>
    `;
    return div;
}

// File handling
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.backgroundColor = '';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = '';
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    Array.from(files).forEach(file => {
        selectedFilesList.add(file);
    });
    updateFilesList();
}

function updateFilesList() {
    selectedFiles.innerHTML = '';
    selectedFilesList.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.className = 'file-item';
        fileElement.innerHTML = `
            <div>
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="send-button" onclick="removeFile('${file.name}')">
                Remove
            </button>
        `;
        selectedFiles.appendChild(fileElement);
    });
}

function removeFile(fileName) {
    selectedFilesList.forEach(file => {
        if (file.name === fileName) {
            selectedFilesList.delete(file);
        }
    });
    updateFilesList();
}

// File sending
window.sendFilesToDevice = async (deviceId) => {
    if (selectedFilesList.size === 0) {
        showNotification('No Files Selected', 'Please select files to send first');
        return;
    }

    for (const file of selectedFilesList) {
        try {
            await sendFile(file, deviceId);
        } catch (error) {
            showNotification('Error', `Failed to send ${file.name}: ${error.message}`);
        }
    }

    selectedFilesList.clear();
    updateFilesList();
};

function sendFile(file, deviceId) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            socket.emit('file-transfer-request', {
                receiverId: deviceId,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                content: e.target.result
            });
            resolve();
        };

        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };

        reader.readAsArrayBuffer(file);
    });
}

// Handle incoming file requests
socket.on('file-request', (data) => {
    const { transferId, senderName, fileName, fileSize } = data;
    
    showNotification(
        'File Transfer Request',
        `${senderName} wants to send "${fileName}" (${formatFileSize(fileSize)})`,
        [
            {
                text: 'Accept',
                action: () => acceptFile(transferId)
            },
            {
                text: 'Decline',
                action: () => declineFile(transferId)
            }
        ]
    );
});

function acceptFile(transferId) {
    socket.emit('file-response', {
        transferId,
        accepted: true
    });
}

function declineFile(transferId) {
    socket.emit('file-response', {
        transferId,
        accepted: false
    });
}

// UI Helpers
function showNotification(title, message, actions = []) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    let html = `
        <div>
            <div style="font-weight: 500">${title}</div>
            <div style="color: var(--text-light)">${message}</div>
        </div>
    `;

    if (actions.length > 0) {
        html += '<div class="notification-actions">';
        actions.forEach(({ text, action }) => {
            html += `<button class="send-button" onclick="(${action.toString()})()">${text}</button>`;
        });
        html += '</div>';
    }

    notification.innerHTML = html;
    notifications.appendChild(notification);

    if (actions.length === 0) {
        setTimeout(() => notification.remove(), 5000);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Handle file receive completion
socket.on('file-received', (data) => {
    showNotification('File Received', `${data.fileName} has been saved to downloads`);
});

socket.on('transfer-error', (data) => {
    showNotification('Error', data.message);
});