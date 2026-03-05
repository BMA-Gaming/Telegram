const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Alisa Bot ishlamoqda... ⚡️'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));

const token = process.env.TOKEN;
const ADMIN_ID = 6685828485; 
const WEB_APP_URL = 'SIZ_YARATGAN_YANGI_LINK'; // 2-qadamdagi linkni shu yerga qo'ying!

const bot = new TelegramBot(token, { polling: true });

let users = {};
// Baza yuklash
if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (!users[chatId]) users[chatId] = {};

    // 1. Web App'dan buyurtma kelsa
    if (msg.web_app_data) {
        const data = JSON.parse(msg.web_app_data.data);
        users[chatId].currentOrder = data.item;
        users[chatId].step = 'ask_address';
        return bot.sendMessage(chatId, `⚪️ **${data.item}** tanlandi.\n\nEndi o'yin ID raqamingizni yoki manzilingizni yozing:`, {parse_mode: 'Markdown'});
    }

    // 2. ID/Manzil kiritish
    if (users[chatId].step === 'ask_address') {
        const adminMsg = `📦 **YANGI BUYURTMA**\n\n👤 Mijoz: ${users[chatId].name}\n📞 Tel: ${users[chatId].phone}\n🆔 ID: ${text}\n💎 Mahsulot: ${users[chatId].currentOrder}`;
        await bot.sendMessage(ADMIN_ID, adminMsg, {parse_mode: 'Markdown'});
        users[chatId].step = null;
        return bot.sendMessage(chatId, "Qabul qilindi! Adminga yuborildi. ✅");
    }

    // 3. Start
    if (text === '/start') {
        users[chatId].step = 'name';
        return bot.sendMessage(chatId, "Salom! Ismingizni kiriting:");
    }

    // 4. Ro'yxatdan o'tish (Ism)
    if (users[chatId].step === 'name') {
        users[chatId].name = text;
        users[chatId].step = 'phone';
        return bot.sendMessage(chatId, "Raqamingizni pastdagi tugma orqali yuboring:", {
            reply_markup: { keyboard: [[{ text: "📞 Raqamni ulash", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
    }

    // 5. Ro'yxatdan o'tish (Telefon)
    if (msg.contact && users[chatId].step === 'phone') {
        users[chatId].phone = msg.contact.phone_number;
        users[chatId].step = null;
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
        return bot.sendMessage(chatId, "Muvaffaqiyatli ro'yxatdan o'tdingiz! 🏁", {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: "https://bma-gaming.github.io/my-donat-shop/" } }]],
                resize_keyboard: true
            }
        });
    }
});
