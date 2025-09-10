require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

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

