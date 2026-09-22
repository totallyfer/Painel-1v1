const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, AttachmentBuilder 
} = require('discord.js');
const fs = require('fs');
const express = require('express');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

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

const CARGO_PROCURANDO_1V1 = "1545802197101576205";
const CARGO_ADMIN = "1545802098338304032";

// --- Base de dados local (gravação atómica para evitar ficheiro corrompido) ---
const DB_FILE = './database.json';
function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ players: {} }, null, 2));
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return { players: {} };
    }
}
function saveDB(data) {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_FILE);
}

// ============================================================
// --- SISTEMA DE IMAGEM DE RANKING (@napi-rs/canvas) ---
// ============================================================
const ROW_H = 80, W = 800, HEADER_H = 140;

function drawRoundImage(ctx, img, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
}

async function generateRankingImage(playersArray, page = 0) {
    const PER_PAGE = 10;
    const startIdx = page * PER_PAGE;
    const current = playersArray.slice(startIdx, startIdx + PER_PAGE);
    const H = HEADER_H + Math.max(current.length, 1) * ROW_H + 40;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fundo
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0f1220');
    bgGrad.addColorStop(1, '#1a1f36');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Cabeçalho
    ctx.fillStyle = '#00FFCC';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 TABELA DE CLASSIFICAÇÃO - 1v1', W / 2, 70);
    ctx.fillStyle = '#8b93b5';
    ctx.font = '24px sans-serif';
    const totalPages = Math.ceil(playersArray.length / PER_PAGE) || 1;
    ctx.fillText(`Colocações ${startIdx + 1} a ${Math.min(startIdx + PER_PAGE, playersArray.length)}  •  Página ${page + 1}/${totalPages}`, W / 2, 108);

    if (current.length === 0) {
        ctx.fillStyle = '#c0c6e0';
        ctx.font = '28px sans-serif';
        ctx.fillText('Nenhum jogador com pontuação ainda.', W / 2, HEADER_H + 50);
        return canvas.toBuffer('image/png');
    }

    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

    for (let i = 0; i < current.length; i++) {
        const p = current[i];
        const rank = startIdx + i + 1;
        const y = HEADER_H + i * ROW_H;

        // Linha (card)
        ctx.fillStyle = rank <= 3 ? 'rgba(0, 255, 204, 0.10)' : 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.roundRect(20, y + 5, W - 40, ROW_H - 10, 14);
        ctx.fill();

        // Colocação
        ctx.textAlign = 'left';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillStyle = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#8b93b5';
        ctx.fillText(medals[rank] ? `${medals[rank]} #${rank}` : `#${rank}`, 40, y + ROW_H / 2 + 12);

        // Avatar
        let avatarImg = null;
        try {
            const avatarURL = p.avatarURL || `https://cdn.discordapp.com/embed/avatars/0.png`;
            avatarImg = await loadImage(avatarURL);
        } catch {}
        if (avatarImg) drawRoundImage(ctx, avatarImg, 150, y + 12, ROW_H - 24);

        // Nome + pontos
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText((p.username || 'Jogador').slice(0, 22), 250, y + ROW_H / 2 - 2);

        ctx.fillStyle = '#00FFCC';
        ctx.font = '22px sans-serif';
        ctx.fillText(`${p.points} pontos`, 250, y + ROW_H / 2 + 26);

        // Pontos à direita
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(`${p.points}`, W - 40, y + ROW_H / 2 + 10);
        ctx.fillStyle = '#8b93b5';
        ctx.font = '18px sans-serif';
        ctx.fillText('PTS', W - 40, y + ROW_H / 2 + 32);
    }

    return canvas.toBuffer('image/png');
}

// Devolve array de players ordenado, já com username e avatar carregados
async function getRankedPlayers(db) {
    const players = Object.values(db.players)
        .filter(p => p.points > 0)
        .sort((a, b) => b.points - a.points);

    const enriched = [];
    for (const p of players) {
        const u = await client.users.fetch(p.userId).catch(() => null);
        enriched.push({
            userId: p.userId,
            points: p.points,
            username: u ? u.username : 'Jogador',
            avatarURL: u ? u.displayAvatarURL({ extension: 'png', size: 128 }) : null
        });
    }
    return enriched;
}

// Gera a embed + imagem + botões de paginação da tabela
async function buildTabelaMessage(players, page) {
    const buffer = await generateRankingImage(players, page);
    const attachment = new AttachmentBuilder(buffer, { name: `tabela_pagina_${page + 1}.png` });

    const totalPages = Math.ceil(players.length / 10) || 1;
    const embed = new EmbedBuilder()
        .setTitle('🏆 Tabela de Classificação - 1v1')
        .setColor(0x00FFCC)
        .setImage(`attachment://tabela_pagina_${page + 1}.png`)
        .setTimestamp()
        .setFooter({ text: `Página ${page + 1} de ${totalPages}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tabela_prev_${page}`).setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`tabela_next_${page}`).setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled((page + 1) * 10 >= players.length)
    );

    return { embeds: [embed], files: [attachment], components: [row] };
}

