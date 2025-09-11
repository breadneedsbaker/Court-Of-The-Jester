// index.js — debug-ready copy-paste
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
  "Motley","Trickster","Prankmaster","Harlequin","Jester Knight",
  "Fool's Regent","The Jester's Hand"
];
const ELITE_RANKS = ["Fool's Regent","The Jester's Hand"];
const RANK_EMOJI = {
  "Motley":"🃏","Trickster":"🎩","Prankmaster":"🤡","Harlequin":"🎭",
  "Jester Knight":"👑","Fool's Regent":"🏰","The Jester's Hand":"✨",
  "Court Jester (Founder)":"🤡"
};
const RANK_THRESHOLDS = [0,50,150,300,500,1000,9999];
const JESTER_ID = process.env.OWNER_ID; // your Discord user id string

function loadUsers(){
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE,'{}');
  return JSON.parse(fs.readFileSync(USER_FILE));
}
function saveUsers(users){
  fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
}
function getRank(doubloons, id){
  if (id === JESTER_ID) return "Court Jester (Founder)";
  for (let i = RANKS.length-1; i>=0; i--){
    if (doubloons >= RANK_THRESHOLDS[i]) return RANKS[i];
  }
  return "Motley";
}
function addActivity(users, text){
  if (!users.activity) users.activity = [];
  users.activity.unshift(text);
  if (users.activity.length > MAX_ACTIVITY) users.activity.pop();
}

// create roles helper
async function setupRoles(guild){
  const needed = [...RANKS, "Jester", "Ruler"];
  for (let name of needed){
    if (!guild.roles.cache.some(r => r.name === name)){
      try {
        await guild.roles.create({
          name,
          color: name === "Jester" ? 'BLUE' : name === "Ruler" ? 'GOLD' : (ELITE_RANKS.includes(name) ? 'GOLD' : 'PURPLE'),
          mentionable: true
        });
        console.log(`[setupRoles] created '${name}' in ${guild.name}`);
      } catch (err){
        console.error(`[setupRoles] failed to create '${name}' in ${guild.name}:`, err?.message || err);
      }
    }
  }
}

async function assignRole(member, rank){
  if (!member) return;
  try{
    if (member.id === JESTER_ID){
      const jr = member.guild.roles.cache.find(r => r.name === 'Jester');
      if (jr) await member.roles.add(jr).catch(()=>{});
      return;
    }
    let role = member.guild.roles.cache.find(r => r.name === rank);
    if (!role){
      role = await member.guild.roles.create({
        name: rank,
        color: ELITE_RANKS.includes(rank) ? 'GOLD' : 'PURPLE',
        mentionable: true
      });
    }
    const old = RANKS.filter(r => r !== rank).map(r => member.guild.roles.cache.find(rr => rr.name === r)).filter(Boolean);
    await member.roles.remove(old).catch(()=>{});
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
      role = await member.guild.roles.create({ name: 'Ruler', color: 'GOLD', mentionable: true });
    }
    member.guild.members.cache.forEach(m => {
      if (m.roles.cache.has(role.id) && m.id !== member.id) m.roles.remove(role).catch(()=>{});
    });
    await member.roles.add(role);
  } catch (err){ console.error('[assignRulerRole]', err?.message || err); }
}

// ready: setup roles in guilds
client.once('ready', async () => {
  console.log(`🤡 JesterBot online as ${client.user.tag}`);
  for (const [gid, guild] of client.guilds.cache){
    try { await setupRoles(guild); } catch(e){ console.error('[ready] setupRoles failed for', guild.name, e?.message || e); }
  }
});

// auto-setup when joining a new guild
client.on('guildCreate', async (guild) => {
  console.log(`Joined guild: ${guild.name} (${guild.id}) — making roles`);
  try { await setupRoles(guild); } catch(e){ console.error('[guildCreate] setupRoles failed', e?.message || e); }
});

