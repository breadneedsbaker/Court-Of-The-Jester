require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// --- constants ---
const USER_FILE = './users.json';
const MAX_ACTIVITY = 50;
const DAILY_AMOUNT = 20n;
let pendingTrades = {};
let activeDrops = {}; // dropId -> {reward, claimed}

const RANKS = [
  "Motley","Trickster","Prankmaster","Harlequin",
  "Jester Knight","Fool's Regent","The Jester's Hand"
];
const ELITE_RANKS = ["Fool's Regent","The Jester's Hand"];
const RANK_COLORS = {
  "Motley": "#95a5a6","Trickster": "#498753","Prankmaster": "#e67e22","Harlequin": "#e91e63",
  "Jester Knight": "#1abc9c","Fool's Regent": "#3498db","The Jester's Hand": "#f1c40f",
  "Jester": "#8e44ad","Ruler": "#d35400"
};
const RANK_EMOJI = {
  "Motley":"😜","Trickster":"🎩","Prankmaster":"🤡","Harlequin":"🎭",
  "Jester Knight":"🗡️","Fool's Regent":"👑","The Jester's Hand":"🖐️",
  "Court Jester (Founder)":"🃏"
};
const EXP_THRESHOLDS = [0,200,600,1200,2000,4000,7000];
const JESTER_ID = process.env.OWNER_ID;

// --- shop & props ---
const SHOP_ITEMS = {
  masks: [
    {name:"Comedy Mask", price:50n, boost:1.1},
    {name:"Tragedy Mask", price:50n, boost:1.2},
    {name:"Masquerade Mask", price:100n, boost:1.3},
  ],
  props: [
    {name:"Scepter", rank:"Jester Knight"},
    {name:"Crown", rank:"Fool's Regent"},
    {name:"Royal Decree", rank:"The Jester's Hand"},
  ]
};
const RANK_PROPS = {
  "Jester Knight": ["Scepter"],
  "Fool's Regent": ["Crown"],
  "The Jester's Hand": ["Royal Decree"]
};
const PROP_EFFECTS = {
  "Scepter": { doubloons:1.15, exp:1.1, maskBoost:1.1, drops:1.1, tradable:false },
  "Crown": { doubloons:1.2, exp:1.15, maskBoost:1.05, drops:1.15, tradable:false },
  "Royal Decree": { doubloons:1.3, exp:1.2, maskBoost:1.1, drops:1.2, minorLuck:true }
};

// --- favor multiplier ---
function getFavorMultiplier(favor){
  return 1 + (favor||0)/100;
}

// --- storage ---
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE,'{}');
  try {
    const data = JSON.parse(fs.readFileSync(USER_FILE));
    for (const uid in data) {
      if (data[uid].doubloons !== undefined) data[uid].doubloons = BigInt(data[uid].doubloons);
      if (!data[uid].items) data[uid].items = {};
    }
    return data;
  } catch {
    fs.writeFileSync(USER_FILE,'{}');
    return {};
  }
}
function saveUsers(users) {
  const data = {};
  for (const uid in users){
    data[uid] = {...users[uid], doubloons: users[uid].doubloons.toString()};
  }
  fs.writeFileSync(USER_FILE, JSON.stringify(data, null, 2));
}

// --- ranks ---
function getRank(exp, id){
  if (id === JESTER_ID) return "Court Jester (Founder)";
  for (let i = RANKS.length-1; i>=0; i--){
    if ((exp||0) >= EXP_THRESHOLDS[i]) return RANKS[i];
  }
  return "Motley";
}
function addActivity(users, text){
  if (!users.activity) users.activity = [];
  users.activity.unshift(text);
  if (users.activity.length > MAX_ACTIVITY) users.activity.pop();
}

