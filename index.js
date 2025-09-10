require('dotenv').config();

if (!process.env.TOKEN) {
  console.error("❌ No TOKEN found! Did you set it in Railway Variables?");
  process.exit(1); // stop instead of crashing weirdly
}

const { Client, GatewayIntentBits } = require('discord.js');

console.log("✅ TOKEN Loaded. Starting bot...");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`🤡 JesterBot is online as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply('Pong! 🃏');
  }

  if (message.content === '!jester') {
    message.channel.send("🎭 The Jester has arrived!");
  }

  if (message.content === '!favor') {
    message.channel.send("👑 You have been granted the Jester's Favor!");
  }
});

// catch login errors instead of crashing
client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Failed to login:", err.message);
});
