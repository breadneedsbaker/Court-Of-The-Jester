// index.js — full JesterBot system with drops/pick/kick and trade
require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

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

const USER_FILE = './users.json';
const MAX_ACTIVITY = 50;
const DAILY_AMOUNT = 20n; // BigInt for large numbers
let droppedDoubloons = null; // { amount: BigInt, messageId }
let pendingTrades = {}; // { recipientId: { from: senderId, offer: {doubloons:BigInt, items:[string] } } }

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
const EXP_THRESHOLDS = [0,200,600,1200,2000,4000,7000];
const JESTER_ID = process.env.OWNER_ID;

// Items
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

// --- storage ---
function loadUsers() {
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE,'{}');
  try { 
    const data = JSON.parse(fs.readFileSync(USER_FILE));
    for (const uid in data) {
      if (data[uid].doubloons !== undefined) data[uid].doubloons = BigInt(data[uid].doubloons);
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

// --- rank ---
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
  const needed = ["Ruler","Jester",...ELITE_RANKS.reverse(),...RANKS.reverse()];
  for (let name of needed){
    if (!guild.roles.cache.some(r => r.name === name)){
      await guild.roles.create({ name, color: RANK_COLORS[name]||"#99aab5", mentionable:true });
    }
  }
}

async function assignRole(member, rank){
  if (!member) return; // skip if member is null (DMs)
  if (member.id === JESTER_ID){
    const jr = member.guild.roles.cache.find(r => r.name === 'Jester');
    if (jr) await member.roles.add(jr).catch(()=>{});
    return;
  }
  let role = member.guild.roles.cache.find(r => r.name === rank);
  if (!role){
    role = await member.guild.roles.create({ name:rank, color:RANK_COLORS[rank]||"#99aab5", mentionable:true });
  }
  const oldRoles = RANKS.filter(r => r !== rank)
    .map(r => member.guild.roles.cache.find(rr => rr.name === r))
    .filter(Boolean);
  if (oldRoles.length) await member.roles.remove(oldRoles).catch(()=>{});
  await member.roles.add(role).catch(()=>{});
}

async function assignRulerRole(member){
  if (!member) return;
  let role = member.guild.roles.cache.find(r => r.name === 'Ruler');
  if (!role) role = await guild.roles.create({ name:'Ruler', color:RANK_COLORS["Ruler"], mentionable:true });
  member.guild.members.cache.forEach(m => {
    if (m.roles.cache.has(role.id) && m.id !== member.id) m.roles.remove(role).catch(()=>{});
  });
  await member.roles.add(role);
}

// --- reactions ---
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  if (user.bot) return;
  if (reaction.emoji.name !== '🃏') return;

  const users = loadUsers();
  const targetId = reaction.message.author.id;
  if (!users[targetId]) users[targetId] = {exp:0,doubloons:0n,favor:0,items:{},lastDaily:0};

  users[targetId].exp += 20;
  users[targetId].rank = getRank(users[targetId].exp, targetId);
  addActivity(users, `🃏 ${user.username} gave a card to ${reaction.message.author.username} (+20 EXP)`);

  saveUsers(users);
  const member = await getGuildMember(reaction.message.guild, targetId);
  if (member) await assignRole(member, users[targetId].rank);
});

// --- commands ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const users = loadUsers();
  const id = message.author.id;
  const isPrivileged = message.guild && (id === JESTER_ID || message.member.roles.cache.some(r => ["Ruler","The Jester's Hand"].includes(r.name)));

  // !join
  if (message.content === '!join'){
    if (!users[id]){
      users[id] = { rank:"Motley", exp:0, doubloons:10n, favor:0, items:{}, lastDaily:0 };
      addActivity(users, `🎭 ${message.author.username} joined the Court!`);
      saveUsers(users);

      // role assignment only if in a guild
      if (message.guild && message.member) await assignRole(message.member, "Motley");

      return message.channel.send(`🎭 Welcome ${message.author.username}! You are now a Motley 😜`);
    } else return message.channel.send("You are already in the Court!");
  }

  // ... rest of your code remains unchanged
