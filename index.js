const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
app.get('/', (req, res) => res.send('Baxti bot is running...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const token = process.env.TOKEN;
const ADMIN_ID = 6685828485; //
const WEB_APP_URL = 'https://my-telegram-webapp-lacp.onrender.com'; //

const bot = new TelegramBot(token, { polling: true });

let users = {};
try {
    if (fs.existsSync('users.json')) {
        users = JSON.parse(fs.readFileSync('users.json'));
    }
} catch (e) { console.log("Baza yangi"); }

function saveDatabase() {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (msg.web_app_data) {
        const data = JSON.parse(msg.web_app_data.data);
        users[chatId].currentOrder = data.item;
        users[chatId].step = 'ask_address';
        return bot.sendMessage(chatId, `Siz **${data.item}** tanladingiz. \n\nIltimos, yashash manzilingizni yozing:`);
    }

    if (users[chatId]?.step === 'ask_address') {
        const address = text;
        const user = users[chatId];
        const adminMsg = `🆕 **YANGI BUYURTMA!**\n\n👤 Ism: ${user.name}\n📞 Tel: ${user.phone}\n📍 Manzil: ${address}\n🏗 Xizmat: ${user.currentOrder}`;
        
        await bot.sendMessage(ADMIN_ID, adminMsg);
        users[chatId].step = null;
        saveDatabase();
        return bot.sendMessage(chatId, "Rahmat! Buyurtmangiz qabul qilindi. Tez orada bog'lanamiz. ✅");
    }

    if (text === '/start') {
        if (users[chatId]?.registered) return showMainMenu(chatId, `Xush kelibsiz!`);
        users[chatId] = { step: 'name' };
        return bot.sendMessage(chatId, "Ismingizni kiriting:");
    }

    if (users[chatId]?.step === 'name') {
        users[chatId].name = text;
        users[chatId].step = 'phone';
        return bot.sendMessage(chatId, "Raqamingizni yuboring:", {
            reply_markup: { keyboard: [[{ text: "📞 Raqamni ulash", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
    }

    if (users[chatId]?.step === 'phone') {
        users[chatId].phone = msg.contact ? msg.contact.phone_number : text;
        users[chatId].registered = true;
        users[chatId].step = null;
        saveDatabase();
        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz!");
    }
});

function showMainMenu(chatId, msg) {
    bot.sendMessage(chatId, msg, {
        reply_markup: {
            keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }]],
            resize_keyboard: true
        }
    });
}