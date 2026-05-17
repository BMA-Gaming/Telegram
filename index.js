const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors()); // Frontend bilan cheklovsiz bog'lanish uchun
app.use(express.json());

const PORT = process.env.PORT || 3000;
const token = process.env.TOKEN; 
const ADMIN_ID = 6685828485; // Sening Telegram ID raqaming
const PAYMENT_TOKEN = process.env.PROVIDER_TOKEN; // Render Envs bo'limidan olinadi

const bot = new TelegramBot(token, { polling: true });

let users = {};
const DB_FILE = 'users.json';

// Ma'lumotlarni yuklash (users.json)
if (fs.existsSync(DB_FILE)) {
    try { 
        users = JSON.parse(fs.readFileSync(DB_FILE)); 
    } catch (e) { 
        console.log("DB o'qishda xato, yangi yaratiladi.");
        users = {}; 
    }
}

// Ma'lumotlarni saqlash
const saveUsers = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error("Faylga yozishda xato:", e);
    }
};

// Frontend (Web App) balansni tekshirishi uchun API
app.get('/get-balance/:id', (req, res) => {
    const userId = req.params.id;
    if (!users[userId]) {
        users[userId] = { balance: 0, history: [] };
        saveUsers();
    }
    res.json(users[userId]);
});

app.get('/', (req, res) => res.send('BMA Bot va API xizmati muvaffaqiyatli ishlamoqda...'));

app.listen(PORT, () => console.log(`Server ${PORT}-portda faol`));

// =======================================================
// TELEGRAM RASMIY TO'LOV TIZIMI (NATIVE PAYMENTS)
// =======================================================

// Foydalanuvchi bot ichida rasmiy CLICK to'lovini tekshirishi uchun
bot.onText(/\/pay/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!PAYMENT_TOKEN) {
        return bot.sendMessage(chatId, "❌ Xatolik: Serverda PROVIDER_TOKEN (To'lov tokeni) sozlanmagan!");
    }

    bot.sendInvoice(
        chatId,
        "BMA-Gaming Balans (Test)", 
        "BMA-Gaming tizimi orqali hisobingizni 10,000 so'mga to'ldirish", 
        `topup_auto_${chatId}_${Date.now()}`, // Unikal Invoice ID
        PAYMENT_TOKEN,
        "UZS", 
        [{ label: "Balansni to'ldirish", amount: 1000000 }] // Tiyinlarda (10000 * 100)
    ).catch(err => console.error("Invoice yuborishda xato:", err));
});

// To'lov tugmasi bosilganda xavfsizlik tekshiruvi
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true)
        .catch(err => console.error("Pre-checkout xatosi:", err));
});

// To'lov muvaffaqiyatli yakunlanganda balansni avtomatik oshirish
bot.on('successful_payment', (msg) => {
    const chatId = msg.chat.id;
    const amountPaid = msg.successful_payment.total_amount / 100; // Tiyindan so'mga o'tkazamiz

    if (!users[chatId]) users[chatId] = { balance: 0, history: [] };
    
    users[chatId].balance = (Number(users[chatId].balance) || 0) + amountPaid;
    
    users[chatId].history.push({
        date: new Date().toLocaleDateString('uz-UZ'),
        amount: amountPaid,
        status: "Avtomatik (Click)"
    });
    
    saveUsers();

    bot.sendMessage(chatId, `✅ To'lovingiz muvaffaqiyatli qabul qilindi!\n💰 Yangi balans: ${users[chatId].balance.toLocaleString()} UZS`);
    
    // Adminga bildirishnoma
    bot.sendMessage(ADMIN_ID, `⚡️ AVTOMATIK TO'LOV\n👤: ${msg.from.first_name}\nID: ${chatId}\n💵: ${amountPaid.toLocaleString()} UZS`);
});

// =======================================================
// INTERFEYS VA QO'LDA TO'LOV MANTIQLARI
// =======================================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    if (msg.successful_payment) return;

    if (!users[chatId]) {
        users[chatId] = { balance: 0, name: firstName, history: [] };
        saveUsers();
    }

    // Web App'dan kelgan ma'lumot (Qo'lda karta orqali to'lov so'rovi)
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            if (data.action === "pay_confirm") {
                const adminKeyboard = {
                    inline_keyboard: [[
                        { text: "✅ Tasdiqlash", callback_data: `app_${chatId}_${data.amount}` },
                        { text: "❌ Rad etish", callback_data: `rej_${chatId}` }
                    ]]
                };
                await bot.sendMessage(ADMIN_ID, `💰 QO'LDA TO'LOV SO'ROVI\n👤: ${firstName}\nID: ${chatId}\n💵: ${Number(data.amount).toLocaleString()} UZS`, { reply_markup: adminKeyboard });
                bot.sendMessage(chatId, "⏳ To'lov so'rovi yuborildi. Admin tasdiqlashini kuting.");
            }
        } catch (e) { 
            console.error("Web App ma'lumotlarida xato:", e); 
        }
    }

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `Salom ${firstName}! BMA Premium Shop do'konimizga xush kelibsiz.\n\n🛒 Do'konni ochish uchun pastdagi tugmani bosing.\n💳 Bot orqali avtomatik to'lov qilish uchun /pay buyrug'ini yuboring.`, {
            reply_markup: {
                keyboard: [[{ text: "🛍 Do'kon", web_app: { url: "https://bma-gaming.github.io/my-donat-shop/" } }]],
                resize_keyboard: true
            }
        });
    }
});

// Admin callback query tugmalari (Qo'lda to'lovlarni boshqarish)
bot.on('callback_query', async (query) => {
    const data = query.data;
    const adminMsg = query.message;

    if (data.startsWith('app_')) {
        const [_, targetId, amount] = data.split('_');
        
        if (!users[targetId]) users[targetId] = { balance: 0, history: [] };
        
        users[targetId].balance = (Number(users[targetId].balance) || 0) + Number(amount);
        
        users[targetId].history.push({
            date: new Date().toLocaleDateString('uz-UZ'),
            amount: amount,
            status: "Tasdiqlandi"
        });
        
        saveUsers();

        bot.sendMessage(targetId, `✅ To'lovingiz admin tomonidan tasdiqlandi!\n💰 Yangi balans: ${users[targetId].balance.toLocaleString()} UZS`);
        bot.editMessageText(adminMsg.text + "\n\n✅ ADMIN TOMONIDAN TASDIQLANDI", { chat_id: ADMIN_ID, message_id: adminMsg.message_id });
    }

    if (data.startsWith('rej_')) {
        const targetId = data.split('_')[1];
        bot.sendMessage(targetId, `❌ Uzr, to'lovingiz admin tomonidan rad etildi. Ma'lumotlarni qayta tekshiring.`);
        bot.editMessageText(adminMsg.text + "\n\n❌ ADMIN TOMONIDAN RAD ETILDI", { chat_id: ADMIN_ID, message_id: adminMsg.message_id });
    }
    
    bot.answerCallbackQuery(query.id);
});
