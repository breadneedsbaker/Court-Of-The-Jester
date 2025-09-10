const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.once('ready', () => {
  console.log(`🤡 JesterBot is online!`);
});

client.on('messageCreate', message => {
  if (message.author.bot) return;

  if (message.content === '!jester') {
    message.channel.send("🎭 The Jester has arrived!");
  }

  if (message.content === '!favor') {
    message.channel.send("👑 You have been granted the Jester's Favor!");
  }
});

client.login(process.env.TOKEN);
