const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Istalgan ko'rinmas bo'shliqlarni yo'qotish uchun .trim() qo'shdik
const token = process.env.TOKEN ? process.env.TOKEN.trim() : null;
const PAYMENT_TOKEN = process.env.PROVIDER_TOKEN ? process.env.PROVIDER_TOKEN.trim() : null;
const ADMIN_ID = 6685828485; 

if (!token) {
    console.error("❌ DIQQAT: Asosiy TOKEN topilmadi yoki xato!");
}
if (!PAYMENT_TOKEN) {
    console.error("❌ DIQQAT: PROVIDER_TOKEN topilmadi yoki xato!");
}

const bot = new TelegramBot(token, { polling: true });

let users = {};
const DB_FILE = 'users.json';

if (fs.existsSync(DB_FILE)) {
    try { 
        users = JSON.parse(fs.readFileSync(DB_FILE)); 
    } catch (e) { 
        users = {}; 
    }
}

const saveUsers = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error("Faylga yozishda xato:", e);
    }
};

app.get('/get-balance/:id', (req, res) => {
    const userId = req.params.id;
    if (!users[userId]) {
        users[userId] = { balance: 0, history: [] };
        saveUsers();
    }
    res.json(users[userId]);
});

app.get('/', (req, res) => res.send('BMA Bot faol...'));
app.listen(PORT, () => console.log(`Server ${PORT} portda faol`));

// CLICK TO'LOV BUYRUG'I
bot.onText(/\/pay/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!PAYMENT_TOKEN) {
        return bot.sendMessage(chatId, `❌ Xatolik: Serverda PROVIDER_TOKEN sozlanmagan!\n\nHozirgi qiymat: ${PAYMENT_TOKEN}`);
    }

    bot.sendInvoice(
        chatId,
        "BMA-Gaming Balans", 
        "BMA-Gaming tizimi orqali hisobingizni 10,000 so'mga to'ldirish", 
        `topup_auto_${chatId}_${Date.now()}`,
        PAYMENT_TOKEN,
        "UZS", 
        [{ label: "Balansni to'ldirish", amount: 1000000 }]
    ).catch(err => {
        console.error("Invoice yuborishda xato:", err);
        bot.sendMessage(chatId, `❌ Telegram to'lov tizimida xato: ${err.message}`);
    });
});

bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true).catch(err => console.error(err));
});

bot.on('successful_payment', (msg) => {
    const chatId = msg.chat.id;
    const amountPaid = msg.successful_payment.total_amount / 100;

    if (!users[chatId]) users[chatId] = { balance: 0, history: [] };
    users[chatId].balance = (Number(users[chatId].balance) || 0) + amountPaid;
    
    users[chatId].history.push({
        date: new Date().toLocaleDateString('uz-UZ'),
        amount: amountPaid,
        status: "Avtomatik (Click)"
    });
    
    saveUsers();
    bot.sendMessage(chatId, `✅ To'lovingiz qabul qilindi!\n💰 Balans: ${users[chatId].balance.toLocaleString()} UZS`);
    bot.sendMessage(ADMIN_ID, `⚡️ AVTOMATIK TO'LOV\n👤: ${msg.from.first_name}\nID: ${chatId}\n💵: ${amountPaid.toLocaleString()} UZS`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    if (msg.successful_payment) return;

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
                await bot.sendMessage(ADMIN_ID, `💰 QO'LDA TO'LOV\n👤: ${firstName}\nID: ${chatId}\n💵: ${Number(data.amount).toLocaleString()} UZS`, { reply_markup: adminKeyboard });
                bot.sendMessage(chatId, "⏳ To'lov so'rovi yuborildi. Admin tasdiqlashini kuting.");
            }
        } catch (e) { console.error(e); }
    }

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `Salom ${firstName}! BMA Premium Shop do'konimizga xush kelibsiz.`, {
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
        users[targetId].balance = (Number(users[targetId].balance) || 0) + Number(amount);
        
        users[targetId].history.push({
            date: new Date().toLocaleDateString('uz-UZ'),
            amount: amount,
            status: "Tasdiqlandi"
        });
        
        saveUsers();
        bot.sendMessage(targetId, `✅ To'lovingiz tasdiqlandi!\n💰 Balans: ${users[targetId].balance.toLocaleString()} UZS`);
        bot.editMessageText(adminMsg.text + "\n\n✅ ADMIN TOMONIDAN TASDIQLANDI", { chat_id: ADMIN_ID, message_id: adminMsg.message_id });
    }

    if (data.startsWith('rej_')) {
        const targetId = data.split('_')[1];
        bot.sendMessage(targetId, `❌ Uzr, to'lovingiz rad etildi.`);
        bot.editMessageText(adminMsg.text + "\n\n❌ ADMIN TOMONIDAN RAD ETILDI", { chat_id: ADMIN_ID, message_id: adminMsg.message_id });
    }
    bot.answerCallbackQuery(query.id);
});
