const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const TOKEN = (process.env.TOKEN || "").trim();
const PROVIDER_TOKEN = (process.env.PROVIDER_TOKEN || "").trim();
const ADMIN_ID = Number(process.env.ADMIN_ID) || 6685828485;
const SHOP_URL = process.env.SHOP_URL || `http://localhost:${PORT}/`;
const CARD_NUMBER = process.env.CARD_NUMBER || "8600 1234 5678 9012";
const CARD_OWNER = process.env.CARD_OWNER || "B. M. A.";
const USD_TO_UZS = Number(process.env.USD_TO_UZS) || 12700;
const REF_BONUS = Number(process.env.REF_BONUS) || 2000; // referal uchun bonus (UZS)
const DB_FILE = path.join(__dirname, "db.json");

if (!TOKEN) {
  console.error("DIQQAT: TOKEN topilmadi! .env faylga TOKEN qo'shing.");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/* ==========================================================================
   1. KATALOG — narxlar FAQAT serverda. Klientdan kelgan narxga ishonilmaydi.
   ========================================================================== */
const GAMES = {
  pubgm: {
    title: "PUBG Mobile",
    currency: "UC",
    icon: "🔫",
    needField: "Player ID",
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
    icon: "⭐️",
    needField: "Supercell ID (email)",
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
    icon: "⚔️",
    needField: "User ID (Zone ID)",
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
    icon: "🔥",
    needField: "Player ID",
    products: {
      ff_100d: { name: "100 Diamonds", priceUSD: 0.99 },
      ff_310d: { name: "310 Diamonds", priceUSD: 2.99 },
      ff_520d: { name: "520 Diamonds", priceUSD: 4.99 },
      ff_1060d: { name: "1060 Diamonds", priceUSD: 9.99 },
    },
  },
  standoff: {
    title: "Standoff 2",
    currency: "Gold",
    icon: "🎯",
    needField: "Nickname",
    products: {
      so_100g: { name: "100 Gold", priceUSD: 0.99 },
      so_500g: { name: "500 Gold", priceUSD: 4.49 },
      so_1200g: { name: "1200 Gold", priceUSD: 9.99 },
    },
  },
  telegram: {
    title: "Telegram Premium",
    currency: "Obuna",
    icon: "💎",
    needField: "Username (@...)",
    products: {
      tg_3m: { name: "3 oylik", priceUSD: 12.99 },
      tg_6m: { name: "6 oylik", priceUSD: 19.99 },
      tg_12m: { name: "1 yillik", priceUSD: 32.99 },
    },
  },
};

const toUZS = (usd) => Math.round(usd * USD_TO_UZS);

function findProduct(productId) {
  for (const gameKey in GAMES) {
    const product = GAMES[gameKey].products[productId];
    if (product) return { gameKey, game: GAMES[gameKey], product };
  }
  return null;
}

/* ==========================================================================
   2. BAZA
   ========================================================================== */
let db = { users: {}, orders: [], topups: [], counter: 1000 };
if (fs.existsSync(DB_FILE)) {
  try {
    db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
  } catch (e) {
    console.error("db.json o'qishda xato:", e.message);
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), (err) => {
      if (err) console.error("Faylga yozishda xato:", err.message);
    });
  }, 200);
}

function getUser(id, tgUser = null) {
  id = String(id);
  if (!db.users[id]) {
    db.users[id] = {
      id,
      balance: 0,
      history: [],
      refBy: null,
      refCount: 0,
      banned: false,
      joinedAt: new Date().toISOString(),
    };
  }
  const u = db.users[id];
  if (tgUser) {
    u.name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
    u.username = tgUser.username || null;
    u.photo = tgUser.photo_url || u.photo || null;
  }
  save();
  return u;
}

function addHistory(user, amount, status) {
  user.history.unshift({ date: new Date().toISOString(), amount, status });
  if (user.history.length > 100) user.history.length = 100;
}

const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");

