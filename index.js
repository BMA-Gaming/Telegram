const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors()); // Web App botdan ma'lumot olishi uchun shart!
app.use(express.json());

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

// Balansni Web App'ga berish yo'lagi
app.get('/get-balance/:id', (req, res) => {
    const userId = req.params.id;
    const userData = users[userId] || { balance: 0, history: [] };
    res.json(userData);
});

app.get('/', (req, res) => res.send('BMA Premium Bot Active ⚡️'));
app.listen(PORT, () => console.log(`Server portda yondi: ${PORT}`));

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
                bot.sendMessage(chatId, "⏳ To'lov so'rovi yuborildi. Admin tasdiqlashini kuting.");
            }
        } catch (e) { console.log(e); }
    }

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `Salom ${firstName}! Do'konimizga xush kelibsiz.`, {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }]],
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
        users[targetId].history.push({ date: new Date().toLocaleString(), amount, status: "Tasdiqlandi" });
        saveUsers();

        bot.sendMessage(targetId, `✅ To'lov tasdiqlandi! Balans: ${users[targetId].balance.toLocaleString()} UZS`);
        bot.editMessageText(query.message.text + "\n\n✅ TASDIQLANDI", { chat_id: ADMIN_ID, message_id: query.message.message_id });
    }
    if (data.startsWith('rej_')) {
        const [_, targetId] = data.split('_');
        bot.sendMessage(targetId, "❌ To'lovingiz admin tomonidan rad etildi.");
        bot.editMessageText(query.message.text + "\n\n❌ RAD ETILDI", { chat_id: ADMIN_ID, message_id: query.message.message_id });
    }
});
