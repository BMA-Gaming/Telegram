const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
app.get('/', (req, res) => res.send('Baxti bot is running...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const token = process.env.TOKEN;
const PAYMENT_TOKEN = '398062629:TEST:999999999_F91D8F69C042267444B74CC0B3C747757EB0E065'; //
const ADMIN_ID = 6685828485; //
const WEB_APP_URL = 'https://my-telegram-webapp-lacp.onrender.com'; //

const bot = new TelegramBot(token, { polling: true });

// --- BAZA ---
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

    // WEB APP DATA (TO'LOV)
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            let finalPrice = parseInt(data.price); //

            await bot.sendInvoice(
                chatId,
                data.item,
                `Baxti Construction: ${data.item}`,
                `order_${Date.now()}`,
                PAYMENT_TOKEN,
                'UZS',
                [{ label: 'To\'lov', amount: finalPrice * 100 }], //
                { photo_url: 'https://cdn-icons-png.flaticon.com/512/4342/4342728.png' }
            );
        } catch (e) { console.log("Error invoice"); }
    }

    // COMMANDS
    if (text === '/start') {
        if (users[chatId] && users[chatId].registered) {
            return showMainMenu(chatId, `Xush kelibsiz, ${users[chatId].name}!`);
        }
        users[chatId] = { step: 'name', history: [] };
        return bot.sendMessage(chatId, "Ismingizni kiriting:");
    }

    // ADMIN PANEL
    if (text === '/admin' && chatId === ADMIN_ID) {
        const count = Object.keys(users).length;
        return bot.sendMessage(chatId, `📊 **Statistika**\n\nJami mijozlar: ${count} ta`);
    }

    // REGISTRATSIYA
    if (users[chatId]?.step === 'name') {
        users[chatId].name = text;
        users[chatId].step = 'phone';
        saveDatabase();
        return bot.sendMessage(chatId, "📞 Raqamingizni yuboring:", {
            reply_markup: { keyboard: [[{ text: "📞 Raqamni ulash", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
    }

    if (users[chatId]?.step === 'phone' && (msg.contact || text)) {
        users[chatId].phone = msg.contact ? msg.contact.phone_number : text;
        users[chatId].registered = true;
        users[chatId].step = null;
        saveDatabase();
        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz!");
    }

    if (text === "👤 Profil") {
        const u = users[chatId];
        let historyText = u.history?.length ? u.history.join("\n") : "Hali xaridlar yo'q";
        return bot.sendMessage(chatId, `👤 **Profil**\n\nIsm: ${u.name}\nTel: ${u.phone}\n\n📜 **Xaridlar:**\n${historyText}`);
    }
});

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));

bot.on('successful_payment', async (msg) => {
    const chatId = msg.chat.id;
    const item = msg.successful_payment.invoice_payload;
    
    if (!users[chatId].history) users[chatId].history = [];
    users[chatId].history.push(`✅ ${new Date().toLocaleDateString()}: To'lov qilindi`);
    saveDatabase();

    await bot.sendMessage(chatId, "🎉 Tabriklaymiz! To'lov muvaffaqiyatli o'tdi.");
    await bot.sendMessage(ADMIN_ID, `💰 **PUL TUSHDI!**\n👤: ${users[chatId].name}\n📞: ${users[chatId].phone}`);
});

function showMainMenu(chatId, msg) {
    bot.sendMessage(chatId, msg, {
        reply_markup: {
            keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }], ["👤 Profil"]],
            resize_keyboard: true
        }
    });
}