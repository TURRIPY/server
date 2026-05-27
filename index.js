const express = require('express');
const app = express();
app.use(express.json());

// { "serverId": [ {id, user, msg}, ... ] }
let serverMessages = {};

// { "serverId": { "username": lastSeenTimestamp } }
let onlineUsers = {};

const ONLINE_TIMEOUT_MS = 15000; // 15 sec without heartbeat = OFFLINE

// ─── Heartbeat: ~8 sec ───────────────────────────────
app.post('/heartbeat', (req, res) => {
    const { user, serverId } = req.body;
    if (!user || !serverId) return res.status(400).json({ error: "Missing data" });

    if (!onlineUsers[serverId]) onlineUsers[serverId] = {};
    onlineUsers[serverId][user] = Date.now();

    res.status(200).json({ success: true });
});

// ─── Send ────────────────────────────────────────────────────────
app.post('/send', (req, res) => {
    const { user, msg, serverId } = req.body;
    if (!user || !msg || !serverId) return res.status(400).json({ error: "Missing data" });

    if (!serverMessages[serverId]) serverMessages[serverId] = [];

    // Updating online when new message too
    if (!onlineUsers[serverId]) onlineUsers[serverId] = {};
    onlineUsers[serverId][user] = Date.now();

    const newMsg = {
        id: Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        user: user,
        msg: msg
    };

    serverMessages[serverId].push(newMsg);
    if (serverMessages[serverId].length > 50) serverMessages[serverId].shift();

    res.status(200).json({ success: true });
});

// ─── History ────────────────────────────────────────────────────────
app.get('/history', (req, res) => {
    const serverId = req.query.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const history = serverMessages[serverId] || [];
    res.json(history);
});

// ─── Online ──────────────────────────────────────────
app.get('/online', (req, res) => {
    const serverId = req.query.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const users = onlineUsers[serverId] || {};
    const now = Date.now();
    const active = Object.entries(users)
        .filter(([, ts]) => now - ts < ONLINE_TIMEOUT_MS)
        .map(([name]) => name);

    res.json({ count: active.length, users: active });
});

// ─── Status ───────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    const serverId = req.query.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const users = onlineUsers[serverId] || {};
    const now = Date.now();
    const activeUsers = Object.entries(users)
        .filter(([, ts]) => now - ts < ONLINE_TIMEOUT_MS)
        .map(([name]) => name);

    const msgCount = (serverMessages[serverId] || []).length;

    res.json({
        serverId: serverId,
        onlineCount: activeUsers.length,
        messageCount: msgCount
    });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.send("Chit-Chat server is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
