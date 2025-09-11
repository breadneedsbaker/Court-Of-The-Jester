require('dotenv').config(); // Load environment variables
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- CONFIG ---
const USER_FILE = './users.json';
const RANKS = [
  "Motley",
  "Trickster",
  "Prankmaster",
  "Harlequin",
  "Jester Knight",
  "Fool's Regent",
  "The Jester's Hand"
];
const RANK_THRESHOLDS = [0, 50, 150, 300, 500, 1000, 9999]; // Doubloons required per rank

// --- UTILITIES ---
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE, '{}');
  return JSON.parse(fs.readFileSync(USER_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
}

function getRank(doubloons) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (doubloons >= RANK_THRESHOLDS[i]) return RANKS[i];
  }
  return "Motley";
}

// --- BOT READY ---
client.once('ready', () => {
  console.log(`🤡 JesterBot is online as ${client.user.tag}`);
});

// --- COMMANDS ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const users = loadUsers();
  const id = message.author.id;

  // --- JOIN ---
  if (message.content === '!join') {
    if (!users[id]) {
      users[id] = { rank: "Motley", doubloons: 10, favor: false, favorExpires: null };
      saveUsers(users);
      return message.channel.send(`🎭 Welcome to the Jester's Court, ${message.author.username}! You are now a Motley. 🃏`);
    } else {
      return message.channel.send(`You are already in the Court, ${message.author.username}!`);
    }
  }

  // --- CHECK RANK ---
  if (message.content === '!rank') {
    if (!users[id]) return message.channel.send("You must !join first.");
    return message.channel.send(`Your rank: **${users[id].rank}**`);
  }

  // --- CHECK DOUBLOONS ---
  if (message.content === '!doubloons') {
    if (!users[id]) return message.channel.send("You must !join first.");
    return message.channel.send(`You have 💰 **${users[id].doubloons} Doubloons**`);
  }

  // --- GIFT ---
  if (message.content.startsWith('!gift')) {
    if (!users[id]) return message.channel.send("You must !join first.");
    const args = message.content.split(' ');
    if (args.length < 3) return message.channel.send("Usage: !gift @user amount");

    const mention = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!mention) return message.channel.send("Mention a valid user to gift.");
    if (isNaN(amount) || amount <= 0) return message.channel.send("Invalid amount.");
    if (!users[mention.id]) return message.channel.send("This user is not in the Court.");
    if (users[id].doubloons < amount) return message.channel.send("You don't have enough Doubloons.");

    users[id].doubloons -= amount;
    users[mention.id].doubloons += amount;

    // Update rank if needed
    users[mention.id].rank = getRank(users[mention.id].doubloons);
    users[id].rank = getRank(users[id].doubloons);

    saveUsers(users);
    return message.channel.send(`${message.author.username} gifted 💰 **${amount} Doubloons** to ${mention.username}!`);
  }

  // --- FAVOR (ONLY ME) ---
  if (message.content.startsWith('!favor')) {
    if (message.author.id !== process.env.1310082359693152338) return;
    const args = message.content.split(' ');
    if (args.length < 3) return message.channel.send("Usage: !favor @user durationInHours");

    const mention = message.mentions.users.first();
    const hours = parseInt(args[2]);
    if (!mention || isNaN(hours)) return message.channel.send("Invalid user or duration.");
    if (!users[mention.id]) return message.channel.send("This user is not in the Court.");

    users[mention.id].favor = true;
    users[mention.id].favorExpires = Date.now() + hours * 3600000;
    saveUsers(users);

    return message.channel.send(`👑 The Jester bestowed their Favor upon ${mention.username} for **${hours} hours**!`);
  }
});

// --- FAVOR EXPIRATION CHECK ---
setInterval(() => {
  const users = loadUsers();
  let changed = false;
  for (let id in users) {
    if (users[id].favor && users[id].favorExpires && Date.now() > users[id].favorExpires) {
      users[id].favor = false;
      users[id].favorExpires = null;
      changed = true;
    }
  }
  if (changed) saveUsers(users);
}, 60000); // every minute

// --- LOGIN ---
if (!process.env.TOKEN || !process.env.OWNER_ID) {
  console.error("❌ Discord token or owner ID missing! Set TOKEN and OWNER_ID in environment variables.");
  process.exit(1);
}

client.login(process.env.TOKEN)
  .then(() => console.log("✅ Login successful!"))
  .catch(err => console.error("❌ Failed to login:", err));

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

