require('dotenv').config();
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
const MAX_ACTIVITY = 50;
const RANKS = [
  "Motley",
  "Trickster",
  "Prankmaster",
  "Harlequin",
  "Jester Knight",
  "Fool's Regent",
  "The Jester's Hand"
];
const RANK_EMOJI = {
  "Motley": "🃏",
  "Trickster": "🎩",
  "Prankmaster": "🤡",
  "Harlequin": "🎭",
  "Jester Knight": "👑",
  "Fool's Regent": "🏰",
  "The Jester's Hand": "✨"
};
const RANK_THRESHOLDS = [0, 50, 150, 300, 500, 1000, 9999];
const JESTER_ID = process.env.OWNER_ID; // <- eternal Jester (you)

// --- UTILITIES ---
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE, '{}');
  return JSON.parse(fs.readFileSync(USER_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
}

function getRank(doubloons, id) {
  if (id === JESTER_ID) return "Court Jester (Founder)";
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (doubloons >= RANK_THRESHOLDS[i]) return RANKS[i];
  }
  return "Motley";
}

function addActivity(users, text) {
  if (!users.activity) users.activity = [];
  users.activity.unshift(text);
  if (users.activity.length > MAX_ACTIVITY) users.activity.pop();
}

// --- ROLE MANAGEMENT ---
async function assignRole(member, rank) {
  if (!member) return;
  try {
    const guild = member.guild;

    // Jester special role
    if (member.id === JESTER_ID) {
      let jesterRole = guild.roles.cache.find(r => r.name === "Jester");
      if (!jesterRole) {
        jesterRole = await guild.roles.create({
          name: "Jester",
          color: 'BLUE',
          mentionable: true
        });
      }
      await member.roles.add(jesterRole).catch(() => {});
      return; // don't assign normal ranks
    }

    // Normal rank system
    let role = guild.roles.cache.find(r => r.name === rank);
    if (!role) {
      role = await guild.roles.create({
        name: rank,
        color: 'PURPLE',
        mentionable: true
      });
    }
    const oldRanks = RANKS.filter(r => r !== rank)
      .map(r => guild.roles.cache.find(role => role.name === r))
      .filter(Boolean);
    await member.roles.remove(oldRanks).catch(() => {});
    await member.roles.add(role).catch(() => {});
  } catch (err) {
    console.error("Role assignment error:", err);
  }
}

