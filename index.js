// index.js — hierarchy-fixed
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
  "Motley","Trickster","Prankmaster","Harlequin",
  "Jester Knight","Fool's Regent","The Jester's Hand"
];
const ELITE_RANKS = ["Fool's Regent","The Jester's Hand"];

const RANK_COLORS = {
  "Motley": "#95a5a6",
  "Trickster": "#498753",
  "Prankmaster": "#e67e22",
  "Harlequin": "#e91e63",
  "Jester Knight": "#1abc9c",
  "Fool's Regent": "#3498db",
  "The Jester's Hand": "#f1c40f",
  "Jester": "#8e44ad",
  "Ruler": "#d35400"
};

const RANK_EMOJI = {
  "Motley":"😜","Trickster":"🎩","Prankmaster":"🤡","Harlequin":"🎭",
  "Jester Knight":"🗡️","Fool's Regent":"👑","The Jester's Hand":"🖐️",
  "Court Jester (Founder)":"🃏"
};

const RANK_THRESHOLDS = [0,50,150,300,500,1000,9999];
const JESTER_ID = process.env.OWNER_ID;

// --- storage helpers ---
function loadUsers(){
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE,'{}');
  try {
    return JSON.parse(fs.readFileSync(USER_FILE));
  } catch (e) {
    console.error('[loadUsers] JSON parse error, resetting file.', e);
    fs.writeFileSync(USER_FILE,'{}');
    return {};
  }
}
function saveUsers(users){
  fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
}

// --- rank helpers ---
function getRank(doubloons, id){
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
    try {
      member = await guild.members.fetch(userId);
    } catch (e) {
      return null;
    }
  }
  return member;
}

// --- role setup (hierarchy aware) ---
async function setupRoles(guild){
  // Order: Ruler → Jester → Elites → Normals (reverse hierarchy)
  const needed = ["Ruler","Jester",...ELITE_RANKS.reverse(),...RANKS.reverse()];
  let results = [];
  for (let name of needed){
    if (!guild.roles.cache.some(r => r.name === name)){
      try {
        await guild.roles.create({
          name,
          color: RANK_COLORS[name] || "#99aab5",
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

// --- assign roles ---
async function assignRole(member, rank){
  if (!member) return;
  try{
    // Jester special
    if (member.id === JESTER_ID){
      const jr = member.guild.roles.cache.find(r => r.name === 'Jester');
      if (jr) await member.roles.add(jr).catch(()=>{});
      return;
    }

    // Normal
    let role = member.guild.roles.cache.find(r => r.name === rank);
    if (!role){
      role = await member.guild.roles.create({
        name: rank,
        color: RANK_COLORS[rank] || "#99aab5",
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
    } catch(e){
      console.error('[ready] setupRoles failed for', guild.name, e?.message || e);
    }
  }
});

// --- guild join ---
client.on('guildCreate', async (guild) => {
  console.log(`🏰 Joined guild: ${guild.name} (${guild.id})`);
  const results = await setupRoles(guild);
  console.log(`[guildCreate] setupRoles for ${guild.name}:`, results.join('; '));
});

// --- message commands (unchanged from last version except role setup uses new colors/hierarchy) ---
// [KEEP all your existing !join, !gift, !favor, !give, !ruler, !leaderboard, !activity, !prank, !createroles code here unchanged]

/* (Trimmed for clarity — your previous command handling block goes here) */

// --- login ---
if (!process.env.TOKEN || !process.env.OWNER_ID) {
  console.error('Missing TOKEN or OWNER_ID in env. Set them and restart the bot.');
  process.exit(1);
}
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Login successful!'))
  .catch(err => console.error('❌ Login failed:', err));
