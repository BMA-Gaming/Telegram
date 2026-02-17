const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// --- RENDER UCHUN SERVER ---
const app = express();
app.get('/', (req, res) => {
    res.send('Baxti bot is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// TOKEN Render Environment'dan olinadi
const token = process.env.TOKEN;

if (!token) {
    console.error("TOKEN topilmadi! Render → Environment ga TOKEN qo'ying.");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 6685828485; 

let users = {};
let userStep = {};

// --- WEB APP URL MANZILI ---
const WEB_APP_URL = 'https://my-telegram-webapp-lacp.onrender.com'; 

bot.on('message', async (msg) => {
    if (!msg.chat) return;

    const chatId = msg.chat.id;
    const text = msg.text || "";

    // --- WEB APP MA'LUMOTLARINI QABUL QILISH ---
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            
            // Foydalanuvchiga tasdiq
            await bot.sendMessage(chatId, `✅ Baxti, buyurtma qabul qilindi!\n📦 Xizmat: ${data.item}\n💰 Narxi: ${data.price.toLocaleString()} so'm\n\nTez orada siz bilan bog'lanamiz!`);
            
            // Adminga (Sizga) bildirishnoma
            const adminMsg = `🚀 WEB APP'DAN YANGI BUYURTMA!\n\n👤 Kimdan: ${msg.from.first_name}\n🛠 Xizmat: ${data.item}\n💵 Narxi: ${data.price.toLocaleString()} so'm`;
            await bot.sendMessage(ADMIN_ID, adminMsg);
            return; 
        } catch (e) {
            console.error("Web App xatosi:", e);
        }
    }

    // START VA ASOSIY MENYU
    if (text === '/start' || text === "🔙 Asosiy menyu") {
        userStep[chatId] = null;
        if (users[chatId] && users[chatId].registered) {
            return showMainMenu(chatId, `Xush kelibsiz, ${users[chatId].name}! Bizning xizmatlardan foydalanish uchun do'konni oching.`);
        } else {
            userStep[chatId] = 'reg_name';
            return bot.sendMessage(chatId, "Assalomu alaykum!\nBotdan foydalanish uchun ismingizni kiriting:");
        }
    }

    // RO'YXATDAN O'TISH: ISM
    if (userStep[chatId] === 'reg_name') {
        users[chatId] = { name: text };
        userStep[chatId] = 'reg_phone';
        return bot.sendMessage(chatId, "Rahmat! Endi telefon raqamingizni yuboring:", {
            reply_markup: {
                keyboard: [[{ text: "📞 Raqamni yuborish", request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    // RO'YXATDAN O'TISH: TELEFON
    if (userStep[chatId] === 'reg_phone') {
        const phone = msg.contact ? msg.contact.phone_number : text;
        if (!users[chatId]) users[chatId] = {};
        users[chatId].phone = phone;
        users[chatId].registered = true;
        userStep[chatId] = null;
        return showMainMenu(chatId, "Muvaffaqiyatli ro'yxatdan o'tdingiz!");
    }

    // PROFIL MA'LUMOTLARI
    if (text === "👤 Profilim") {
        const u = users[chatId];
        if (!u) return bot.sendMessage(chatId, "Avval ro'yxatdan o'ting. /start");
        return bot.sendMessage(chatId, `👤 Ismingiz: ${u.name}\n📞 Tel: ${u.phone}`);
    }
});

// ASOSIY MENYU FUNKSIYASI
function showMainMenu(chatId, message) {
    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: [
                [{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }],
                ["👤 Profilim", "🔙 Asosiy menyu"]
            ],
            resize_keyboard: true
        }
    });
}

// Xatoliklarni ushlash
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});