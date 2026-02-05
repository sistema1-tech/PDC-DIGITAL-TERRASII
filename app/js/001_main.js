import {
    atualizarValorTotalClassificacoes,
    atualizarValorTotalParcelas,
    adicionarLinhaClassificacao,
    validarEntidadesPermitidas,
    calcularValorTotalPagar,
    atualizarValorOriginal,
    preencherListaAnexosV2,
    mostrarCamposRetencao,
    atualizarValorOrcado,
    preencherDadosPDC,
} from './002_forms_utils.js';
import {
    atualizarOuvintesTabCot,
    prenchTabCot,
} from './003_table_utils.js'
import {
    buscarClassesOperacionais,
    buscarFornecedores,
    buscarCentrosCusto,

} from './004_dados_p_selects.js';
import {criarBotao} from './005_metodos_filtragem.js';
import {
    desabilitarCampos,
    executar_apiZoho,
    setupEventListeners

} from './007_utils.js'
import {globais} from './999_config.js';
//import {enviarParaPaybox} from './006_save_utils.js'

// Inicia o processo
__INIT__().catch(error => {
    console.error('Erro na inicialização:', error);
});

async function __INIT__() {
    try {
        const log = false;
        if (log) console.log("++++++++++INICIANDO APLICAÇÃO++++++++++");
        // 1. Executa searchPageParams e espera seu resultado
        await searchPageParams();

        // 2. Valida as entidades permitidas
        validarEntidadesPermitidas();
        //buscarDadosUsuarioLogado();

        // 3. Cria a Promise que busca todas as bases
        const basesPromise = Promise.allSettled([
            buscarFornecedores().then(result => { globais.baseFornecedores = result; }),
            buscarCentrosCusto().then(result => { globais.baseCentrosCusto = result; }),
            buscarClassesOperacionais().then(result => {
                globais.baseClassesOperacionais = result;}).then(() => {
                    adicionarLinhaClassificacao();
                })
        ]);

        /**
         * TODO: Revisar essa lógica de carregamento das bases
         * 1. Se estiver na página criar_cotacao, executa em background (não espera o carregamento)
         * 2. Se não estiver na página criar_cotacao, carrega bases iniciais para renderização do dashboard
         * 3. Carrega o restante das bases em background (Não espera o carregamento)
         */

        // 4. Se não estiver na página criar_cotacao, aguarda as bases carregarem
        if (!globais.pag.includes('criar_cotacao')) {
            await basesPromise;
        } else {
            // Se estiver na página criar_cotacao, executa em background
            void basesPromise.catch(console.error);
        }

        // 5. Configura os ouvintes (Se a página ainda não tiver carregado, adiciona um ouvinte para aguardar carregar, senão inicia os processos)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', async() => {setupEventListeners(); await executarProcessosParalelos();});

        } else {
            setupEventListeners();
            await executarProcessosParalelos();

        }
    } catch (error) {
        console.error('Erro ao inicializar:', error);
    }
}

async function buscarDadosUsuarioLogado() {
    if (globais.id_usuario_logado)
    {
        const apoio_dados_usuario = new Map();
        //usuarioLogado
        const config = {
            tipo: "busc_reg",
            criterios: `(ID==${globais.id_usuario_logado})`,
            nomeR: "Usuarios_API",
        }

        const apoio_usuario = await executar_apiZoho(config);

        apoio_dados_usuario.set("ID", apoio_usuario[0]?.ID || null);
        apoio_dados_usuario.set("Nome_completo", apoio_usuario[0]?.Nome_completo || null);
        apoio_dados_usuario.set("e_mail_pessoal", apoio_usuario[0]?.e_mail_pessoal || null);
        apoio_dados_usuario.set("e_mail_profissional", apoio_usuario[0]?.e_mail_profissional || null);
        apoio_dados_usuario.set("Cargo", apoio_usuario[0]?.Cargo || null);
        apoio_dados_usuario.set("Departamento", apoio_usuario[0]?.Departamento || null);
        apoio_dados_usuario.set("Entidades_permitidas", apoio_usuario[0]?.Entidades_permitidas.map(ent => ent.ID) || null);

        console.log("apoio_usuario => ", apoio_usuario);
        const ids_perfis = apoio_usuario[0]?.Perfil1.map(perfil => perfil.ID) || [];
        console.log("ids_perfis => ", ids_perfis);

        const config_perfis = {
            tipo: "busc_reg",
            criterios: `ID in [${ids_perfis.join(",")}]`,
            nomeR: "Perfis_criados_API",
        }

        console.log("config_perfis => ", config_perfis);
        const perfis = await executar_apiZoho(config_perfis);
        console.log("perfis => ", perfis);
    }
}