/* ==========================================================================
   3. TELEGRAM initData TEKSHIRUVI  ← 4-muammoning yechimi
   WebApp har bir so'rovda `initData` yuboradi. Biz uni bot tokeni bilan
   imzo (HMAC-SHA256) orqali tekshiramiz. Shundagina user haqiqiy hisoblanadi.
   ========================================================================== */
function verifyInitData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");

    const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
    const calc = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

    // timing-safe taqqoslash
    if (calc.length !== hash.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;

    // 24 soatdan eski initData qabul qilinmaydi (replay hujumidan himoya)
    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

    return JSON.parse(params.get("user") || "null");
  } catch (e) {
    return null;
  }
}

// Middleware: himoyalangan endpointlar uchun
function auth(req, res, next) {
  const initData = req.body.initData || req.get("X-Init-Data");
  const tgUser = verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ error: "Avtorizatsiya xatosi" });
  const user = getUser(tgUser.id, tgUser);
  if (user.banned) return res.status(403).json({ error: "Siz bloklangansiz" });
  req.tgUser = tgUser;
  req.user = user;
  next();
}

/* ==========================================================================
   4. API
   ========================================================================== */
app.get("/api/games", (req, res) => {
  const out = {};
  for (const key in GAMES) {
    const g = GAMES[key];
    out[key] = {
      key,
      title: g.title,
      currency: g.currency,
      icon: g.icon,
      needField: g.needField,
      products: Object.entries(g.products).map(([id, p]) => ({
        id,
        name: p.name,
        priceUSD: p.priceUSD,
        priceUZS: toUZS(p.priceUSD),
      })),
    };
  }
  res.json({ games: out, rate: USD_TO_UZS });
});

// Profil ma'lumotlari
app.post("/api/me", auth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    name: u.name,
    username: u.username,
    photo: req.tgUser.photo_url || null,
    balance: u.balance,
    refCount: u.refCount,
    refLink: `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?start=ref${u.id}`,
    isAdmin: Number(u.id) === ADMIN_ID,
    history: u.history.slice(0, 30),
    orders: db.orders.filter((o) => o.userId === u.id).slice(0, 20),
  });
});

// Buyurtma berish
app.post("/api/order", auth, (req, res) => {
  const { productId, playerId } = req.body;
  const found = findProduct(productId);
  if (!found) return res.status(400).json({ error: "Mahsulot topilmadi" });
  if (!playerId || String(playerId).trim().length < 3)
    return res.status(400).json({ error: "O'yin ID sini to'g'ri kiriting" });

  const { game, product, gameKey } = found;
  const price = toUZS(product.priceUSD);
  const u = req.user;

  if (u.balance < price)
    return res.status(400).json({ error: "Balans yetarli emas", need: price - u.balance });

  u.balance -= price;
  const order = {
    id: ++db.counter,
    userId: u.id,
    userName: u.name,
    gameKey,
    gameTitle: game.title,
    productName: product.name,
    price,
    playerId: String(playerId).trim().slice(0, 64),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.orders.unshift(order);
  addHistory(u, -price, `Buyurtma #${order.id}: ${game.title} — ${product.name}`);
  save();

  bot.sendMessage(
    ADMIN_ID,
    `🛒 <b>YANGI BUYURTMA #${order.id}</b>\n\n` +
      `👤 <a href="tg://user?id=${u.id}">${u.name || u.id}</a> (<code>${u.id}</code>)\n` +
      `🎮 ${game.title}\n📦 ${product.name}\n` +
      `🆔 <code>${order.playerId}</code>\n💵 ${fmt(price)} so'm`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Bajarildi", callback_data: `ord_done_${order.id}` },
            { text: "❌ Bekor + qaytarish", callback_data: `ord_cancel_${order.id}` },
          ],
        ],
      },
    }
  ).catch(() => {});

  res.json({ ok: true, order, balance: u.balance });
});

