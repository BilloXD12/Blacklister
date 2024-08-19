require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Import node-fetch for sending webhooks
const express = require('express'); // Import Express.js for local server

// Load rejoin counts from JSON file
const dataFilePath = path.join(__dirname, 'rejoinCounts.json');
let rejoinTracker = new Map();

function loadRejoinData() {
    if (fs.existsSync(dataFilePath)) {
        const rawData = fs.readFileSync(dataFilePath);
        const parsedData = JSON.parse(rawData);
        rejoinTracker = new Map(Object.entries(parsedData));
    }
}

function saveRejoinData() {
    const dataToSave = Object.fromEntries(rejoinTracker);
    fs.writeFileSync(dataFilePath, JSON.stringify(dataToSave, null, 2));
}

loadRejoinData();

const blacklistRoleId = process.env.BLACKLIST_ROLE_ID;
const shouldKick = process.env.KICK_ENABLED === 'true';
const webhookUrl = process.env.WEBHOOK_URL; // Add your webhook URL here
const port = process.env.PORT || 3000; // Default port to 3000 if not specified

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Setup Express server
const app = express();
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Set custom status
    client.user.setPresence({
        activities: [{ name: 'Blacklisting User', type: ActivityType.Watching }],
        status: 'online'
    });
});

client.on('guildMemberRemove', async (member) => {
    const userId = member.id;
    let rejoinCount = rejoinTracker.get(userId) || 0;
    rejoinCount++;
    rejoinTracker.set(userId, rejoinCount);
    saveRejoinData();

    if (rejoinCount === 1) {
        try {
            const warningEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('<a:WARNING:1196772105304424499> Warning!')
                .setDescription("It seems you've left the server. If you rejoin and then leave the server again, you will be blacklisted and will not be able to rejoin without appealing, then if you wish to regain access, you’ll need to submit an appeal.")
                .addFields(
                    { name: '<:discordverify:861292720324476968> **Server Link**', value: '**[Join the Server](https://discord.gg/SYge6ShgVv)**' }
                )
                .setFooter({ text: 'Please consider this carefully before leaving again.' })
                .setThumbnail(member.user.displayAvatarURL());

            await member.user.send({ embeds: [warningEmbed] });
        } catch (error) {
            console.error('Failed to send DM:', error);
        }
    } else if (rejoinCount >= 2) {
        try {
            const blacklistEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('<a:Alert:1222696669997437049> You Have Been Blacklisted')
                .setDescription('Due to your recent actions, you have been blacklisted from rejoining the server. To regain access, please follow these steps to submit an appeal:')
                .addFields(
                    { name: '<:discordverify:861292720324476968> Click the Link to Join Server', value: '**[Join the Server](https://discord.gg/SYge6ShgVv)**' },
                    { name: '<a:dstar:859462751255658506> Head Towards the Appeal Channel', value: 'Open a ticket for your appeal, and provide a valid reasons why you left the server that might help us understand your situation.' },
                    { name: '<a:dstar:859462751255658506> Submit the Ticket', value: 'After completing the form, submit it for review.' },
                    { name: '<a:dstar:859462751255658506> Wait for a Response', value: 'Our moderation team will review your appeal and respond as soon as possible. This process may take some time, so please be patient.' }
                )
                .setFooter({ text: 'Thank you for your cooperation.' })
                .setThumbnail(member.user.displayAvatarURL());

            await member.user.send({ embeds: [blacklistEmbed] });
        } catch (error) {
            console.error('Failed to send DM:', error);
        }

        if (shouldKick) {
            try {
                await member.kick('Blacklisted from the server');
                console.log(`${member.user.tag} has been kicked from the server.`);
            } catch (error) {
                console.error('Failed to kick member:', error);
            }
        }
    }

    // Send important log to webhook
    const logMessage = {
        content: `<@${userId}> has left the server and has been given ${rejoinCount} warning(s).`
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logMessage)
        });
        console.log('Important log sent to webhook.');
    } catch (error) {
        console.error('Failed to send log to webhook:', error);
    }
});

client.on('guildMemberAdd', async (member) => {
    const userId = member.id;
    const rejoinCount = rejoinTracker.get(userId) || 0;

    if (rejoinCount >= 2) {
        if (blacklistRoleId) {
            const role = member.guild.roles.cache.get(blacklistRoleId);
            if (role) {
                try {
                    await member.roles.add(role);
                    console.log(`${member.user.tag} has been assigned the role ${role.name}.`);

                    // Send webhook notification about role assignment
                    const roleLogMessage = {
                        content: `<@${userId}> has been granted the role <@&${role.id}>.`
                    };
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(roleLogMessage)
                    });
                    console.log('Role assignment log sent to webhook.');
                } catch (error) {
                    console.error('Failed to assign role:', error);
                }
            } else {
                console.log(`Role not found with ID: ${blacklistRoleId}`);
            }
        }

        try {
            const blacklistEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('<a:Alert:1222696669997437049> You Have Been Blacklisted')
                .setDescription('Due to your recent actions, you have been blacklisted from rejoining the server. To regain access, please follow these steps to submit an appeal:')
                .addFields(
                    { name: '<:discordverify:861292720324476968> Click the Link to Join Server', value: '**[Join the Server](https://discord.gg/SYge6ShgVv)**' },
                    { name: '<a:dstar:859462751255658506> Head Towards the Appeal Channel', value: 'Open a ticket for your appeal, and provide a valid reasons why you left the server that might help us understand your situation.' },
                    { name: '<a:dstar:859462751255658506> Submit the Ticket', value: 'After completing the form, submit it for review.' },
                    { name: '<a:dstar:859462751255658506> Wait for a Response', value: 'Our moderation team will review your appeal and respond as soon as possible. This process may take some time, so please be patient.' }
                )
                .setFooter({ text: 'Thank you for your cooperation.' })
                .setThumbnail(member.user.displayAvatarURL());

            await member.user.send({ embeds: [blacklistEmbed] });
        } catch (error) {
            console.error('Failed to send DM:', error);
        }

        if (shouldKick) {
            try {
                await member.kick('Blacklisted from the server');
                console.log(`${member.user.tag} has been kicked from the server.`);
            } catch (error) {
                console.error('Failed to kick member:', error);
            }
        }
    }
});

// Command handling
client.on('messageCreate', async (message) => {
    if (!message.guild) return;
    if (!message.content.startsWith('!') || message.author.bot) return;

    console.log('Received message:', message.content);

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'unblacklist') {
        console.log('Unblacklist command received');

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('You do not have permission to use this command.');
        }

        const userId = args[0];
        if (!userId) {
            return message.reply('Please provide the user ID to unblacklist.');
        }

        const user = message.guild.members.cache.get(userId);
        if (user) {
            if (blacklistRoleId) {
                const role = user.guild.roles.cache.get(blacklistRoleId);
                if (role) {
                    try {
                        await user.roles.remove(role);
                        console.log(`${user.user.tag} has been removed from the blacklist.`);
                    } catch (error) {
                        console.error('Failed to remove role:', error);
                        message.reply('Failed to remove role.');
                    }
                } else {
                    message.reply('Role not found.');
                }
            }
            rejoinTracker.delete(userId);
            saveRejoinData();
            message.reply(`User <@${userId}> has been unblacklisted.`);
        } else {
            message.reply('User not found in the server.');
        }
    }
});

try {
    client.login(process.env.BOT_TOKEN);
    console.log("Bot is running...");
} catch (error) {
    console.error('Failed to login:', error);
}
