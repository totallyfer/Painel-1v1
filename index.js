const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    StringSelectMenuBuilder, ChannelType, PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');
const express = require('express');

// --- Servidor Web para manter ativo (Render / Replit) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot de 1v1 SFC a funcionar perfeitamente!'));
app.listen(PORT, () => console.log(`Servidor web na porta ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1551768205444259862";

// --- Configurações e Cargos ---
const CARGO_PROCURANDO_1V1 = "1545802197101576205";
const CARGO_ADMIN = "1545802098338304032";

// --- Ficheiro de Base de Dados Local ---
const DB_FILE = './database.json';
function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ players: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const activeChallenges = new Map();

client.once('ready', async () => {
    console.log(`Bot 1v1 online como ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('tabela')
            .setDescription('Mostra a tabela de classificação 1v1 em texto')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' })),
        
        new SlashCommandBuilder()
            .setName('desafiar')
            .setDescription('Cria um desafio 1v1 com seleção de mapa')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('adversario').setDescription('Deixe vazio para aleatório').setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('analise')
            .setDescription('Mostra o painel de análise detalhado de um membro')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('utilizador').setDescription('Membro a analisar (opcional)').setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('reset')
            .setDescription('Reseta a tabela e dados de 1v1 (Apenas Admins)')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Slash commands de 1v1 registados com sucesso!');
    } catch (error) {
        console.error(error);
    }
});

// --- Função para gerar Embed de Tabela Textual (1-10 por página) ---
function generateRankingEmbed(playersArray, page = 0) {
    const startIdx = page * 10;
    const currentPlayers = playersArray.slice(startIdx, startIdx + 10);
    const totalPages = Math.ceil(playersArray.length / 10) || 1;

    const embed = new EmbedBuilder()
        .setTitle('🏆 Tabela de Classificação - 1v1')
        .setColor(0x00FFCC)
        .setTimestamp()
        .setFooter({ text: `Página ${page + 1} de${totalPages}` });

    if (currentPlayers.length === 0) {
        embed.setDescription('⚠️ Ainda não existem jogadores com pontuação positiva.');
    } else {
        let desc = '';
        for (let i = 0; i < currentPlayers.length; i++) {
            const p = currentPlayers[i];
            const rank = startIdx + i + 1;
            desc += `${rank}. <@${p.userId}> 🎲 ${p.points} pontos\n`;
        }
        embed.setDescription(desc);
    }

    return embed;
}