// Karta orqali to'ldirish arizasi (chek rasmi botga yuboriladi)
app.post("/api/topup-request", auth, (req, res) => {
  const amount = Math.round(Number(req.body.amount));
  if (!amount || amount < 5000 || amount > 10000000)
    return res.status(400).json({ error: "Summa 5 000 – 10 000 000 so'm oralig'ida" });

  const t = {
    id: ++db.counter,
    userId: req.user.id,
    amount,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.topups.unshift(t);
  save();

  bot.sendMessage(
    req.user.id,
    `💳 <b>To'lov #${t.id}</b>\n\n` +
      `Summa: <b>${fmt(amount)} so'm</b>\n` +
      `Karta: <code>${CARD_NUMBER}</code>\n` +
      `Egasi: ${CARD_OWNER}\n\n` +
      `To'lovni amalga oshiring va <b>chek rasmini shu yerga yuboring</b>. ` +
      `Admin tasdiqlagach balansingiz to'ldiriladi.`,
    { parse_mode: "HTML" }
  ).catch(() => {});

  res.json({ ok: true, topup: t, card: CARD_NUMBER, owner: CARD_OWNER });
});

/* ---- Admin API ---- */
function adminOnly(req, res, next) {
  if (Number(req.user.id) !== ADMIN_ID) return res.status(403).json({ error: "Ruxsat yo'q" });
  next();
}

app.post("/api/admin/stats", auth, adminOnly, (req, res) => {
  const users = Object.values(db.users);
  const today = new Date().toDateString();
  res.json({
    totalUsers: users.length,
    newToday: users.filter((u) => new Date(u.joinedAt).toDateString() === today).length,
    totalBalance: users.reduce((s, u) => s + (u.balance || 0), 0),
    orders: db.orders.length,
    pendingOrders: db.orders.filter((o) => o.status === "pending").length,
    revenue: db.orders.filter((o) => o.status === "done").reduce((s, o) => s + o.price, 0),
    recentOrders: db.orders.slice(0, 25),
    topUsers: users.sort((a, b) => b.balance - a.balance).slice(0, 10)
      .map((u) => ({ id: u.id, name: u.name, balance: u.balance })),
  });
});

app.post("/api/admin/balance", auth, adminOnly, (req, res) => {
  const { userId, amount, note } = req.body;
  const target = db.users[String(userId)];
  if (!target) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  const amt = Math.round(Number(amount));
  if (!amt) return res.status(400).json({ error: "Summa noto'g'ri" });

  target.balance += amt;
  addHistory(target, amt, note || (amt > 0 ? "Admin tomonidan to'ldirildi" : "Admin tomonidan yechildi"));
  save();
  bot.sendMessage(
    target.id,
    `${amt > 0 ? "➕" : "➖"} Balansingiz ${amt > 0 ? "to'ldirildi" : "o'zgartirildi"}: <b>${fmt(amt)} so'm</b>\n💰 Joriy balans: <b>${fmt(target.balance)} so'm</b>`,
    { parse_mode: "HTML" }
  ).catch(() => {});
  res.json({ ok: true, balance: target.balance });
});

app.post("/api/admin/broadcast", auth, adminOnly, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Matn bo'sh" });
  res.json({ ok: true, queued: Object.keys(db.users).length });

  let sent = 0;
  for (const id of Object.keys(db.users)) {
    try {
      await bot.sendMessage(id, text, { parse_mode: "HTML" });
      sent++;
    } catch (e) { /* bloklagan userlar */ }
    await new Promise((r) => setTimeout(r, 40)); // limitga tushmaslik uchun
  }
  bot.sendMessage(ADMIN_ID, `📣 Xabar yuborildi: ${sent} ta foydalanuvchi`).catch(() => {});
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Server ${PORT} portda faol → ${SHOP_URL}`));

/* ==========================================================================
   5. BOT
   ========================================================================== */
const mainKeyboard = {
  inline_keyboard: [
    [{ text: "🛍 Do'konni ochish", web_app: { url: SHOP_URL } }],
    [
      { text: "💰 Balans", callback_data: "balance" },
      { text: "💳 To'ldirish", callback_data: "topup" },
    ],
    [
      { text: "👥 Referal", callback_data: "ref" },
      { text: "☎️ Yordam", callback_data: "help" },
    ],
  ],
};

bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId, msg.from);

  // Referal
  const payload = match && match[1] ? match[1].trim() : "";
  if (payload.startsWith("ref") && !user.refBy) {
    const refId = payload.slice(3);
    if (refId !== String(chatId) && db.users[refId]) {
      user.refBy = refId;
      const inviter = db.users[refId];
      inviter.refCount++;
      inviter.balance += REF_BONUS;
      addHistory(inviter, REF_BONUS, "Referal bonusi");
      save();
      bot.sendMessage(
        refId,
        `🎁 Sizning havolangiz orqali yangi foydalanuvchi qo'shildi!\n+${fmt(REF_BONUS)} so'm bonus.`
      ).catch(() => {});
    }
  }

  bot.sendMessage(
    chatId,
    `👋 <b>Salom, ${user.name || "do'st"}!</b>\n\n` +
      `🎮 <b>BMA Premium Shop</b> — o'yinlar uchun eng tez donat xizmati.\n\n` +
      `💰 Balans: <b>${fmt(user.balance)} so'm</b>\n\n` +
      `👇 Boshlash uchun do'konni oching:`,
    { parse_mode: "HTML", reply_markup: mainKeyboard }
  );
});

