const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// --- RENDER UCHUN SOXTA SERVER ---
const app = express();
app.get('/', (req, res) => {
    res.send('Bot is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// ---------------------------------

const token = process.env.TOKEN;

if (!token) {
    console.error("TOKEN topilmadi! Render → Environment ga TOKEN qo'ying.");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 6685828485; 

let users = {};
let userStep = {};
let tempOrder = {};

const services = ["🏠 Uy qurish", "☕️ Kafe qurish", "🏢 Bino qurish", "🏘 Kvartira ta'mi"];

// --- WEB APP URL MANZILI ---
// Baxti, shu yerga Render'dan olgan STATIC SITE manzilingizni qo'ying
const WEB_APP_URL = 'https://my-telegram-webapp-lacp.onrender.com'; 

bot.on('message', async (msg) => {
    if (!msg.chat) return;

    const chatId = msg.chat.id;
    const text = msg.text || "";

    // --- WEB APP MA'LUMOTLARINI QABUL QILISH ---
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            
            await bot.sendMessage(chatId, `✅ Baxti, buyurtma qabul qilindi!\n📦 Xizmat: ${data.item}\n💰 Narxi: ${data.price} so'm`);
            
            const adminMsg = `🚀 WEB APP'DAN BUYURTMA!\n👤 Kimdan: ${msg.from.first_name}\n🛠 Xizmat: ${data.item}\n💵 Narxi: ${data.price} so'm`;
            await bot.sendMessage(ADMIN_ID, adminMsg);
            return; 
        } catch (e) {
            console.error("Web App xatosi:", e);
        }
    }

    // START
    if (text === '/start' || text === "🔙 Asosiy menyu") {
        userStep[chatId] = null;
        if (users[chatId] && users[chatId].registered) {
            return showMainMenu(chatId, `Xush kelibsiz, ${users[chatId].name}! Nima quramiz?`);
        } else {
            userStep[chatId] = 'reg_name';
            return bot.sendMessage(chatId, "Assalomu alaykum!\nIsmingizni kiriting:");
        }
    }

    // ISM VA RO'YXATDAN O'TISH
    if (userStep[chatId] === 'reg_name') {
        users[chatId] = { name: text };
        userStep[chatId] = 'reg_phone';
        return bot.sendMessage(chatId, "Telefon raqamingizni yuboring:", {
            reply_markup: {
                keyboard: [[{ text: "📞 Raqamni yuborish", request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    if (userStep[chatId] === 'reg_phone') {
        const phone = msg.contact ? msg.contact.phone_number : text;
        if (!users[chatId]) users[chatId] = {};
        users[chatId].phone = phone;
        users[chatId].registered = true;
        userStep[chatId] = null;
        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz!");
    }

    // XIZMATLAR
    if (services.includes(text)) {
        if (!users[chatId] || !users[chatId].registered) {
            return bot.sendMessage(chatId, "Avval /start bosing.");
        }
        tempOrder[chatId] = { service: text };
        userStep[chatId] = 'send_location';
        return bot.sendMessage(chatId, "Lokatsiyani yuboring:", {
            reply_markup: {
                keyboard: [
                    [{ text: "📍 Lokatsiyani yuborish", request_location: true }],
                    ["🔙 Asosiy menyu"]
                ],
                resize_keyboard: true
            }
        });
    }

    // LOKATSIYA VA TASDIQLASH
    if (userStep[chatId] === 'send_location') {
        if (msg.location) {
            tempOrder[chatId].latitude = msg.location.latitude;
            tempOrder[chatId].longitude = msg.location.longitude;
            userStep[chatId] = 'confirm_order';
            return bot.sendMessage(chatId, "Buyurtmani tasdiqlaysizmi?", {
                reply_markup: {
                    keyboard: [["✅ Yuborish", "❌ Bekor qilish"]],
                    resize_keyboard: true
                }
            });
        }
    }

    if (userStep[chatId] === 'confirm_order') {
        if (text === "✅ Yuborish") {
            const user = users[chatId];
            const order = tempOrder[chatId];
            const googleMapsUrl = `https://www.google.com/maps?q=${order.latitude},${order.longitude}`;
            const adminText = `🚀 YANGI BUYURTMA\n\n👤 ${user.name}\n📞 ${user.phone}\n🏗 ${order.service}\n📍 [Joylashuv](${googleMapsUrl})`;
            
            await bot.sendMessage(ADMIN_ID, adminText, { parse_mode: 'Markdown' });
            await bot.sendLocation(ADMIN_ID, order.latitude, order.longitude);
            userStep[chatId] = null;
            return showMainMenu(chatId, "Buyurtma yuborildi!");
        }
    }

    if (text === "👤 Profilim") {
        const u = users[chatId];
        if (!u) return bot.sendMessage(chatId, "Avval ro'yxatdan o'ting. /start");
        return bot.sendMessage(chatId, `Siz: ${u.name}\nTel: ${u.phone}`);
    }
});

function showMainMenu(chatId, message) {
    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: [
                [{ text: "🛍 Maxsus Menu (Web App)", web_app: { url: WEB_APP_URL } }],
                ["🏠 Uy qurish", "☕️ Kafe qurish"],
                ["🏢 Bino qurish", "🏘 Kvartira ta'mi"],
                ["👤 Profilim"]
            ],
            resize_keyboard: true
        }
    });
}

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);