async function executarProcessosParalelos() {
    if (!globais.pag.includes('criar_cotacao')) {
        //   //======================================================================\\
        //   ||==========TRATA E APRESENTA OS DADOS NA TELA (PDC EXISTENTE)==========||
        //   ||==========TAMBÉM MODIFICA OS BOTÕES DE ACORDO COM A PÁGINA  ==========||
        //   \\======================================================================//

        //=====Preenche paralelamente os dados da tab de preços e o restante do PDC=====\\
        const tarefas = [
            processarDadosPDC(),
            processarDadosCotacao()
        ];
        await Promise.all(tarefas);

        if (globais.pag.includes('editar_cotacao') || globais.pag.includes('ajustar_cotacao_DP')) {
            //=====Cria o botão Sol. Aprov. Síndico=====\\
            criarBotao({ page: globais.pag });
            if (globais.perfilResponsavel.includes("Depto. Pessoal") || globais.perfilResponsavel.includes("Controladoria")) {

                if (globais.perfilResponsavel === "Depto. Pessoal") {

                    //=====Desabilita os campos de nome Num_PDC_parcela e adiciona o cursor: not-allowed=====\\
                    const numPDCParcelaElements = document.querySelectorAll('input[name="Num_PDC_parcela"]');
                    numPDCParcelaElements.forEach(element => {
                        element.setAttribute('disabled', 'true');
                        element.style.cursor = 'not-allowed';

                    });

                }

                //=====Oculta o checkbox de pagamento antecipado=====\\
                const checkboxPagamentoAntecipado = document.getElementsByClassName('check-pag-antecipado')[0];
                if (checkboxPagamentoAntecipado) {
                    checkboxPagamentoAntecipado.classList.add("hidden");
                }
            }

        } else if (globais.pag.includes("aprovar_cotacao")) {
            //=====Cria o botão de Aprovar Cotação=====\\
            criarBotao({ page: "aprovar_cotacao", removeExistingButtons: true });

        } else if ([
            "confirmar_compra", 
            "arquivar_cotacao", 
            "duplicar_pdc", 
            "ver_cotacao"
        ].includes(globais.pag)) {
            //=====Se for qualquer outro processo que precise apenas criar botão, cria o botão correspondente=====\\
            criarBotao({ page: globais.pag, removeExistingButtons: true });

        } else if ([
            "criar_numero_de_PDC",
            "receber_compra",
            "enviar_p_ass_control",
            "enviar_p_assinatura",
            "lancamentos_provisionados",
            "checagem_final",
            "autorizar_pagamento_subsindico",
            "autorizar_pagamento_sindico",
            "confirmar_todas_as_assinaturas",
            "lancar_pdc_ahreas",
            "confirmar_pag_ahreas"
        ].includes(globais.pag)) {
            //=====Cria o botão correspondente=====\\
            //=====Pode ou não remover os botões existentes antes de criar os novos=====\\
            criarBotao(
                {
                    page: globais.pag,
                    removeExistingButtons:
                    [
                        "receber_compra",
                        "autorizar_pagamento_subsindico",
                        "autorizar_pagamento_sindico",
                        "confirmar_todas_as_assinaturas",
                        "lancar_pdc_ahreas",
                        "confirmar_pag_ahreas"
                    ].includes(globais.pag) ? true : false
                }
            );

            //=====COLAPSA SEÇÕES PARA A TRIAGEM=====\\
            if (["lancar_pdc_ahreas", "confirmar_pag_ahreas"].includes(globais.pag)) {
                const allSections = document.querySelectorAll('.section');
                const sectionsToCollapse = ["tabela-cotacoes"];
                allSections.forEach(section => {
                    const header = section.previousElementSibling;
                    const sectionClasses = Array.from(section.classList);

                    if (sectionsToCollapse.some(className => sectionClasses.includes(className))) {
                        section.classList.add('collapsed');

                        if (header && header.classList.contains('section-header')) {
                            header.classList.add('collapsed');
                        }
                    }

                });
            }

            if (globais.pag.includes("checagem_final")) {
                mostrarCamposRetencao();
            }

        } else {
            //=====Remove todos os botões=====\\
            criarBotao({ removeExistingButtons: true });
            if (["ver_PDC_c_ret"].includes(globais.pag)) {
                mostrarCamposRetencao();
                criarBotao({ page: globais.pag });

            }
        }

        //=====Mostra os campos de retenção se for necessário=====\\
        /*
        if (["ajustar_compra_compras", "checagem_final", "lancar_pdc_ahreas", "confirmar_pag_ahreas", "duplicar_pdc"].includes(globais.pag)) {
            mostrarCamposRetencao();
        }
        */

        //=====Desabilita os campos baseado no globais.pag passado=====\\
        desabilitarCampos();
    } else {
        //==========TRATA TODAS AS EXCEÇÕES DE NOVA SOLICITAÇÃO E==========\\
        //==========ATUALIZA TODOS OS OUVINTES DA PÁGINA==========\\

        //=====Cria o botão de Sol. Aprov. Síndico=====\\
        criarBotao({ page: globais.pag });
        preencherListaAnexosV2();

        if (globais.pag.includes('_DP') || globais.pag.includes("_controladoria") || globais.pag.includes("_asa_laranjeiras")) {
            if (globais.pag.includes('_DP')) {
                //=====Oculta o campo de Tipo de Solicitação=====\\
                const tipoElement = document.querySelector('select[name="Tipo_de_solicitacao"]');
                const tipoLabel = tipoElement.previousElementSibling;
                if (tipoElement && tipoLabel) {
                    tipoElement.style.display = 'none';
                    tipoLabel.style.display = 'none';
                }

                globais.perfilResponsavel = "Depto. Pessoal";

            } else if (globais.pag.includes("_asa_laranjeiras")) {
                globais.perfilResponsavel = "Comprador ASA";

            } else {
                globais.perfilResponsavel = "Controladoria";

            }

            //=====Oculta o checkbox de pagamento antecipado=====\\
            const checkboxPagamentoAntecipado = document.getElementsByClassName('check-pag-antecipado')[0];
            if (checkboxPagamentoAntecipado) {
                checkboxPagamentoAntecipado.classList.add("hidden");

            }

        } else if(globais.pag.includes('_eventos')) {
            globais.perfilResponsavel = "Comprador eventos";
        }
        else {
            globais.perfilResponsavel = "Comprador";

        }
    }

    //==========MOSTRA A PÁGINA E ATUALIZA TODOS OS VALORES E OUVINTES==========\\
    document.body.classList.remove('hidden');
    atualizarOuvintesTabCot();
    atualizarValorOrcado();
    atualizarValorTotalParcelas();
    atualizarValorTotalClassificacoes();

}

