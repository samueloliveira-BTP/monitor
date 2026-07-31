// ==UserScript==
// @name         Monitor Fila SZ.chat - Final
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Painel redimensionável, foco em atendimentos e cronômetro de pausas.
// @author       Samuel Luiz
// @match        http://toolsvgl.gegnet.com.br/fila*
// @updateURL    https://raw.githubusercontent.com/samueloliveira-BTP/monitor/main/-fila.user.js
// @downloadURL  https://raw.githubusercontent.com/samueloliveira-BTP/monitor/main/-fila.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CHAVE_ARMAZENAMENTO = 'monitoramentoFilaSZ_logs';
    const CHAVE_ESTADO = 'monitoramentoFilaSZ_estado';
    const CHAVE_PAUSAS = 'monitoramentoFilaSZ_pausas';

    let historicoLogs = JSON.parse(localStorage.getItem(CHAVE_ARMAZENAMENTO)) || [];
    let estadoAnterior = JSON.parse(localStorage.getItem(CHAVE_ESTADO)) || null;
    let temposPausa = JSON.parse(localStorage.getItem(CHAVE_PAUSAS)) || {};

    // Força a reinicialização dos tempos de pausa caso venha da versão antiga
    for (let u in temposPausa) {
        if (temposPausa[u].total !== undefined) {
            temposPausa = {};
            localStorage.removeItem(CHAVE_PAUSAS);
            break;
        }
    }

    // --- FUNÇÕES DE CONTROLE DE PAUSA CATEGORIZADA ---
    function salvarPausas() {
        localStorage.setItem(CHAVE_PAUSAS, JSON.stringify(temposPausa));
    }

    function iniciarPausa(usuario, motivo) {
        if (!motivo || motivo === "" || motivo === "-") motivo = 'Sem motivo';

        if (!temposPausa[usuario]) {
            temposPausa[usuario] = { categorias: {}, pausaAtual: null };
        }

        if (!temposPausa[usuario].categorias[motivo]) {
            temposPausa[usuario].categorias[motivo] = 0;
        }

        if (!temposPausa[usuario].pausaAtual) {
            temposPausa[usuario].pausaAtual = { motivo: motivo, inicio: Date.now() };
            salvarPausas();
        }
    }

    function finalizarPausa(usuario) {
        if (temposPausa[usuario] && temposPausa[usuario].pausaAtual) {
            let motivo = temposPausa[usuario].pausaAtual.motivo;
            let tempoGasto = Date.now() - temposPausa[usuario].pausaAtual.inicio;

            temposPausa[usuario].categorias[motivo] += tempoGasto;
            temposPausa[usuario].pausaAtual = null;
            salvarPausas();
        }
    }

    // --- PARTE 1: CRIAÇÃO DO DASHBOARD ---
    function criarInterface() {
        if (document.getElementById('sz-painel-monitor')) return;

        const css = `
            #sz-painel-monitor { position: fixed; bottom: 20px; right: 20px; width: 380px; height: 450px; min-width: 300px; min-height: 250px; background: #262626; color: #fff; border: 1px solid #444; border-radius: 8px; z-index: 999999; font-family: sans-serif; box-shadow: 0 5px 15px rgba(0,0,0,0.6); display: flex; flex-direction: column; overflow: hidden; resize: both; }
            #sz-painel-header { background: #0056b3; padding: 10px 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
            #sz-painel-titulo { cursor: pointer; flex-grow: 1; user-select: none; }
            #sz-painel-status { font-size: 10px; color: #f1c40f; margin-top: 4px; display: block; font-weight: normal; }
            #sz-btn-limpar { background: #dc3545; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 10px; }
            #sz-btn-limpar:hover { background: #c82333; }

            #sz-tabs { display: flex; background: #1e1e1e; border-bottom: 1px solid #444; }
            .sz-tab { flex: 1; padding: 8px; text-align: center; cursor: pointer; font-size: 12px; font-weight: bold; color: #888; border-bottom: 2px solid transparent; user-select: none; }
            .sz-tab:hover { color: #ccc; }
            .sz-tab.active { color: #fff; border-bottom: 2px solid #00a8ff; background: #262626; }

            #sz-body-wrap { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; }
            .sz-painel-body { flex-grow: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }

            .sz-log-item { background: #333; padding: 8px; border-left: 4px solid #00a8ff; border-radius: 4px; font-size: 12px; }
            .sz-log-item.pausa { border-left-color: #f39c12; }
            .sz-log-item.saida { border-left-color: #e74c3c; }
            .sz-log-item.entrada { border-left-color: #2ecc71; }
            .sz-log-item.atendimento { border-left-color: #9b59b6; background: #2c1a35; }
            .sz-log-tempo { color: #aaa; font-size: 10px; margin-bottom: 3px; }
            .sz-log-acao { font-weight: bold; margin-bottom: 3px; }

            .sz-pausa-item { display: flex; flex-direction: column; background: #333; padding: 10px; border-radius: 4px; border-left: 4px solid #f39c12; }
            .sz-pausa-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 6px; }
            .sz-pausa-nome { font-size: 13px; font-weight: bold; }
            .sz-pausa-relogio { font-size: 14px; font-family: monospace; color: #f1c40f; font-weight: bold; }
            .sz-pausa-relogio.inativo { color: #aaa; font-weight: normal; }
            .sz-pausa-detalhe { display: flex; justify-content: space-between; font-size: 11px; padding-left: 10px; border-left: 2px solid #555; margin-top: 4px; }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.innerText = css;
        document.head.appendChild(styleSheet);

        const painel = document.createElement('div');
        painel.id = 'sz-painel-monitor';
        painel.innerHTML = `
            <div id="sz-painel-header">
                <div id="sz-painel-titulo">
                    📊 Monitor da Fila
                    <span id="sz-painel-status">Iniciando...</span>
                </div>
                <button id="sz-btn-limpar">Limpar Tudo</button>
            </div>
            <div id="sz-tabs">
                <div class="sz-tab active" data-target="sz-body-logs">📝 Logs</div>
                <div class="sz-tab" data-target="sz-body-pausas">⏱️ Tempo em Pausa</div>
            </div>
            <div id="sz-body-wrap">
                <div id="sz-body-logs" class="sz-painel-body"></div>
                <div id="sz-body-pausas" class="sz-painel-body" style="display:none;"></div>
            </div>
        `;
        document.body.appendChild(painel);

        let minimizado = false;
        const painelEl = document.getElementById('sz-painel-monitor');
        document.getElementById('sz-painel-titulo').addEventListener('click', () => {
            minimizado = !minimizado;
            if (minimizado) {
                document.getElementById('sz-tabs').style.display = 'none';
                document.getElementById('sz-body-wrap').style.display = 'none';
                painelEl.style.height = 'auto';
                painelEl.style.resize = 'none';
            } else {
                document.getElementById('sz-tabs').style.display = 'flex';
                document.getElementById('sz-body-wrap').style.display = 'flex';
                painelEl.style.height = '450px';
                painelEl.style.resize = 'both';
            }
        });

        document.querySelectorAll('.sz-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.sz-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.sz-painel-body').forEach(b => b.style.display = 'none');

                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).style.display = 'flex';
            });
        });

        document.getElementById('sz-btn-limpar').addEventListener('click', () => {
            if (confirm('Apagar todo o histórico de logs E zerar o cronômetro de pausas?')) {
                historicoLogs = [];
                estadoAnterior = null;
                temposPausa = {};
                localStorage.removeItem(CHAVE_ARMAZENAMENTO);
                localStorage.removeItem(CHAVE_ESTADO);
                localStorage.removeItem(CHAVE_PAUSAS);
                document.getElementById('sz-body-logs').innerHTML = '';
                renderizarCronometros();
            }
        });

        historicoLogs.forEach(log => adicionarLogNaTela(log));
    }

    function atualizarStatus(mensagem, cor) {
        const statusEl = document.getElementById('sz-painel-status');
        if (statusEl) {
            statusEl.innerText = mensagem;
            statusEl.style.color = cor;
        }
    }

    function adicionarLogNaTela(log) {
        const body = document.getElementById('sz-body-logs');
        if (!body) return;

        const item = document.createElement('div');
        item.className = 'sz-log-item';

        if (log.acao.includes('Pausa')) item.classList.add('pausa');
        else if (log.acao.includes('Puxou Atendimento')) item.classList.add('atendimento');
        else if (log.acao.includes('Saiu')) item.classList.add('saida');
        else if (log.acao.includes('Entrou')) item.classList.add('entrada');

        item.innerHTML = `
            <div class="sz-log-tempo">${log.dataHora}</div>
            <div class="sz-log-acao">${log.usuario} - <span style="color: #fff">${log.acao}</span></div>
            <div class="sz-log-detalhes">${log.detalhes}</div>
        `;

        body.appendChild(item);
        body.scrollTop = body.scrollHeight;
    }

    function formatarTempo(ms) {
        let segTotal = Math.floor(ms / 1000);
        let horas = Math.floor(segTotal / 3600);
        segTotal %= 3600;
        let minutos = Math.floor(segTotal / 60);
        let segundos = segTotal % 60;
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }

    function renderizarCronometros() {
        const container = document.getElementById('sz-body-pausas');
        if (!container || container.style.display === 'none') return;

        let html = '';
        for (const usuario in temposPausa) {
            const dados = temposPausa[usuario];
            if (!dados.categorias) continue;

            let categoriasTemp = { ...dados.categorias };
            let totalGeral = 0;
            let temTempoRegistrado = false;

            // Adiciona o tempo decorrido no motivo atual (se estiver em pausa agora)
            if (dados.pausaAtual) {
                let motivoAtual = dados.pausaAtual.motivo;
                categoriasTemp[motivoAtual] += (Date.now() - dados.pausaAtual.inicio);
            }

            let subItemsHtml = '';
            for (const cat in categoriasTemp) {
                if (categoriasTemp[cat] > 0) {
                    temTempoRegistrado = true;
                    totalGeral += categoriasTemp[cat];

                    let isCategoriaAtiva = dados.pausaAtual && dados.pausaAtual.motivo === cat;
                    let colorStyle = isCategoriaAtiva ? 'color: #f1c40f; font-weight: bold;' : 'color: #aaa;';

                    subItemsHtml += `
                        <div class="sz-pausa-detalhe">
                            <span style="color: #ccc;">${cat}</span>
                            <span style="font-family: monospace; ${colorStyle}">${formatarTempo(categoriasTemp[cat])}</span>
                        </div>
                    `;
                }
            }

            if (temTempoRegistrado) {
                let isEmPausa = dados.pausaAtual !== null;
                let classeAtiva = isEmPausa ? '' : 'inativo';
                let corNome = isEmPausa ? 'color: #fff;' : 'color: #999; text-decoration: line-through;';

                html += `
                    <div class="sz-pausa-item">
                        <div class="sz-pausa-header">
                            <div class="sz-pausa-nome" style="${corNome}">${usuario}</div>
                            <div class="sz-pausa-relogio ${classeAtiva}">${formatarTempo(totalGeral)}</div>
                        </div>
                        ${subItemsHtml}
                    </div>
                `;
            }
        }

        if (html === '') {
            html = '<div style="color:#aaa; text-align:center; padding: 20px;">Nenhuma pausa detalhada registrada ainda.</div>';
        }
        container.innerHTML = html;
    }

    function lerTabelaAtual() {
        const tabela = document.querySelector('#fila');
        if (!tabela) return null;

        const linhas = tabela.querySelectorAll('tbody tr');
        const estadoAtual = {};
        let encontrouUsuarios = false;

        linhas.forEach(linha => {
            const colunas = linha.querySelectorAll('td');

            if (colunas.length >= 6 && !colunas[0].hasAttribute('colspan')) {
                const usuario = colunas[1].textContent.trim();
                const posicao = colunas[2].textContent.trim();
                const motivoPausa = colunas[3].textContent.trim();
                const horaPausa = colunas[4].textContent.trim();

                if (usuario && usuario !== "" && usuario !== "Nenhum registro encontrado") {
                    estadoAtual[usuario] = { posicao, motivoPausa, horaPausa };
                    encontrouUsuarios = true;
                }
            }
        });

        return encontrouUsuarios ? estadoAtual : null;
    }

    function registrarEvento(usuario, acao, detalhes) {
        const dataHora = new Date().toLocaleString('pt-BR');
        const novoLog = { dataHora, usuario, acao, detalhes };

        historicoLogs.push(novoLog);
        localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(historicoLogs));
        adicionarLogNaTela(novoLog);
    }

    function verificarAlteracoes(estadoVelho, estadoNovo) {
        const posicoesNumericas = Object.values(estadoNovo)
            .map(d => parseInt(d.posicao))
            .filter(n => !isNaN(n));
        const ultimaPosicaoFila = posicoesNumericas.length > 0 ? Math.max(...posicoesNumericas) : 0;

        for (const usuario in estadoNovo) {
            const dadosNovos = estadoNovo[usuario];
            const dadosVelhos = estadoVelho[usuario];

            if (!dadosVelhos) {
                registrarEvento(usuario, 'Entrou na Fila', `Posição inicial: ${dadosNovos.posicao}`);
                if (dadosNovos.posicao === 'PAUSA') iniciarPausa(usuario, dadosNovos.motivoPausa);

            } else {
                let mudouPosicao = dadosVelhos.posicao !== dadosNovos.posicao;
                let mudouMotivo = (dadosVelhos.posicao === 'PAUSA' && dadosNovos.posicao === 'PAUSA' && dadosVelhos.motivoPausa !== dadosNovos.motivoPausa);

                if (mudouPosicao || mudouMotivo) {

                    if (dadosVelhos.posicao === 'PAUSA' && dadosNovos.posicao === 'PAUSA') {
                        finalizarPausa(usuario);
                        iniciarPausa(usuario, dadosNovos.motivoPausa);
                        registrarEvento(usuario, 'Mudou Motivo de Pausa', `${dadosVelhos.motivoPausa || 'S/M'} -> ${dadosNovos.motivoPausa}`);
                    }
                    else if (dadosNovos.posicao === 'PAUSA') {
                        iniciarPausa(usuario, dadosNovos.motivoPausa);
                        registrarEvento(usuario, 'Entrou em Pausa', `Motivo: ${dadosNovos.motivoPausa || 'Sem motivo'} (${dadosNovos.horaPausa})`);
                    }
                    else if (dadosVelhos.posicao === 'PAUSA') {
                        finalizarPausa(usuario);
                        registrarEvento(usuario, 'Voltou da Pausa', `Nova posição: ${dadosNovos.posicao}`);
                    }
                    else {
                        if (dadosVelhos.posicao === '1' && parseInt(dadosNovos.posicao) === ultimaPosicaoFila) {
                            registrarEvento(usuario, 'Puxou Atendimento', `Foi movido para o final da fila (posição: ${dadosNovos.posicao})`);
                        }
                    }
                }
            }
        }

        for (const usuario in estadoVelho) {
            if (!estadoNovo[usuario]) {
                if (estadoVelho[usuario].posicao === 'PAUSA') finalizarPausa(usuario);
                registrarEvento(usuario, 'Saiu da Fila', `Sumiu da tabela. Posição anterior: ${estadoVelho[usuario].posicao}`);
            }
        }
    }

    // --- PARTE 3: INICIALIZAÇÃO ---
    criarInterface();

    setInterval(() => {
        const estadoNovo = lerTabelaAtual();

        if (estadoNovo === null) {
            atualizarStatus("Aguardando carregamento...", "#f39c12");
            return;
        }

        atualizarStatus("Monitoramento Ativo 🟢", "#2ecc71");

        if (estadoAnterior === null) {
            estadoAnterior = estadoNovo;
            for (const u in estadoNovo) {
                if (estadoNovo[u].posicao === 'PAUSA') iniciarPausa(u, estadoNovo[u].motivoPausa);
            }
            localStorage.setItem(CHAVE_ESTADO, JSON.stringify(estadoAnterior));
        } else {
            verificarAlteracoes(estadoAnterior, estadoNovo);
            estadoAnterior = estadoNovo;
            localStorage.setItem(CHAVE_ESTADO, JSON.stringify(estadoAnterior));
        }

    }, 2000);

    setInterval(renderizarCronometros, 1000);

})();