async function assignRulerRole(member) {
  if (!member) return;
  try {
    const guild = member.guild;
    let role = guild.roles.cache.find(r => r.name === 'Ruler');
    if (!role) {
      role = await guild.roles.create({
        name: 'Ruler',
        color: 'GOLD',
        mentionable: true
      });
    }
    // Remove old Ruler
    guild.members.cache.forEach(m => {
      if (m.roles.cache.has(role.id) && m.id !== member.id) m.roles.remove(role).catch(() => {});
    });
    await member.roles.add(role);
  } catch (err) {
    console.error("Ruler role assignment error:", err);
  }
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

  // Ensure Jester always exists in file
  if (id === JESTER_ID && !users[id]) {
    users[id] = { rank: "Court Jester (Founder)", doubloons: 999999, favor: true, favorExpires: null };
    saveUsers(users);
  }

  // --- JOIN ---
  if (message.content === '!join') {
    if (!users[id]) {
      users[id] = { rank: "Motley", doubloons: 10, favor: false, favorExpires: null };
      addActivity(users, `🎭 ${message.author.username} joined the Court!`);
      saveUsers(users);
      await assignRole(message.member, "Motley");
      return message.channel.send(`🎭 Welcome to the Jester's Court, ${message.author.username}! You are now a Motley. 🃏`);
    } else {
      return message.channel.send(`You are already in the Court, ${message.author.username}!`);
    }
  }

  // --- CHECK RANK ---
  if (message.content === '!rank') {
    if (!users[id]) return message.channel.send("You must !join first.");
    const rank = getRank(users[id].doubloons, id);
    const emoji = RANK_EMOJI[rank] || (id === JESTER_ID ? "🤡" : "");
    return message.channel.send(`Your rank: ${emoji} **${rank}**`);
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
    if (users[id].doubloons < amount && id !== JESTER_ID) return message.channel.send("You don't have enough Doubloons.");

    if (id !== JESTER_ID) users[id].doubloons -= amount;
    users[mention.id].doubloons += amount;
    users[mention.id].rank = getRank(users[mention.id].doubloons, mention.id);
    users[id].rank = getRank(users[id].doubloons, id);
    addActivity(users, `💰 ${message.author.username} gifted ${amount} Doubloons to ${mention.username}!`);

    saveUsers(users);
    await assignRole(message.member, users[id].rank);
    await assignRole(message.guild.members.cache.get(mention.id), users[mention.id].rank);

    return message.channel.send(`${message.author.username} gifted 💰 **${amount} Doubloons** to ${mention.username}!`);
  }

  // --- FAVOR ---
  if (message.content.startsWith('!favor')) {
    const canGiveFavor = id === JESTER_ID ||
      (message.guild.members.cache.get(id)?.roles.cache.some(r => r.name === 'Ruler'));
    if (!canGiveFavor) return;
    const args = message.content.split(' ');
    if (args.length < 3) return message.channel.send("Usage: !favor @user durationInHours");

    const mention = message.mentions.users.first();
    const hours = parseInt(args[2]);
    if (!mention || isNaN(hours)) return message.channel.send("Invalid user or duration.");
    if (!users[mention.id]) return message.channel.send("This user is not in the Court.");

    users[mention.id].favor = true;
    users[mention.id].favorExpires = Date.now() + hours * 3600000;
    addActivity(users, `👑 Favor given to ${mention.username} for ${hours} hours!`);

    saveUsers(users);
    return message.channel.send(`👑 Favor bestowed upon ${mention.username} for **${hours} hours**!`);
  }

  // --- OWNER / RULER CREATIVE MODE ---
  const isPrivileged = id === JESTER_ID ||
    (message.guild.members.cache.get(id)?.roles.cache.some(r => r.name === 'Ruler'));

  if (isPrivileged && message.content.startsWith('!give')) {
    const args = message.content.split(' ');
    const mention = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!mention || isNaN(amount)) return message.channel.send("Usage: !give @user amount");
    if (!users[mention.id]) users[mention.id] = { rank: "Motley", doubloons: 0, favor: false, favorExpires: null };

    users[mention.id].doubloons += amount;
    users[mention.id].rank = getRank(users[mention.id].doubloons, mention.id);
    addActivity(users, `✨ ${message.author.username} gave ${amount} Doubloons to ${mention.username}!`);

    saveUsers(users);
    await assignRole(message.guild.members.cache.get(mention.id), users[mention.id].rank);
    return message.channel.send(`✨ Gave 💰 **${amount} Doubloons** to ${mention.username}!`);
  }

  // --- RULER ASSIGNMENT (JESTER ONLY) ---
  if (id === JESTER_ID && message.content.startsWith('!ruler')) {
    const mention = message.mentions.members.first();
    if (!mention) return message.channel.send("Usage: !ruler @user");
    await assignRulerRole(mention);
    addActivity(users, `👑 ${mention.user.username} was given the Ruler title!`);
    saveUsers(users);
    return message.channel.send(`👑 ${mention.user.username} is now the Ruler of this server!`);
  }

  // --- LEADERBOARD ---
  if (message.content === '!leaderboard') {
    const leaderboard = Object.entries(users)
      .filter(([k,v]) => k !== 'activity')
      .sort((a,b) => b[1].doubloons - a[1].doubloons)
      .slice(0, 10)
      .map(([k,v], i) => {
        const rank = getRank(v.doubloons, k);
        return `${i+1}. ${rank} ${RANK_EMOJI[rank] || ""} <@${k}> — 💰 ${v.doubloons}`;
      });
    if (!leaderboard.length) return message.channel.send("No users yet!");
    return message.channel.send("🏆 **Leaderboard**\n" + leaderboard.join('\n'));
  }

  // --- ACTIVITY FEED ---
  if (message.content === '!activity') {
    const act = users.activity || [];
    if (!act.length) return message.channel.send("No activity yet.");
    return message.channel.send("📜 **Recent Court Activity**\n" + act.slice(0, 10).join('\n'));
  }

  // --- PRANK EVENT ---
  if (isPrivileged && message.content.startsWith('!prank')) {
    const args = message.content.split(' ');
    const mention = message.mentions.users.first();
    const amount = parseInt(args[2]) || 10;
    if (!mention) return message.channel.send("Usage: !prank @user amount");
    if (!users[mention.id]) return message.channel.send("User not found!");

    users[mention.id].doubloons = Math.max(0, users[mention.id].doubloons - amount);
    users[mention.id].rank = getRank(users[mention.id].doubloons, mention.id);
    addActivity(users, `😈 ${mention.username} got pranked and lost ${amount} Doubloons!`);

    saveUsers(users);
    await assignRole(message.guild.members.cache.get(mention.id), users[mention.id].rank);
    return message.channel.send(`😈 ${mention.username} got pranked and lost ${amount} Doubloons!`);
  }

  // --- CREATE ROLES (NEW COMMAND) ---
  if (isPrivileged && message.content === '!createroles') {
    for (const rank of RANKS) {
      let role = message.guild.roles.cache.find(r => r.name === rank);
      if (!role) {
        await message.guild.roles.create({
          name: rank,
          color: 'PURPLE',
          mentionable: true
        });
      }
    }
    // Ensure Jester role exists
    let jesterRole = message.guild.roles.cache.find(r => r.name === "Jester");
    if (!jesterRole) {
      await message.guild.roles.create({
        name: "Jester",
        color: 'BLUE',
        mentionable: true
      });
    }
    // Ensure Ruler role exists
    let rulerRole = message.guild.roles.cache.find(r => r.name === "Ruler");
    if (!rulerRole) {
      await message.guild.roles.create({
        name: "Ruler",
        color: 'GOLD',
        mentionable: true
      });
    }
    return message.channel.send("✅ All rank roles, Jester, and Ruler have been created (if missing)!");
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
      addActivity(users, `⏰ Favor expired for <@${id}>`);
      changed = true;
    }
  }
  if (changed) saveUsers(users);
}, 60000);

// --- LOGIN ---
if (!process.env.TOKEN || !process.env.OWNER_ID) {
  console.error("❌ Discord token or owner ID missing! Set TOKEN and OWNER_ID in environment variables.");
  process.exit(1);
}

client.login(process.env.TOKEN)
  .then(() => console.log("✅ Login successful!"))
  .catch(err => console.error("❌ Failed to login:", err));