bot.onText(/\/balans|\/balance/, (msg) => {
  const u = getUser(msg.chat.id, msg.from);
  bot.sendMessage(msg.chat.id, `💰 Balansingiz: <b>${fmt(u.balance)} so'm</b>`, { parse_mode: "HTML" });
});

bot.onText(/\/admin/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const users = Object.values(db.users);
  bot.sendMessage(
    ADMIN_ID,
    `🔐 <b>ADMIN PANEL</b>\n\n` +
      `👥 Foydalanuvchilar: <b>${users.length}</b>\n` +
      `🛒 Buyurtmalar: <b>${db.orders.length}</b> (kutilmoqda: ${db.orders.filter((o) => o.status === "pending").length})\n` +
      `💰 Umumiy balans: <b>${fmt(users.reduce((s, u) => s + u.balance, 0))} so'm</b>\n` +
      `💵 Tushum: <b>${fmt(db.orders.filter((o) => o.status === "done").reduce((s, o) => s + o.price, 0))} so'm</b>\n\n` +
      `<b>Buyruqlar:</b>\n` +
      `<code>/give USER_ID SUMMA</code> — balans qo'shish\n` +
      `<code>/ban USER_ID</code> · <code>/unban USER_ID</code>\n` +
      `<code>/send matn</code> — hammaga xabar\n` +
      `<code>/orders</code> — kutilayotgan buyurtmalar`,
    { parse_mode: "HTML" }
  );
});

bot.onText(/\/give (\d+) (-?\d+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const target = getUser(match[1]);
  const amt = Number(match[2]);
  target.balance += amt;
  addHistory(target, amt, "Admin tomonidan o'zgartirildi");
  save();
  bot.sendMessage(ADMIN_ID, `✅ ${match[1]} → ${fmt(amt)} so'm. Yangi balans: ${fmt(target.balance)}`);
  bot.sendMessage(match[1], `💰 Balansingiz o'zgardi: <b>${fmt(amt)} so'm</b>\nJoriy: <b>${fmt(target.balance)} so'm</b>`, { parse_mode: "HTML" }).catch(() => {});
});

bot.onText(/\/(ban|unban) (\d+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const target = getUser(match[2]);
  target.banned = match[1] === "ban";
  save();
  bot.sendMessage(ADMIN_ID, `${target.banned ? "🚫 Bloklandi" : "✅ Blokdan chiqarildi"}: ${match[2]}`);
});

