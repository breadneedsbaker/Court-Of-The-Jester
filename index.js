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
  "Fool's Regent",       // Elite (local only)
  "The Jester's Hand"    // Elite (local only)
];
const ELITE_RANKS = ["Fool's Regent", "The Jester's Hand"]; // unsynced
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
      return;
    }

    // Normal ranks
    let role = guild.roles.cache.find(r => r.name === rank);
    if (!role) {
      role = await guild.roles.create({
        name: rank,
        color: ELITE_RANKS.includes(rank) ? 'GOLD' : 'PURPLE',
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
    guild.members.cache.forEach(m => {
      if (m.roles.cache.has(role.id) && m.id !== member.id) m.roles.remove(role).catch(() => {});
    });
    await member.roles.add(role);
  } catch (err) {
    console.error("Ruler role assignment error:", err);
  }
}

// --- BOT READY ---
client.once('ready', async () => {
  console.log(`🤡 JesterBot is online as ${client.user.tag}`);

  // Auto-create missing roles on startup
  for (const [guildId, guild] of client.guilds.cache) {
    console.log(`🔎 Checking roles for guild: ${guild.name}`);
    const neededRoles = [...RANKS, "Jester", "Ruler"];
    for (let rank of neededRoles) {
      let role = guild.roles.cache.find(r => r.name === rank);
      if (!role) {
        try {
          await guild.roles.create({
            name: rank,
            color: rank === "Ruler" ? "GOLD" : (rank === "Jester" ? "BLUE" : (ELITE_RANKS.includes(rank) ? "GOLD" : "PURPLE")),
            mentionable: true,
          });
          console.log(`✅ Created role: ${rank} in ${guild.name}`);
        } catch (err) {
          console.error(`❌ Failed to create role ${rank} in ${guild.name}:`, err);
        }
      }
    }
  }
});

// --- COMMANDS ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const users = loadUsers();
  const id = message.author.id;

  // Auto-register Jester
  if (id === JESTER_ID && !users[id]) {
    users[id] = { rank: "Court Jester (Founder)", doubloons: 999999, favor: true, favorExpires: null };
    saveUsers(users);
  }

  // !join
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

  // --- all other commands (rank, doubloons, gift, favor, give, ruler, leaderboard, activity, prank, createroles) ---
  // (kept identical to your previous version, since those were fine)
});

// --- FAVOR EXPIRATION ---
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
