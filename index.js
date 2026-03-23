const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors'); // CORS qo'shildi

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const token = process.env.TOKEN; 
const ADMIN_ID = 6685828485; 
const WEB_APP_URL = "https://bma-gaming.github.io/my-donat-shop/"; 

const bot = new TelegramBot(token, { polling: true });

let users = {};
if (fs.existsSync('users.json')) {
    try { users = JSON.parse(fs.readFileSync('users.json')); } catch (e) { users = {}; }
}
const saveUsers = () => fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

// Web App'dan balansni so'rash uchun API endpoint (ixtiyoriy, lekin yaxshi yechim)
app.get('/get-user/:id', (req, res) => {
    const userId = req.params.id;
    res.json(users[userId] || { balance: 0, history: [] });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    if (!users[chatId]) {
        users[chatId] = { balance: 0, name: firstName, history: [] };
        saveUsers();
    }

    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            if (data.action === "pay_confirm") {
                const adminKeyboard = {
                    inline_keyboard: [[
                        { text: "✅ Tasdiqlash", callback_data: `app_${chatId}_${data.amount}` },
                        { text: "❌ Rad etish", callback_data: `rej_${chatId}` }
                    ]]
                };
                await bot.sendMessage(ADMIN_ID, `💰 TO'LOV: ${data.amount} UZS\n👤: ${firstName}\nID: ${chatId}`, { reply_markup: adminKeyboard });
                bot.sendMessage(chatId, "⏳ So'rov yuborildi. Admin tasdiqlashini kuting.");
            }
        } catch (e) { console.log(e); }
    }

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `Salom ${firstName}! Do'konimizga xush kelibsiz.`, {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'kon", web_app: { url: WEB_APP_URL } }]],
                resize_keyboard: true
            }
        });
    }
});

bot.on('callback_query', async (query) => {
    const data = query.data;
    if (data.startsWith('app_')) {
        const [_, targetId, amount] = data.split('_');
        if(!users[targetId]) users[targetId] = { balance: 0, history: [] };
        
        users[targetId].balance += parseInt(amount);
        users[targetId].history.push({ date: new Date().toLocaleString(), amount, status: "OK" });
        saveUsers();

        bot.sendMessage(targetId, `✅ To'lov tasdiqlandi! Balans: ${users[targetId].balance} UZS`);
        bot.answerCallbackQuery(query.id, { text: "Tasdiqlandi!" });
    }
});

app.listen(PORT, () => console.log(`Server: ${PORT}`));
