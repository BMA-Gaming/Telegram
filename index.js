const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors()); // Frontend bilan bog'lanish ruxsati
app.use(express.json());

const PORT = process.env.PORT || 3000;
const token = process.env.TOKEN; 
const ADMIN_ID = 6685828485; 

const bot = new TelegramBot(token, { polling: true });

let users = {};
const DB_FILE = 'users.json';

// Ma'lumotlarni yuklash
if (fs.existsSync(DB_FILE)) {
    try { 
        users = JSON.parse(fs.readFileSync(DB_FILE)); 
    } catch (e) { 
        console.log("DB o'qishda xato, yangi yaratiladi.");
        users = {}; 
    }
}

const saveUsers = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));

// HTML uchun API
app.get('/get-balance/:id', (req, res) => {
    const userId = req.params.id;
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

    // Web App'dan kelgan ma'lumot
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
                await bot.sendMessage(ADMIN_ID, `💰 TO'LOV SO'ROVI\n👤: ${firstName}\nID: ${chatId}\n💵: ${Number(data.amount).toLocaleString()} UZS`, { reply_markup: adminKeyboard });
                bot.sendMessage(chatId, "⏳ To'lov yuborildi. Admin tasdiqlashini kuting.");
            }
        } catch (e) { console.error("Data parse xatosi"); }
    }

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `Salom ${firstName}! Do'konimizga xush kelibsiz.`, {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'kon", web_app: { url: "https://bma-gaming.github.io/my-donat-shop/" } }]],
                resize_keyboard: true
            }
        });
    }
});

bot.on('callback_query', async (query) => {
    const data = query.data;
    const adminMsg = query.message;

    if (data.startsWith('app_')) {
        const [_, targetId, amount] = data.split('_');
        
        if (!users[targetId]) users[targetId] = { balance: 0, history: [] };
        
        // Hisoblashda xato bo'lmasligi uchun Number() ishlatamiz
        users[targetId].balance = (Number(users[targetId].balance) || 0) + Number(amount);
        
        users[targetId].history.push({
            date: new Date().toLocaleDateString('uz-UZ'),
            amount: amount,
            status: "Tasdiqlandi"
        });
        
        saveUsers();

        bot.sendMessage(targetId, `✅ To'lov tasdiqlandi!\n💰 Yangi balans: ${users[targetId].balance.toLocaleString()} UZS`);
        bot.editMessageText(adminMsg.text + "\n\n✅ TASDIQLANDI", { chat_id: ADMIN_ID, message_id: adminMsg.message_id });
    }

    if (data.startsWith('rej_')) {
        const targetId = data.split('_')[1];
        bot.sendMessage(targetId, `❌ Uzr, to'lovingiz admin tomonidan rad etildi.`);
        bot.editMessageText(adminMsg.text + "\n\n❌ RAD ETILDI", { chat_id: ADMIN_ID, message_id: adminMsg.message_id });
    }
    
    bot.answerCallbackQuery(query.id);
});
