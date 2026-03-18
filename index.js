const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BMA Premium Bot ishlamoqda... ⚡️'));
app.listen(PORT, () => console.log(`Server running on port: ${PORT}`));

// --- ASOSIY SOZLAMALAR ---
const token = process.env.TOKEN; // Render/Railway'da muhit o'zgaruvchisiga TOKEN qo'shing
const ADMIN_ID = 6685828485; 
const WEB_APP_URL = 'https://bma-gaming.github.io/my-donat-shop/'; 

const bot = new TelegramBot(token, { polling: true });

let users = {};
if (fs.existsSync('users.json')) {
    try {
        users = JSON.parse(fs.readFileSync('users.json'));
    } catch (e) {
        users = {};
    }
}

// Ma'lumotlarni saqlash funksiyasi
const saveUsers = () => fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (!users[chatId]) users[chatId] = { step: null, name: '', phone: '' };

    // 1. Web App'dan ma'lumot kelganda
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            users[chatId].currentOrder = data.item;
            users[chatId].category = data.category;
            users[chatId].step = 'ask_details';

            let promptText = data.category === 'game' 
                ? `🎮 **${data.item}** tanlandi.\n\nIltimos, o'yin ID raqamingizni yozing:` 
                : `📱 **${data.item}** tanlandi.\n\nIltimos, telefon raqamingizni yozing:`;

            return bot.sendMessage(chatId, promptText, { parse_mode: 'Markdown' });
        } catch (e) {
            return bot.sendMessage(chatId, "Xatolik yuz berdi. Qaytadan urinib ko'ring.");
        }
    }

    // 2. ID yoki Raqamni qabul qilish
    if (users[chatId].step === 'ask_details' && text !== '/start') {
        const userDetail = text;
        const detailLabel = users[chatId].category === 'game' ? "🆔 O'yin ID" : "📞 Tel raqam";

        const adminMsg = `🔥 **YANGI BUYURTMA**\n` +
                         `━━━━━━━━━━━━━━\n` +
                         `👤 Mijoz: ${users[chatId].name}\n` +
                         `📞 Aloqa: ${users[chatId].phone}\n` +
                         `📦 Mahsulot: ${users[chatId].currentOrder}\n` +
                         `${detailLabel}: ${userDetail}\n` +
                         `━━━━━━━━━━━━━━`;

        await bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' });
        
        users[chatId].step = null;
        return bot.sendMessage(chatId, "✅ Buyurtmangiz qabul qilindi! Admin tez orada siz bilan bog'lanadi.", {
            reply_markup: {
                inline_keyboard: [[{ text: "Yana xarid qilish", web_app: { url: WEB_APP_URL } }]]
            }
        });
    }

    // 3. Start komandasi
    if (text === '/start') {
        users[chatId].step = 'name';
        return bot.sendMessage(chatId, "Assalomu alaykum! BMA Premium do'koniga xush kelibsiz. Davom etish uchun ismingizni kiriting:");
    }

    // 4. Ro'yxatdan o'tish (Ism)
    if (users[chatId].step === 'name') {
        users[chatId].name = text;
        users[chatId].step = 'phone';
        return bot.sendMessage(chatId, "Raqamingizni pastdagi tugma orqali yuboring:", {
            reply_markup: {
                keyboard: [[{ text: "📞 Raqamni ulash", request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    // 5. Ro'yxatdan o'tish (Telefon)
    if (msg.contact && users[chatId].step === 'phone') {
        users[chatId].phone = msg.contact.phone_number;
        users[chatId].step = null;
        saveUsers();
        
        return bot.sendMessage(chatId, "Muvaffaqiyatli ro'yxatdan o'tdingiz! 🏁", {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: 'https://bma-gaming.github.io/my-donat-shop/' } }]],
                resize_keyboard: true
            }
        });
    }
});
