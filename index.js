// index.js — full, debug-ready, copy-paste
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

// --- quick env check ---
console.log('ENV CHECK -> TOKEN set?', !!process.env.TOKEN, 'OWNER_ID set?', !!process.env.OWNER_ID);

const USER_FILE = './users.json';
const MAX_ACTIVITY = 50;

const RANKS = [
  "Motley", "Trickster", "Prankmaster", "Harlequin",
  "Jester Knight", "Fool's Regent", "The Jester's Hand"
];
const ELITE_RANKS = ["Fool's Regent", "The Jester's Hand"]; // do not auto-sync

// --- rank colors ---
const RANK_COLORS = {
  "Motley": "#95a5a6",
  "Trickster": "#498753",
  "Prankmaster": "#e67e22",
  "Harlequin": "#e91e63",
  "Jester Knight": "#1abc9c",
  "Fool's Regent": "#3498db",
  "The Jester's Hand": "#f1c40f",
  "Jester": "#8e44ad",
  "Ruler": "#d35400",
  "Court Jester (Founder)": "#8e44ad"
};

const RANK_EMOJI = {
  "Motley":"😜","Trickster":"🎩","Prankmaster":"🤡","Harlequin":"🎭",
  "Jester Knight":"✨","Fool's Regent":"👑","The Jester's Hand":"🖐️",
  "Jester":"🃏","Ruler":"👑","Court Jester (Founder)":"🃏"
};

const RANK_THRESHOLDS = [0, 50, 150, 300, 500, 1000, 9999];
const JESTER_ID = process.env.OWNER_ID; // your Discord user id string

// --- storage helpers ---
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE, '{}');
  try {
    return JSON.parse(fs.readFileSync(USER_FILE));
  } catch (e) {
    console.error('[loadUsers] JSON parse error, resetting file.', e);
    fs.writeFileSync(USER_FILE,'{}');
    return {};
  }
}
function saveUsers(users) {
  fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
}

// --- rank helpers ---
function getRank(doubloons, id) {
  if (id === JESTER_ID) return "Court Jester (Founder)";
  for (let i = RANKS.length-1; i>=0; i--){
    if ((doubloons||0) >= RANK_THRESHOLDS[i]) return RANKS[i];
  }
  return "Motley";
}
function addActivity(users, text){
  if (!users.activity) users.activity = [];
  users.activity.unshift(text);
  if (users.activity.length > MAX_ACTIVITY) users.activity.pop();
}

// --- guild/member helpers ---
async function getGuildMember(guild, userId){
  if (!guild) return null;
  let member = guild.members.cache.get(userId);
  if (!member) {
    try { member = await guild.members.fetch(userId); }
    catch (e) { return null; }
  }
  return member;
}

// --- role setup (returns report array) ---
async function setupRoles(guild){
  const needed = [...RANKS, "Jester", "Ruler"];
  let results = [];
  for (let name of needed){
    if (!guild.roles.cache.some(r => r.name === name)){
      try {
        await guild.roles.create({
          name,
          color: RANK_COLORS[name] || "#95a5a6",
          mentionable: true
        });
        console.log(`[setupRoles] created '${name}' in ${guild.name}`);
        results.push(`✅ Created **${name}**`);
      } catch (err){
        console.error(`[setupRoles] failed to create '${name}' in ${guild.name}:`, err?.message || err);
        results.push(`❌ Failed to create **${name}** (${err?.message || err})`);
      }
    } else {
      results.push(`ℹ️ Role **${name}** already exists`);
    }
  }
  return results;
}

// --- assign / ruler functions ---
async function assignRole(member, rank){
  if (!member) return;
  try{
    // Jester special
    if (member.id === JESTER_ID){
      const jr = member.guild.roles.cache.find(r => r.name === 'Jester');
      if (jr) await member.roles.add(jr).catch(()=>{});
      return;
    }

    // Normal ranks
    let role = member.guild.roles.cache.find(r => r.name === rank);
    if (!role){
      role = await member.guild.roles.create({
        name: rank,
        color: RANK_COLORS[rank] || "#95a5a6",
        mentionable: true
      });
    }

    const oldRoles = RANKS.filter(r => r !== rank)
      .map(r => member.guild.roles.cache.find(rr => rr.name === r))
      .filter(Boolean);
    if (oldRoles.length) await member.roles.remove(oldRoles).catch(()=>{});
    await member.roles.add(role).catch(()=>{});
  } catch (err){
    console.error('[assignRole] error:', err?.message || err);
  }
}

async function assignRulerRole(member){
  if (!member) return;
  try{
    let role = member.guild.roles.cache.find(r => r.name === 'Ruler');
    if (!role){
      role = await member.guild.roles.create({ name: 'Ruler', color: RANK_COLORS["Ruler"], mentionable: true });
    }
    member.guild.members.cache.forEach(m => {
      if (m.roles.cache.has(role.id) && m.id !== member.id) m.roles.remove(role).catch(()=>{});
    });
    await member.roles.add(role);
  } catch (err){ console.error('[assignRulerRole]', err?.message || err); }
}

