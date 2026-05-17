const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const token = process.env.TOKEN ? process.env.TOKEN.trim() : null;
// index.js faylingda tokenlar shunday olinishi kerak:
const token = process.env.TOKEN;
const providerToken = process.env.PROVIDER_TOKEN;
const ADMIN_ID = 6685828485; 

if (!token) console.error("❌ DIQQAT: Asosiy TOKEN topilmadi!");
if (!PAYMENT_TOKEN) console.error("❌ DIQQAT: PROVIDER_TOKEN topilmadi!");

const bot = new TelegramBot(token, { polling: true });

let users = {};
const DB_FILE = 'users.json';

// Baza bilan ishlash
if (fs.existsSync(DB_FILE)) {
    try { users = JSON.parse(fs.readFileSync(DB_FILE)); } 
    catch (e) { users = {}; }
}

const saveUsers = () => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); } 
    catch (e) { console.error("Faylga yozishda xato:", e); }
};

// API: Balans va tarixni olish
app.get('/get-user/:id', (req, res) => {
    const userId = req.params.id;
    if (!users[userId]) {
        users[userId] = { balance: 0, history: [] };
        saveUsers();
    }
    res.json(users[userId]);
});

app.get('/', (req, res) => res.send('BMA Premium Bot Serveri faol... 🚀'));
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portda faol`));

// PROFESSIONAL /start BUYRUG'I
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    if (!users[chatId]) {
        users[chatId] = { balance: 0, name: firstName, history: [] };
        saveUsers();
    }

    const welcomeMessage = `
👋 <b>Salom, ${firstName}!</b>

🎮 <b>BMA Premium Shop</b> ga xush kelibsiz!
Bu yerda siz o'yinlar uchun donat qila olasiz va hisobingizni boshqarishingiz mumkin.

👇 <i>Do'konni ochish uchun pastdagi tugmani bosing!</i>
    `;

    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🛍 Do'konni ochish (Web 3D)", web_app: { url: "https://bma-gaming.github.io/my-donat-shop/" } }],
                [{ text: "💳 Balansni to'ldirish (Avto)", callback_data: "pay_auto" }]
            ]
        }
    });
});

// PROFESSIONAL /pay BUYRUG'I
bot.onText(/\/pay/, (msg) => {
    sendInvoice(msg.chat.id);
});

// Inline tugma orqali to'lov
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'pay_auto') {
        sendInvoice(chatId);
        bot.answerCallbackQuery(query.id);
    }
});

function sendInvoice(chatId) {
    if (!PAYMENT_TOKEN) {
        return bot.sendMessage(chatId, `❌ Uzr, hozircha avtomatik to'lov tizimi o'chirilgan.`);
    }
    bot.sendInvoice(
        chatId,
        "💳 BMA-Gaming Balans", 
        "Hisobingizni tezkor va xavfsiz tarzda 10,000 so'mga to'ldiring. To'lov avtomatik hisoblanadi.", 
        `topup_auto_${chatId}_${Date.now()}`,
        PAYMENT_TOKEN,
        "UZS", 
        [{ label: "Balansni to'ldirish", amount: 1000000 }], // 10,000 UZS
        { 
            photo_url: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?q=80&w=500&auto=format&fit=crop", 
            photo_width: 500, 
            photo_height: 300 
        }
    ).catch(err => console.error("Invoice xatosi:", err));
}

bot.on('pre_checkout_query', (query) => bot.answerPreCheckoutQuery(query.id, true));

// TO'LOV MUVAFFAQIYATLI BO'LGANDA
bot.on('successful_payment', (msg) => {
    const chatId = msg.chat.id;
    const amountPaid = msg.successful_payment.total_amount / 100;

    users[chatId].balance = (Number(users[chatId].balance) || 0) + amountPaid;
    users[chatId].history.push({
        date: new Date().toLocaleString('uz-UZ'),
        amount: amountPaid,
        status: "✅ Click/Payme"
    });
    saveUsers();

    bot.sendMessage(chatId, `🎉 <b>Tabriklaymiz!</b>\n\n💳 Hisobingizga <b>${amountPaid.toLocaleString()} UZS</b> muvaffaqiyatli tushdi!\n💰 Hozirgi balans: <b>${users[chatId].balance.toLocaleString()} UZS</b>`, { parse_mode: 'HTML' });
    bot.sendMessage(ADMIN_ID, `⚡️ <b>YANGI TO'LOV!</b>\n👤 User: <a href="tg://user?id=${chatId}">${msg.from.first_name}</a>\n💵 Summa: <b>${amountPaid.toLocaleString()} UZS</b>`, { parse_mode: 'HTML' });
});

// WEB APP DAN KELGAN MA'LUMOTLAR
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.successful_payment || msg.text === '/start' || msg.text === '/pay') return;

    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            if (data.action === "buy_item") {
                const price = Number(data.price);
                if (users[chatId].balance >= price) {
                    users[chatId].balance -= price;
                    users[chatId].history.push({
                        date: new Date().toLocaleString('uz-UZ'),
                        amount: -price,
                        status: `🛒 Xarid: ${data.item}`
                    });
                    saveUsers();
                    
                    bot.sendMessage(chatId, `✅ <b>Xarid muvaffaqiyatli!</b>\n\nSiz <b>${data.item}</b> sotib oldingiz.\nHisobingizdan <b>${price.toLocaleString()} UZS</b> yechildi.`, { parse_mode: 'HTML' });
                    bot.sendMessage(ADMIN_ID, `🛒 <b>YANGI XARID!</b>\n👤 User ID: ${chatId}\n📦 Tovar: ${data.item}\n💵 Narxi: ${price.toLocaleString()} UZS`, { parse_mode: 'HTML' });
                } else {
                    bot.sendMessage(chatId, `❌ <b>Xatolik!</b>\nHisobingizda mablag' yetarli emas. \nIltimos, /pay buyrug'i orqali balansni to'ldiring.`, { parse_mode: 'HTML' });
                }
            }
        } catch (e) { console.error(e); }
    }
});
