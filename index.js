const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

// 1. Asosiy o'zgaruvchilar va sozlamalar
const token = process.env.TOKEN; // Renderdan avtomatik olinadi
const ADMIN_ID = 6685828485;
const WEB_APP_URL = 'https://my-telegram-webapp-lacp.onrender.com';

// Agar .env faylda yoki Renderda TOKEN topilmasa, xato berish
if (!token) {
    console.error("XATOLIK: Telegram bot tokeni topilmadi. Render 'Environment Variables' qismini tekshiring.");
    process.exit(1);
}

// 2. Express server (Render uxlab qolmasligi va portga ulanishi uchun kerak)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Baxti bot muvaffaqiyatli ishlamoqda... 🚀'));
app.listen(PORT, () => console.log(`Express server ${PORT}-portda ishga tushdi`));

// 3. Botni ishga tushirish
const bot = new TelegramBot(token, { polling: true });

// 4. Ma'lumotlar bazasi (JSON fayl)
let users = {};
const DB_FILE = 'users.json';

try {
    if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        users = JSON.parse(data);
    }
} catch (e) {
    console.log("Ma'lumotlar bazasi yangi yoki o'qishda xatolik yuz berdi.");
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// 5. Asosiy menyuni chiqaruvchi funksiya
function showMainMenu(chatId, msgText) {
    bot.sendMessage(chatId, msgText, {
        reply_markup: {
            keyboard: [
                [{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }]
            ],
            resize_keyboard: true
        }
    });
}

// 6. Xabarlarni qabul qilish va qayta ishlash
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Agar foydalanuvchi bazada bo'lmasa, uni yaratish
    if (!users[chatId]) {
        users[chatId] = {};
    }
    const user = users[chatId];

    try {
        // A) Web App'dan ma'lumot kelganda (Buyurtma qilinganda)
        if (msg.web_app_data) {
            const data = JSON.parse(msg.web_app_data.data);
            user.currentOrder = data.item;
            user.step = 'ask_address';
            saveDatabase();
            return bot.sendMessage(chatId, `Siz **${data.item}** tanladingiz. \n\nIltimos, yetkazib berish uchun yashash manzilingizni yozing:`, { parse_mode: "Markdown" });
        }

        // B) Manzil kiritish bosqichi
        if (user.step === 'ask_address') {
            const address = text;
            const adminMsg = `🆕 **YANGI BUYURTMA!**\n\n👤 Ism: ${user.name}\n📞 Tel: ${user.phone}\n📍 Manzil: ${address}\n🏗 Mahsulot/Xizmat: ${user.currentOrder}`;
            
            // Adminga xabar yuborish
            await bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: "Markdown" });
            
            user.step = null; // Qadamni tozalash
            saveDatabase();
            return bot.sendMessage(chatId, "Rahmat! Buyurtmangiz qabul qilindi. Tez orada siz bilan bog'lanamiz. ✅");
        }

        // C) /start komandasi
        if (text === '/start') {
            if (user.registered) {
                return showMainMenu(chatId, `Yana bir bor xush kelibsiz, ${user.name}!`);
            }
            user.step = 'name';
            saveDatabase();
            return bot.sendMessage(chatId, "Assalomu alaykum! Botdan foydalanish uchun ismingizni kiriting:");
        }

        // D) Ismni saqlash va raqam so'rash
        if (user.step === 'name') {
            user.name = text;
            user.step = 'phone';
            saveDatabase();
            return bot.sendMessage(chatId, "Endi telefon raqamingizni yuboring:", {
                reply_markup: {
                    keyboard: [
                        [{ text: "📞 Raqamni yuborish", request_contact: true }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }

        // E) Raqamni saqlash va ro'yxatdan o'tkazish
        if (user.step === 'phone') {
            user.phone = msg.contact ? msg.contact.phone_number : text;
            user.registered = true;
            user.step = null;
            saveDatabase();
            return showMainMenu(chatId, "Ro'yxatdan muvaffaqiyatli o'tdingiz! 🎉");
        }

    } catch (error) {
        console.error("Xatolik yuz berdi:", error);
    }
});

console.log('Bot muvaffaqiyatli ishga tushdi...');
