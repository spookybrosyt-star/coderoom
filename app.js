/* 
   -------------------------------------------------------
   CODE STATION PRO - PYTHON & ROOMS
   Run with: node app.js
   -------------------------------------------------------
*/

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// --- STATE MANAGEMENT ---
const rooms = {}; 
const PY_TEMPLATE = "# Python 3 environment\nprint('Hello from Code Station!')\n\ndef add(a, b):\n    return a + b\n\nprint(add(5, 10))";

// --- EXECUTION CONFIG ---
const MAX_OUTPUT_BYTES = 128 * 1024;   // cap output we store/broadcast
const runningProcs = new Map();        // room -> child process

// --- HTML FRONTEND (Embedded) ---
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Station Pro</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Inter', sans-serif; background-color: #1e1e2e; color: #cdd6f4; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        
        /* HEADER */
        header { background-color: #181825; padding: 0 20px; height: 50px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #313244; }
        h1 { font-family: 'JetBrains Mono', monospace; font-size: 1.2rem; margin: 0; }
        .brand-code { color: #f9e2af; } /* Python Yellow */
        .brand-station { color: #89b4fa; } /* Blue */
        #room-display { font-size: 0.9rem; color: #aaa; }
        #leave-btn { background: #f38ba8; color: #111; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }

        /* VIEWS */
        #lobby-view { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #1e1e2e; z-index: 100; display: flex; justify-content: center; align-items: center; }
        #room-view { display: none; flex: 1; height: calc(100vh - 50px); }

        /* LOBBY UI */
        .lobby-box { background: #11111b; padding: 30px; border-radius: 12px; border: 1px solid #313244; width: 400px; }
        .lobby-box h2 { margin-top: 0; color: #f9e2af; text-align: center; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-size: 0.9rem; }
        input, select { width: 100%; padding: 10px; background: #1e1e2e; border: 1px solid #45475a; color: white; border-radius: 6px; outline: none; }
        .lobby-btn { width: 100%; padding: 12px; background: #89b4fa; color: #111; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px; }
        .lobby-btn:hover { background: #b4befe; }
        
        /* WORKSPACE LAYOUT */
        #main-split { display: flex; width: 100%; height: 100%; }
        
        /* LEFT: EDITOR & OUTPUT */
        #code-section { flex: 2; display: flex; flex-direction: column; border-right: 1px solid #313244; }
        #toolbar { padding: 10px; background: #181825; display: flex; gap: 10px; border-bottom: 1px solid #313244; }
        #run-btn { background: #a6e3a1; color: #111; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; font-family: 'JetBrains Mono'; }
        #run-btn:hover { background: #94e2d5; }
        #stop-btn { background: #f38ba8; color: #111; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; font-family: 'JetBrains Mono'; }
        #stop-btn:hover { background: #eba0ac; }

        #code-editor { flex: 2; background-color: #1e1e2e; color: #cdd6f4; border: none; padding: 15px; font-family: 'JetBrains Mono', monospace; font-size: 15px; line-height: 1.6; resize: none; outline: none; }
        
        #output-console { flex: 1; background: #11111b; border-top: 2px solid #313244; padding: 15px; font-family: 'JetBrains Mono', monospace; font-size: 14px; overflow-y: auto; color: #babbf1; }
        .output-title { font-size: 0.8rem; color: #6c7086; margin-bottom: 5px; text-transform: uppercase; }

        /* RIGHT: CHAT */
        #chat-section { flex: 1; min-width: 300px; display: flex; flex-direction: column; background-color: #181825; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; list-style: none; margin: 0; display: flex; flex-direction: column; gap: 10px; }
        .message { background-color: #313244; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
        .sys-msg { color: #f9e2af; font-style: italic; font-size: 0.8rem; text-align: center; }
        
        #input-area { padding: 15px; background: #11111b; border-top: 1px solid #313244; display: flex; gap: 5px; }
        #msg-input { flex: 1; }
        #send-btn { background: #89b4fa; border: none; padding: 0 15px; border-radius: 6px; cursor: pointer; }
    </style>
</head>
<body>

    <!-- LOBBY VIEW -->
    <div id="lobby-view">
        <div class="lobby-box">
            <h2>🐍 Code Station Pro</h2>
            
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="username" placeholder="Enter your name...">
            </div>

            <div class="form-group">
                <label>Room Name</label>
                <input type="text" id="room-name" placeholder="Room ID (e.g. py-room-1)">
            </div>

            <div class="form-group">
                <label>Room Type</label>
                <select id="room-type" onchange="togglePass()">
                    <option value="public">Public</option>
                    <option value="private">Private (Password Protected)</option>
                </select>
            </div>

            <div class="form-group" id="pass-group" style="display:none;">
                <label>Room Password</label>
                <input type="password" id="room-pass" placeholder="Secret...">
            </div>

            <button class="lobby-btn" onclick="joinRoom()">Enter Room</button>
            <p id="error-msg" style="color: #f38ba8; text-align: center; font-size: 0.9rem; margin-top:10px;"></p>
        </div>
    </div>

    <!-- ROOM VIEW -->
    <div id="room-view">
        <header>
            <h1><span class="brand-code">Python</span> <span class="brand-station">Station</span></h1>
            <span id="room-display"></span>
            <button id="leave-btn" onclick="location.reload()">Leave</button>
        </header>

        <div id="main-split">
            <div id="code-section">
                <div id="toolbar">
                    <button id="run-btn" onclick="runCode()">▶ Run Code</button>
                    <button id="stop-btn" onclick="stopCode()">■ Stop</button>
                    <span style="color:#6c7086; font-size: 0.8rem; align-self:center; margin-left:auto;">Auto-saves to room</span>
                </div>
                <textarea id="code-editor" spellcheck="false" placeholder="# Write Python code here..."></textarea>
                <div id="output-console">
                    <div class="output-title">Terminal Output</div>
                    <pre id="output-text" style="margin:0;">Waiting for execution...</pre>
                </div>
            </div>

            <div id="chat-section">
                <ul id="messages"></ul>
                <form id="input-area" onsubmit="sendMessage(event)">
                    <input id="msg-input" type="text" placeholder="Type a message..." autocomplete="off" />
                    <button id="send-btn">Send</button>
                </form>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentUser = null;
        let currentRoom = null;

        // --- DOM ELEMENTS ---
        const lobbyView = document.getElementById('lobby-view');
        const roomView = document.getElementById('room-view');
        const editor = document.getElementById('code-editor');
        const outputText = document.getElementById('output-text');
        const messagesList = document.getElementById('messages');
        const errorMsg = document.getElementById('error-msg');

        // --- LOBBY LOGIC ---
        function togglePass() {
            const type = document.getElementById('room-type').value;
            document.getElementById('pass-group').style.display = (type === 'private') ? 'block' : 'none';
        }

        function joinRoom() {
            const user = document.getElementById('username').value.trim();
            const room = document.getElementById('room-name').value.trim();
            const type = document.getElementById('room-type').value;
            const pass = document.getElementById('room-pass').value;

            if (!user || !room) {
                errorMsg.innerText = "Name and Room are required.";
                return;
            }

            currentUser = user;
            currentRoom = room;

            socket.emit('join-room', { user, room, type, pass });
        }

        // --- SOCKET LISTENERS ---
        socket.on('join-success', (data) => {
            lobbyView.style.display = 'none';
            roomView.style.display = 'flex'; 
            roomView.style.flexDirection = 'column';

            document.getElementById('room-display').innerText = \`Room: \${currentRoom}\`;
            
            // Load initial state
            editor.value = data.code;
            outputText.innerText = data.output || 'Ready to run...';
            messagesList.innerHTML = '';
            data.messages.forEach(addMsg);
        });

        socket.on('join-error', (msg) => {
            errorMsg.innerText = msg;
        });

        socket.on('chat-msg', addMsg);
        
        socket.on('code-update', (code) => {
            if (editor.value !== code) {
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                editor.value = code;
                editor.setSelectionRange(start, end);
            }
        });

        socket.on('output-update', (text) => {
            outputText.innerText = text;
        });

        // --- APP LOGIC ---
        function sendMessage(e) {
            e.preventDefault();
            const inp = document.getElementById('msg-input');
            if (inp.value) {
                socket.emit('send-msg', { room: currentRoom, user: currentUser, text: inp.value });
                inp.value = '';
            }
        }

        function addMsg(msg) {
            const li = document.createElement('li');
            if (msg.user === 'System') {
                li.className = 'sys-msg';
                li.innerText = msg.text;
            } else {
                li.className = 'message';
                li.innerHTML = \`<strong style="color:#89b4fa">\${msg.user}:</strong> \${msg.text}\`;
            }
            messagesList.appendChild(li);
            messagesList.scrollTop = messagesList.scrollHeight;
        }

        function runCode() {
            outputText.innerText = "Running...";
            socket.emit('run-code', { room: currentRoom, code: editor.value });
        }

        function stopCode() {
            socket.emit('stop-code', { room: currentRoom });
            outputText.innerText = "Stopping...";
        }

        // Sync Code typing
        editor.addEventListener('input', () => {
            socket.emit('type-code', { room: currentRoom, code: editor.value });
        });
    </script>
</body>
</html>
`;

// --- SERVER API ---
app.get('/', (req, res) => {
    res.send(HTML_CONTENT);
});

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
  socket.on('join-room', ({ user, room, type, pass }) => {
    if (!rooms[room]) {
      rooms[room] = { type, password: pass, code: PY_TEMPLATE, messages: [], output: '' };
    }
    const targetRoom = rooms[room];

    if (targetRoom.type === 'private' && targetRoom.password !== pass) {
      socket.emit('join-error', 'Wrong Password!');
      return;
    }

    socket.join(room);
    socket.data.room = room;
    socket.data.user = user;
    socket.emit('join-success', targetRoom);

    const joinMsg = { user: 'System', text: \`\${user} joined.\` };
    targetRoom.messages.push(joinMsg);
    io.to(room).emit('chat-msg', joinMsg);
  });

  socket.on('send-msg', (data) => {
    const room = socket.data.room;
    if (!room || !rooms[room]) return;
    const payload = { ...data, room };
    rooms[room].messages.push(payload);
    if (rooms[room].messages.length > 50) rooms[room].messages.shift();
    io.to(room).emit('chat-msg', payload);
  });

  socket.on('type-code', (data) => {
    const room = socket.data.room;
    if (!room || !rooms[room]) return;
    rooms[room].code = data.code;
    socket.to(room).emit('code-update', data.code);
  });

  socket.on('run-code', (data) => {
    const room = socket.data.room;
    const roomData = rooms[room];
    if (!roomData) return;

    // kill previous run if still active
    if (runningProcs.has(room)) {
      runningProcs.get(room).kill('SIGTERM');
      runningProcs.delete(room);
    }

    // simple deny-list
    const forbidden = [/import\\s+os/, /import\\s+sys/, /import\\s+subprocess/, /\\bexec\\s*\\(/, /\\beval\\s*\\(/, /\\bopen\\s*\\(/];
    if (forbidden.some((re) => re.test(data.code))) {
      const msg = "Security Error: File system and shell access are disabled.";
      roomData.output = msg;
      io.to(room).emit('output-update', msg);
      return;
    }

    const tempDir = fs.mkdtempSync('cspro-');
    const tempFile = \`\${tempDir}/main.py\`;
    fs.writeFileSync(tempFile, data.code);

    const child = exec(\`python3 -I \${tempFile}\`, { maxBuffer: MAX_OUTPUT_BYTES });
    runningProcs.set(room, child);

    let collected = '';
    const sendChunk = (chunk) => {
      if (!chunk) return;
      collected += chunk;
      if (collected.length > MAX_OUTPUT_BYTES) {
        collected = collected.slice(0, MAX_OUTPUT_BYTES) + "\\n[output truncated]";
        child.kill('SIGTERM');
      }
      roomData.output = collected;
      io.to(room).emit('output-update', collected);
    };

    child.stdout.on('data', sendChunk);
    child.stderr.on('data', sendChunk);

    child.on('close', () => {
      runningProcs.delete(room);
      fs.rm(tempDir, { recursive: true, force: true }, () => {});
      io.to(room).emit('output-update', roomData.output || "Finished.");
    });

    child.on('error', (err) => {
      runningProcs.delete(room);
      roomData.output = err.message;
      io.to(room).emit('output-update', err.message);
    });
  });

  socket.on('stop-code', ({ room }) => {
    const proc = runningProcs.get(room);
    if (proc) {
      proc.kill('SIGTERM');
      runningProcs.delete(room);
      const msg = "Execution stopped by user.";
      rooms[room].output = msg;
      io.to(room).emit('output-update', msg);
    }
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    const user = socket.data.user;
    if (room && rooms[room]) {
      const leaveMsg = { user: 'System', text: \`\${user || 'A user'} left.\` };
      rooms[room].messages.push(leaveMsg);
      io.to(room).emit('chat-msg', leaveMsg);
    }
    const proc = runningProcs.get(room);
    if (proc) proc.kill('SIGTERM');
    runningProcs.delete(room);
  });
});

server.listen(PORT, () => {
    console.log(\`Python Station running on port \${PORT}\`);
});