client.once('ready', async () => {
    console.log(`Bot 1v1 online como ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('tabela')
            .setDescription('Mostra a tabela de classificação 1v1 em imagem')
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
        console.error('Erro ao registar comandos:', error);
    }
});

// --- Gestão de Comandos e Interações ---
client.on('interactionCreate', async interaction => {
    const db = loadDB();

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'tabela') {
            // defer porque gerar a imagem + buscar avatares pode demorar >3s
            await interaction.deferReply();

            const players = await getRankedPlayers(db);
            if (players.length === 0) {
                return await interaction.editReply({ content: '⚠️ Ainda não existem jogadores com pontuação positiva na tabela 1v1!' });
            }

            try {
                const payload = await buildTabelaMessage(players, 0);
                return await interaction.editReply(payload);
            } catch (err) {
                console.error('Erro ao gerar imagem da tabela:', err);
                return await interaction.editReply({ content: '❌ Erro ao gerar a imagem da tabela. Tenta novamente.' });
            }
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
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
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
            const taxaVitorias = totalJogos > 0 ? (((pData.wins || 0) / totalJogos) * 100).toFixed(1) : '0.0';

            // Posição na tabela
            const allPlayers = Object.values(db.players).sort((a, b) => b.points - a.points);
            const position = allPlayers.findIndex(p => p.userId === targetUser.id);
            const posText = position >= 0 ? `#${position + 1}` : 'Sem rank';

            const embed = new EmbedBuilder()
                .setTitle(`📊 Perfil de Desempenho - ${targetUser.username}`)
                .setColor(0x0099FF)
                .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
                .addFields(
                    { name: '⭐ Pontuação', value: `\`${pData.points} PTS\``, inline: true },
                    { name: '🏅 Posição', value: `\`${posText}\``, inline: true },
                    { name: '📈 Taxa de Vitória', value: `\`${taxaVitorias}%\``, inline: true },
                    { name: '🎮 Partidas', value: `\`${totalJogos}\``, inline: true },
                    { name: '✅ Vitórias', value: `\`${pData.wins || 0}\``, inline: true },
                    { name: '❌ Derrotas', value: `\`${pData.losses || 0}\``, inline: true },
                    { name: '🤝 Empates', value: `\`${pData.draws || 0}\``, inline: true }
                )
                .setTimestamp();

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
            .setThumbnail((await client.users.fetch(challengerId).catch(() => null))?.displayAvatarURL({ extension: 'png' }))
            .addFields(
                { name: '👤 Desafiante', value: `<@${challengerId}>`, inline: true },
                { name: '🛡️ Adversário', value: targetId !== 'aleatorio' ? `<@${targetId}>` : '`Aberto a qualquer um`', inline: true },
                { name: '🗺️ Mapa', value: `\`${mapa}\``, inline: false },
                { name: '📌 Regras', value: '• Vitória: **+32 pts** | Derrota: **-32 pts** | Empate: **+10 pts**', inline: false }
            );

        const btnAccept = new ButtonBuilder()
            .setCustomId(`aceitar_desafio_${challengerId}_${targetId}_${encodeURIComponent(mapa)}`)
            .setLabel('Aceitar Desafio')
            .setEmoji('1551829027801800714') 
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(btnAccept);
        const content = `<@&${CARGO_PROCURANDO_1V1}>`;

        await interaction.channel.send({ content, embeds: [embed], components: [row] });
        await interaction.update({ content: '✅ Desafio publicado com sucesso no canal!', embeds: [], components: [] });
    }

    if (interaction.isButton() && (interaction.customId.startsWith('tabela_prev_') || interaction.customId.startsWith('tabela_next_'))) {
        // Paginação da tabela: gera a imagem da página correspondente (1-10, 11-20, ...)
        await interaction.deferUpdate();

        const pageChange = interaction.customId.startsWith('tabela_next_') ? 1 : -1;
        const currentPage = parseInt(interaction.customId.split('_').pop(), 10);
        const newPage = currentPage + pageChange;

        const players = await getRankedClientsSafe(db);
        if (players.length === 0) {
            return await interaction.editReply({ content: '⚠️ A tabela está vazia agora.', embeds: [], files: [], components: [] });
        }

        try {
            const payload = await buildTabelaMessage(players, newPage);
            return await interaction.editReply(payload);
        } catch (err) {
            console.error('Erro ao paginar tabela:', err);
            return await interaction.followUp({ content: '❌ Erro ao mudar de página.', ephemeral: true });
        }
    }

    if (interaction.isButton()) {
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
                const thread = await interaction.message.startThread({
                    name: `1v1-${interaction.user.username}`,
                    autoArchiveDuration: 60,
                    reason: 'Partida 1v1 privada'
                });

                await thread.members.add(challengerId).catch(() => {});
                await thread.members.add(interaction.user.id).catch(() => {});

                const embedThread = new EmbedBuilder()
                    .setTitle('⚔️ SALA DE CONFRONTO 1v1')
                    .setDescription(
                        `**Participantes:** <@${challengerId}> ⚔️ <@${interaction.user.id}>\n` +
                        `**Mapa:** \`${mapa}\`\n\n` +
                        `### 📌 Regras e Instruções do Tópico:\n` +
                        `1. **Envie o link do servidor privado** aqui no tópico para irem para o 1v1.\n` +
                        `2. Ambos os participantes podem enviar mensagens livremente.\n` +
                        `3. Joguem a partida no mapa indicado.\n` +
                        `4. Após o jogo, **ambos** devem selecionar o resultado exato no menu abaixo.\n` +
                        `⚠️ *Nota: O cancelamento exige que ambos cliquem no botão de cancelar.*`
                    )
                    .setColor(0x00FF99);

                const selectMenuResult = new StringSelectMenuBuilder()
                    .setCustomId(`resultado_1v1_${challengerId}_${interaction.user.id}`)
                    .setPlaceholder('Selecione o resultado exato do confronto...')
                    .addOptions([
                        { label: 'Desafiante (1-0)', value: 'desafiante_1_0', description: 'Desafiante venceu por 1 a 0' },
                        { label: 'Adversário (1-0)', value: 'adversario_1_0', description: 'Adversário venceu por 1 a 0' },
                        { label: 'Desafiante (2-1)', value: 'desafiante_2_1', description: 'Desafiante venceu por 2 a 1' },
                        { label: 'Desafiante (2-0)', value: 'desafiante_2_0', description: 'Desafiante venceu por 2 a 0' },
                        { label: 'Adversário (2-1)', value: 'adversario_2_1', description: 'Adversário venceu por 2 a 1' },
                        { label: 'Adversário (2-0)', value: 'adversario_2_0', description: 'Adversário venceu por 2 a 0' },
                        { label: 'Empate Ambos', value: 'empate', description: 'A partida terminou em empate (+10 pts para cada)' }
                    ]);

                const btnCancel = new ButtonBuilder()
                    .setCustomId(`cancelar_desafio_${challengerId}_${interaction.user.id}`)
                    .setLabel('❌ Cancelar Desafio (0/2)')
                    .setStyle(ButtonStyle.Danger);

                const rowResult = new ActionRowBuilder().addComponents(selectMenuResult);
                const rowCancel = new ActionRowBuilder().addComponents(btnCancel);

                await thread.send({ 
                    content: `⚔️ <@${challengerId}> e <@${interaction.user.id}> o vosso tópico privado foi criado!`, 
                    embeds: [embedThread], 
                    components: [rowResult, rowCancel] 
                });

                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setTitle('⚔️ Desafio em andamento')
                    .setColor(0xF1C40F);

                const fields = originalEmbed.data.fields;
                if (fields && fields[1]) {
                    fields[1].value = `<@${interaction.user.id}>`;
                }

                await interaction.update({ embeds: [originalEmbed], components: [] });

                // --- Timeout de 2 horas ---
                const timeoutHandle = setTimeout(async () => {
                    try {
                        const fetchedChannel = await client.channels.fetch(thread.id).catch(() => null);
                        if (fetchedChannel) {
                            await fetchedChannel.send('⚠️ O tempo limite de 2 horas expirou. O desafio foi cancelado automaticamente por inatividade.');
                            setTimeout(async () => { try { await fetchedChannel.delete(); } catch (e) {} }, 5000);
                        }
                        const starterMessage = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
                        if (starterMessage) await starterMessage.delete().catch(() => {});
                    } catch (e) {
                        console.error('Erro no timeout de 2h:', e);
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

                return await interaction.followUp({ content: `⚠️ <@${interaction.user.id}> votou para cancelar. Falta o voto do outro participante (**${count}/2**).` });
            } else {
                if (interaction.client.matchTimeouts?.has(interaction.channelId)) {
                    clearTimeout(interaction.client.matchTimeouts.get(interaction.channelId));
                    interaction.client.matchTimeouts.delete(interaction.channelId);
                }
                interaction.client.cancelVotes.delete(interaction.channelId);

                try {
                    const starterMessage = await interaction.channel.fetchStarterMessage().catch(() => null);
                    if (starterMessage) await starterMessage.delete().catch(() => {});
                } catch (e) {}

                const embedCancel = new EmbedBuilder()
                    .setTitle('❌ DESAFIO CANCELADO')
                    .setDescription(`Ambos os participantes concordaram em cancelar o confronto. Este canal será eliminado em 5 segundos.`)
                    .setColor(0xFF0000);

                await interaction.update({ content: '', embeds: [embedCancel], components: [] });
                
                setTimeout(async () => { try { await interaction.channel.delete(); } catch (e) {} }, 5000);
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

        await interaction.reply({ content: `✅ Voto registado com sucesso. A aguardar o adversário...`, ephemeral: true });

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
            let scoreText = '';

            if (result.startsWith('desafiante_')) {
                winnerId = challengerId;
                loserId = acceptorId;
                if (result === 'desafiante_1_0') scoreText = '1-0';
                if (result === 'desafiante_2_1') scoreText = '2-1';
                if (result === 'desafiante_2_0') scoreText = '2-0';
            } else if (result.startsWith('adversario_')) {
                winnerId = acceptorId;
                loserId = challengerId;
                if (result === 'adversario_1_0') scoreText = '1-0';
                if (result === 'adversario_2_1') scoreText = '2-1';
                if (result === 'adversario_2_0') scoreText = '2-0';
            } else if (result === 'empate') {
                isDraw = true;
            }

            if (!db.players[challengerId]) db.players[challengerId] = { userId: challengerId, points: 0, wins: 0, draws: 0, losses: 0 };
            if (!db.players[acceptorId]) db.players[acceptorId] = { userId: acceptorId, points: 0, wins: 0, draws: 0, losses: 0 };

            if (isDraw) {
                db.players[challengerId].points += 10;
                db.players[challengerId].draws += 1;
                db.players[acceptorId].points += 10;
                db.players[acceptorId].draws += 1;
            } else {
                db.players[winnerId].points += 32;
                db.players[winnerId].wins += 1;
                db.players[loserId].points -= 32;
                db.players[loserId].losses += 1;
            }

            saveDB(db);
            interaction.client.pendingResults.delete(interaction.channelId);

            let winnerUserObj = null;
            if (!isDraw) {
                winnerUserObj = await client.users.fetch(winnerId).catch(() => null);
            }

            const textResult = isDraw 
                ? 'Desafio finalizado ambos empataram' 
                : `Desafio finalizado o vencedor foi ${winnerUserObj ? winnerUserObj.username : 'Desconhecido'}`;

            try {
                const starterMessage = await interaction.channel.fetchStarterMessage().catch(() => null);
                if (starterMessage) {
                    const parentChannel = starterMessage.channel;
                    await starterMessage.delete().catch(() => {});

                    const finalEmbed = new EmbedBuilder()
                        .setTitle(textResult)
                        .setColor(0x00FF00)
                        .addFields(
                            { name: '👤 Desafiante', value: `<@${challengerId}>`, inline: true },
                            { name: '🛡️ Adversário', value: `<@${acceptorId}>`, inline: true },
                            { name: '📊 Placar', value: `\`${isDraw ? 'Empate' : scoreText}\``, inline: false }
                        )
                        .setTimestamp();

                    await parentChannel.send({ embeds: [finalEmbed] });
                }
            } catch (e) {
                console.error('Não foi possível atualizar a mensagem pública de finalização:', e);
            }

            const embedFinal = new EmbedBuilder()
                .setTitle('🏆 CONFRONTO CONCLUÍDO!')
                .setDescription(`${textResult} (${isDraw ? 'Empate' : 'Placar: ' + scoreText})`)
                .setColor(0x00FF00);

            await interaction.channel.send({ embeds: [embedFinal] });
            setTimeout(async () => { try { await interaction.channel.delete(); } catch (e) {} }, 5000);
        }
    }
});

// Helper para buscar jogadores com username/avatar (usado na paginação)
async function getRankedClientsSafe(db) {
    const players = Object.values(db.players)
        .filter(p => p.points > 0)
        .sort((a, b) => b.points - a.points);
    const enriched = [];
    for (const p of players) {
        const u = await client.users.fetch(p.userId).catch(() => null);
        enriched.push({
            userId: p.userId,
            points: p.points,
            username: u ? u.username : 'Jogador',
            avatarURL: u ? u.displayAvatarURL({ extension: 'png', size: 128 }) : null
        });
    }
    return enriched;
}

client.login(TOKEN);