async function processarDadosPDC() {
    const log = false;
    if (log) console.log("++++++++++BUSCANDO DADOS DO PDC++++++++++");
    //const cPDC = "(" + (globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ? `id_temp=="${globais.numPDC_temp}"` : "ID==0")) + ")";
    const cPDC = "(" + globais.numPDC_temp ? `id_temp=="${globais.numPDC_temp}"&&Status_geral!="Separado em parcelas")` : "ID==0)";
    const respPDC = await executar_apiZoho({
        tipo: "busc_reg",
        criterios: cPDC,
        nomeR: globais.nomeRelPDC
    });

    globais.tipo = 'editar_pdc';
    preencherDadosPDC(respPDC[0]);
}

async function processarDadosCotacao() {
    
    const idCriterio = globais.numPDC_temp ? `num_pdc_temp=="${globais.numPDC_temp}"` : "ID==0";

    const aprovadoCriterio = !['editar_cotacao', 'ajustar_cotacao', 'ajustar_compra', 'aprovar_cotacao'].some(str => globais.pag?.includes(str)) ? " && Aprovado==true" : "";

    let cCot = `(${idCriterio} && Ativo==true${aprovadoCriterio})`;
    console.log("cCot => ", cCot);
    const respCot = await executar_apiZoho({
        tipo: "busc_reg",
        criterios: cCot,
        nomeR: globais.nomeRelCot
    });

    prenchTabCot(respCot);
    atualizarValorOriginal();
    calcularValorTotalPagar();
        
}