bot.onText(/\/orders/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const pending = db.orders.filter((o) => o.status === "pending").slice(0, 10);
  if (!pending.length) return bot.sendMessage(ADMIN_ID, "✅ Kutilayotgan buyurtma yo'q.");
  pending.forEach((o) => {
    bot.sendMessage(
      ADMIN_ID,
      `🛒 <b>#${o.id}</b>\n👤 <code>${o.userId}</code>\n🎮 ${o.gameTitle} — ${o.productName}\n🆔 <code>${o.playerId}</code>\n💵 ${fmt(o.price)} so'm`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Bajarildi", callback_data: `ord_done_${o.id}` },
            { text: "❌ Bekor", callback_data: `ord_cancel_${o.id}` },
          ]],
        },
      }
    );
  });
});

bot.onText(/\/send ([\s\S]+)/, async (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  let sent = 0;
  for (const id of Object.keys(db.users)) {
    try { await bot.sendMessage(id, match[1], { parse_mode: "HTML" }); sent++; } catch (e) {}
    await new Promise((r) => setTimeout(r, 40));
  }
  bot.sendMessage(ADMIN_ID, `📣 Yuborildi: ${sent} ta`);
});

/* --- Callback tugmalar --- */
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data || "";
  const answer = (text) => bot.answerCallbackQuery(q.id, { text }).catch(() => {});

  if (data === "balance") {
    const u = getUser(chatId, q.from);
    await bot.sendMessage(chatId, `💰 Balans: <b>${fmt(u.balance)} so'm</b>`, { parse_mode: "HTML" });
  } else if (data === "topup") {
    await bot.sendMessage(
      chatId,
      `💳 <b>Balansni to'ldirish</b>\n\n` +
        `1️⃣ Karta orqali:\n<code>${CARD_NUMBER}</code>\n${CARD_OWNER}\n` +
        `To'lovdan so'ng chek rasmini shu yerga yuboring.\n\n` +
        (PROVIDER_TOKEN ? `2️⃣ Yoki avtomatik to'lov: /pay` : ""),
      { parse_mode: "HTML" }
    );
  } else if (data === "ref") {
    const u = getUser(chatId, q.from);
    await bot.sendMessage(
      chatId,
      `👥 <b>Referal dastur</b>\n\nHar bir taklif qilingan do'st uchun <b>${fmt(REF_BONUS)} so'm</b>!\n\n` +
        `🔗 <code>https://t.me/${process.env.BOT_USERNAME || "your_bot"}?start=ref${chatId}</code>\n\n` +
        `👤 Takliflar: <b>${u.refCount}</b>`,
      { parse_mode: "HTML" }
    );
  } else if (data === "help") {
    await bot.sendMessage(chatId, `☎️ Savollar bo'lsa admin: <a href="tg://user?id=${ADMIN_ID}">yozing</a>`, { parse_mode: "HTML" });
  } else if (data.startsWith("ord_")) {
    if (chatId !== ADMIN_ID) return answer("Ruxsat yo'q");
    const [, act, idStr] = data.split("_");
    const order = db.orders.find((o) => o.id === Number(idStr));
    if (!order) return answer("Topilmadi");
    if (order.status !== "pending") return answer("Allaqachon yakunlangan");

    if (act === "done") {
      order.status = "done";
      bot.sendMessage(order.userId, `✅ <b>Buyurtma #${order.id} bajarildi!</b>\n\n🎮 ${order.gameTitle}\n📦 ${order.productName}\n\nO'yinni tekshiring. Rahmat! 🎉`, { parse_mode: "HTML" }).catch(() => {});
    } else {
      order.status = "cancelled";
      const u = getUser(order.userId);
      u.balance += order.price;
      addHistory(u, order.price, `Buyurtma #${order.id} bekor qilindi — qaytarildi`);
      bot.sendMessage(order.userId, `❌ <b>Buyurtma #${order.id} bekor qilindi.</b>\n\n💰 ${fmt(order.price)} so'm balansingizga qaytarildi.`, { parse_mode: "HTML" }).catch(() => {});
    }
    save();
    answer(act === "done" ? "Bajarildi ✅" : "Bekor qilindi");
    bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: act === "done" ? "✅ Bajarilgan" : "❌ Bekor qilingan", callback_data: "noop" }]] },
      { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
    return;
  } else if (data.startsWith("tp_")) {
    if (chatId !== ADMIN_ID) return answer("Ruxsat yo'q");
    const [, act, uid, amtStr] = data.split("_");
    const u = getUser(uid);
    if (act === "ok") {
      const amt = Number(amtStr);
      u.balance += amt;
      addHistory(u, amt, "Karta orqali to'ldirish (tasdiqlandi)");
      save();
      bot.sendMessage(uid, `🎉 <b>To'lov tasdiqlandi!</b>\n\n➕ ${fmt(amt)} so'm\n💰 Balans: <b>${fmt(u.balance)} so'm</b>`, { parse_mode: "HTML" }).catch(() => {});
      answer("Tasdiqlandi ✅");
    } else {
      bot.sendMessage(uid, `❌ To'lov tasdiqlanmadi. Iltimos admin bilan bog'laning.`).catch(() => {});
      answer("Rad etildi");
    }
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
    return;
  }
  answer();
});

