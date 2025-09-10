require('dotenv').config(); // Load environment variables from .env

const { Client, GatewayIntentBits } = require('discord.js');

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Log when the bot is ready
client.once('ready', () => {
  console.log(`🤡 JesterBot is online as ${client.user.tag}`);
});

// Listen for messages
client.on('messageCreate', (message) => {
  if (message.author.bot) return; // Ignore bot messages

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

// Login the bot
if (!process.env.TOKEN) {
  console.error("❌ Discord token is missing! Set TOKEN in environment variables.");
  process.exit(1);
}

client.login(process.env.TOKEN)
  .then(() => console.log("✅ Login successful!"))
  .catch(err => console.error("❌ Failed to login:", err));
