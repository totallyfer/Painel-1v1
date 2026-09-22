const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, AttachmentBuilder 
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
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
        fs.writeFileSync(DB_FILE, JSON.stringify({ players: {}, settings: { title: "Ranking 1v1 SFC" } }, null, 2));
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
            .setDescription('Mostra a tabela de classificação 1v1 com imagens')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' })),
        
        new SlashCommandBuilder()
            .setName('desafiar')
            .setDescription('Cria um desafio avançado de 1v1')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('adversario').setDescription('Deixe vazio para aleatório').setRequired(false))
            .addStringOption(option => option.setName('mapa').setDescription('Nome do mapa do confronto').setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('analise')
            .setDescription('Mostra o painel de análise detalhado de um membro')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('utilizador').setDescription('Membro a analisar (opcional)').setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('reset')
            .setDescription('Reseta a tabela e dados de 1v1 (Apenas Admins)')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' })),
        
        new SlashCommandBuilder()
            .setName('painel')
            .setDescription('Painel de controlo e definições do 1v1 (Apenas Admins)')
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

// --- Gerador de Imagem do Ranking com Fotos de Perfil e Cores Seguras ---
async function generateRankingImage(playersArray, page = 0) {
    const canvas = createCanvas(800, 650);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('🏆 Tabela de Classificação - 1v1 SFC', 40, 55);

    ctx.fillStyle = '#949ba4';
    ctx.font = '16px sans-serif';
    ctx.fillText('Ranking oficial atualizado dos melhores combatentes', 40, 85);

    const startIdx = page * 10;
    const currentPlayers = playersArray.slice(startIdx, startIdx + 10);

    let y = 120;
    for (let i = 0; i < currentPlayers.length; i++) {
        const p = currentPlayers[i];
        const rank = startIdx + i + 1;

        ctx.fillStyle = '#2b2d31';
        ctx.beginPath();
        ctx.roundRect(40, y, 720, 46, 8);
        ctx.fill();

        ctx.fillStyle = rank === 1 ? '#f1c40f' : rank === 2 ? '#95a5a6' : rank === 3 ? '#e67e22' : '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`#${rank}`, 60, y + 28);

        if (p.avatarUrl) {
            try {
                const avatar = await loadImage(p.avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(125, y + 23, 18, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 107, y + 5, 36, 36);
                ctx.restore();
            } catch (e) {
                ctx.fillStyle = '#5865f2';
                ctx.beginPath();
                ctx.arc(125, y + 23, 18, 0, Math.PI * 2, true);
                ctx.fill();
            }
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(p.username || 'Utilizador', 155, y + 28);

        ctx.fillStyle = '#2ecc71';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Vitórias: ${p.wins || 0}`, 490, y + 28);

        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${p.points} PTS`, 730, y + 28);
        ctx.textAlign = 'left';

        y += 52;
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'tabela-1v1.png' });
}

// --- Gestão de Comandos e Interações ---
client.on('interactionCreate', async interaction => {
    const db = loadDB();

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'tabela') {
            await interaction.deferReply();
            const players = Object.values(db.players)
                .filter(p => p.points > 0)
                .sort((a, b) => b.points - a.points);
            
            if (players.length === 0) {
                return await interaction.editReply('⚠️ Ainda não existem jogadores com pontuação positiva na tabela 1v1!');
            }

            const attachment = await generateRankingImage(players, 0);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tabela_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('tabela_next').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled(players.length <= 10)
            );

            interaction.client.tabelaCache = interaction.client.tabelaCache || new Map();
            interaction.client.tabelaCache.set(interaction.user.id, { page: 0, players });

            return await interaction.editReply({ files: [attachment], components: [row] });
        }

        if (commandName === 'desafiar') {
            const adversario = interaction.options.getUser('adversario');
            const mapa = interaction.options.getString('mapa') || '🏟️ Arena Principal / Aleatório';

            if (adversario && adversario.id === interaction.user.id) {
                return await interaction.reply({ content: '❌ Não podes desafiar a ti próprio!', ephemeral: true });
            }
            if (adversario && adversario.bot) {
                return await interaction.reply({ content: '❌ Não podes desafiar um bot!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚔️ NOVO DESAFIO 1v1 LANÇADO!')
                .setDescription('Um novo combate foi criado na arena. Verifique os detalhes abaixo e clique no botão para aceitar o duelo!')
                .setColor(0xFF4500)
                .addFields(
                    { name: '👤 Desafiante', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                    { name: '🛡️ Adversário', value: adversario ? `${adversario}` : '`Aberto a qualquer desafiante`', inline: true },
                    { name: '🗺️ Mapa Selecionado', value: `\`${mapa}\``, inline: false },
                    { name: '📌 Regras & Instruções', value: '• Vitória: **+32 pontos** | Derrota: **-32 pontos** | Empate: **+10 pontos** (para ambos).\n• Ao aceitar, será criado um canal privado exclusivo para o confronto.\n• Respeite sempre as regras do fair-play.', inline: false }
                )
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Sistema de Confrontos SFC • Aguardando Oponente' })
                .setTimestamp();

            const btnAccept = new ButtonBuilder()
                .setCustomId(`aceitar_desafio_${interaction.user.id}_${adversario ? adversario.id : 'aleatorio'}`)
                .setLabel('✅ Aceitar Desafio')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(btnAccept);

            const content = `<@&${CARGO_PROCURANDO_1V1}>`;
            const msg = await interaction.reply({ content: content, embeds: [embed], components: [row], fetchReply: true });

            activeChallenges.set(msg.id, {
                challengerId: interaction.user.id,
                targetId: adversario ? adversario.id : null,
                mapa
            });
            return;
        }

        if (commandName === 'analise') {
            const targetUser = interaction.options.getUser('utilizador') || interaction.user;
            const pData = db.players[targetUser.id] || { username: targetUser.username, points: 0, wins: 0, draws: 0, losses: 0 };
            
            const totalJogos = (pData.wins || 0) + (pData.losses || 0) + (pData.draws || 0);
            const taxaVitorias = totalJogos > 0 ? (((pData.wins || 0) / totalJogos) * 100).toFixed(1) : 0;

            const embed = new EmbedBuilder()
                .setTitle(`📊 Perfil de Desempenho 1v1`)
                .setDescription(`Estatísticas detalhadas de combate para **${targetUser.username}**`)
                .setColor(0x0099FF)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '⭐ Pontuação Total', value: `\`${pData.points} PTS\``, inline: true },
                    { name: '📈 Taxa de Vitória', value: `\`${taxaVitorias}%\``, inline: true },
                    { name: '🎮 Total de Partidas', value: `\`${totalJogos}\``, inline: true },
                    { name: '✅ Vitórias', value: `\`${pData.wins || 0}\``, inline: true },
                    { name: '❌ Derrotas', value: `\`${pData.losses || 0}\``, inline: true },
                    { name: '🤝 Empates', value: `\`${pData.draws || 0}\``, inline: true }
                )
                .setFooter({ text: 'Painel de Análise SFC' })
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

        if (commandName === 'painel') {
            if (!interaction.member.roles.cache.has(CARGO_ADMIN) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas administradores podem aceder ao painel!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Painel de Controlo Administrativo')
                .setDescription('Gerencie as opções do sistema de 1v1 através do menu interativo abaixo.')
                .setColor(0xFFA500);

            const menu = new StringSelectMenuBuilder()
                .setCustomId('painel_select')
                .setPlaceholder('Seleciona uma ação administrativa...')
                .addOptions([
                    { label: 'Mudar Nome da Tabela', value: 'mudar_nome', description: 'Altera o título exibido no ranking' },
                    { label: 'Remover Membro', value: 'remover_membro', description: 'Remove um jogador da tabela' },
                    { label: 'Zerar Pontos de Membro', value: 'zerar_pontos', description: 'Coloca os pontos de um jogador a zero' }
                ]);

            const row = new ActionRowBuilder().addComponents(menu);
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'tabela_prev' || interaction.customId === 'tabela_next') {
            const cacheData = interaction.client.tabelaCache?.get(interaction.user.id);
            if (!cacheData) return await interaction.reply({ content: 'Sessão expirada. Executa o comando `/tabela 1v1` novamente.', ephemeral: true });

            cacheData.page += interaction.customId === 'tabela_next' ? 1 : -1;
            const attachment = await generateRankingImage(cacheData.players, cacheData.page);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tabela_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(cacheData.page === 0),
                new ButtonBuilder().setCustomId('tabela_next').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled((cacheData.page + 1) * 10 >= cacheData.players.length)
            );

            return await interaction.update({ files: [attachment], components: [row] });
        }

        if (interaction.customId.startsWith('aceitar_desafio_')) {
            const parts = interaction.customId.split('_');
            const challengerId = parts[2];
            const targetId = parts[3];

            if (interaction.user.id === challengerId) {
                return await interaction.reply({ content: '❌ Não podes desafiar a ti próprio!', ephemeral: true });
            }
            if (targetId !== 'aleatorio' && interaction.user.id !== targetId) {
                return await interaction.reply({ content: '❌ Este desafio foi direcionado especificamente para outro jogador!', ephemeral: true });
            }

            const challengeData = activeChallenges.get(interaction.message.id);
            if (!challengeData) {
                return await interaction.reply({ content: '⚠️ Este desafio já expirou ou foi concluído.', ephemeral: true });
            }

            try {
                const thread = await interaction.channel.threads.create({
                    name: `arena-1v1-${interaction.user.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PrivateThread,
                    reason: 'Partida 1v1 privada a decorrer'
                });

                await thread.members.add(challengerId);
                await thread.members.add(interaction.user.id);

                const embedThread = new EmbedBuilder()
                    .setTitle('⚔️ SALA DE CONFRONTO PRIVADA - 1v1')
                    .setDescription(
                        `**Participantes:** <@${challengerId}> ⚔️ <@${interaction.user.id}>\n` +
                        `**Mapa Atribuído:** \`${challengeData.mapa}\`\n\n` +
                        `### 📌 Instruções para Registo do Resultado:\n` +
                        `1. Joguem a partida no mapa indicado.\n` +
                        `2. **Ambos os jogadores** devem selecionar o resultado exato no menu suspenso abaixo.\n` +
                        `3. O vencedor recebe **+32**, o derrotado perde **-32** e em caso de empate ambos ganham **+10 pontos**. O canal fechará em 5 segundos.`
                    )
                    .setColor(0x00FF99)
                    .setTimestamp();

                const selectMenuResult = new StringSelectMenuBuilder()
                    .setCustomId(`resultado_1v1_${challengerId}_${interaction.user.id}`)
                    .setPlaceholder('Selecione o resultado exato do confronto...')
                    .addOptions([
                        { label: 'Desafiante Venceu (2-0)', value: 'v_2_0', description: 'Vitória limpa do criador do desafio' },
                        { label: 'Desafiante Venceu (2-1)', value: 'v_2_1', description: 'Vitória suada do criador do desafio' },
                        { label: 'Desafiante Venceu (3-2)', value: 'v_3_2', description: 'Vitória disputada em MD5' },
                        { label: 'Adversário Venceu (2-0)', value: 'a_2_0', description: 'Vitória limpa de quem aceitou' },
                        { label: 'Adversário Venceu (2-1)', value: 'a_2_1', description: 'Vitória suada de quem aceitou' },
                        { label: 'Adversário Venceu (3-2)', value: 'a_3_2', description: 'Vitória disputada em MD5 por quem aceitou' },
                        { label: 'Empate Geral (1-1)', value: 'empate', description: 'Ambos ganham +10 pontos' }
                    ]);

                const rowResult = new ActionRowBuilder().addComponents(selectMenuResult);

                await thread.send({ embeds: [embedThread], components: [rowResult] });

                await interaction.update({ content: `✅ Desafio aceito com sucesso! Tópico privado criado: ${thread}`, components: [] });
                activeChallenges.delete(interaction.message.id);
            } catch (err) {
                console.error(err);
                return await interaction.reply({ content: '❌ Erro ao criar o tópico privado. Verifique se o bot tem permissões de gerir tópicos.', ephemeral: true });
            }
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('resultado_1v1_')) {
        const parts = interaction.customId.split('_');
        const challengerId = parts[2];
        const acceptorId = parts[3];

        if (interaction.user.id !== challengerId && interaction.user.id !== acceptorId) {
            return await interaction.reply({ content: '❌ Apenas os dois participantes do 1v1 podem votar no resultado!', ephemeral: true });
        }

        interaction.client.pendingResults = interaction.client.pendingResults || new Map();
        let matchVotes = interaction.client.pendingResults.get(interaction.channelId) || {};
        matchVotes[interaction.user.id] = interaction.values[0];
        interaction.client.pendingResults.set(interaction.channelId, matchVotes);

        await interaction.reply({ content: `✅ Voto registado com sucesso: **${interaction.values[0]}**. A aguardar o voto do adversário...`, ephemeral: true });

        if (matchVotes[challengerId] && matchVotes[acceptorId]) {
            if (matchVotes[challengerId] !== matchVotes[acceptorId]) {
                await interaction.channel.send('⚠️ **Atenção:** Os votos enviados pelos dois jogadores **não coincidem**! Por favor, dialoguem e votem novamente no resultado correto.');
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

            if (!db.players[challengerId]) db.players[challengerId] = { username: 'Jogador', points: 0, wins: 0, draws: 0, losses: 0, avatarUrl: '' };
            if (!db.players[acceptorId]) db.players[acceptorId] = { username: 'Jogador', points: 0, wins: 0, draws: 0, losses: 0, avatarUrl: '' };

            const userC = await client.users.fetch(challengerId).catch(() => null);
            const userA = await client.users.fetch(acceptorId).catch(() => null);

            if (userC) {
                db.players[challengerId].username = userC.username;
                db.players[challengerId].avatarUrl = userC.displayAvatarURL({ extension: 'png', size: 64 });
            }
            if (userA) {
                db.players[acceptorId].username = userA.username;
                db.players[acceptorId].avatarUrl = userA.displayAvatarURL({ extension: 'png', size: 64 });
            }

            if (isDraw) {
                // Empate dá +10 pontos para ambos
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
                .setTitle('🏆 CONFRONTO CONCLUÍDO COM SUCESSO!')
                .setDescription(`O resultado foi validado e a pontuação foi atualizada (Vitória: +32 | Derrota: -32 | Empate: +10).\n\nEste canal será eliminado automaticamente em 5 segundos.`)
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.channel.send({ embeds: [embedFinal] });
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
        }
    }
});

client.login(TOKEN);
