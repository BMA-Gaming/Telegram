const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BMA Premium Bot ishlayapti... ⚡️'));
app.listen(PORT, () => console.log(`Server portda yondi: ${PORT}`));

// --- SOZLAMALAR ---
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

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (!users[chatId]) users[chatId] = { step: null, name: '', phone: '' };

    // 1. WEB APP'DAN MA'LUMOT KELGANDA
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            users[chatId].currentOrder = data.item;
            users[chatId].category = data.category;
            users[chatId].step = 'ask_details';

            // MANTIQ: Agar kategoriya 'phone' bo'lsa tel so'raydi, aks holda ID
            let promptText = (data.category === 'phone') 
                ? `📱 **${data.item}** miqdori tanlandi.\n\nIltimos, pul tushirilishi kerak bo'lgan **telefon raqamni** yozing:` 
                : `🎮 **${data.item}** tanlandi.\n\nIltimos, o'yin **ID raqamingizni** yozing:`;

            return bot.sendMessage(chatId, promptText, { parse_mode: 'Markdown' });
        } catch (e) {
            return bot.sendMessage(chatId, "Xatolik! Qaytadan urinib ko'ring.");
        }
    }

    // 2. DETALLARNI QABUL QILISH (ID YOKI TEL)
    if (users[chatId].step === 'ask_details' && text !== '/start') {
        const userDetail = text;
        const detailLabel = (users[chatId].category === 'game' || users[chatId].category === 'pubg' || users[chatId].category === 'ff' || users[chatId].category === 'mlbb') 
            ? "🆔 O'yin ID" 
            : "📞 Tel raqam";

        const adminMsg = `🔥 **YANGI BUYURTMA**\n` +
                         `━━━━━━━━━━━━━━\n` +
                         `👤 Mijoz: ${users[chatId].name}\n` +
                         `📞 Bog'lanish: ${users[chatId].phone}\n` +
                         `📦 Mahsulot: ${users[chatId].currentOrder}\n` +
                         `${detailLabel}: ${userDetail}\n` +
                         `━━━━━━━━━━━━━━`;

        await bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' });
        
        users[chatId].step = null;
        return bot.sendMessage(chatId, "✅ Buyurtma qabul qilindi! Admin tez orada bog'lanadi.", {
            reply_markup: {
                inline_keyboard: [[{ text: "Yana xarid qilish", web_app: { url: WEB_APP_URL } }]]
            }
        });
    }

    // 3. START VA RO'YXATDAN O'TISH
    if (text === '/start') {
        users[chatId].step = 'name';
        return bot.sendMessage(chatId, "Assalomu alaykum! Ismingizni kiriting:");
    }

    if (users[chatId].step === 'name') {
        users[chatId].name = text;
        users[chatId].step = 'phone';
        return bot.sendMessage(chatId, "Pastdagi tugmani bosing:", {
            reply_markup: {
                keyboard: [[{ text: "📞 Raqamni yuborish", request_contact: true }]],
                resize_keyboard: true, one_time_keyboard: true
            }
        });
    }

    if (msg.contact && users[chatId].step === 'phone') {
        users[chatId].phone = msg.contact.phone_number;
        users[chatId].step = null;
        saveUsers();
        
        return bot.sendMessage(chatId, "Tayyor! Do'konni ochishingiz mumkin:", {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'kon", web_app: { url: WEB_APP_URL } }]],
                resize_keyboard: true
            }
        });
    }
});
