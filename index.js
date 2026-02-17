const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const app = express();
app.get('/', (req, res) => res.send('Baxti bot is running...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const token = process.env.TOKEN;
const PAYMENT_TOKEN = '398062629:TEST:999999999_F91D8F69C042267444B74CC0B3C747757EB0E065'; 
const ADMIN_ID = 6685828485; 
const WEB_APP_URL = 'https://my-telegram-webapp-lacp.onrender.com'; 

if (!token) {
    console.error("TOKEN topilmadi!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// --- SODDA BAZA (Xatosiz o'qish) ---
let users = {};
try {
    if (fs.existsSync('users.json')) {
        users = JSON.parse(fs.readFileSync('users.json'));
    }
} catch (e) {
    console.log("Baza o'qishda xato, yangi baza yaratiladi.");
}

function saveDatabase() {
    try {
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    } catch (e) {
        console.error("Faylga yozishda xato:", e.message);
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            
            // Narxni tekshirish (Telegram limiti uchun)
            // Agar HTML dan juda katta son kelsa, uni 1000 so'm qilib tursin
            let finalPrice = parseInt(data.price) > 10000000 ? 1000 : parseInt(data.price);

            await bot.sendMessage(chatId, `Tayyor! ${data.item} uchun chek tayyorlanmoqda...`);

            await bot.sendInvoice(
                chatId,
                data.item,
                `Xizmat: ${data.item}`,
                `order_${Date.now()}`,
                PAYMENT_TOKEN,
                'UZS',
                [{ label: 'To\'lov miqdori', amount: finalPrice * 100 }], // Tiyinda
                { photo_url: 'https://cdn-icons-png.flaticon.com/512/4342/4342728.png' }
            );
        } catch (e) {
            console.error("To'lov yuborishda xato:", e.message);
            bot.sendMessage(chatId, "To'lov tizimida xatolik yuz berdi. Narx juda kattami?");
        }
    }

    if (text === '/start') {
        if (users[chatId] && users[chatId].registered) {
            return showMainMenu(chatId, `Xush kelibsiz, ${users[chatId].name}!`);
        } else {
            users[chatId] = { step: 'reg_name' };
            return bot.sendMessage(chatId, "Ismingizni kiriting:");
        }
    }

    // REGISTRATSIYA VA PROFIL (Kodingizning qolgan qismi bir xil...)
    if (users[chatId] && users[chatId].step === 'reg_name') {
        users[chatId].name = text;
        users[chatId].step = 'reg_phone';
        saveDatabase();
        return bot.sendMessage(chatId, "Raqamni yuboring:", {
            reply_markup: { keyboard: [[{ text: "📞 Raqam", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
    }

    if (users[chatId] && users[chatId].step === 'reg_phone') {
        users[chatId].phone = msg.contact ? msg.contact.phone_number : text;
        users[chatId].registered = true;
        users[chatId].step = null;
        saveDatabase();
        return showMainMenu(chatId, "Ro'yxatdan o'tdingiz!");
    }

    if (text === "👤 Profilim") {
        const u = users[chatId] || {};
        return bot.sendMessage(chatId, `👤: ${u.name || 'Noma\'lum'}\n📞: ${u.phone || 'Yo\'q'}`);
    }
});

bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', async (msg) => {
    await bot.sendMessage(msg.chat.id, "🎉 To'lov muvaffaqiyatli amalga oshirildi!");
    await bot.sendMessage(ADMIN_ID, `💰 PUL TUSHDI!\n👤 Foydalanuvchi: ${msg.chat.id}`);
});

// Xatolar botni o'chirib qo'ymasligi uchun:
bot.on("polling_error", (err) => console.log("Polling error:", err.code, err.message));

function showMainMenu(chatId, message) {
    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url: WEB_APP_URL } }], ["👤 Profilim"]],
            resize_keyboard: true
        }
    });
}