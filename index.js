const TelegramBot = require('node-telegram-bot-api');
const express = require('express'); // Express qo'shildi

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

// TOKEN Render Environment ga qo'yiladi
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

const services = ["🏠 Uy qurish", "☕️ Kafe qurish", "🏢 Bino qurish", "🏘 Kvartira ta'miri"];

bot.on('message', async (msg) => {

    if (!msg.chat) return;

    const chatId = msg.chat.id;
    const text = msg.text || "";

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

    // ISM
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

    // TELEFON
    if (userStep[chatId] === 'reg_phone') {

        const phone = msg.contact ? msg.contact.phone_number : text;

        if (!users[chatId]) users[chatId] = {};

        users[chatId].phone = phone;
        users[chatId].registered = true;

        userStep[chatId] = null;

        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz!");
    }

    // XIZMAT TANLASH
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

    // LOKATSIYA
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

        } else {
            return bot.sendMessage(chatId, "Pastdagi tugma orqali lokatsiya yuboring.");
        }
    }

    // TASDIQLASH
    if (userStep[chatId] === 'confirm_order') {

        if (text === "✅ Yuborish") {

            const user = users[chatId];
            const order = tempOrder[chatId];

            if (!user || !order) {
                userStep[chatId] = null;
                return bot.sendMessage(chatId, "Xatolik yuz berdi. Qaytadan boshlang.");
            }

            const googleMapsUrl = `https://www.google.com/maps?q=${order.latitude},${order.longitude}`;

            const adminText =
`🚀 YANGI BUYURTMA

👤 ${user.name}
📞 ${user.phone}
🏗 ${order.service}
📍 [Google Maps](${googleMapsUrl})`;

            await bot.sendMessage(ADMIN_ID, adminText, { parse_mode: 'Markdown' });
            await bot.sendLocation(ADMIN_ID, order.latitude, order.longitude);

            userStep[chatId] = null;
            tempOrder[chatId] = null;

            return showMainMenu(chatId, "Buyurtma yuborildi!");
        }

        if (text === "❌ Bekor qilish") {
            userStep[chatId] = null;
            tempOrder[chatId] = null;
            return showMainMenu(chatId, "Bekor qilindi.");
        }
    }

    // PROFIL
    if (text === "👤 Profilim") {

        const u = users[chatId];

        if (!u) {
            return bot.sendMessage(chatId, "Avval ro'yxatdan o'ting. /start");
        }

        return bot.sendMessage(chatId, `Siz: ${u.name}\nTel: ${u.phone}`);
    }

});

function showMainMenu(chatId, message) {
    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: [
                ["🏠 Uy qurish", "☕️ Kafe qurish"],
                ["🏢 Bino qurish", "🏘 Kvartira ta'miri"],
                ["👤 Profilim"]
            ],
            resize_keyboard: true
        }
    });
}

// Xatolik tushsa bot o'chib ketmasligi uchun
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);