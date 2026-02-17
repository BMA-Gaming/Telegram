const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs'); // Ma'lumotlarni saqlash uchun

const app = express();
app.get('/', (req, res) => res.send('Baxti bot is running...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const token = process.env.TOKEN;
const PAYMENT_TOKEN = '398062629:TEST:999999999_F91D8F69C042267444B74CC0B3C747757EB0E065'; // BotFather'dan olgan token
const ADMIN_ID = 6685828485; 
const WEB_APP_URL = 'srv-d6a6n0oboq4c73dsc270'; 

if (!token) {
    console.error("TOKEN topilmadi!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// --- SODDA BAZA (Faylda saqlash) ---
let users = {};
if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
}

function saveDatabase() {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // --- WEB APP'DAN MA'LUMOT KELSA (TO'LOV CHIQARAMIZ) ---
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            
            await bot.sendMessage(chatId, `Tayyor, Baxti! ${data.item} uchun to'lov cheki tayyorlanmoqda...`);

            // To'lov chekini yuborish
            await bot.sendInvoice(
                chatId,
                data.item, // Nomi
                `Baxti Construction'dan ${data.item} xizmati`, // Tavsif
                `order_${Date.now()}`, // Ichki ID
                PAYMENT_TOKEN,
                'UZS', // Valyuta
                [{ label: data.item, amount: data.price * 100 }], // Narx (tiyinda yoziladi, shuning uchun *100)
                { photo_url: 'https://cdn-icons-png.flaticon.com/512/4342/4342728.png' }
            );
        } catch (e) {
            console.error("To'lov xatosi:", e);
        }
    }

    // START
    if (text === '/start') {
        if (users[chatId] && users[chatId].registered) {
            return showMainMenu(chatId, `Xush kelibsiz, ${users[chatId].name}!`);
        } else {
            users[chatId] = { step: 'reg_name' };
            return bot.sendMessage(chatId, "Ismingizni kiriting:");
        }
    }

    // REGISTRATSIYA
    if (users[chatId] && users[chatId].step === 'reg_name') {
        users[chatId].name = text;
        users[chatId].step = 'reg_phone';
        saveDatabase();
        return bot.sendMessage(chatId, "Raqamni yuboring:", {
            reply_markup: { keyboard: [[{ text: "📞 Raqam", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
    }

    if (users[chatId] && users[chatId].step === 'reg_phone') {
        users[chatId].phone = msg.contact ? msg.contact.phone_number : text;
        users[chatId].registered = true;
        users[chatId].step = null;
        saveDatabase();
        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz!");
    }

    if (text === "👤 Profilim") {
        const u = users[chatId];
        return bot.sendMessage(chatId, `👤: ${u.name}\n📞: ${u.phone}`);
    }
});

// To'lov jarayonini tasdiqlash (Telegram so'raydi)
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
});

// To'lov muvaffaqiyatli o'tsa
bot.on('successful_payment', async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, "🎉 To'lov muvaffaqiyatli amalga oshirildi! Baxti tez orada siz bilan bog'lanadi.");
    await bot.sendMessage(ADMIN_ID, `💰 PUL TUSHDI!\n👤 Kimdan: ${users[chatId].name}\n📞 Tel: ${users[chatId].phone}`);
});

function showMainMenu(chatId, message) {
    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: [
                [{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }],
                ["👤 Profilim"]
            ],
            resize_keyboard: true
        }
    });
}