// --- Gestão de Comandos e Interações ---
client.on('interactionCreate', async interaction => {
    const db = loadDB();

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'tabela') {
            const players = Object.values(db.players)
                .filter(p => p.points > 0)
                .sort((a, b) => b.points - a.points);
            
            if (players.length === 0) {
                return await interaction.reply({ content: '⚠️ Ainda não existem jogadores com pontuação positiva na tabela 1v1!', ephemeral: true });
            }

            const embed = generateRankingEmbed(players, 0);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tabela_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('tabela_next').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled(players.length <= 10)
            );

            interaction.client.tabelaCache = interaction.client.tabelaCache || new Map();
            interaction.client.tabelaCache.set(interaction.user.id, { page: 0, players });

            return await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'desafiar') {
            const adversario = interaction.options.getUser('adversario');

            if (adversario && adversario.id === interaction.user.id) {
                return await interaction.reply({ content: '❌ Não podes desafiar a ti próprio!', ephemeral: true });
            }
            if (adversario && adversario.bot) {
                return await interaction.reply({ content: '❌ Não podes desafiar um bot!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚔️ NOVO DESAFIO 1v1 LANÇADO!')
                .setDescription('Seleciona o mapa desejado no menu abaixo e clica para aceitar o duelo!')
                .setColor(0xFF4500)
                .addFields(
                    { name: '👤 Desafiante', value: `${interaction.user}`, inline: true },
                    { name: '🛡️ Adversário', value: adversario ? `${adversario}` : '`Aberto a qualquer um`', inline: true },
                    { name: '📌 Regras', value: '• Vitória: **+32 pts** | Derrota: **-32 pts** | Empate: **+10 pts**', inline: false }
                );

            const mapSelect = new StringSelectMenuBuilder()
                .setCustomId(`escolher_mapa_${interaction.user.id}_${adversario ? adversario.id : 'aleatorio'}`)
                .setPlaceholder('🗺️ Selecione o mapa do confronto...')
                .addOptions([
                    { label: 'Homestead', value: 'Homestead', description: 'Jogar no mapa Homestead' },
                    { label: 'Airport', value: 'Airport', description: 'Jogar no mapa Airport' },
                    { label: 'Facility', value: 'Facility', description: 'Jogar no mapa Facility' },
                    { label: 'Abandoned Prison', value: 'Abandoned Prison', description: 'Jogar no mapa Abandoned Prison' },
                    { label: 'Arcade', value: 'Arcade', description: 'Jogar no mapa Arcade' },
                    { label: 'Abandoned Facility', value: 'Abandoned Facility', description: 'Jogar no mapa Abandoned Facility' }
                ]);

            const row = new ActionRowBuilder().addComponents(mapSelect);
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'analise') {
            const targetUser = interaction.options.getUser('utilizador') || interaction.user;
            const pData = db.players[targetUser.id] || { points: 0, wins: 0, draws: 0, losses: 0 };
            
            const totalJogos = (pData.wins || 0) + (pData.losses || 0) + (pData.draws || 0);
            const taxaVitorias = totalJogos > 0 ? (((pData.wins || 0) / totalJogos) * 100).toFixed(1) : 0;

            const embed = new EmbedBuilder()
                .setTitle(`📊 Perfil de Desempenho - ${targetUser.username}`)
                .setColor(0x0099FF)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '⭐ Pontuação', value: `\`${pData.points} PTS\``, inline: true },
                    { name: '📈 Taxa de Vitória', value: `\`${taxaVitorias}%\``, inline: true },
                    { name: '🎮 Partidas', value: `\`${totalJogos}\``, inline: true },
                    { name: '✅ Vitórias', value: `\`${pData.wins || 0}\``, inline: true },
                    { name: '❌ Derrotas', value: `\`${pData.losses || 0}\``, inline: true },
                    { name: '🤝 Empates', value: `\`${pData.draws || 0}\``, inline: true }
                );

            return await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'reset') {
            if (!interaction.member.roles.cache.has(CARGO_ADMIN) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas administradores podem usar este comando!', ephemeral: true });
            }
            db.players = {};
            saveDB(db);
            return await interaction.reply({ content: '🔄 A tabela e os dados de 1v1 foram resetados com sucesso!', ephemeral: true });
        }
    }

    // Seleção do mapa (Passo 1 do Desafio)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('escolher_mapa_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const targetId = parts[3];
        const mapa = interaction.values[0];

        if (interaction.user.id !== challengerId) {
            return await interaction.reply({ content: '❌ Apenas quem criou o desafio pode escolher o mapa!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('⚔️ NOVO DESAFIO 1v1 LANÇADO!')
            .setDescription('Um combate foi criado. Clica no botão abaixo para aceitar o duelo!')
            .setColor(0xFF4500)
            .addFields(
                { name: '👤 Desafiante', value: `<@${challengerId}>`, inline: true },
                { name: '🛡️ Adversário', value: targetId !== 'aleatorio' ? `<@${targetId}>` : '`Aberto a qualquer um`', inline: true },
                { name: '🗺️ Mapa', value: `\`${mapa}\``, inline: false },
                { name: '📌 Regras', value: '• Vitória: **+32 pts** | Derrota: **-32 pts** | Empate: **+10 pts**', inline: false }
            );

        const btnAccept = new ButtonBuilder()
            .setCustomId(`aceitar_desafio_${challengerId}_${targetId}_${encodeURIComponent(mapa)}`)
            .setLabel('✅ Aceitar Desafio')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(btnAccept);
        const content = `<@&${CARGO_PROCURANDO_1V1}>`;

        const msg = await interaction.channel.send({ content: content, embeds: [embed], components: [row] });
        await interaction.update({ content: '✅ Desafio publicado com sucesso no canal!', embeds: [], components: [] });
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'tabela_prev' || interaction.customId === 'tabela_next') {
            const cacheData = interaction.client.tabelaCache?.get(interaction.user.id);
            if (!cacheData) return await interaction.reply({ content: 'Sessão expirada. Executa o comando `/tabela 1v1` novamente.', ephemeral: true });

            cacheData.page += interaction.customId === 'tabela_next' ? 1 : -1;
            const embed = generateRankingEmbed(cacheData.players, cacheData.page);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tabela_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(cacheData.page === 0),
                new ButtonBuilder().setCustomId('tabela_next').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled((cacheData.page + 1) * 10 >= cacheData.players.length)
            );

            return await interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.customId.startsWith('aceitar_desafio_')) {
            const parts = interaction.customId.split('_');
            const challengerId = parts[2];
            const targetId = parts[3];
            const mapa = decodeURIComponent(parts[4]);

            if (interaction.user.id === challengerId) {
                return await interaction.reply({ content: '❌ Não podes aceitar o teu próprio desafio!', ephemeral: true });
            }
            if (targetId !== 'aleatorio' && interaction.user.id !== targetId) {
                return await interaction.reply({ content: '❌ Este desafio foi direcionado para outro jogador!', ephemeral: true });
            }

            try {
                const thread = await interaction.channel.threads.create({
                    name: `1v1-${interaction.user.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PrivateThread,
                    reason: 'Partida 1v1 privada'
                });

                await thread.members.add(challengerId);
                await thread.members.add(interaction.user.id);

                const embedThread = new EmbedBuilder()
                    .setTitle('⚔️ SALA DE CONFRONTO 1v1')
                    .setDescription(
                        `**Participantes:** <@${challengerId}> ⚔️ <@${interaction.user.id}>\n` +
                        `**Mapa:** \`${mapa}\`\n\n` +
                        `### 📌 Instruções:\n` +
                        `1. Joguem a partida no mapa indicado.\n` +
                        `2. **Ambos** devem selecionar o resultado exato abaixo.\n` +
                        `3. O canal fechará automaticamente após a validação.`
                    )
                    .setColor(0x00FF99);

                const selectMenuResult = new StringSelectMenuBuilder()
                    .setCustomId(`resultado_1v1_${challengerId}_${interaction.user.id}`)
                    .setPlaceholder('Selecione o resultado exato...')
                    .addOptions([
                        { label: 'Desafiante Venceu (2-0)', value: 'v_2_0' },
                        { label: 'Desafiante Venceu (2-1)', value: 'v_2_1' },
                        { label: 'Desafiante Venceu (3-2)', value: 'v_3_2' },
                        { label: 'Adversário Venceu (2-0)', value: 'a_2_0' },
                        { label: 'Adversário Venceu (2-1)', value: 'a_2_1' },
                        { label: 'Adversário Venceu (3-2)', value: 'a_3_2' },
                        { label: 'Empate Geral (+10 pts cada)', value: 'empate' }
                    ]);

                const rowResult = new ActionRowBuilder().addComponents(selectMenuResult);
                await thread.send({ embeds: [embedThread], components: [rowResult] });

                await interaction.update({ content: `✅ Desafio aceite! Tópico privado criado: ${thread}`, components: [] });
            } catch (err) {
                console.error(err);
                return await interaction.reply({ content: '❌ Erro ao criar o tópico privado.', ephemeral: true });
            }
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('resultado_1v1_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const acceptorId = parts[3];

        if (interaction.user.id !== challengerId && interaction.user.id !== acceptorId) {
            return await interaction.reply({ content: '❌ Apenas os participantes podem votar!', ephemeral: true });
        }

        interaction.client.pendingResults = interaction.client.pendingResults || new Map();
        let matchVotes = interaction.client.pendingResults.get(interaction.channelId) || {};
        matchVotes[interaction.user.id] = interaction.values[0];
        interaction.client.pendingResults.set(interaction.channelId, matchVotes);

        await interaction.reply({ content: `✅ Voto registado (**${interaction.values[0]}**). A aguardar o adversário...`, ephemeral: true });

        if (matchVotes[challengerId] && matchVotes[acceptorId]) {
            if (matchVotes[challengerId] !== matchVotes[acceptorId]) {
                await interaction.channel.send('⚠️ Os votos não coincidem! Dialoguem e votem novamente.');
                interaction.client.pendingResults.delete(interaction.channelId);
                return;
            }

            const result = matchVotes[challengerId];
            let winnerId = null, loserId = null, isDraw = false;

            if (result.startsWith('v_')) {
                winnerId = challengerId;
                loserId = acceptorId;
            } else if (result.startsWith('a_')) {
                winnerId = acceptorId;
                loserId = challengerId;
            } else if (result === 'empate') {
                isDraw = true;
            }

            if (!db.players[challengerId]) db.players[challengerId] = { userId: challengerId, points: 0, wins: 0, draws: 0, losses: 0 };
            if (!db.players[acceptorId]) db.players[acceptorId] = { userId: acceptorId, points: 0, wins: 0, draws: 0, losses: 0 };

            if (isDraw) {
                db.players[challengerId].points = (db.players[challengerId].points || 0) + 10;
                db.players[challengerId].draws = (db.players[challengerId].draws || 0) + 1;

                db.players[acceptorId].points = (db.players[acceptorId].points || 0) + 10;
                db.players[acceptorId].draws = (db.players[acceptorId].draws || 0) + 1;
            } else {
                db.players[winnerId].points = (db.players[winnerId].points || 0) + 32;
                db.players[winnerId].wins = (db.players[winnerId].wins || 0) + 1;

                db.players[loserId].points = (db.players[loserId].points || 0) - 32;
                db.players[loserId].losses = (db.players[loserId].losses || 0) + 1;
            }

            saveDB(db);
            interaction.client.pendingResults.delete(interaction.channelId);

            const embedFinal = new EmbedBuilder()
                .setTitle('🏆 CONFRONTO CONCLUÍDO!')
                .setDescription('Pontuação atualizada com sucesso. Este canal será eliminado em 5 segundos.')
                .setColor(0x00FF00);

            await interaction.channel.send({ embeds: [embedFinal] });
            setTimeout(async () => {
                try { await interaction.channel.delete(); } catch (e) {}
            }, 5000);
        }
    }
});

client.login(TOKEN);
