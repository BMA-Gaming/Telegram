require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN ? process.env.TOKEN.trim() : null;
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN ? process.env.PROVIDER_TOKEN.trim() : null;
const ADMIN_ID = Number(process.env.ADMIN_ID) || 6685828485;
const SHOP_URL = process.env.SHOP_URL || "https://bma-gaming.github.io/my-donat-shop/";
const DB_FILE = "users.json";

if (!TOKEN) {
  console.error("DIQQAT: TOKEN topilmadi! .env faylga TOKEN qo'shing.");
  process.exit(1);
}
if (!PROVIDER_TOKEN) {
  console.warn("PROVIDER_TOKEN topilmadi - to'lov (invoice) funksiyasi ishlamaydi.");
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------------------------------------------------------------------------
// MUHIM: O'yinlar, valyuta paketlari va narxlar FAQAT shu yerda, serverda
// saqlanadi. WebApp (index.html) dan kelgan narxga hech qachon ishonilmaydi -
// aks holda foydalanuvchi narxni o'zi o'zgartirib, arzon/bepul xarid qilishi
// yoki hatto manfiy narx yuborib balansni ko'paytirishi mumkin bo'lardi.
// Narxlar USD'da, lekin balans/to'lov UZS'da bo'lgani uchun konvertatsiya
// qilinadi (kurs .env orqali sozlanadi).
// ---------------------------------------------------------------------------
const USD_TO_UZS = Number(process.env.USD_TO_UZS) || 12700; // taxminiy kurs - .env'da yangilab turing

const GAMES = {
  pubgm: {
    title: "PUBG Mobile",
    currency: "UC",
    products: {
      pubgm_60uc: { name: "60 UC", priceUSD: 0.99 },
      pubgm_325uc: { name: "325 UC", priceUSD: 4.99 },
      pubgm_660uc: { name: "660 UC", priceUSD: 9.99 },
      pubgm_1800uc: { name: "1800 UC", priceUSD: 24.99 },
    },
  },
  brawlstars: {
    title: "Brawl Stars",
    currency: "Gems",
    products: {
      brawl_30gems: { name: "30 Gems", priceUSD: 0.99 },
      brawl_80gems: { name: "80 Gems", priceUSD: 2.99 },
      brawl_170gems: { name: "170 Gems", priceUSD: 4.99 },
      brawl_360gems: { name: "360 Gems", priceUSD: 9.99 },
    },
  },
  mlbb: {
    title: "Mobile Legends",
    currency: "Diamonds",
    products: {
      mlbb_56d: { name: "56 Diamonds", priceUSD: 1.49 },
      mlbb_278d: { name: "278 Diamonds", priceUSD: 6.99 },
      mlbb_571d: { name: "571 Diamonds", priceUSD: 12.99 },
      mlbb_1783d: { name: "1783 Diamonds", priceUSD: 34.99 },
    },
  },
  freefire: {
    title: "Free Fire",
    currency: "Diamonds",
    products: {
      ff_100d: { name: "100 Diamonds", priceUSD: 0.99 },
      ff_310d: { name: "310 Diamonds", priceUSD: 2.99 },
      ff_520d: { name: "520 Diamonds", priceUSD: 4.99 },
      ff_1060d: { name: "1060 Diamonds", priceUSD: 9.99 },
    },
  },
  // Keyingi o'yinlarni shu yerga xuddi shu tuzilmada qo'shasiz
};

// productId bo'yicha o'yin ichidan mahsulotni topish
function findProduct(productId) {
  for (const gameKey in GAMES) {
    const product = GAMES[gameKey].products[productId];
    if (product) return { gameKey, game: GAMES[gameKey], product };
  }
  return null;
}

function toUZS(priceUSD) {
  return Math.round(priceUSD * USD_TO_UZS);
}

// --- Foydalanuvchilar bazasi (oddiy JSON fayl) ---
let users = {};
if (fs.existsSync(DB_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    console.error("users.json o'qishda xato:", e.message);
    users = {};
  }
}

// Ketma-ket yozishlarni birlashtirib (debounce), diskka kamroq murojaat qilamiz
let saveTimer = null;
function saveUsers() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(users, null, 2), (err) => {
      if (err) console.error("Faylga yozishda xato:", err.message);
    });
  }, 200);
}

// Foydalanuvchini bazadan olish, mavjud bo'lmasa yaratish
function getUser(chatId) {
  if (!users[chatId]) {
    users[chatId] = { balance: 0, history: [] };
    saveUsers();
  }
  return users[chatId];
}

// --- Express API (WebApp yoki tashqi panel uchun) ---
app.get("/get-user/:id", (req, res) => {
  res.json(getUser(req.params.id));
});

// WebApp shu yerdan o'yinlar va narxlar ro'yxatini so'raydi (fetch qiladi)
app.get("/games", (req, res) => {
  const publicGames = {};
  for (const key in GAMES) {
    publicGames[key] = {
      title: GAMES[key].title,
      currency: GAMES[key].currency,
      products: Object.entries(GAMES[key].products).map(([id, p]) => ({
        id,
        name: p.name,
        priceUSD: p.priceUSD,
      })),
    };
  }
  res.json(publicGames);
});