// message handler with debugging
client.on('messageCreate', async (message) => {
  try {
    // log incoming message
    console.log(`[MSG] ${message.author.tag} (${message.author.id}) in ${message.guild?.name || 'DM'} #${message.channel?.name || message.channel?.id}: "${message.content}"`);

    if (message.author.bot) return;
    if (!message.guild) return message.channel.send('Please use commands in a server channel (not DM).');

    const users = loadUsers();
    const id = message.author.id;

    // ensure jester record exists
    if (id === JESTER_ID && !users[id]){
      users[id] = { rank: "Court Jester (Founder)", doubloons: 999999, favor: true, favorExpires: null };
      saveUsers(users);
    }

    const raw = (message.content || '').trim();
    if (!raw) return;
    const lc = raw.toLowerCase();
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // quick ping test
    if (cmd === '!ping') {
      await message.reply('Pong! 🃏');
      return;
    }

    // !join
    if (cmd === '!join') {
      if (!users[id]) {
        users[id] = { rank: "Motley", doubloons: 10, favor: false, favorExpires: null };
        addActivity(users, `🎭 ${message.author.username} joined the Court!`);
        saveUsers(users);
        await assignRole(message.member, "Motley");
        await message.channel.send(`🎭 Welcome to the Jester's Court, ${message.author.username}! You are now a Motley. 🃏`);
      } else {
        await message.channel.send(`You are already in the Court, ${message.author.username}!`);
      }
      return;
    }

    // shortcut: if user hasn't joined and command isn't !join, politely inform
    if (!users[id]) {
      // allow privileged owners to use commands without !join
      if (id !== JESTER_ID && !message.member.roles.cache.some(r => r.name === 'Ruler')) {
        return message.channel.send("You must `!join` first to use Court commands.");
      }
    }

    // PRIVILEGED check
    const isPrivileged = id === JESTER_ID || message.member.roles.cache.some(r => r.name === 'Ruler');

    // handle other commands with normalized parsing
    if (cmd === '!rank') {
      const rank = getRank(users[id].doubloons, id);
      const emoji = RANK_EMOJI[rank] || "";
      return message.channel.send(`Your rank: ${emoji} **${rank}**`);
    }

    if (cmd === '!doubloons') {
      return message.channel.send(`You have 💰 **${users[id]?.doubloons ?? 0} Doubloons**`);
    }

    if (cmd === '!gift') {
      const mention = message.mentions.users.first();
      const amount = parseInt(parts[2]);
      if (!mention) return message.channel.send("Mention a valid user to gift.");
      if (isNaN(amount) || amount <= 0) return message.channel.send("Invalid amount.");
      if (!users[mention.id]) return message.channel.send("That user hasn't joined the Court.");
      if (users[id].doubloons < amount && id !== JESTER_ID) return message.channel.send("You don't have enough Doubloons.");
      if (id !== JESTER_ID) users[id].doubloons -= amount;
      users[mention.id].doubloons += amount;
      if (!ELITE_RANKS.includes(users[mention.id].rank)) users[mention.id].rank = getRank(users[mention.id].doubloons, mention.id);
      if (!ELITE_RANKS.includes(users[id].rank)) users[id].rank = getRank(users[id].doubloons, id);
      addActivity(users, `💰 ${message.author.username} gifted ${amount} Doubloons to ${mention.username}!`);
      saveUsers(users);
      await assignRole(message.member, users[id].rank);
      await assignRole(message.guild.members.cache.get(mention.id), users[mention.id].rank);
      return message.channel.send(`${message.author.username} gifted 💰 **${amount} Doubloons** to ${mention.username}!`);
    }

    if (cmd === '!favor') {
      if (!isPrivileged) return;
      const mention = message.mentions.users.first();
      const hours = parseInt(parts[2]);
      if (!mention || isNaN(hours) || hours <= 0) return message.channel.send("Usage: !favor @user hours");
      if (!users[mention.id]) return message.channel.send("That user hasn't joined the Court.");
      users[mention.id].favor = true;
      users[mention.id].favorExpires = Date.now() + hours * 3600000;
      addActivity(users, `👑 Favor given to ${mention.username} for ${hours} hours!`);
      saveUsers(users);
      return message.channel.send(`👑 Favor bestowed upon ${mention.username} for **${hours} hours**!`);
    }

    if (cmd === '!give') {
      if (!isPrivileged) return;
      const mention = message.mentions.users.first();
      const amount = parseInt(parts[2]);
      if (!mention || isNaN(amount)) return message.channel.send("Usage: !give @user amount");
      if (!users[mention.id]) users[mention.id] = { rank: "Motley", doubloons: 0, favor: false, favorExpires: null };
      users[mention.id].doubloons += amount;
      if (!ELITE_RANKS.includes(users[mention.id].rank)) users[mention.id].rank = getRank(users[mention.id].doubloons, mention.id);
      addActivity(users, `✨ ${message.author.username} gave ${amount} Doubloons to ${mention.username}!`);
      saveUsers(users);
      await assignRole(message.guild.members.cache.get(mention.id), users[mention.id].rank);
      return message.channel.send(`✨ Gave 💰 **${amount} Doubloons** to ${mention.username}!`);
    }

    if (cmd === '!ruler') {
      if (id !== JESTER_ID) return;
      const mention = message.mentions.members.first();
      if (!mention) return message.channel.send("Usage: !ruler @user");
      await assignRulerRole(mention);
      addActivity(users, `👑 ${mention.user.username} was given the Ruler title!`);
      saveUsers(users);
      return message.channel.send(`👑 ${mention.user.username} is now the Ruler of this server!`);
    }

    if (cmd === '!leaderboard') {
      const leaderboard = Object.entries(users)
        .filter(([k,v]) => k !== 'activity')
        .sort((a,b) => b[1].doubloons - a[1].doubloons)
        .slice(0,10)
        .map(([k,v],i) => `${i+1}. ${getRank(v.doubloons,k)} ${RANK_EMOJI[getRank(v.doubloons,k)]||""} <@${k}> — 💰 ${v.doubloons}`);
      return message.channel.send("🏆 **Leaderboard**\n" + (leaderboard.length ? leaderboard.join('\n') : 'No users yet!'));
    }

    if (cmd === '!activity') {
      const act = (users.activity||[]).slice(0,10);
      return message.channel.send("📜 **Recent Court Activity**\n" + (act.length ? act.join('\n') : 'No activity yet.'));
    }

    if (cmd === '!prank') {
      if (!isPrivileged) return;
      const mention = message.mentions.users.first();
      const amount = parseInt(parts[2]) || 10;
      if (!mention) return message.channel.send("Usage: !prank @user amount");
      if (!users[mention.id]) return message.channel.send("User not found!");
      users[mention.id].doubloons = Math.max(0, (users[mention.id].doubloons||0) - amount);
      if (!ELITE_RANKS.includes(users[mention.id].rank)) users[mention.id].rank = getRank(users[mention.id].doubloons, mention.id);
      addActivity(users, `😈 ${mention.username} got pranked and lost ${amount} Doubloons!`);
      saveUsers(users);
      await assignRole(message.guild.members.cache.get(mention.id), users[mention.id].rank);
      return message.channel.send(`😈 ${mention.username} got pranked and lost ${amount} Doubloons!`);
    }

    if (cmd === '!createroles') {
      if (!isPrivileged) return;
      await setupRoles(message.guild);
      return message.channel.send('✅ Created missing roles (if any).');
    }

    // unknown command - ignore or give hint
    // await message.channel.send("Unknown command. Try !ping or !join");
  } catch (err) {
    console.error('[messageCreate] handler error:', err?.stack || err);
    try { await message.channel.send("❌ An internal error occurred. Check the bot logs."); } catch(e){ console.error('failed to send error message to channel', e); }
  }
});

// favor expiration
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
  } catch(err){
    console.error('[favor timer] error', err);
  }
}, 60000);

// login
if (!process.env.TOKEN || !process.env.OWNER_ID) {
  console.error('Missing TOKEN or OWNER_ID in env. Set them and restart the bot.');
  process.exit(1);
}
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Login successful!'))
  .catch(err => console.error('❌ Login failed:', err));
