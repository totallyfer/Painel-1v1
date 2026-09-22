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
const CLIENT_ID = process.env.CLIENT_ID; // ID da aplicação do bot

// --- Configurações e Cargos ---
const CARGO_PROCURANDO_1V1 = "1545802197101576205";
const CARGO_ADMIN = "1545802098338304032";

// --- Ficheiro de Base de Dados Local ---
const DB_FILE = './database.json';
function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ players: {}, settings: { title: "Ranking 1v1 SFC", bgColor: "#1e1e2f" } }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Memória temporária para desafios ativos e resultados pendentes
const activeChallenges = new Map(); // id_desafio -> dados

client.once('ready', async () => {
    console.log(`Bot 1v1 online como ${client.user.tag}!`);

    // Registar Slash Commands
    const commands = [
        new SlashCommandBuilder()
            .setName('tabela')
            .setDescription('Mostra a tabela de classificação 1v1')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' })),
        
        new SlashCommandBuilder()
            .setName('desafiar')
            .setDescription('Desafia um membro para um 1v1')
            .addStringOption(option => option.setName('modo').setDescription('Modo').setRequired(true).addChoices({ name: '1v1', value: '1v1' }))
            .addUserOption(option => option.setName('adversario').setDescription('Deixe vazio para aleatório').setRequired(false))
            .addStringOption(option => option.setName('mapa').setDescription('Nome do mapa do confronto').setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('analise')
            .setDescription('Analisa o desempenho de 1v1 de um membro')
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

// --- Gerador de Imagem do Ranking (Tabela) ---
async function generateRankingImage(playersArray, page = 0, settings) {
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');

    // Fundo personalizado
    ctx.fillStyle = settings.bgColor || '#1e1e2f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Título
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(settings.title || 'Ranking 1v1 SFC', 40, 60);

    const startIdx = page * 10;
    const currentPlayers = playersArray.slice(startIdx, startIdx + 10);

    let y = 110;
    for (let i = 0; i < currentPlayers.length; i++) {
        const p = currentPlayers[i];
        const rank = startIdx + i + 1;

        // Caixa do jogador
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.roundRect(40, y, 720, 42, 8);
        ctx.fill();

        // Posição / Colocação
        ctx.fillStyle = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`#${rank}`, 60, y + 28);

        // Avatar do utilizador
        if (p.avatarUrl) {
            try {
                const avatar = await loadImage(p.avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(125, y + 21, 16, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 109, y + 5, 32, 32);
                ctx.restore();
            } catch (e) {
                // Fallback se falhar carregar avatar
            }
        }

        // Nome
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px sans-serif';
        ctx.fillText(p.username || 'Utilizador', 155, y + 27);

        // Pontos
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${p.points} PTS`, 730, y + 27);
        ctx.textAlign = 'left';

        y += 48;
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'tabela-1v1.png' });
}

// --- Gerador de Imagem de Análise ---
async function generateAnalysisImage(playerData) {
    const canvas = createCanvas(600, 300);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#181824';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Análise de Desempenho 1v1', 40, 50);

    // Avatar
    if (playerData.avatarUrl) {
        try {
            const avatar = await loadImage(playerData.avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(80, 130, 35, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, 45, 95, 70, 70);
            ctx.restore();
        } catch (e) {}
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(playerData.username, 135, 120);

    ctx.fillStyle = '#00ffcc';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Pontuação Atual: ${playerData.points} PTS`, 135, 148);

    // Estatísticas
    const statsY = 200;
    ctx.fillStyle = '#22223b';
    ctx.fillRect(40, statsY, 160, 60);
    ctx.fillRect(220, statsY, 160, 60);
    ctx.fillRect(400, statsY, 160, 60);

    ctx.fillStyle = '#00ff7f';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`Vitórias: ${playerData.wins || 0}`, 55, statsY + 35);

    ctx.fillStyle = '#ffaa00';
    ctx.fillText(`Empates: ${playerData.draws || 0}`, 235, statsY + 35);

    ctx.fillStyle = '#ff4d4d';
    ctx.fillText(`Derrotas: ${playerData.losses || 0}`, 415, statsY + 35);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'analise-1v1.png' });
}

// --- Gestão de Slash Commands e Interações ---
client.on('interactionCreate', async interaction => {
    const db = loadDB();

    // --- COMANDOS SLASH ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // 1. /tabela 1v1
        if (commandName === 'tabela') {
            await interaction.deferReply();
            const players = Object.values(db.players).filter(p => p.points > 0).sort((a, b) => b.points - a.points);
            
            if (players.length === 0) {
                return await interaction.editReply('Ainda não existem jogadores com pontos na tabela 1v1!');
            }

            const attachment = await generateRankingImage(players, 0, db.settings);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tabela_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('tabela_next').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled(players.length <= 10)
            );

            interaction.client.tabelaCache = interaction.client.tabelaCache || new Map();
            interaction.client.tabelaCache.set(interaction.user.id, { page: 0, players });

            return await interaction.editReply({ files: [attachment], components: [row] });
        }

        // 2. /desafiar 1v1
        if (commandName === 'desafiar') {
            const adversario = interaction.options.getUser('adversario');
            const mapa = interaction.options.getString('mapa') || 'Mapa Aleatório';

            if (adversario && adversario.id === interaction.user.id) {
                return await interaction.reply({ content: '❌ Não podes desafiar a ti próprio!', ephemeral: true });
            }
            if (adversario && adversario.bot) {
                return await interaction.reply({ content: '❌ Não podes desafiar um bot!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚔️ Novo Desafio 1v1')
                .setDescription(
                    `**Desafiante:** ${interaction.user}\n` +
                    `**Adversário:** ${adversario ? adversario : 'Qualquer membro (Aleatório)'}\n` +
                    `**Mapa:** ${mapa}`
                )
                .setColor(0xFF4500)
                .setTimestamp();

            const btnAccept = new ButtonBuilder()
                .setCustomId(`aceitar_desafio_${interaction.user.id}_${adversario ? adversario.id : 'aleatorio'}`)
                .setLabel('✅ Aceitar')
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

        // 3. /analise 1v1
        if (commandName === 'analise') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('utilizador') || interaction.user;
            const pData = db.players[targetUser.id] || { username: targetUser.username, points: 0, wins: 0, draws: 0, losses: 0, avatarUrl: targetUser.displayAvatarURL({ extension: 'png' }) };
            pData.username = targetUser.username;
            pData.avatarUrl = targetUser.displayAvatarURL({ extension: 'png' });

            const attachment = await generateAnalysisImage(pData);
            return await interaction.editReply({ files: [attachment] });
        }

        // 4. /reset 1v1
        if (commandName === 'reset') {
            if (!interaction.member.roles.cache.has(CARGO_ADMIN) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas administradores podem usar este comando!', ephemeral: true });
            }
            db.players = {};
            saveDB(db);
            return await interaction.reply({ content: '🔄 A tabela e os dados de 1v1 foram resetados com sucesso!', ephemeral: true });
        }

        // 5. /painel 1v1
        if (commandName === 'painel') {
            if (!interaction.member.roles.cache.has(CARGO_ADMIN) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas administradores podem aceder ao painel!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Painel de Controlo 1v1')
                .setDescription('Escolhe uma das opções abaixo para gerir o sistema de 1v1:')
                .setColor(0x0055FF);

            const menu = new StringSelectMenuBuilder()
                .setCustomId('painel_select')
                .setPlaceholder('Seleciona uma ação...')
                .addOptions([
                    { label: 'Mudar Nome da Tabela', value: 'mudar_nome', description: 'Altera o título exibido no ranking' },
                    { label: 'Remover Membro', value: 'remover_membro', description: 'Remove um jogador da tabela' },
                    { label: 'Zerar Pontos de Membro', value: 'zerar_pontos', description: 'Coloca os pontos de um jogador a zero' },
                    { label: 'Mudar Cor de Fundo', value: 'mudar_cor', description: 'Altera a cor do fundo da imagem do ranking' }
                ]);

            const row = new ActionRowBuilder().addComponents(menu);
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }

    // --- INTERAÇÃO DE BOTÕES E MENUS ---
    if (interaction.isButton()) {
        // Paginação da Tabela
        if (interaction.customId === 'tabela_prev' || interaction.customId === 'tabela_next') {
            const cacheData = interaction.client.tabelaCache?.get(interaction.user.id);
            if (!cacheData) return await interaction.reply({ content: 'Sessão expirada. Executa o comando `/tabela 1v1` novamente.', ephemeral: true });

            cacheData.page += interaction.customId === 'tabela_next' ? 1 : -1;
            const attachment = await generateRankingImage(cacheData.players, cacheData.page, db.settings);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tabela_prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(cacheData.page === 0),
                new ButtonBuilder().setCustomId('tabela_next').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled((cacheData.page + 1) * 10 >= cacheData.players.length)
            );

            return await interaction.update({ files: [attachment], components: [row] });
        }

        // Aceitar Desafio
        if (interaction.customId.startsWith('aceitar_desafio_')) {
            const parts = interaction.customId.split('_');
            const challengerId = parts[2];
            const targetId = parts[3];

            if (interaction.user.id === challengerId) {
                return await interaction.reply({ content: '❌ Não podes aceitar o teu próprio desafio!', ephemeral: true });
            }
            if (targetId !== 'aleatorio' && interaction.user.id !== targetId) {
                return await interaction.reply({ content: '❌ Este desafio foi direcionado especificamente para outro jogador!', ephemeral: true });
            }

            const challengeData = activeChallenges.get(interaction.message.id);
            if (!challengeData) {
                return await interaction.reply({ content: '⚠️ Este desafio já expirou ou foi concluído.', ephemeral: true });
            }

            // Criar Tópico Privado
            try {
                const thread = await interaction.channel.threads.create({
                    name: `1v1-${interaction.user.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PrivateThread,
                    reason: 'Partida 1v1 a decorrer'
                });

                await thread.members.add(challengerId);
                await thread.members.add(interaction.user.id);

                const selectMenuResult = new StringSelectMenuBuilder()
                    .setCustomId(`resultado_1v1_${challengerId}_${interaction.user.id}`)
                    .setPlaceholder('Selecione o resultado do confronto...')
                    .addOptions([
                        { label: 'VOCE 2-0 ADVERSARIO', value: 'v_2_0', description: 'Desafiante ganhou por 2 a 0' },
                        { label: 'VOCE 2-1 ADVERSARIO', value: 'v_2_1', description: 'Desafiante ganhou por 2 a 1' },
                        { label: 'VOCE 3-2 ADVERSARIO', value: 'v_3_2', description: 'Desafiante ganhou por 3 a 2' },
                        { label: 'ADVERSARIO 2-0 VOCE', value: 'a_2_0', description: 'Adversário ganhou por 2 a 0' },
                        { label: 'ADVERSARIO 2-1 VOCE', value: 'a_2_1', description: 'Adversário ganhou por 2 a 1' },
                        { label: 'ADVERSARIO 3-2 VOCE', value: 'a_3_2', description: 'Adversário ganhou por 3 a 2' },
                        { label: 'VOCE 1-1 ADVERSARIO', value: 'empate', description: 'Empate' }
                    ]);

                const rowResult = new ActionRowBuilder().addComponents(selectMenuResult);

                await thread.send({
                    content: `⚔️ **Confronto iniciado entre <@${challengerId}> e <@${interaction.user.id}>!**\nMapa: **${challengeData.mapa}**\n\nAmbos os jogadores devem selecionar abaixo o resultado exato da partida para atualizar a pontuação.`,
                    components: [rowResult]
                });

                await interaction.update({ content: `✅ Desafio aceito! Tópico privado criado: ${thread}`, components: [] });
                activeChallenges.delete(interaction.message.id);
            } catch (err) {
                console.error(err);
                return await interaction.reply({ content: '❌ Erro ao criar o tópico privado. Verifique as permissões do bot.', ephemeral: true });
            }
        }
    }

    // --- SELECT MENU DE RESULTADOS ---
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

        await interaction.reply({ content: `Votação registada: **${interaction.values[0]}**. A aguardar a resposta do outro jogador...`, ephemeral: true });

        // Se ambos votaram
        if (matchVotes[challengerId] && matchVotes[acceptorId]) {
            if (matchVotes[challengerId] !== matchVotes[acceptorId]) {
                await interaction.channel.send('⚠️ **Os votos dos dois jogadores não coincidem!** Por favor, verifiquem o resultado correto e votem novamente.');
                interaction.client.pendingResults.delete(interaction.channelId);
                return;
            }

            // Votos coincidem, calcular pontuação (+/- 32 pontos)
            const result = matchVotes[challengerId];
            let winnerId = null, loserId = null, isDraw = false;

            if (result === 'v_2_0' || result === 'v_2_1' || result === 'v_3_2') {
                winnerId = challengerId;
                loserId = acceptorId;
            } else if (result === 'a_2_0' || result === 'a_2_1' || result === 'a_3_2') {
                winnerId = acceptorId;
                loserId = challengerId;
            } else if (result === 'empate') {
                isDraw = true;
            }

            // Atualizar BD
            if (!db.players[challengerId]) db.players[challengerId] = { username: 'Jogador', points: 0, wins: 0, draws: 0, losses: 0 };
            if (!db.players[acceptorId]) db.players[acceptorId] = { username: 'Jogador', points: 0, wins: 0, draws: 0, losses: 0 };

            // Atualizar nomes via discord se possível
            const userC = await client.users.fetch(challengerId).catch(() => null);
            const userA = await client.users.fetch(acceptorId).catch(() => null);
            if (userC) db.players[challengerId].username = userC.username;
            if (userA) db.players[acceptorId].username = userA.username;

            if (isDraw) {
                db.players[challengerId].draws = (db.players[challengerId].draws || 0) + 1;
                db.players[acceptorId].draws = (db.players[acceptorId].draws || 0) + 1;
            } else {
                db.players[winnerId].points += 32;
                db.players[winnerId].wins = (db.players[winnerId].wins || 0) + 1;

                db.players[loserId].points -= 32;
                db.players[loserId].losses = (db.players[loserId].losses || 0) + 1;
            }

            saveDB(db);
            interaction.client.pendingResults.delete(interaction.channelId);

            await interaction.channel.send('✅ **Resultado confirmado e pontuação aplicada com sucesso!** O tópico será fechado automaticamente em 5 segundos.');
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
        }
    }
});

client.login(TOKEN);