app.get("/", (req, res) => res.send("BMA Premium Bot Serveri faol..."));
app.listen(PORT, () => console.log(`Server ${PORT} portda faol`));

// --- /start buyrug'i ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Do'st";
  const user = getUser(chatId);
  user.name = firstName;
  saveUsers();

  const welcomeMessage = `👋 <b>Salom, ${firstName}!</b>

🎮 <b>BMA Premium Shop</b> ga xush kelibsiz!
Bu yerda siz o'yinlar uchun donat qila olasiz va hisobingizni boshqarishingiz mumkin.

👇 <i>Do'konni ochish uchun pastdagi tugmani bosing!</i>`;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛍 Do'konni ochish", web_app: { url: SHOP_URL } }],
        [{ text: "💳 Balansni to'ldirish", callback_data: "pay_auto" }],
      ],
    },
  });
});

// --- /pay buyrug'i ---
bot.onText(/\/pay/, (msg) => sendInvoice(msg.chat.id));

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  if (query.data === "pay_auto") {
    sendInvoice(chatId);
  }
  bot.answerCallbackQuery(query.id).catch(() => {});
});

function sendInvoice(chatId) {
  if (!PROVIDER_TOKEN) {
    return bot.sendMessage(chatId, "Uzr, hozircha avtomatik to'lov tizimi o'chirilgan.");
  }
  bot
    .sendInvoice(
      chatId,
      "BMA-Gaming Balans",
      "Hisobingizni tezkor va xavfsiz tarzda 10,000 so'mga to'ldiring.",
      `topup_${chatId}_${Date.now()}`,
      PROVIDER_TOKEN,
      "UZS",
      [{ label: "Balansni to'ldirish", amount: 1000000 }] // 10,000 UZS (eng kichik pul birligida, *100)
    )
    .catch((err) => console.error("Invoice xatosi:", err.message));
}

bot.on("pre_checkout_query", (query) => {
  bot.answerPreCheckoutQuery(query.id, true).catch(() => {});
});

// --- To'lov muvaffaqiyatli bo'lganda ---
bot.on("successful_payment", (msg) => {
  const chatId = msg.chat.id;
  const amountPaid = msg.successful_payment.total_amount / 100;
  const user = getUser(chatId);

  user.balance = (Number(user.balance) || 0) + amountPaid;
  user.history.push({
    date: new Date().toLocaleString("uz-UZ"),
    amount: amountPaid,
    status: "Click/Payme orqali to'lov",
  });
  saveUsers();

  bot.sendMessage(
    chatId,
    `🎉 <b>Tabriklaymiz!</b>\n\n💳 Hisobingizga <b>${amountPaid.toLocaleString()} UZS</b> tushdi!\n💰 Balans: <b>${user.balance.toLocaleString()} UZS</b>`,
    { parse_mode: "HTML" }
  );
  bot
    .sendMessage(
      ADMIN_ID,
      `⚡️ <b>YANGI TO'LOV!</b>\n👤 <a href="tg://user?id=${chatId}">${msg.from.first_name}</a>\n💵 ${amountPaid.toLocaleString()} UZS`,
      { parse_mode: "HTML" }
    )
    .catch(() => {});
});

// --- WebApp'dan kelgan xarid ma'lumotlari ---
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!msg.web_app_data) return;

  let data;
  try {
    data = JSON.parse(msg.web_app_data.data);
  } catch (e) {
    console.error("web_app_data JSON xato:", e.message);
    return;
  }

  if (data.action !== "buy_item") return;

  // Narx va nom klientdan emas, serverdagi GAMES katalogidan olinadi.
  const found = findProduct(data.productId);
  if (!found) {
    bot.sendMessage(chatId, "Bunday mahsulot topilmadi.");
    return;
  }

  const { game, product } = found;
  const priceUZS = toUZS(product.priceUSD);

  const user = getUser(chatId);
  if (user.balance < priceUZS) {
    bot.sendMessage(
      chatId,
      "❌ <b>Xatolik!</b>\nHisobingizda mablag' yetarli emas.\nIltimos, /pay buyrug'i orqali balansni to'ldiring.",
      { parse_mode: "HTML" }
    );
    return;
  }

  user.balance -= priceUZS;
  user.history.push({
    date: new Date().toLocaleString("uz-UZ"),
    amount: -priceUZS,
    status: `Xarid: ${game.title} - ${product.name}`,
  });
  saveUsers();

  bot.sendMessage(
    chatId,
    `✅ <b>Xarid muvaffaqiyatli!</b>\n\n🎮 ${game.title}\n💎 <b>${product.name}</b>\n💵 $${product.priceUSD} (${priceUZS.toLocaleString()} UZS) hisobingizdan yechildi.`,
    { parse_mode: "HTML" }
  );
  bot
    .sendMessage(
      ADMIN_ID,
      `🛒 <b>YANGI XARID!</b>\n👤 User ID: ${chatId}\n🎮 ${game.title}\n📦 ${product.name}\n💵 $${product.priceUSD} (${priceUZS.toLocaleString()} UZS)`,
      { parse_mode: "HTML" }
    )
    .catch(() => {});
});

process.on("unhandledRejection", (err) => console.error("Unhandled Rejection:", err));