async function searchPageParams() {
    const log = false;
    if (log) console.log("++++++++++BUSCANDO OS PARÂMETROS DA PÁGINA++++++++++");
    const params = await ZOHO.CREATOR.UTIL.getQueryParams();
    if (params) {
        console.log("Parâmetros da URL recebidos:", params);
        globais.numPDC = params.idPdc ?? globais.numPDC;
        globais.numPDC_temp = params.num_pdc_temp ?? globais.numPDC_temp;
        globais.pag = params.pag ?? globais.pag;
        globais.userIP = params.user_ip ?? globais.userIP;
        globais.novoPerfilResponsavel = params.perfil_resp ?? globais.novoPerfilResponsavel;
        globais.entidades_permitidas = params.ent_perm ? params.ent_perm.split(",") : globais.entidades_permitidas;
        globais.usuario_logado = params.user ?? globais.usuarioLogado;
        globais.id_usuario_logado = params.id_user ?? globais.id_usuario_logado;
    }
    if (log) console.log("Parâmetros da página definidos:", {
        numPDC: globais.numPDC,
        numPDC_temp: globais.numPDC_temp,
        pag: globais.pag,
        userIP: globais.userIP, // Adicionado
        novoPerfilResponsavel: globais.novoPerfilResponsavel, // Adicionado
        entidades_permitidas: globais.entidades_permitidas, // Adicionado    
        usuario_logado: globais.usuario_logado, // Adicionado
        id_usuario_logado: globais.id_usuario_logado // Adicionado
    });
    if (log) console.log("----------PARÂMETROS DA PÁGINA DEFINIDOS----------");
}

// Adicionar esta nova função
export function handleEnterKeyNavigation(event) {
    const log = false;

    if (event.key === 'Enter') {
        if (log) console.log("++++++++++PULANDO PARA A CELULA DE BAIXO OU DE CIMA++++++++++");
        event.preventDefault(); // Previne a quebra de linha em textareas

        const activeElement = document.activeElement;
        const isShiftPressed = event.shiftKey;

        // Verifica se é uma célula da tabela
        if (activeElement.closest('td')) {
            const currentCell = activeElement;
            const currentRow = currentCell.parentElement;
            const currentIndex = Array.from(currentRow.cells).indexOf(currentCell);
            const targetRow = isShiftPressed ? currentRow.previousElementSibling : currentRow.nextElementSibling;

            // Verifica se a linha alvo existe e não é uma linha especial
            if (targetRow && !targetRow.classList.contains('linhas-totalizadoras') && !targetRow.classList.contains('borda-oculta')) {
                const targetCell = targetRow.cells[currentIndex];
                if (targetCell && targetCell.hasAttribute('contenteditable')) {
                    targetCell.focus();
                    // Seleciona todo o conteúdo da célula
                    window.getSelection().selectAllChildren(targetCell);
                }
            }
        }

        // Verifica se é um input ou textarea em um formulário
        else if (activeElement.matches('input, textarea, select')) {
            const form = activeElement.closest('form');
            if (form) {
                const inputs = Array.from(form.querySelectorAll('input:not([type="radio"]), textarea, select'));
                const currentIndex = inputs.indexOf(activeElement);

                // Define o índice do próximo input baseado na direção
                const targetIndex = isShiftPressed ? currentIndex - 1 : currentIndex + 1;

                // Verifica se o índice alvo é válido
                if (targetIndex >= 0 && targetIndex < inputs.length) {
                    const targetInput = inputs[targetIndex];
                    targetInput.focus();
                    // Seleciona todo o conteúdo do input/textarea
                    targetInput.select();
                }
            }
        }
    }
}