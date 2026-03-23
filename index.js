const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors()); // BU JUDA MUHIM! HTML botdan ma'lumot olishi uchun ruxsat beradi.
app.use(express.json());

const PORT = process.env.PORT || 3000;
const token = process.env.TOKEN; 
const ADMIN_ID = 6685828485; 

const bot = new TelegramBot(token, { polling: true });

let users = {};
if (fs.existsSync('users.json')) {
    try { users = JSON.parse(fs.readFileSync('users.json')); } catch (e) { users = {}; }
}
const saveUsers = () => fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

// --- BALANSNI HTML'GA BERADIGAN YO'LAK ---
app.get('/get-balance/:id', (req, res) => {
    const userId = req.params.id;
    // Agar foydalanuvchi bo'lmasa, yangi yaratamiz
    if (!users[userId]) {
        users[userId] = { balance: 0, history: [] };
        saveUsers();
    }
    res.json(users[userId]);
});

app.get('/', (req, res) => res.send('BMA Bot is Running...'));
app.listen(PORT, () => console.log(`Server is up on port ${PORT}`));

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    if (!users[chatId]) {
        users[chatId] = { balance: 0, name: firstName, history: [] };
        saveUsers();
    }

    if (msg.web_app_data) {
        const data = JSON.parse(msg.web_app_data.data);
        if (data.action === "pay_confirm") {
            const adminKeyboard = {
                inline_keyboard: [[
                    { text: "✅ Tasdiqlash", callback_data: `app_${chatId}_${data.amount}` },
                    { text: "❌ Rad etish", callback_data: `rej_${chatId}` }
                ]]
            };
            await bot.sendMessage(ADMIN_ID, `💰 TO'LOV SO'ROVI\n👤: ${firstName}\nID: ${chatId}\n💵: ${data.amount} UZS`, { reply_markup: adminKeyboard });
            bot.sendMessage(chatId, "⏳ To'lov yuborildi. Admin tasdiqlashini kuting.");
        }
    }

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `Salom ${firstName}!`, {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'kon", web_app: { url: "https://bma-gaming.github.io/my-donat-shop/" } }]],
                resize_keyboard: true
            }
        });
    }
});

bot.on('callback_query', async (query) => {
    const data = query.data;
    if (data.startsWith('app_')) {
        const [_, targetId, amount] = data.split('_');
        
        // BALANSNI OSHIRISH (Raqam ekanligiga ishonch hosil qilamiz)
        users[targetId].balance = Number(users[targetId].balance) + Number(amount);
        
        users[targetId].history.push({
            date: new Date().toLocaleDateString(),
            amount: amount,
            status: "Tasdiqlandi"
        });
        saveUsers();

        bot.sendMessage(targetId, `✅ To'lov tasdiqlandi! Yangi balans: ${users[targetId].balance.toLocaleString()} UZS`);
        bot.editMessageText(query.message.text + "\n\n✅ TASDIQLANDI", { chat_id: ADMIN_ID, message_id: query.message.message_id });
    }
});
