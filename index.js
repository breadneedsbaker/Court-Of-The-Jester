// index.js — full JesterBot system with drops/pick and kick
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
const DAILY_AMOUNT = 20;

let droppedDoubloons = null; // Track dropped doubloons {amount, messageId}

// --- Ranks & Colors ---
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

// --- Items ---
const SHOP_ITEMS = {
  masks: [
    {name:"Comedy Mask", price:50, boost:1.1},
    {name:"Tragedy Mask", price:50, boost:1.2},
    {name:"Masquerade Mask", price:100, boost:1.3},
  ],
  props: [
    {name:"Scepter", rank:"Jester Knight"},
    {name:"Crown", rank:"Fool's Regent"},
    {name:"Royal Decree", rank:"The Jester's Hand"},
  ]
};

// --- storage helpers ---
function loadUsers(){
  if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE,'{}');
  try { return JSON.parse(fs.readFileSync(USER_FILE)); }
  catch { fs.writeFileSync(USER_FILE,'{}'); return {}; }
}
function saveUsers(users){ fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2)); }

// --- rank helpers ---
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

// --- guild/member helpers ---
async function getGuildMember(guild, userId){
  if (!guild) return null;
  let member = guild.members.cache.get(userId);
  if (!member) { try { member = await guild.members.fetch(userId); } catch { return null; } }
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
  if (!member) return;
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
  let role = member.guild.roles.cache.find(r => r.name === 'Ruler');
  if (!role) role = await member.guild.roles.create({ name:'Ruler', color:RANK_COLORS["Ruler"], mentionable:true });
  member.guild.members.cache.forEach(m => {
    if (m.roles.cache.has(role.id) && m.id !== member.id) m.roles.remove(role).catch(()=>{});
  });
  await member.roles.add(role);
}

// --- reaction -> EXP ---
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  if (user.bot) return;
  if (reaction.emoji.name !== '🃏') return;

  const users = loadUsers();
  const targetId = reaction.message.author.id;
  if (!users[targetId]) users[targetId] = {exp:0,doubloons:0,favor:0,items:{},lastDaily:0};

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
  const isPrivileged = id === JESTER_ID || message.member.roles.cache.some(r => ["Ruler","The Jester's Hand"].includes(r.name));

  // join
  if (message.content === '!join'){
    if (!users[id]){
      users[id] = { rank:"Motley", exp:0, doubloons:10, favor:0, items:{}, lastDaily:0 };
      addActivity(users, `🎭 ${message.author.username} joined the Court!`);
      saveUsers(users);
      await assignRole(message.member, "Motley");
      return message.channel.send(`🎭 Welcome ${message.author.username}! You are now a Motley 😜`);
    } else return message.channel.send("You are already in the Court!");
  }

  // profile
  if (message.content === '!profile'){
    if (!users[id]) return message.channel.send("You must !join first.");
    const u = users[id];
    const props = Object.keys(u.items).filter(i=>SHOP_ITEMS.props.find(p=>p.name===i));
    const masks = Object.keys(u.items).filter(i=>SHOP_ITEMS.masks.find(m=>m.name===i));
    return message.channel.send(`📜 **Profile of ${message.author.username}**\n`+
      `${RANK_EMOJI[u.rank]||""} Rank: **${u.rank}** (${u.exp} EXP)\n`+
      `💰 Doubloons: **${u.doubloons}**\n`+
      `⭐ Favor: **${u.favor||0}**\n`+
      `🎭 Props: ${props.length?props.join(", "):"None"}\n`+
      `🎭 Masks: ${masks.length?masks.join(", "):"None"}`);
  }

  // daily
  if (message.content === '!daily'){
    if (!users[id]) return message.channel.send("You must !join first.");
    const now = Date.now();
    if (now - (users[id].lastDaily||0) < 86400000) return message.channel.send("⏳ You already claimed your daily doubloons.");
    users[id].doubloons += DAILY_AMOUNT;
    users[id].lastDaily = now;
    addActivity(users, `💰 ${message.author.username} claimed daily doubloons`);
    saveUsers(users);
    return message.channel.send(`💰 You claimed **${DAILY_AMOUNT} Doubloons**!`);
  }

  // drop doubloons
  if (message.content.startsWith('!drop')){
    if (!users[id]) return message.channel.send("You must !join first.");
    const args = message.content.split(' ');
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <=0) return message.channel.send("Usage: !drop <amount>");
    if (users[id].doubloons < amount) return message.channel.send("Not enough doubloons to drop.");
    users[id].doubloons -= amount;
    droppedDoubloons = { amount, messageId: message.id };
    addActivity(users, `💰 ${message.author.username} dropped ${amount} doubloons!`);
    saveUsers(users);
    return message.channel.send(`💰 ${amount} Doubloons dropped! First to pick them gets it!`);
  }

  if (message.content === '!pick'){
    if (!droppedDoubloons) return message.channel.send("No doubloons dropped to pick up.");
    users[id].doubloons += droppedDoubloons.amount;
    addActivity(users, `💰 ${message.author.username} picked up ${droppedDoubloons.amount} doubloons!`);
    const pickedAmount = droppedDoubloons.amount;
    droppedDoubloons = null; // reset so no one else can pick
    saveUsers(users);
    return message.channel.send(`💰 You picked up **${pickedAmount} Doubloons**!`);
  }

  // privileged commands
  if (isPrivileged){
    if (message.content.startsWith('!give ')){
      const args = message.content.split(' ');
      const mention = message.mentions.users.first();
      const amount = parseInt(args[2]);
      if (!mention || isNaN(amount)) return message.channel.send("Usage: !give @user amount");
      if (!users[mention.id]) users[mention.id] = { rank:"Motley", exp:0, doubloons:0, favor:0, items:{}, lastDaily:0 };
      users[mention.id].doubloons += amount;
      addActivity(users, `💰 ${message.author.username} gave ${amount} doubloons to ${mention.username}`);
      saveUsers(users);
      return message.channel.send(`💰 Gave ${amount} doubloons to ${mention.username}`);
    }

    if (message.content.startsWith('!giveprop ')){
      const args = message.content.split(' ');
      const mention = message.mentions.users.first();
      const propName = args.slice(2).join(' ');
      if (!mention || !propName) return message.channel.send("Usage: !giveprop @user PropName");
      const prop = SHOP_ITEMS.props.find(p=>p.name.toLowerCase()===propName.toLowerCase());
      if (!prop) return message.channel.send("Prop not found.");
      if (!users[mention.id]) users[mention.id] = { rank:"Motley", exp:0, doubloons:0, favor:0, items:{}, lastDaily:0 };
      users[mention.id].items[prop.name] = true;
      addActivity(users, `🎭 ${message.author.username} gave ${prop.name} to ${mention.username}`);
      saveUsers(users);
      return message.channel.send(`🎭 Gave ${prop.name} to ${mention.username}!`);
    }

    // !kick
    if (message.content.startsWith('!kick')){
      const mention = message.mentions.members.first();
      if (!mention) return message.channel.send("Usage: !kick @user");
      mention.kick("Kicked from Court by privileged user").catch(()=>{});
      addActivity(users, `🚪 ${mention.user.username} was kicked from the Court by ${message.author.username}`);
      return message.channel.send(`🚪 Kicked ${mention.user.username} from the Court.`);
    }
  }

  // ... other commands like !shop, !buy, !coinflip unchanged
});

// --- login ---
client.once('ready',()=>console.log(`🤡 JesterBot online as ${client.user.tag}`));
if (!process.env.TOKEN || !process.env.OWNER_ID) process.exit(1);
client.login(process.env.TOKEN);
