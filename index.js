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

// --- MA'LUMOTLAR BAZASI (JSON) ---
let users = {};
if (fs.existsSync('users.json')) {
    try {
        users = JSON.parse(fs.readFileSync('users.json'));
    } catch (e) { users = {}; }
}

const saveUsers = () => fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

// Foydalanuvchini tekshirish
function checkUser(chatId, firstName) {
    if (!users[chatId]) {
        users[chatId] = { 
            balance: 0, 
            name: firstName || 'Mijoz', 
            history: [] 
        };
        saveUsers();
    }
    return users[chatId];
}

// --- ASOSIY LOGIKA ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    const firstName = msg.from.first_name;

    checkUser(chatId, firstName);

    // 1. WEB APP'DAN TO'LOV TASDIQLASH SO'ROVI KELGANDA
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);

            if (data.action === "pay_confirm") {
                const amount = data.amount;

                // Adminga tugmalar bilan yuborish
                const adminKeyboard = {
                    inline_keyboard: [
                        [
                            { text: "✅ Tasdiqlash", callback_data: `app_${chatId}_${amount}` },
                            { text: "❌ Rad etish", callback_data: `rej_${chatId}` }
                        ]
                    ]
                };

                await bot.sendMessage(ADMIN_ID, 
                    `💰 **YANGI TO'LOV SO'ROVI**\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `👤 Mijoz: ${firstName}\n` +
                    `🆔 ID: ${chatId}\n` +
                    `💵 Summa: ${parseInt(amount).toLocaleString()} UZS\n` +
                    `━━━━━━━━━━━━━━`, 
                    { parse_mode: 'Markdown', reply_markup: adminKeyboard }
                );

                return bot.sendMessage(chatId, "⏳ To'lov so'rovingiz adminga yuborildi. Tasdiqlangach hisobingizga tushadi.");
            }
        } catch (e) {
            console.error("WebAppData xatosi:", e);
        }
    }

    // 2. START KOMANDASI
    if (text === '/start') {
        return bot.sendMessage(chatId, `Assalomu alaykum, ${firstName}! 👋\nBMA Premium do'koniga xush kelibsiz.`, {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }]],
                resize_keyboard: true
            }
        });
    }
});

// --- ADMIN TUGMALARINI BOSGANDA (CALLBACK QUERY) ---

bot.on('callback_query', async (query) => {
    const adminId = query.from.id;
    const data = query.data;

    if (data.startsWith('app_')) {
        // TASDIQLASH: app_chatId_amount
        const [_, targetId, amount] = data.split('_');

        if (!users[targetId]) users[targetId] = { balance: 0, history: [] };
        
        // Balansni yangilash
        users[targetId].balance += parseInt(amount);
        
        // Tarixga yozish
        users[targetId].history.push({
            date: new Date().toLocaleString(),
            amount: amount,
            status: "Tasdiqlandi"
        });
        
        saveUsers();

        // Mijozga xabar yuborish
        bot.sendMessage(targetId, `✅ To'lovingiz tasdiqlandi!\n💰 Hisobingizga ${parseInt(amount).toLocaleString()} UZS qo'shildi.\nJoriy balans: ${users[targetId].balance.toLocaleString()} UZS`);

        // Admindagi xabarni yangilash
        bot.editMessageText(query.message.text + "\n\n✅ **TASDIQLANDI**", {
            chat_id: adminId,
            message_id: query.message.message_id
        });
    }

    if (data.startsWith('rej_')) {
        // RAD ETISH: rej_chatId
        const [_, targetId] = data.split('_');

        bot.sendMessage(targetId, "❌ To'lovingiz admin tomonidan rad etildi. Agar xatolik bo'lsa @BMA_Admin ga murojaat qiling.");

        bot.editMessageText(query.message.text + "\n\n❌ **RAD ETILDI**", {
            chat_id: adminId,
            message_id: query.message.message_id
        });
    }
});
