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

            const titleStatus = adversario 
                ? `<a:emoji_67:1551828003015893023> AGUARDANDO ${adversario.username.toUpperCase()} ACEITAR DESAFIO` 
                : `<a:emoji_67:1551828003015893023> AGUARDANDO ALGUM MEMBRO ACEITAR`;

            const embed = new EmbedBuilder()
                .setTitle(titleStatus)
                .setDescription('Seleciona o mapa desejado no menu abaixo para publicar o desafio!')
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

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('escolher_mapa_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const targetId = parts[3];
        const mapa = interaction.values[0];

        if (interaction.user.id !== challengerId) {
            return await interaction.reply({ content: '❌ Apenas quem criou o desafio pode escolher o mapa!', ephemeral: true });
        }

        let targetUserObj = null;
        if (targetId !== 'aleatorio') {
            targetUserObj = await client.users.fetch(targetId).catch(() => null);
        }

        const titleStatus = targetUserObj 
            ? `<a:emoji_67:1551828003015893023> AGUARDANDO ${targetUserObj.username.toUpperCase()} ACEITAR DESAFIO` 
            : `<a:emoji_67:1551828003015893023> AGUARDANDO ALGUM MEMBRO ACEITAR`;

        const embed = new EmbedBuilder()
            .setTitle(titleStatus)
            .setDescription('Um combate foi criado. Clica no botão abaixo para aceitar o duelo!')
            .setColor(0xFF4500)
            .addFields(
                { name: '👤 Desafiante', value: `<@${challengerId}>`, inline: true },
                { name: '🛡️ Adversário', value: targetId !== 'aleatorio' ? `<@${targetId}>` : '`Aberto a qualquer um`', inline: true },
                { name: '🗺️ Mapa', value: `\`${mapa}\``, inline: false },
                { name: '📌 Regras', value: '• Vitória: **+32 pts** | Derrota: **-32 pts** | Empate: **+10 pts**', inline: false }
            );

        // Botão com o emoji animado <a:sla:1551829027801800714>
        const btnAccept = new ButtonBuilder()
            .setCustomId(`aceitar_desafio_${challengerId}_${targetId}_${encodeURIComponent(mapa)}`)
            .setLabel('Aceitar Desafio')
            .setEmoji('1551829027801800714') 
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(btnAccept);
        const content = `<@&${CARGO_PROCURANDO_1V1}>`;

        await interaction.channel.send({ content: content, embeds: [embed], components: [row] });
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
                        `3. O canal fechará automaticamente após a validação.\n` +
                        `⚠️ *Nota: O cancelamento exige que ambos cliquem no botão de cancelar.*`
                    )
                    .setColor(0x00FF99);

                const selectMenuResult = new StringSelectMenuBuilder()
                    .setCustomId(`resultado_1v1_${challengerId}_${interaction.user.id}`)
                    .setPlaceholder('Selecione o resultado do confronto...')
                    .addOptions([
                        { label: 'Desafiante venceu', value: 'desafiante_venceu', description: 'O criador do desafio ganhou a partida' },
                        { label: 'O que aceitou o desafio venceu', value: 'aceitou_venceu', description: 'O adversário que aceitou ganhou a partida' },
                        { label: 'Ambos empataram', value: 'empate', description: 'A partida terminou em empate (+10 pts para cada)' }
                    ]);

                const btnCancel = new ButtonBuilder()
                    .setCustomId(`cancelar_desafio_${challengerId}_${interaction.user.id}`)
                    .setLabel('❌ Cancelar Desafio (0/2)')
                    .setStyle(ButtonStyle.Danger);

                const rowResult = new ActionRowBuilder().addComponents(selectMenuResult);
                const rowCancel = new ActionRowBuilder().addComponents(btnCancel);

                await thread.send({ embeds: [embedThread], components: [rowResult, rowCancel] });

                // Altera para o emoji animado <a:emoji_67:1551828003015893023>
                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setTitle('<a:emoji_67:1551828003015893023> DESAFIO 1v1 EM ANDAMENTO')
                    .setColor(0xF1C40F);

                if (targetId === 'aleatorio') {
                    const fields = originalEmbed.data.fields;
                    if (fields && fields[1]) {
                        fields[1].value = `<@${interaction.user.id}>`;
                    }
                }

                await interaction.update({ embeds: [originalEmbed], components: [] });

                // --- Timeout de 2 horas ---
                const timeoutHandle = setTimeout(async () => {
                    try {
                        const fetchedChannel = await client.channels.fetch(thread.id).catch(() => null);
                        if (fetchedChannel) {
                            await fetchedChannel.send('⚠️ O tempo limite de 2 horas expirou. O desafio foi cancelado automaticamente por inatividade.');
                            setTimeout(async () => {
                                try { await fetchedChannel.delete(); } catch (e) {}
                            }, 5000);
                        }

                        const starterMessage = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
                        if (starterMessage) {
                            const expiredEmbed = EmbedBuilder.from(starterMessage.embeds[0])
                                .setTitle('⌛ Desafio expirado por inatividade (2h)')
                                .setColor(0x7F8C8D);
                            await starterMessage.edit({ embeds: [expiredEmbed], components: [] });
                        }
                    } catch (e) {
                        console.error("Erro no timeout de 2h:", e);
                    }
                }, 2 * 60 * 60 * 1000);

                interaction.client.matchTimeouts = interaction.client.matchTimeouts || new Map();
                interaction.client.matchTimeouts.set(thread.id, timeoutHandle);

            } catch (err) {
                console.error(err);
                return await interaction.reply({ content: '❌ Erro ao criar o tópico privado.', ephemeral: true });
            }
        }

        if (interaction.customId.startsWith('cancelar_desafio_')) {
            const parts = interaction.customId.split('_');
            const challengerId = parts[2];
            const acceptorId = parts[3];

            if (interaction.user.id !== challengerId && interaction.user.id !== acceptorId) {
                return await interaction.reply({ content: '❌ Apenas os participantes podem cancelar o desafio!', ephemeral: true });
            }

            interaction.client.cancelVotes = interaction.client.cancelVotes || new Map();
            let cancelSet = interaction.client.cancelVotes.get(interaction.channelId) || new Set();
            cancelSet.add(interaction.user.id);
            interaction.client.cancelVotes.set(interaction.channelId, cancelSet);

            const count = cancelSet.size;

            if (count < 2) {
                try {
                    const actionRows = interaction.message.components;
                    for (let r of actionRows) {
                        for (let comp of r.components) {
                            if (comp.customId && comp.customId.startsWith('cancelar_desafio_')) {
                                comp.data.label = `❌ Cancelar Desafio (${count}/2)`;
                            }
                        }
                    }
                    await interaction.update({ components: actionRows });
                } catch (e) {}

                return await interaction.followUp({ content: `⚠️ <@${interaction.user.id}> votou para cancelar. Falta o voto do outro participante (**${count}/2**).`, ephemeral: false });
            } else {
                if (interaction.client.matchTimeouts?.has(interaction.channelId)) {
                    clearTimeout(interaction.client.matchTimeouts.get(interaction.channelId));
                    interaction.client.matchTimeouts.delete(interaction.channelId);
                }
                interaction.client.cancelVotes.delete(interaction.channelId);

                try {
                    const starterMessage = await interaction.channel.fetchStarterMessage().catch(() => null);
                    if (starterMessage) {
                        const cancelEmbed = EmbedBuilder.from(starterMessage.embeds[0])
                            .setTitle('❌ Desafio cancelado')
                            .setColor(0xFF0000);
                        await starterMessage.edit({ embeds: [cancelEmbed], components: [] });
                    }
                } catch (e) {}

                const embedCancel = new EmbedBuilder()
                    .setTitle('❌ DESAFIO CANCELADO')
                    .setDescription(`Ambos os participantes concordaram em cancelar o confronto. Este canal será eliminado em 5 segundos.`)
                    .setColor(0xFF0000);

                await interaction.update({ content: '', embeds: [embedCancel], components: [] });
                
                setTimeout(async () => {
                    try { await interaction.channel.delete(); } catch (e) {}
                }, 5000);
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

        await interaction.reply({ content: `✅ Voto registado. A aguardar o adversário...`, ephemeral: true });

        if (matchVotes[challengerId] && matchVotes[acceptorId]) {
            if (matchVotes[challengerId] !== matchVotes[acceptorId]) {
                await interaction.channel.send('⚠️ Os votos não coincidem! Dialoguem e votem novamente.');
                interaction.client.pendingResults.delete(interaction.channelId);
                return;
            }

            if (interaction.client.matchTimeouts?.has(interaction.channelId)) {
                clearTimeout(interaction.client.matchTimeouts.get(interaction.channelId));
                interaction.client.matchTimeouts.delete(interaction.channelId);
            }

            const result = matchVotes[challengerId];
            let winnerId = null, loserId = null, isDraw = false;

            if (result === 'desafiante_venceu') {
                winnerId = challengerId;
                loserId = acceptorId;
            } else if (result === 'aceitou_venceu') {
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

            try {
                const starterMessage = await interaction.channel.fetchStarterMessage();
                if (starterMessage) {
                    const finalEmbed = EmbedBuilder.from(starterMessage.embeds[0])
                        .setTitle(isDraw ? 'Desafio finalizado ambos empataram' : `Desafio finalizado o vencedor foi <@${winnerId}>`)
                        .setColor(0x00FF00);
                    
                    const fields = finalEmbed.data.fields;
                    if (fields && fields[1] && fields[1].value.includes('Aberto a qualquer um')) {
                        fields[1].value = `<@${acceptorId}>`;
                    }

                    await starterMessage.edit({ embeds: [finalEmbed], components: [] });
                }
            } catch (e) {
                console.error("Não foi possível atualizar a mensagem original pública:", e);
            }

            const embedFinal = new EmbedBuilder()
                .setTitle('🏆 CONFRONTO CONCLUÍDO!')
                .setDescription(isDraw ? 'Desafio finalizado ambos empataram' : `Desafio finalizado o vencedor foi <@${winnerId}>`)
                .setColor(0x00FF00);

            await interaction.channel.send({ embeds: [embedFinal] });
            setTimeout(async () => {
                try { await interaction.channel.delete(); } catch (e) {}
            }, 5000);
        }
    }
});

client.login(TOKEN);