// --- ready ---
client.once('ready', async () => {
  console.log(`🤡 JesterBot online as ${client.user.tag}`);
  const users = loadUsers();

  for (const [gid, guild] of client.guilds.cache){
    try {
      const results = await setupRoles(guild);
      console.log(`[ready] setupRoles for ${guild.name}:`, results.join('; '));
    } catch(e){ console.error('[ready] setupRoles failed for', guild.name, e?.message || e); }

    // Auto-sync non-elite ranks
    try {
      let synced = 0;
      for (const uid of Object.keys(users)){
        if (ELITE_RANKS.includes(users[uid]?.rank)) continue;
        const member = await getGuildMember(guild, uid);
        if (member && users[uid] && users[uid].rank){
          await assignRole(member, users[uid].rank);
          synced++;
        }
      }
      console.log(`[ready] synced ${synced} member roles in ${guild.name}`);
    } catch (e) {
      console.error('[ready] sync failed for', guild.name, e?.message || e);
    }
  }
});

// --- guild join ---
client.on('guildCreate', async (guild) => {
  console.log(`🏰 Joined guild: ${guild.name} (${guild.id}) — making roles`);
  try {
    const results = await setupRoles(guild);
    console.log(`[guildCreate] setupRoles for ${guild.name}:`, results.join('; '));
  } catch(e){
    console.error('[guildCreate] setupRoles failed', e?.message || e);
  }
});

// --- message handler (commands) ---
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return message.channel.send('Please use commands in a server.');

    const users = loadUsers();
    const id = message.author.id;
    const raw = (message.content || '').trim();
    if (!raw) return;
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // ensure jester record exists
    if (id === JESTER_ID && !users[id]){
      users[id] = { rank: "Court Jester (Founder)", doubloons: 999999, favor: true, favorExpires: null };
      saveUsers(users);
    }

    const isPrivileged = id === JESTER_ID || message.member.roles.cache.some(r => r.name === 'Ruler');

    // --- !ping ---
    if (cmd === '!ping') return message.reply('Pong! 🃏');

    // --- !join ---
    if (cmd === '!join') {
      if (!users[id]) {
        users[id] = { rank: "Motley", doubloons: 10, favor: false, favorExpires: null };
        addActivity(users, `🎭 ${message.author.username} joined the Court!`);
        saveUsers(users);
        await assignRole(message.member, "Motley");
        return message.channel.send(`🎭 Welcome, ${message.author.username}! You are now a Motley.`);
      } else {
        return message.channel.send(`You are already in the Court, ${message.author.username}!`);
      }
    }

    // if not joined
    if (!users[id] && !isPrivileged) return message.channel.send("You must `!join` first to use Court commands.");

    // --- !rank ---
    if (cmd === '!rank') {
      const rank = getRank(users[id].doubloons, id);
      const emoji = RANK_EMOJI[rank] || "";
      return message.channel.send(`Your rank: ${emoji} **${rank}**`);
    }

    // --- !doubloons ---
    if (cmd === '!doubloons') {
      return message.channel.send(`You have 💰 **${users[id].doubloons} Doubloons**`);
    }

    // --- !leaderboard ---
    if (cmd === '!leaderboard') {
      const leaderboard = Object.entries(users)
        .filter(([k,v]) => k !== 'activity')
        .sort((a,b) => (b[1].doubloons||0) - (a[1].doubloons||0))
        .slice(0,10)
        .map(([k,v],i) => `${i+1}. ${getRank(v.doubloons,k)} ${RANK_EMOJI[getRank(v.doubloons,k)]||""} <@${k}> — 💰 ${v.doubloons||0}`);
      return message.channel.send("🏆 **Leaderboard**\n" + (leaderboard.length ? leaderboard.join('\n') : 'No users yet!'));
    }

    // --- !activity ---
    if (cmd === '!activity') {
      const act = (users.activity||[]).slice(0,10);
      return message.channel.send("📜 **Recent Court Activity**\n" + (act.length ? act.join('\n') : 'No activity yet.'));
    }

    // --- !createroles ---
    if (cmd === '!createroles' && isPrivileged) {
      const results = await setupRoles(message.guild);
      return message.channel.send("📜 **Role Creation Report**\n" + results.join("\n"));
    }

    // --- !ruler ---
    if (cmd === '!ruler' && id === JESTER_ID) {
      const mention = message.mentions.members.first();
      if (!mention) return message.channel.send("Usage: !ruler @user");
      await assignRulerRole(mention);
      addActivity(users, `👑 ${mention.user.username} was given the Ruler title!`);
      saveUsers(users);
      return message.channel.send(`👑 ${mention.user.username} is now the Ruler!`);
    }

    // (other commands like !gift, !favor, !give, !prank would follow here — trimmed for brevity)

  } catch (err){
    console.error('[messageCreate] error:', err?.stack || err);
    try { await message.channel.send("❌ An internal error occurred."); } catch(e){}
  }
});

// --- favor expiration ---
setInterval(() => {
  try {
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
  } catch(err){ console.error('[favor timer] error', err); }
}, 60000);

// --- login ---
if (!process.env.TOKEN || !process.env.OWNER_ID) {
  console.error('Missing TOKEN or OWNER_ID in env. Set them and restart.');
  process.exit(1);
}
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Login successful!'))
  .catch(err => console.error('❌ Login failed:', err));

      
