const express = require('express');
const app = express();
app.use(express.json());

let messages = [];

// Отправка сообщения
app.post('/send', (req, res) => {
    const { user, msg } = req.body;
    if (!user || !msg) return res.status(400).json({ error: "Missing data" });

    const newMsg = {
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        user: user,
        msg: msg
    };
    
    messages.push(newMsg);
    if (messages.length > 50) messages.shift(); 

    res.status(200).json({ success: true });
});

// Получение истории
app.get('/history', (req, res) => {
    res.json(messages);
});

app.get('/', (req, res) => {
    res.send("server succsessfully work!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`server port is ${PORT}`);
});