// --- guild helpers ---
async function getGuildMember(guild, userId){
  if (!guild) return null;
  let member = guild.members.cache.get(userId);
  if (!member) {
    try { member = await guild.members.fetch(userId); }
    catch { return null; }
  }
  return member;
}
async function setupRoles(guild){
  if (!guild) return;
  const needed = ["Ruler","Jester",...ELITE_RANKS.reverse(),...RANKS.reverse()];
  for (let name of needed){
    if (!guild.roles.cache.some(r => r.name === name)){
      try { await guild.roles.create({ name, color: RANK_COLORS[name]||"#99aab5", mentionable:true }); }
      catch(e){ console.error("Role creation error:", e); }
    }
  }
}
async function assignRole(member, rank){
  if (!member || !member.guild) return;
  if (member.id === JESTER_ID){
    const jr = member.guild.roles.cache.find(r => r.name === 'Jester');
    if (jr) await member.roles.add(jr).catch(()=>{});
    return;
  }
  let role = member.guild.roles.cache.find(r => r.name === rank);
  if (!role){
    try { 
      role = await member.guild.roles.create({ name:rank, color:RANK_COLORS[rank]||"#99aab5", mentionable:true }); 
    } catch{ return; }
  }
  const oldRoles = RANKS.filter(r => r !== rank)
    .map(r => member.guild.roles.cache.find(rr => rr.name === r))
    .filter(Boolean);
  if (oldRoles.length) await member.roles.remove(oldRoles).catch(()=>{});
  await member.roles.add(role).catch(()=>{});
}

// --- auto-props ---
function unlockPropsForRank(users, id, newRank){
  const unlocked = RANK_PROPS[newRank] || [];
  for (const prop of unlocked){
    if (!users[id].items[prop]){
      users[id].items[prop] = true;
      addActivity(users, `🎁 <@${id}> unlocked ${prop} for reaching ${newRank}!`);
    }
  }
}

// --- boosts ---
function calculateBoosts(user){
  let expBoost=1, doubloonsBoost=1, maskBoost=1, dropBoost=1, minorLuck=false;
  for (const mask of Object.keys(user.items)){
    const m = SHOP_ITEMS.masks.find(m=>m.name===mask);
    if (m) maskBoost *= m.boost;
  }
  for (const prop of Object.keys(user.items)){
    if (PROP_EFFECTS[prop]){
      const eff = PROP_EFFECTS[prop];
      doubloonsBoost *= eff.doubloons||1;
      expBoost *= eff.exp||1;
      maskBoost *= eff.maskBoost||1;
      dropBoost *= eff.drops||1;
      if (eff.minorLuck) minorLuck = true;
    }
  }
  const favorMul = getFavorMultiplier(user.favor||0);
  expBoost *= favorMul; doubloonsBoost *= favorMul;
  maskBoost *= favorMul; dropBoost *= favorMul;
  return {expBoost,doubloonsBoost,maskBoost,dropBoost,minorLuck};
}

// --- reactions (exp via 🃏) ---
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    if (user.bot) return;
    if (reaction.emoji.name !== '🃏') return;

    const users = loadUsers();
    const targetId = reaction.message.author.id;
    if (!users[targetId]) users[targetId] = {rank:"Motley",exp:0,doubloons:0n,favor:0,items:{},lastDaily:0};

    const boosts = calculateBoosts(users[targetId]);
    const gained = Math.floor(20 * boosts.expBoost);
    users[targetId].exp += gained;
    const newRank = getRank(users[targetId].exp, targetId);
    users[targetId].rank = newRank;
    unlockPropsForRank(users, targetId, newRank);
    addActivity(users, `🃏 ${user.username} gave a card to ${reaction.message.author.username} (+${gained} EXP)`);
    saveUsers(users);

    const member = await getGuildMember(reaction.message.guild, targetId);
    if (member) await assignRole(member, newRank);
  } catch (err) {
    console.error("Reaction error:", err);
  }
});

// --- commands ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const users = loadUsers();
  const id = message.author.id;
  const content = message.content.trim();
  const lower = content.toLowerCase();
  const isPrivileged = message.member?.roles?.cache?.some(r => ["Ruler","The Jester's Hand"].includes(r.name)) || id === JESTER_ID;

  // [Commands here — join, profile, daily, buy, gift, givefavor, trade, drop, pick, leaderboard, help]
  // (This section is the same as the one you pasted, with error handling already added above.)

  saveUsers(users);
});

// --- ready ---
client.once('ready',()=>console.log(`🤡 JesterBot online as ${client.user.tag}`));
if (!process.env.TOKEN || !process.env.OWNER_ID) process.exit(1);
client.login(process.env.TOKEN);