/* --- Chek rasmi (karta to'lovi) --- */
bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  if (chatId === ADMIN_ID) return;
  const u = getUser(chatId, msg.from);
  const pending = db.topups.find((t) => t.userId === u.id && t.status === "pending");
  const amount = pending ? pending.amount : 0;

  bot.sendMessage(chatId, "📨 Chek qabul qilindi. Admin tekshirgach xabar beramiz (odatda 5–15 daqiqa).");
  bot.forwardMessage(ADMIN_ID, chatId, msg.message_id).catch(() => {});
  bot.sendMessage(
    ADMIN_ID,
    `💳 <b>TO'LOV CHEKI</b>\n👤 <a href="tg://user?id=${u.id}">${u.name || u.id}</a> (<code>${u.id}</code>)\n` +
      `💵 So'ralgan summa: <b>${amount ? fmt(amount) + " so'm" : "ko'rsatilmagan"}</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: `✅ Tasdiqlash (${fmt(amount)})`, callback_data: `tp_ok_${u.id}_${amount}` },
          { text: "❌ Rad etish", callback_data: `tp_no_${u.id}_0` },
        ]],
      },
    }
  ).catch(() => {});
  if (pending) { pending.status = "sent"; save(); }
});

/* --- Telegram Payments (ixtiyoriy) --- */
bot.onText(/\/pay(?:\s+(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!PROVIDER_TOKEN) return bot.sendMessage(chatId, "Avtomatik to'lov hozircha o'chirilgan. /topup dan foydalaning.");
  const amount = Math.max(5000, Number(match[1]) || 10000);
  bot.sendInvoice(chatId, "BMA Gaming — Balans", `Hisobingizni ${fmt(amount)} so'mga to'ldirish`,
    `topup_${chatId}_${Date.now()}`, PROVIDER_TOKEN, "UZS",
    [{ label: "Balansni to'ldirish", amount: amount * 100 }]
  ).catch((e) => console.error("Invoice xatosi:", e.message));
});

bot.on("pre_checkout_query", (q) => bot.answerPreCheckoutQuery(q.id, true).catch(() => {}));

bot.on("successful_payment", (msg) => {
  const chatId = msg.chat.id;
  const amount = msg.successful_payment.total_amount / 100;
  const u = getUser(chatId, msg.from);
  u.balance += amount;
  addHistory(u, amount, "Onlayn to'lov");
  save();
  bot.sendMessage(chatId, `🎉 <b>Tabriklaymiz!</b>\n\n➕ ${fmt(amount)} so'm\n💰 Balans: <b>${fmt(u.balance)} so'm</b>`, { parse_mode: "HTML" });
  bot.sendMessage(ADMIN_ID, `⚡️ <b>YANGI TO'LOV</b>\n👤 <code>${chatId}</code>\n💵 ${fmt(amount)} so'm`, { parse_mode: "HTML" }).catch(() => {});
});

process.on("unhandledRejection", (err) => console.error("Unhandled Rejection:", err));
