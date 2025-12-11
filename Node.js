/* 
   -------------------------------------------------------
   CODE STATION PRO - MULTI-TABS & MULTI-LANG
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

// --- STATE ---
const rooms = {};
const PY_TEMPLATE = "# Python 3 environment\nprint('Hello from Code Station!')\n";
const JS_TEMPLATE = "console.log('Hello from Code Station (Node)!');\n";
const HTML_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview</title></head>
<body style="font-family:sans-serif;"><h1>Hello from Code Station!</h1></body></html>`;

// --- EXECUTION CONFIG ---
const MAX_OUTPUT_BYTES = 128 * 1024;
const runningProcs = new Map(); // key: room|tabId -> child process

// --- HTML FRONTEND ---
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Code Station Pro</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;} body{margin:0;font-family:'Inter',sans-serif;background:#1e1e2e;color:#cdd6f4;height:100vh;display:flex;flex-direction:column;overflow:hidden;}
header{background:#181825;padding:0 16px;height:46px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #313244;}
h1{font-family:'JetBrains Mono',monospace;font-size:1.1rem;margin:0;}
.brand-code{color:#f9e2af;} .brand-station{color:#89b4fa;}
#room-display{color:#9aa3b5;font-size:0.85rem;}
#leave-btn{background:#f38ba8;color:#111;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;}
#lobby-view{position:fixed;inset:0;background:#1e1e2e;z-index:10;display:flex;align-items:center;justify-content:center;}
.lobby-box{background:#11111b;padding:26px;border-radius:12px;border:1px solid #313244;width:380px;}
.lobby-box h2{margin:0 0 12px 0;text-align:center;color:#f9e2af;}
.form-group{margin-bottom:12px;} label{display:block;margin-bottom:6px;font-size:0.9rem;}
input,select{width:100%;padding:10px;background:#1e1e2e;border:1px solid #45475a;color:white;border-radius:6px;outline:none;}
.lobby-btn{width:100%;padding:12px;background:#89b4fa;color:#111;font-weight:bold;border:none;border-radius:6px;cursor:pointer;}
.lobby-btn:hover{background:#b4befe;}
#room-view{display:none;flex:1;min-height:0;}
#main-split{display:flex;height:calc(100vh - 46px);}
#code-panel{flex:2;display:flex;flex-direction:column;border-right:1px solid #313244;min-width:0;}
#chat-panel{flex:1;min-width:280px;display:flex;flex-direction:column;background:#181825;}
#tab-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#181825;border-bottom:1px solid #313244;overflow-x:auto;}
.tab{padding:6px 10px;border-radius:6px;background:#313244;cursor:pointer;white-space:nowrap;font-size:0.9rem;}
.tab.active{background:#89b4fa;color:#111;font-weight:600;}
#add-tab{padding:6px 10px;border-radius:6px;background:#45475a;color:#cdd6f4;cursor:pointer;border:1px dashed #6c7086;}
#toolbar{display:flex;gap:10px;align-items:center;padding:8px 10px;background:#181825;border-bottom:1px solid #313244;}
#run-btn{background:#a6e3a1;color:#111;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-family:'JetBrains Mono';}
#stop-btn{background:#f38ba8;color:#111;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-family:'JetBrains Mono';}
select.slim{padding:6px 8px;font-size:0.9rem;}
#editor-output{flex:1;display:flex;flex-direction:column;min-height:0;}
#code-editor{flex:1;background:#1e1e2e;color:#cdd6f4;border:none;padding:14px;font-family:'JetBrains Mono',monospace;font-size:15px;line-height:1.55;resize:none;outline:none;}
#drag-bar{height:6px;cursor:row-resize;background:#181825;border-top:1px solid #313244;border-bottom:1px solid #313244;}
#output-console{flex:0 0 38%;background:#11111b;padding:0;display:flex;flex-direction:column;min-height:120px;}
.output-title{padding:8px 12px;font-size:0.78rem;color:#6c7086;text-transform:uppercase;border-bottom:1px solid #313244;}
#output-text{flex:1;margin:0;padding:12px;font-family:'JetBrains Mono',monospace;font-size:13px;overflow-y:auto;color:#babbf1;white-space:pre-wrap;}
#preview-frame{flex:1;border:none;width:100%;background:white;display:none;}
#messages{flex:1;overflow-y:auto;padding:12px;list-style:none;margin:0;display:flex;flex-direction:column;gap:8px;}
.message{background:#313244;padding:8px 12px;border-radius:6px;font-size:0.9rem;}
.sys-msg{color:#f9e2af;font-style:italic;font-size:0.8rem;text-align:center;}
#input-area{padding:10px;background:#11111b;border-top:1px solid #313244;display:flex;gap:6px;}
#msg-input{flex:1;padding:10px;background:#1e1e2e;border:1px solid #45475a;color:white;border-radius:6px;outline:none;}
#send-btn{background:#89b4fa;border:none;padding:0 14px;border-radius:6px;cursor:pointer;}
</style>
</head>
<body>

<div id="lobby-view">
  <div class="lobby-box">
    <h2>🐍 Code Station Pro</h2>
    <div class="form-group"><label>Username</label><input id="username" placeholder="Enter your name..."></div>
    <div class="form-group"><label>Room Name</label><input id="room-name" placeholder="Room ID (e.g. dev-room)"></div>
    <div class="form-group"><label>Room Type</label>
      <select id="room-type" onchange="togglePass()"><option value="public">Public</option><option value="private">Private</option></select>
    </div>
    <div class="form-group" id="pass-group" style="display:none;"><label>Room Password</label><input type="password" id="room-pass" placeholder="Secret..."></div>
    <button class="lobby-btn" onclick="joinRoom()">Enter Room</button>
    <p id="error-msg" style="color:#f38ba8;text-align:center;font-size:0.9rem;margin-top:10px;"></p>
  </div>
</div>

<div id="room-view">
  <header>
    <h1><span class="brand-code">Code</span> <span class="brand-station">Station</span></h1>
    <span id="room-display"></span>
    <button id="leave-btn" onclick="location.reload()">Leave</button>
  </header>

  <div id="main-split">
    <div id="code-panel">
      <div id="tab-bar">
        <div id="add-tab">+ New Tab</div>
      </div>
      <div id="toolbar">
        <button id="run-btn" onclick="runCode()">▶ Run</button>
        <button id="stop-btn" onclick="stopCode()">■ Stop</button>
        <select id="lang-select" class="slim" onchange="changeLang(event)">
          <option value="python">Python</option>
          <option value="javascript">JavaScript (Node)</option>
          <option value="html">HTML</option>
        </select>
        <span id="file-label" style="color:#9aa3b5;font-size:0.85rem;">main.py</span>
        <span style="margin-left:auto;color:#6c7086;font-size:0.78rem;">Tabs sync across the room</span>
      </div>

      <div id="editor-output">
        <textarea id="code-editor" spellcheck="false"></textarea>
        <div id="drag-bar"></div>
        <div id="output-console">
          <div class="output-title">Output / Preview</div>
          <pre id="output-text">Waiting...</pre>
          <iframe id="preview-frame"></iframe>
        </div>
      </div>
    </div>

    <div id="chat-panel">
      <ul id="messages"></ul>
      <form id="input-area" onsubmit="sendMessage(event)">
        <input id="msg-input" placeholder="Type a message..." autocomplete="off"/>
        <button id="send-btn">Send</button>
      </form>
    </div>
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let currentUser=null, currentRoom=null;
let tabs = []; // {id,name,lang,code,output}
let activeTabId = null;

const lobbyView=document.getElementById('lobby-view');
const roomView=document.getElementById('room-view');
const editor=document.getElementById('code-editor');
const outputText=document.getElementById('output-text');
const previewFrame=document.getElementById('preview-frame');
const messagesList=document.getElementById('messages');
const errorMsg=document.getElementById('error-msg');
const tabBar=document.getElementById('tab-bar');
const langSelect=document.getElementById('lang-select');
const fileLabel=document.getElementById('file-label');
const outputConsole=document.getElementById('output-console');
const dragBar=document.getElementById('drag-bar');

function uid(){ return 'tab-' + Math.random().toString(36).slice(2,8) + Date.now().toString(36); }

function togglePass(){
  document.getElementById('pass-group').style.display =
    document.getElementById('room-type').value==='private'?'block':'none';
}

function joinRoom(){
  const user=document.getElementById('username').value.trim();
  const room=document.getElementById('room-name').value.trim();
  const type=document.getElementById('room-type').value;
  const pass=document.getElementById('room-pass').value;
  if(!user||!room){errorMsg.innerText="Name and Room are required.";return;}
  currentUser=user; currentRoom=room;
  socket.emit('join-room',{user,room,type,pass});
}

socket.on('join-success',(data)=>{
  lobbyView.style.display='none'; roomView.style.display='flex'; roomView.style.flexDirection='column';
  document.getElementById('room-display').innerText = \`Room: \${currentRoom}\`;
  tabs = data.tabs && data.tabs.length ? data.tabs : [makeDefaultTab()];
  activeTabId = tabs[0].id;
  renderTabs();
  loadActiveTab();
  messagesList.innerHTML=''; data.messages.forEach(addMsg);
});
socket.on('join-error',(msg)=>errorMsg.innerText=msg);

socket.on('chat-msg',addMsg);
socket.on('code-update',({tabId,code})=>{
  if(tabId!==activeTabId){ const t=tabs.find(t=>t.id===tabId); if(t) t.code=code; return; }
  if(editor.value!==code){
    const s=editor.selectionStart, e=editor.selectionEnd;
    editor.value=code; editor.setSelectionRange(s,e);
  }
});
socket.on('output-update',({tabId,text})=>{
  const t=tabs.find(t=>t.id===tabId); if(t) t.output=text;
  if(tabId===activeTabId){ showOutput(t.lang,text); }
});
socket.on('tabs-update',(serverTabs)=>{
  const prevCount = tabs.length;
  tabs = serverTabs;
  if (tabs.length > prevCount) {
    activeTabId = tabs[tabs.length - 1].id; // select newly added tab
  } else if (!tabs.find(t=>t.id===activeTabId) && tabs.length) {
    activeTabId = tabs[0].id;
  }
  renderTabs(); loadActiveTab();
});

// chat helpers
function sendMessage(e){e.preventDefault();const inp=document.getElementById('msg-input');if(inp.value){socket.emit('send-msg',{room:currentRoom,user:currentUser,text:inp.value});inp.value='';}}
function addMsg(msg){
  const li=document.createElement('li');
  if(msg.user==='System'){li.className='sys-msg';li.innerText=msg.text;}
  else{li.className='message';li.innerHTML=\`<strong style="color:#89b4fa">\${msg.user}:</strong> \${msg.text}\`;}
  messagesList.appendChild(li); messagesList.scrollTop=messagesList.scrollHeight;
}

// tabs
function makeDefaultTab(){
  return {id:uid(),name:'main.py',lang:'python',code:PY_TEMPLATE,output:''};
}
function renderTabs(){
  Array.from(tabBar.querySelectorAll('.tab')).forEach(n=>n.remove());
  tabs.forEach(tab=>{
    const div=document.createElement('div');
    div.className='tab'+(tab.id===activeTabId?' active':'');
    div.innerText=\`\${tab.name} (\${tab.lang})\`;
    div.onclick=()=>{activeTabId=tab.id; renderTabs(); loadActiveTab();};
    tabBar.insertBefore(div, document.getElementById('add-tab'));
  });
}
document.getElementById('add-tab').onclick=()=>{
  socket.emit('add-tab',{room:currentRoom});
};

function changeLang(e){
  const t=tabs.find(t=>t.id===activeTabId); if(!t)return;
  t.lang=e.target.value;
  t.name = t.lang==='python'?'main.py':t.lang==='javascript'?'app.js':'index.html';
  fileLabel.innerText=t.name;
  if(t.lang==='html' && t.code.trim()==='') t.code=HTML_TEMPLATE;
  syncTabs();
  loadActiveTab();
}

// editor sync
editor.addEventListener('input',()=>{
  const t=tabs.find(t=>t.id===activeTabId); if(!t)return;
  t.code=editor.value;
  socket.emit('type-code',{room:currentRoom,tabId:t.id,code:t.code});
});

function loadActiveTab(){
  const t=tabs.find(t=>t.id===activeTabId); if(!t)return;
  editor.value=t.code;
  langSelect.value=t.lang;
  fileLabel.innerText=t.name;
  showOutput(t.lang, t.output || 'Waiting...');
}

function showOutput(lang,text){
  if(lang==='html'){
    previewFrame.style.display='block';
    outputText.style.display='none';
    previewFrame.srcdoc=text;
  }else{
    previewFrame.style.display='none';
    outputText.style.display='block';
    outputText.innerText=text;
  }
}

// run / stop
function runCode(){
  const t=tabs.find(t=>t.id===activeTabId); if(!t)return;
  t.output="Running...";
  showOutput(t.lang,t.output);
  if(t.lang==='html'){
    previewFrame.srcdoc=t.code;
    t.output="Rendered preview.";
    return;
  }
  socket.emit('run-code',{room:currentRoom,tabId:t.id,lang:t.lang,code:t.code});
}
function stopCode(){
  const t=tabs.find(t=>t.id===activeTabId); if(!t)return;
  socket.emit('stop-code',{room:currentRoom,tabId:t.id});
}

// tabs sync
function syncTabs(){ socket.emit('tabs-sync',{room:currentRoom,tabs}); }

// resizable output
let isDragging=false,startY=0,startEditorH=0,startOutH=0;
dragBar.addEventListener('mousedown',(e)=>{
  isDragging=true; startY=e.clientY;
  startEditorH=editor.offsetHeight; startOutH=outputConsole.offsetHeight;
  document.body.style.userSelect='none';
});
window.addEventListener('mousemove',(e)=>{
  if(!isDragging) return;
  const dy=e.clientY-startY;
  const newEditorH=startEditorH+dy;
  const newOutH=startOutH-dy;
  const min=120;
  if(newEditorH<min || newOutH<min) return;
  editor.style.flex='0 0 '+newEditorH+'px';
  outputConsole.style.flex='0 0 '+newOutH+'px';
});
window.addEventListener('mouseup',()=>{
  if(isDragging){ isDragging=false; document.body.style.userSelect=''; }
});
</script>
</body>
</html>
`;

// --- ROUTE ---
app.get('/', (req,res)=>res.send(HTML_CONTENT));

// --- HELPERS ---
const denyList = [/import\s+os/, /import\s+sys/, /import\s+subprocess/, /\bexec\s*\(/, /\beval\s*\(/, /\bopen\s*\(/];

function runPython(code, cb){
  const tempDir = fs.mkdtempSync('cspro-');
  const tempFile = `${tempDir}/main.py`;
  fs.writeFileSync(tempFile, code);
  const child = exec(`python3 -I ${tempFile}`, { maxBuffer: MAX_OUTPUT_BYTES });
  cb(child, tempDir);
}
function runNode(code, cb){
  const tempDir = fs.mkdtempSync('cspro-');
  const tempFile = `${tempDir}/main.js`;
  fs.writeFileSync(tempFile, code);
  const child = exec(`node ${tempFile}`, { maxBuffer: MAX_OUTPUT_BYTES });
  cb(child, tempDir);
}

// --- SOCKET LOGIC ---
io.on('connection',(socket)=>{

  socket.on('join-room',({user,room,type,pass})=>{
    if(!rooms[room]){
      rooms[room]={
        type,
        password:pass,
        messages:[],
        tabs:[{id:'tab-1',name:'main.py',lang:'python',code:PY_TEMPLATE,output:''}]
      };
    }
    const target=rooms[room];
    if(target.type==='private' && target.password!==pass){ socket.emit('join-error','Wrong Password!'); return; }
    socket.join(room);
    socket.data.room=room; socket.data.user=user;
    socket.emit('join-success',{tabs:target.tabs,messages:target.messages});
    const joinMsg={user:'System',text:`${user} joined.`};
    target.messages.push(joinMsg); io.to(room).emit('chat-msg',joinMsg);
  });

  socket.on('add-tab',({room})=>{
    if(!rooms[room]) return;
    const newTab = {
      id: 'tab-' + Date.now().toString(36),
      name: 'main.py',
      lang: 'python',
      code: PY_TEMPLATE,
      output: ''
    };
    rooms[room].tabs.push(newTab);
    io.to(room).emit('tabs-update', rooms[room].tabs);
  });

  socket.on('send-msg',(data)=>{
    const room=socket.data.room; if(!room||!rooms[room])return;
    const payload={...data}; rooms[room].messages.push(payload);
    if(rooms[room].messages.length>80) rooms[room].messages.shift();
    io.to(room).emit('chat-msg',payload);
  });

  socket.on('type-code',({tabId,code})=>{
    const room=socket.data.room; if(!room||!rooms[room])return;
    const tab=rooms[room].tabs.find(t=>t.id===tabId); if(!tab)return;
    tab.code=code;
    socket.to(room).emit('code-update',{tabId,code});
  });

  socket.on('tabs-sync',({room,tabs:newTabs})=>{
    if(!rooms[room])return;
    rooms[room].tabs=newTabs;
    io.to(room).emit('tabs-update',rooms[room].tabs);
  });

  socket.on('run-code',({tabId,lang,code})=>{
    const room=socket.data.room; if(!room||!rooms[room])return;
    const tab=rooms[room].tabs.find(t=>t.id===tabId); if(!tab)return;

    const key=`${room}|${tabId}`;
    if(runningProcs.has(key)){ runningProcs.get(key).kill('SIGTERM'); runningProcs.delete(key); }

    if(lang==='python' && denyList.some(re=>re.test(code))){
      const msg="Security Error: File system and shell access are disabled.";
      tab.output=msg; io.to(room).emit('output-update',{tabId,text:msg}); return;
    }

    const execRunner = lang==='python'? runPython : lang==='javascript'? runNode : null;
    if(!execRunner){
      const msg="Execution for this language is not supported on the server.";
      tab.output=msg; io.to(room).emit('output-update',{tabId,text:msg}); return;
    }

    execRunner(code,(child,tempDir)=>{
      runningProcs.set(key,child);
      let collected='';

      const sendChunk=(chunk)=>{
        if(!chunk)return;
        collected+=chunk;
        if(collected.length>MAX_OUTPUT_BYTES){
          collected=collected.slice(0,MAX_OUTPUT_BYTES)+"\\n[output truncated]";
          child.kill('SIGTERM');
        }
        tab.output=collected;
        io.to(room).emit('output-update',{tabId,text:collected});
      };

      child.stdout.on('data',sendChunk);
      child.stderr.on('data',sendChunk);

      child.on('close',()=>{
        runningProcs.delete(key);
        fs.rm(tempDir,{recursive:true,force:true},()=>{});
        io.to(room).emit('output-update',{tabId,text:tab.output||"Finished."});
      });
      child.on('error',(err)=>{
        runningProcs.delete(key);
        tab.output=err.message;
        io.to(room).emit('output-update',{tabId,text:err.message});
      });
    });
  });

  socket.on('stop-code',({tabId})=>{
    const room=socket.data.room; if(!room)return;
    const key=`${room}|${tabId}`;
    const proc=runningProcs.get(key);
    if(proc){ proc.kill('SIGTERM'); runningProcs.delete(key); }
    if(rooms[room]){
      const tab=rooms[room].tabs.find(t=>t.id===tabId);
      if(tab){ tab.output="Execution stopped by user."; io.to(room).emit('output-update',{tabId,text:tab.output}); }
    }
  });

  socket.on('disconnect',()=>{
    const room=socket.data.room; const user=socket.data.user;
    if(room&&rooms[room]){
      const msg={user:'System',text:`${user||'A user'} left.`};
      rooms[room].messages.push(msg); io.to(room).emit('chat-msg',msg);
    }
    if(room){
      for(const [key,proc] of runningProcs.entries()){
        if(key.startsWith(room+"|")){ proc.kill('SIGTERM'); runningProcs.delete(key); }
      }
    }
  });
});

server.listen(PORT,()=>console.log(`Code Station running on port ${PORT}`));
