const express = require('express');
const app = express();
app.use(express.json());

const SERVER_START_TIME = Date.now();

// { "serverId": [ {id, user, msg}, ... ] }
let serverMessages = {};

// { "serverId": { "username": lastSeenTimestamp } }
let onlineUsers = {};

const ONLINE_TIMEOUT_MS  = 15000;  // 15 сек без heartbeat = оффлайн
const CLEANUP_INTERVAL_MS = 60000; // проверка каждую минуту
const IDLE_CLEANUP_MS     = 5 * 60 * 1000; // чистим сервер если пуст 5+ минут

// ─── Автоочистка пустых серверов ─────────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (const serverId of Object.keys(serverMessages)) {
        const users = onlineUsers[serverId] || {};
        const hasActive = Object.values(users).some(ts => now - ts < ONLINE_TIMEOUT_MS);
        if (hasActive) continue;

        // Нет активных — смотрим когда последний раз кто-то был
        const lastSeen = Math.max(0, ...Object.values(users));
        if (lastSeen === 0 || now - lastSeen > IDLE_CLEANUP_MS) {
            delete serverMessages[serverId];
            delete onlineUsers[serverId];
            console.log(`[cleanup] Cleared idle server: ${serverId}`);
        }
    }
}, CLEANUP_INTERVAL_MS);

// ─── Heartbeat: клиент пингует каждые ~8 секунд ───────────────────────────────
app.post('/heartbeat', (req, res) => {
    const { user, serverId } = req.body;
    if (!user || !serverId) return res.status(400).json({ error: "Missing data" });

    if (!onlineUsers[serverId]) onlineUsers[serverId] = {};
    onlineUsers[serverId][user] = Date.now();

    res.status(200).json({ success: true });
});

// ─── Отправка сообщения ────────────────────────────────────────────────────────
app.post('/send', (req, res) => {
    const { user, msg, serverId } = req.body;
    if (!user || !msg || !serverId) return res.status(400).json({ error: "Missing data" });

    if (!serverMessages[serverId]) serverMessages[serverId] = [];

    // Обновляем онлайн при каждом сообщении тоже
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

// ─── История сообщений ────────────────────────────────────────────────────────
app.get('/history', (req, res) => {
    const serverId = req.query.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const history = serverMessages[serverId] || [];
    res.json(history);
});

// ─── Онлайн пользователи на сервере ──────────────────────────────────────────
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

// ─── Статистика сервера ───────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    const serverId = req.query.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const users = onlineUsers[serverId] || {};
    const now = Date.now();
    const activeUsers = Object.entries(users)
        .filter(([, ts]) => now - ts < ONLINE_TIMEOUT_MS)
        .map(([name]) => name);

    const msgCount = (serverMessages[serverId] || []).length;
    const uptimeSeconds = Math.floor((now - SERVER_START_TIME) / 1000);
    const totalServers = Object.keys(serverMessages).length;

    res.json({
        serverId: serverId,
        onlineCount: activeUsers.length,
        messageCount: msgCount,
        uptimeSeconds: uptimeSeconds,
        totalServers: totalServers
    });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.send("Chit-Chat server is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
