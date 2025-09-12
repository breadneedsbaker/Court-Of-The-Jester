// index.js — JesterBot fully fixed & complete with boosts, masks, props, favor 
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
const DAILY_AMOUNT = 20n;
let pendingTrades = {};

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

// --- prop effects ---
const PROP_EFFECTS = {
  "Scepter": { doubloons: 1.15, exp: 1.1, maskBoost: 1.1, drops: 1.1, tradable:false },
  "Crown": { doubloons:1.2, exp:1.15, maskBoost:1.05, drops:1.15, tradable:false },
  "Royal Decree": { doubloons:1.3, exp:1.2, maskBoost:1.1, drops:1.2, tradable:false, minorLuck:true }
};

// --- favor multiplier ---
function getFavorMultiplier(favor){
  return 1 + (favor||0)/100; // each point = +1% boost to everything
}

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

// --- auto-unlock props ---
function unlockPropsForRank(users, id, newRank){
  const unlocked = RANK_PROPS[newRank] || [];
  for (const prop of unlocked){
    if (!users[id].items[prop]){
      users[id].items[prop] = true;
      addActivity(users, `🎁 <@${id}> unlocked ${prop} for reaching ${newRank}!`);
    }
  }
}

// --- calculate boosts ---
function calculateBoosts(user){
  let expBoost = 1, doubloonsBoost = 1, maskBoost = 1, dropBoost = 1, minorLuck=false;
  // masks
  for (const mask of Object.keys(user.items)){
    const m = SHOP_ITEMS.masks.find(m=>m.name===mask);
    if (m) maskBoost *= m.boost;
  }
  // props
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
  // favor
  const favorMul = getFavorMultiplier(user.favor||0);
  expBoost *= favorMul;
  doubloonsBoost *= favorMul;
  maskBoost *= favorMul;
  dropBoost *= favorMul;

  return {expBoost, doubloonsBoost, maskBoost, dropBoost, minorLuck};
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

  const boosts = calculateBoosts(users[targetId]);
  users[targetId].exp += Math.floor(20 * boosts.expBoost);
  const newRank = getRank(users[targetId].exp, targetId);
  users[targetId].rank = newRank;
  unlockPropsForRank(users, targetId, newRank);
  addActivity(users, `🃏 ${user.username} gave a card to ${reaction.message.author.username} (+${Math.floor(20*boosts.expBoost)} EXP)`);

  saveUsers(users);
  const member = await getGuildMember(reaction.message.guild, targetId);
  if (member) await assignRole(member, newRank);
});

