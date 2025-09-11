// index.js — full jester system
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

// --- quick env check ---
console.log('ENV CHECK -> TOKEN set?', !!process.env.TOKEN, 'OWNER_ID set?', !!process.env.OWNER_ID);

const USER_FILE = './users.json';
const MAX_ACTIVITY = 50;

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
        results.push(`✅ Created **${name}**`);
      } catch (err){
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
    if (member.id === JESTER_ID){
      const jr = member.guild.roles.cache.find(r => r.name === 'Jester');
      if (jr) await member.roles.add(jr).catch(()=>{});
      return;
    }
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
  for (const [gid, guild] of client.guilds.cache){
    await setupRoles(guild);
  }
});
client.on('guildCreate', async (guild) => {
  const results = await setupRoles(guild);
  console.log(`[guildCreate] setupRoles for ${guild.name}:`, results.join('; '));
});

// --- reaction -> EXP ---
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  if (user.bot) return;
  if (reaction.emoji.name !== '🃏') return;

  const users = loadUsers();
  const targetId = reaction.message.author.id;
  if (!users[targetId]) {
    users[targetId] = { exp:0, doubloons:0, favor:false, favorExpires:null, items:{} };
  }
  users[targetId].exp = (users[targetId].exp||0) + 20;

  const newRank = getRank(users[targetId].exp, targetId);
  users[targetId].rank = newRank;
  addActivity(users, `🃏 ${user.username} gave a card to ${reaction.message.author.username} (+20 EXP)`);

  saveUsers(users);
  const member = await getGuildMember(reaction.message.guild, targetId);
  if (member) await assignRole(member, newRank);
});

// --- commands ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const users = loadUsers();
  const id = message.author.id;
  const isPrivileged = id === JESTER_ID || message.member.roles.cache.some(r => r.name === 'Ruler');

  if (message.content === '!join'){
    if (!users[id]){
      users[id] = { rank:"Motley", exp:0, doubloons:10, favor:false, favorExpires:null, items:{} };
      addActivity(users, `🎭 ${message.author.username} joined the Court!`);
      saveUsers(users);
      await assignRole(message.member, "Motley");
      return message.channel.send(`🎭 Welcome ${message.author.username}! You are now a Motley 😜`);
    } else return message.channel.send("You are already in the Court!");
  }

  if (message.content === '!rank'){
    if (!users[id]) return message.channel.send("You must !join first.");
    const rank = users[id].rank;
    return message.channel.send(`Your rank: ${RANK_EMOJI[rank]||""} **${rank}** (${users[id].exp||0} EXP)`);
  }

  if (message.content === '!doubloons'){
    if (!users[id]) return message.channel.send("You must !join first.");
    return message.channel.send(`You have 💰 **${users[id].doubloons||0} Doubloons**`);
  }

  if (message.content === '!leaderboard'){
    const leaderboard = Object.entries(users)
      .filter(([k,v])=>k!=='activity')
      .sort((a,b)=>(b[1].exp||0)-(a[1].exp||0))
      .slice(0,10)
      .map(([k,v],i)=>`${i+1}. ${RANK_EMOJI[v.rank]||""} ${v.rank} <@${k}> — EXP ${v.exp||0}, 💰 ${v.doubloons||0}`);
    if (!leaderboard.length) return message.channel.send("No users yet!");
    return message.channel.send("🏆 **Leaderboard**\n"+leaderboard.join('\n'));
  }

  if (message.content === '!activity'){
    const act = users.activity||[];
    if (!act.length) return message.channel.send("No activity yet.");
    return message.channel.send("📜 **Recent Court Activity**\n"+act.slice(0,10).join('\n'));
  }

  if (isPrivileged && message.content.startsWith('!give')){
    const args = message.content.split(' ');
    const mention = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!mention||isNaN(amount)) return message.channel.send("Usage: !give @user amount");
    if (!users[mention.id]) users[mention.id] = { rank:"Motley", exp:0, doubloons:0, favor:false, favorExpires:null, items:{} };
    users[mention.id].doubloons += amount;
    users[mention.id].rank = getRank(users[mention.id].exp, mention.id);
    addActivity(users, `✨ ${message.author.username} gave ${amount} Doubloons to ${mention.username}`);
    saveUsers(users);
    await assignRole(await getGuildMember(message.guild, mention.id), users[mention.id].rank);
    return message.channel.send(`✨ Gave 💰 **${amount}** to ${mention.username}`);
  }

  if (id===JESTER_ID && message.content.startsWith('!ruler')){
    const mention = message.mentions.members.first();
    if (!mention) return message.channel.send("Usage: !ruler @user");
    await assignRulerRole(mention);
    addActivity(users, `👑 ${mention.user.username} is now Ruler`);
    saveUsers(users);
    return message.channel.send(`👑 ${mention.user.username} is now Ruler!`);
  }

  if (message.content==='!createroles'){
    const results = await setupRoles(message.guild);
    return message.channel.send("📜 Role Creation Report\n"+results.join('\n'));
  }
});

// --- login ---
if (!process.env.TOKEN || !process.env.OWNER_ID) {
  console.error('Missing TOKEN or OWNER_ID in env. Set them and restart the bot.');
  process.exit(1);
}
client.login(process.env.TOKEN)
  .then(()=>console.log('✅ Login successful!'))
  .catch(err=>console.error('❌ Login failed:', err));
