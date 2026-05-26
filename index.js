const express = require('express');
const app = express();
app.use(express.json());

// Теперь структура такая: { "JobId_1": [сообщения...], "JobId_2": [сообщения...] }
let serverMessages = {};

// Отправка сообщения
app.post('/send', (req, res) => {
    const { user, msg, serverId } = req.body;
    
    if (!user || !msg || !serverId) {
        return res.status(400).json({ error: "Missing data" });
    }

    // Если для этого сервера еще нет массива, создаем его
    if (!serverMessages[serverId]) {
        serverMessages[serverId] = [];
    }

    const newMsg = {
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        user: user,
        msg: msg
    };
    
    serverMessages[serverId].push(newMsg);

    // Лимит сообщений на сервер (пусть будет 50)
    if (serverMessages[serverId].length > 50) {
        serverMessages[serverId].shift(); 
    }

    res.status(200).json({ success: true });
});

// Получение истории конкретного сервера
app.get('/history', (req, res) => {
    const serverId = req.query.serverId;
    
    if (!serverId) {
        return res.status(400).json({ error: "serverId is required" });
    }

    // Возвращаем сообщения только для этого сервера или пустой массив
    const history = serverMessages[serverId] || [];
    res.json(history);
});

app.get('/', (req, res) => {
    res.send("Server is running with ServerID support!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
