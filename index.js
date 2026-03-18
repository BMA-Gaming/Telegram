const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BMA Premium Bot ishlayapti... ⚡️'));
app.listen(PORT, () => console.log(`Server portda yondi: ${PORT}`));

const token = process.env.TOKEN; 
const ADMIN_ID = 6685828485; 
const WEB_APP_URL = "https://bma-gaming.github.io/my-donat-shop/"; 

const bot = new TelegramBot(token, { polling: true });

let users = {};
if (fs.existsSync('users.json')) {
    try {
        users = JSON.parse(fs.readFileSync('users.json'));
    } catch (e) { users = {}; }
}
const saveUsers = () => fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

// Yordamchi: Foydalanuvchini tekshirish va yaratish
function checkUser(msg) {
    const chatId = msg.chat.id;
    if (!users[chatId]) {
        users[chatId] = { step: null, name: msg.from.first_name || 'Mijoz', phone: 'Kiritilmagan' };
        saveUsers();
    }
    // Agar ismi kiritilmagan bo'lsa, Telegramdan olib saqlash
    if(!users[chatId].name) {
        users[chatId].name = msg.from.first_name || 'Mijoz';
        saveUsers();
    }
    return chatId;
}

bot.on('message', async (msg) => {
    const chatId = checkUser(msg);
    const text = msg.text || "";

    // 1. WEB APP'DAN MA'LUMOT KELGANDA
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            users[chatId].currentOrder = data.product;
            users[chatId].category = data.category;
            users[chatId].step = 'ask_details';
            saveUsers(); 

            let promptText = (data.category === 'phone') 
                ? `📱 **${data.product}** tanlandi.\n\nPul tushirilishi kerak bo'lgan **telefon raqamni** yozing:` 
                : `🎮 **${data.product}** tanlandi.\n\nIltimos, o'yin **ID raqamingizni** yozing:`;

            return bot.sendMessage(chatId, promptText, { parse_mode: 'Markdown' });
        } catch (e) {
            return bot.sendMessage(chatId, "Xatolik! Qaytadan urinib ko'ring.");
        }
    }

    // 2. DETALLARNI QABUL QILISH (ID YOKI TEL)
    if (users[chatId].step === 'ask_details' && text !== '/start') {
        const userDetail = text;
        const detailLabel = (users[chatId].category === 'phone') ? "📞 Tel raqam" : "🆔 O'yin ID";

        const adminMsg = `🔥 **YANGI BUYURTMA**\n` +
                         `━━━━━━━━━━━━━━\n` +
                         `👤 Mijoz: ${users[chatId].name}\n` +
                         `📞 Registratsiya raqami: ${users[chatId].phone}\n` +
                         `📦 Mahsulot: ${users[chatId].currentOrder}\n` +
                         `${detailLabel}: ${userDetail}\n` +
                         `━━━━━━━━━━━━━━`;

        await bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' });
        
        users[chatId].step = null;
        saveUsers(); 
        
        return bot.sendMessage(chatId, "✅ Buyurtma qabul qilindi! Admin tez orada siz bilan bog'lanadi.", {
            reply_markup: {
                inline_keyboard: [[{ text: "Yana xarid qilish", web_app: { url: WEB_APP_URL } }]]
            }
        });
    }

    // 3. START COMMANDASI (Registratsiyasiz, to'g'ridan-to'g'ri do'kon)
    if (text === '/start') {
        users[chatId].step = null; // Stepni tozalash
        saveUsers();
        
        return bot.sendMessage(chatId, "Assalomu alaykum! BMA Premium do'koniga xush kelibsiz.\nDo'konni ochish tugmasini bosing:", {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }]],
                resize_keyboard: true
            }
        });
    }
});
