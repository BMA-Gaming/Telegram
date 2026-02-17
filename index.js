// index.js ichidagi bot.on('message') qismini shu mantiq bilan yangilang:

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Web App'dan buyurtma kelsa
    if (msg.web_app_data) {
        const data = JSON.parse(msg.web_app_data.data);
        users[chatId].currentOrder = data.item; // Qaysi xizmatni tanlaganini eslab qolamiz
        users[chatId].step = 'ask_address';
        return bot.sendMessage(chatId, `Siz **${data.item}** xizmatini tanladingiz. \n\nIltimos, manzilingizni yuboring (masalan: Toshkent sh, Chilonzor 5-mavze):`);
    }

    // Manzilni qabul qilish va Adminga yuborish
    if (users[chatId]?.step === 'ask_address') {
        const address = text;
        const user = users[chatId];
        
        // Adminga buyurtmani yuborish
        const adminMsg = `🆕 **YANGI BUYURTMA!**\n\n` +
                         `👤 Ism: ${user.name}\n` +
                         `📞 Tel: ${user.phone}\n` +
                         `📍 Manzil: ${address}\n` +
                         `🏗 Nima quriladi: ${user.currentOrder}`;

        await bot.sendMessage(ADMIN_ID, adminMsg); //
        
        users[chatId].step = null;
        saveDatabase();
        return bot.sendMessage(chatId, "Rahmat! Buyurtmangiz adminga yuborildi. Tez orada siz bilan bog'lanamiz. ✅");
    }

    // Start va Registratsiya kodingiz o'zgarmasdan qoladi...
});