// --- commands ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const users = loadUsers();
  const id = message.author.id;
  const content = message.content.toLowerCase();
  const isPrivileged = message.member?.roles?.cache?.some(r => ["Ruler","The Jester's Hand"].includes(r.name)) || id === JESTER_ID;

  // --- !join
  if (content.startsWith('!join')){
    let member = message.member;
    if (!member && message.guild) {
      try { member = await message.guild.members.fetch(id); }
      catch { return message.channel.send("Could not fetch your server member info!"); }
    }
    if (!users[id]){
      users[id] = { rank:"Motley", exp:0, doubloons:10n, favor:0, items:{}, lastDaily:0 };
      addActivity(users, `🎭 ${message.author.username} joined the Court!`);
      saveUsers(users);
      if (message.guild && member) {
        await setupRoles(message.guild);
        await assignRole(member, "Motley");
      }
      return message.channel.send(`🎭 Welcome ${message.author.username}! You are now a Motley 😜`);
    } else return message.channel.send("You are already in the Court!");
  }

  // --- !profile
  if (content === '!profile'){
    if (!users[id]) return message.channel.send("You must !join first.");
    const u = users[id];
    const props = Object.keys(u.items).filter(i => SHOP_ITEMS.props.find(p => p.name === i));
    const masks = Object.keys(u.items).filter(i => SHOP_ITEMS.masks.find(m => m.name === i));
    return message.channel.send(`📜 **Profile of ${message.author.username}**\n`+
      `${RANK_EMOJI[u.rank]||""} Rank: **${u.rank}** (${u.exp} EXP)\n`+
      `💰 Doubloons: **${u.doubloons}**\n`+
      `⭐ Favor: **${u.favor||0}**\n`+
      `🎭 Props: ${props.length?props.join(", "):"None"}\n`+
      `🎭 Masks: ${masks.length?masks.join(", "):"None"}`);
  }

  // --- !daily
  if (content === '!daily'){
    if (!users[id]) return message.channel.send("You must !join first.");
    const now = Date.now();
    if (now - (users[id].lastDaily||0) < 24*60*60*1000) return message.channel.send("You have already collected your daily doubloons!");
    const boosts = calculateBoosts(users[id]);
    users[id].doubloons += BigInt(Math.floor(Number(DAILY_AMOUNT)*boosts.doubloonsBoost));
    users[id].lastDaily = now;
    addActivity(users, `💰 ${message.author.username} collected daily ${DAILY_AMOUNT} doubloons!`);
    saveUsers(users);
    return message.channel.send(`💰 You collected your daily ${Math.floor(Number(DAILY_AMOUNT)*boosts.doubloonsBoost)} doubloons!`);
  }

  // --- !buy
  if (content.startsWith('!buy ')){
    if (!users[id]) return message.channel.send("You must !join first.");
    const args = message.content.split(' ').slice(1);
    const itemName = args.join(' ');
    const item = SHOP_ITEMS.masks.find(m => m.name.toLowerCase()===itemName.toLowerCase()) || SHOP_ITEMS.props.find(p => p.name.toLowerCase()===itemName.toLowerCase());
    if (!item) return message.channel.send("Item not found.");
    let price = item.price||0n;
    const boosts = calculateBoosts(users[id]);
    price = BigInt(Math.floor(Number(price)*boosts.doubloonsBoost));
    if (users[id].doubloons < price) return message.channel.send("Not enough doubloons.");
    users[id].doubloons -= price;
    users[id].items[item.name] = true;
    addActivity(users, `🛒 ${message.author.username} bought ${item.name}!`);
    saveUsers(users);
    return message.channel.send(`🛒 You bought ${item.name} for ${price} doubloons!`);
  }

  // --- !gift
  if (content.startsWith('!gift ')){
    const mention = message.mentions.users.first();
    if (!mention) return message.channel.send("Mention a user to gift.");
    const amount = BigInt(content.split(' ')[2]||0);
    if (!users[id]) return message.channel.send("You must !join first.");
    if (users[id].doubloons < amount) return message.channel.send("Not enough doubloons.");
    if (!users[mention.id]) users[mention.id]={exp:0,doubloons:0n,favor:0,items:{},lastDaily:0};
    users[id].doubloons -= amount;
    const boosts = calculateBoosts(users[id]);
    users[mention.id].doubloons += BigInt(Math.floor(Number(amount)*boosts.doubloonsBoost));
    users[mention.id].exp += Math.floor(10 * boosts.expBoost); // small bonus for receiving gift
    addActivity(users, `🎁 ${message.author.username} gifted ${amount} doubloons to ${mention.username}`);
    saveUsers(users);
    return message.channel.send(`🎁 You gifted ${amount} doubloons to ${mention.username}`);
  }

  // --- !givefavor
  if (content.startsWith('!givefavor ')){
    if (!isPrivileged) return message.channel.send("You cannot give favor.");
    const mention = message.mentions.users.first();
    if (!mention) return message.channel.send("Mention a user.");
    let amount = parseInt(content.split(' ')[2]||0);
    if (!users[mention.id]) users[mention.id]={exp:0,doubloons:0n,favor:0,items:{},lastDaily:0};
    users[mention.id].favor = Math.min(100,(users[mention.id].favor||0) + amount);
    addActivity(users, `⭐ ${message.author.username} gave ${amount} favor to ${mention.username}`);
    saveUsers(users);
    return message.channel.send(`⭐ You gave ${amount} favor to ${mention.username}`);
  }

  // --- !trade
  if (content.startsWith('!trade ')){
    const mention = message.mentions.users.first();
    if (!mention) return message.channel.send("Mention a user to trade with.");
    if (pendingTrades[mention.id]) return message.channel.send("They already have a pending trade!");
    const parts = message.content.split(' ').slice(2);
    const amount = BigInt(parts[0]||0);
    const items = parts.slice(1);
    if (!users[id]) return message.channel.send("You must !join first.");
    if (users[id].doubloons < amount) return message.channel.send("Not enough doubloons.");
    pendingTrades[mention.id] = { from: id, offer: { doubloons: amount, items } };
    return message.channel.send(`🃏 Trade offered to ${mention.username}. They can accept with !tradeaccept`);
  }

  if (content==='!tradeaccept'){
    const trade = pendingTrades[id];
    if (!trade) return message.channel.send("No pending trade for you.");
    const sender = trade.from;
    if (!users[sender]) return message.channel.send("Sender not found.");
    if (users[sender].doubloons<trade.offer.doubloons) return message.channel.send("Sender doesn't have enough doubloons.");
    users[sender].doubloons -= trade.offer.doubloons;
    users[id].doubloons += trade.offer.doubloons;
    for (const it of trade.offer.items){
      if (users[sender].items[it]){
        delete users[sender].items[it];
        users[id].items[it]=true;
      }
    }
    addActivity(users, `🃏 <@${id}> accepted trade from <@${sender}>`);
    delete pendingTrades[id];
    saveUsers(users);
    return message.channel.send("Trade completed!");
  }

  if (content==='!trades'){
    const trades = Object.entries(pendingTrades).map(([k,v])=>`To <@${k}> from <@${v.from}>: ${v.offer.doubloons} doubloons, items: ${v.offer.items.join(',')}`);
    return message.channel.send(trades.length?trades.join('\n'):"No pending trades.");
  }

  // --- !leaderboard
  if (content==='!leaderboard'){
    const top = Object.entries(users)
      .sort(([,a],[,b])=>Number(b.exp||0)-Number(a.exp||0))
      .slice(0,10)
      .map(([uid,u],i)=>`${i+1}. <@${uid}> - ${u.rank} - ${u.exp} EXP - ${u.doubloons} doubloons - Favor: ${u.favor||0}`);
    return message.channel.send(top.length?top.join('\n'):"No users yet.");
  }

  // --- !help
  if (content === '!help'){
    return message.channel.send("Commands: !join, !profile, !daily, !buy <item>, !gift <user> <amount>, !givefavor <user> <amount>, !trade <user> <amount/items>, !tradeaccept, !trades, !leaderboard, !help");
  }

  saveUsers(users);
});

// --- ready
client.once('ready',()=>console.log(`🤡 JesterBot online as ${client.user.tag}`));
if (!process.env.TOKEN || !process.env.OWNER_ID) process.exit(1);
client.login(process.env.TOKEN);
