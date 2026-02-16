const TelegramBot = require('node-telegram-bot-api');

// 1. Tokenni shu yerga qo'ying
const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

// 2. Buyurtma boradigan Admin ID (O'zingizning ID raqamingiz)
// Agar ID'ingizni bilmasangiz @userinfobot ga kiring
const ADMIN_ID = 6685828485; 

let users = {}; 
let userStep = {}; 
let tempOrder = {}; 

// Yangi xizmat turlari
const services = ["🏠 Uy qurish", "☕️ Kafe qurish", "🏢 Bino qurish", "🏘 Kvartira ta'miri"];

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // 1. START VA RO'YXATDAN O'TISH
    if (text === '/start' || text === "🔙 Asosiy menyu") {
        userStep[chatId] = null;
        if (users[chatId] && users[chatId].registered) {
            return showMainMenu(chatId, `Xush kelibsiz, ${users[chatId].name}! Nima quramiz?`);
        } else {
            userStep[chatId] = 'reg_name';
            return bot.sendMessage(chatId, "Assalomu alaykum! Qurilish xizmati botiga xush kelibsiz.\nIsmingizni kiriting:");
        }
    }

    // Ismni saqlash
    if (userStep[chatId] === 'reg_name') {
        users[chatId] = { name: text };
        userStep[chatId] = 'reg_phone';
        return bot.sendMessage(chatId, "Telefon raqamingizni yuboring:", {
            reply_markup: {
                keyboard: [[{ text: "📞 Raqamni yuborish", request_contact: true }]],
                resize_keyboard: true, one_time_keyboard: true
            }
        });
    }

    // Telefonni saqlash
    if (userStep[chatId] === 'reg_phone') {
        const phone = msg.contact ? msg.contact.phone_number : text;
        users[chatId].phone = phone;
        users[chatId].registered = true;
        userStep[chatId] = null;
        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz! Qanday obyekt qurmoqchisiz?");
    }

    // 2. XIZMAT TURINI TANLASH
    if (services.includes(text)) {
        tempOrder[chatId] = { service: text };
        userStep[chatId] = 'send_location';
        
        return bot.sendMessage(chatId, `Yaxshi, ${text} bo'yicha joylashuvni aniqlashimiz kerak.\n\nIltimos, obyekt joylashgan "Lokatsiya"ni yuboring:`, {
            reply_markup: {
                keyboard: [
                    [{ text: "📍 Lokatsiyani yuborish", request_location: true }],
                    ["🔙 Asosiy menyu"]
                ],
                resize_keyboard: true
            }
        });
    }

    // 3. LOKATSIYANI QABUL QILISH
    if (userStep[chatId] === 'send_location') {
        if (msg.location) {
            tempOrder[chatId].latitude = msg.location.latitude;
            tempOrder[chatId].longitude = msg.location.longitude;
            
            userStep[chatId] = 'confirm_order';

            const summary = 
`📝 BUYURTMA MA'LUMOTI:

🏗 Xizmat turi: ${tempOrder[chatId].service}
📍 Lokatsiya: Qabul qilindi

Haqiqatan ham ushbu buyurtmani yuborishni xohlaysizmi?
            `;

            return bot.sendMessage(chatId, summary, {
                reply_markup: {
                    keyboard: [["✅ Yuborish", "❌ Bekor qilish"]],
                    resize_keyboard: true
                }
            });
        } else if (text !== "🔙 Asosiy menyu") {
            return bot.sendMessage(chatId, "Iltimos, pastdagi tugma orqali lokatsiya yuboring.");
        }
    }

    // 4. TASDIQLASH VA ADMINGA YUBORISH
    if (userStep[chatId] === 'confirm_order') {
        if (text === "✅ Yuborish") {
            const user = users[chatId];
            const order = tempOrder[chatId];
            
            // Google Maps havolasini yaratish
            const googleMapsUrl = `https://www.google.com/maps?q=${order.latitude},${order.longitude}`;

            const adminText = 
`🚀 YANGI QURILISH BUYURTMASI!

👤 Buyurtmachi: ${user.name}
📞 Telefon: ${user.phone}
🏗 Obyekt: ${order.service}
📍 Lokatsiya: ${googleMapsUrl}
            `;

// Adminga (Sizga) yuborish
            await bot.sendMessage(ADMIN_ID, adminText);
            
            // Lokatsiyani xarita sifatida ham yuborish (ko'rish oson bo'lishi uchun)
            await bot.sendLocation(ADMIN_ID, order.latitude, order.longitude);

            await bot.sendMessage(chatId, "✅ Buyurtmangiz yuborildi! Mutaxassislarimiz tez orada aloqaga chiqishadi.");
            userStep[chatId] = null;
            return showMainMenu(chatId, "Yana boshqa xizmat kerakmi?");
            
        } else if (text === "❌ Bekor qilish") {
            userStep[chatId] = null;
            return showMainMenu(chatId, "Buyurtma bekor qilindi.");
        }
    }

    // Profil
    if (text === "👤 Profilim") {
        const u = users[chatId];
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