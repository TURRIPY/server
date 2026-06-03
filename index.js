const express = require('express');
const app = express();
app.use(express.json());

const SERVER_START_TIME = Date.now();

// ─── Rate limiting — увеличено до 500 запросов в минуту с одного IP ──────────
const rateLimitMap = {};
const RATE_LIMIT   = 500; 
const RATE_WINDOW  = 60 * 1000;

function rateLimit(req, res) {
    const ip  = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < RATE_WINDOW);
    if (rateLimitMap[ip].length >= RATE_LIMIT) {
        res.status(429).json({ error: "Too many requests" });
        return false;
    }
    rateLimitMap[ip].push(now);
    return true;
}

setInterval(() => {
    const now = Date.now();
    for (const ip of Object.keys(rateLimitMap)) {
        rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < RATE_WINDOW);
        if (rateLimitMap[ip].length === 0) delete rateLimitMap[ip];
    }
}, 5 * 60 * 1000);

// ─── Валидация входных данных ─────────────────────────────────────────────────
function sanitize(str, maxLen) {
    if (typeof str !== "string") return null;
    return str.trim().substring(0, maxLen);
}

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
    if (!rateLimit(req, res)) return;
    const user     = sanitize(req.body.user, 50);
    const serverId = sanitize(req.body.serverId, 100);
    if (!user || !serverId) return res.status(400).json({ error: "Missing data" });

    if (!onlineUsers[serverId]) onlineUsers[serverId] = {};
    onlineUsers[serverId][user] = Date.now();
    res.status(200).json({ success: true });
});

// ─── Отправка сообщения ────────────────────────────────────────────────────────
app.post('/send', (req, res) => {
    if (!rateLimit(req, res)) return;
    const user     = sanitize(req.body.user, 50);
    const msg      = sanitize(req.body.msg, 500);
    const serverId = sanitize(req.body.serverId, 100);
    if (!user || !msg || !serverId) return res.status(400).json({ error: "Missing data" });

    if (!serverMessages[serverId]) serverMessages[serverId] = [];
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
    if (!rateLimit(req, res)) return;
    const serverId = sanitize(req.query.serverId, 100);
    if (!serverId) return res.status(400).json({ error: "serverId is required" });
    res.json(serverMessages[serverId] || []);
});

// ─── Онлайн пользователи на сервере ──────────────────────────────────────────
app.get('/online', (req, res) => {
    if (!rateLimit(req, res)) return;
    const serverId = sanitize(req.query.serverId, 100);
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const users = onlineUsers[serverId] || {};
    const now   = Date.now();
    const active = Object.entries(users)
        .filter(([, ts]) => now - ts < ONLINE_TIMEOUT_MS)
        .map(([name]) => name);
    res.json({ count: active.length, users: active });
});

// ─── Статистика сервера ───────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    if (!rateLimit(req, res)) return;
    const serverId = sanitize(req.query.serverId, 100);
    if (!serverId) return res.status(400).json({ error: "serverId is required" });

    const users = onlineUsers[serverId] || {};
    const now   = Date.now();
    const activeUsers = Object.entries(users)
        .filter(([, ts]) => now - ts < ONLINE_TIMEOUT_MS)
        .map(([name]) => name);

    res.json({
        serverId:      serverId,
        onlineCount:   activeUsers.length,
        messageCount:  (serverMessages[serverId] || []).length,
        uptimeSeconds: Math.floor((now - SERVER_START_TIME) / 1000),
        totalServers:  Object.keys(serverMessages).length
    });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.send("Chit-Chat server is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
