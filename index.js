const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const SERVER_START_TIME = Date.now();
const rooms = {}; 
const serverMessages = {}; 

function sanitize(str, maxLen) {
    if (typeof str !== "string") return null;
    return str.trim().substring(0, maxLen)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

wss.on('connection', (ws, req) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const serverId = sanitize(url.searchParams.get('serverId'), 100);
        const user = sanitize(url.searchParams.get('user'), 50);

        if (!serverId || !user) {
            ws.close(4000, "Missing parameters");
            return;
        }

        ws.serverId = serverId;
        ws.user = user;

        if (!rooms[serverId]) rooms[serverId] = new Set();
        rooms[serverId].add(ws);

        if (serverMessages[serverId]) {
            ws.send(JSON.stringify({ type: "history", data: serverMessages[serverId] }));
        }

        ws.msgCount = 0;
        const limitInterval = setInterval(() => { ws.msgCount = 0; }, 10000);

        ws.on('message', (message) => {
            ws.msgCount++;
            if (ws.msgCount > 7) return; 

            try {
                const parsed = JSON.parse(message);
                if (parsed.type === "msg") {
                    const cleanMsg = sanitize(parsed.text, 500);
                    if (!cleanMsg) return;

                    const newMsg = {
                        id: Date.now() + "_" + Math.random().toString(36).substring(2, 7),
                        user: ws.user,
                        msg: cleanMsg
                    };

                    if (!serverMessages[serverId]) serverMessages[serverId] = [];
                    serverMessages[serverId].push(newMsg);
                    if (serverMessages[serverId].length > 50) serverMessages[serverId].shift();

                    const broadcastData = JSON.stringify({ type: "msg", data: newMsg });
                    rooms[serverId].forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(broadcastData);
                        }
                    });
                }
            } catch (e) {}
        });

        ws.on('close', () => {
            clearInterval(limitInterval);
            if (rooms[serverId]) {
                rooms[serverId].delete(ws);
                if (rooms[serverId].size === 0) {
                    delete rooms[serverId];
                    delete serverMessages[serverId];
                }
            }
        });

    } catch (err) {
        ws.close(4001, "Connection error");
    }
});

app.get('/online', (req, res) => {
    const serverId = sanitize(req.query.serverId, 100);
    if (!serverId) return res.status(400).json({ error: "serverId is required" });
    const active = [];
    if (rooms[serverId]) {
        rooms[serverId].forEach(client => active.push(client.user));
    }
    res.json({ count: active.length, users: active });
});

app.get('/status', (req, res) => {
    const serverId = sanitize(req.query.serverId, 100);
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    res.json({
        serverId:      serverId,
        onlineCount:   rooms[serverId] ? rooms[serverId].size : 0,
        messageCount:  (serverMessages[serverId] || []).length,
        uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
        totalServers:  Object.keys(rooms).length
    });
});

app.get('/', (_req, res) => { res.send("Chit-Chat WS server running!"); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
