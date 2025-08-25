import {
    atualizarOuvintesTabCot,
    addSupplierColumn,
    removeProductRow,
    addProductRow,
    prenchTabCot,
} from './table_utils.js'
import {
    buscarClassesOperacionais,
    buscarFornecedores,
    buscarCentrosCusto,
    
} from './dados_p_selects.js';
import {
    desabilitarCampos,
    executar_apiZoho,
    customModal_V2,
    formatToBRL_V2,
    customModal
} from './utils.js'
import {
    atualizarValorTotalClassificacoes,
    atualizarValorTotalParcelas,
    atualizarValorOrcado,
    adicionarLinhaClassificacao,
    removerLinhaClassificacao,
    calcularValorTotalPagar,
    atualizarValorOriginal,
    preencherListaAnexosV2,
    mostrarCamposPagamento,
    mostrarCamposRetencao,
    adicionarCampoVenc,
    setupPixValidation,
    preencherDadosPDC,
    formatarCPFouCNPJ,
    adicionarLinhaNF,
    removerCampoVenc,
    removerLinhaNF,
} from './forms_utils.js';
import { CONFIG } from './config.js';
import { criarBotao } from './metodos_filtragem.js';
//import {enviarParaPaybox} from './save_utils.js'

class Globais {
    constructor() {
        this.state = {
            baseClassesOperacionais: new Map(),
            baseFornecedores: new Map(),
            baseCentrosCusto: new Map(),
            idsCotacao: new Array(),
            numSolicPDC: null,
            userIP: null,
            arquivosGaleria: new Array(),
            arquivospPaybox: new Array(),
            ...CONFIG.INITIAL_STATE,
            ...CONFIG.APPS
        };

        return new Proxy(this.state, {
            get: (target, prop) => target[prop],
            set: (target, prop, value) => {
                target[prop] = value;
                return true;
            }
        });
    }
}
export const globais = new Globais();

// Inicia o processo
initGenericItems().catch(error => {
    console.error('Erro na inicialização:', error);
});

async function initGenericItems() {

    try {
        // 1. Executa searchPageParams e espera seu resultado
        await searchPageParams();

        // 2. Define as entidades permitidas
        const entidadesCadastradas = {
            "3938561000102002101": ["2", "KONDOMINIUM", "98765432101234"], 
            "3938561000066182595": ["479", "ASSOCIAÇÃO SERVIR", "11290260000246"], 
            "3938561000066182591": ["477", "CONDOMÍNIO LARANJEIRAS", "30322150000182"], 
            "3938561000096117305": ["560", "ASA LARANJEIRAS", "11501224000101"]
        };

        let entidades_aplicaveis = Object.entries(entidadesCadastradas);

        // Verifica se o perfil do usuário é um dos permitidos
        if (globais.entidades_permitidas?.length > 0) {
            entidades_aplicaveis = Object.entries(entidadesCadastradas).filter(([key]) => globais.entidades_permitidas.includes(key));
        
        }
        
        const campo_entidades = document.querySelector('select[name="Entidade"]');
        if (campo_entidades) {
            campo_entidades.innerHTML = `
                <option value="" disabled selected class="invalid">Selecione uma entidade...</option>
                ${entidades_aplicaveis.map(([key, value]) => `<option value="${key}" data-cnpj_ent="${value[2]}" data-cod_cond_ahreas="${value[0]}">${value[1]}</option>`).join('')}
            `;

        }

        // 3. Cria a Promise que busca todas as bases
        const basesPromise = Promise.allSettled([
            buscarFornecedores().then(result => {globais.baseFornecedores = result;}),
            buscarCentrosCusto().then(result => {globais.baseCentrosCusto = result;}),
            buscarClassesOperacionais().then(result => { 
                globais.baseClassesOperacionais = result;
            })
            
        ]).then(() => {
            adicionarLinhaClassificacao();
        });

        // 4. Se não estiver na página criar_cotacao, aguarda as bases carregarem
        if (!globais.pag.includes('criar_cotacao')) {
            await basesPromise;
        } else {
            // Se estiver na página criar_cotacao, executa em background
            void basesPromise.catch(console.error);
        }

        // 5. Configura os ouvintes (Se a página ainda não tiver carregado, adiciona um ouvinte para aguardar carregar, senão inicia os processos)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupListenersAndInit);
        } else {
            await setupListenersAndInit();
        }
    } catch (error) {
        console.error('Erro ao inicializar:', error);
    }
}

async function setupListenersAndInit() {
    //==========CONFIGURA OS OUVINTES GERAIS==========\\
    const buttonActions = {
        "add-supplier-btn": { handler: () => addSupplierColumn(), type: 'click' },
        "add-product-btn": { handler: () => addProductRow(), type: 'click' },
        "remove-product-btn": { 
            handler: (elemento) => customModal({ 
                botao: elemento, 
                tipo: 'remover_produto', 
                mensagem: 'Deseja realmente remover este produto?' 
            }).then(() => { removeProductRow(elemento);}),
            type: 'click'
        },
        "save-btn": { 
            handler: (elemento) => customModal_V2({ 
                botao: elemento, 
                acao: 'salvar_cot',
                mensagem: 'Deseja realmente salvar esta cotação?' 
            }),
            type: 'click'
        },
        "formas-pagamento": { handler: (elemento) => mostrarCamposPagamento(), type: 'click' },
        "add-linha-nf": { handler: () => adicionarLinhaNF(), type: 'click' },
        "remover-linha-nf": { handler: (elemento) => removerLinhaNF(elemento), type: 'click' },
        "add-parcela": { handler: () => adicionarCampoVenc(null, null, globais.numPDC), type: 'click' },
        "remover-parcela": { handler: (elemento) => removerCampoVenc(elemento), type: 'click' },
        "add-classificacao": { handler: () => adicionarLinhaClassificacao(), type: 'click' },
        "remover-classificacao": { handler: (elemento) => removerLinhaClassificacao(elemento), type: 'click' },
        "valor-parcela": { handler: (elemento) => { formatToBRL_V2(elemento); atualizarValorTotalParcelas();}, type: 'blur' },
        "valor-classificacao": { handler: (elemento) => { formatToBRL_V2(elemento); atualizarValorTotalClassificacoes();}, type: 'blur' },
        "campos-ret-desc":{handler: (elemento) => {formatToBRL_V2(elemento); calcularValorTotalPagar();}, type: 'blur'},
        "campos-ret-acr":{handler: (elemento) => {formatToBRL_V2(elemento); calcularValorTotalPagar();}, type: 'blur'},
        "numeric-cell": { handler: (elemento) => handleEnterKeyNavigation(elemento), type: 'keydown' },
        "teste" : {handler: () => enviarParaPaybox(), type: 'click'},
        "": { handler: () => setupPixValidation(), type: 'DOMContentLoaded'}
    };
    //"cpf_cnpj_favorecido": { handler: (elemento) => formatarCPFouCNPJ(elemento), type: 'blur' },

    Object.entries(buttonActions).forEach(([className, config]) => {
        if (className === '') {
            // Para eventos globais como DOMContentLoaded
            if (config.type === 'DOMContentLoaded') {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', config.handler);
                } else {
                    config.handler();
                }
            } else {
                document.addEventListener(config.type, config.handler);
            }
        } else {
            // Para elementos específicos
            document.querySelectorAll(`.${className}`).forEach(elemento => {
                if (config.type === 'DOMContentLoaded') {
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', () => config.handler(elemento));
                    } else {
                        config.handler(elemento);
                    }
                } else {
                    elemento.addEventListener(config.type, () => config.handler(elemento));
                }
            });
        }
    });
    //==========CONFIGURA OS OUVINTES DAS BARRAS DE TÍTULO, ==========\\
    //==========(PARA QUE AS SEÇÕES SEJAM EXPANDIDAS/RECOLHIDAS)==========\\
    setupSectionToggle();

    //==========INICIA O TRATAMENTO/APRESENTAÇÃO DOS DADOS==========\\
    await executarProcessosParalelos();
}

async function executarProcessosParalelos() {

    if (!globais.pag.includes('criar_cotacao')) { 
        //==========TRATA TODOS OS DADOS PARA APRESENTAÇÃO E==========\\
        //==========MODIFICAÇÃO DOS BOTÕES (VISTO QUE NÃO É UMA NOVA SOLICITAÇÃO)==========\\
        await ZOHO.CREATOR.init();

        //=====Preenche paralelamente os dados da tab de preços e o restante do PDC=====\\
        const tarefas = [
            processarDadosPDC(),
            processarDadosCotacao()
        ];
        await Promise.all(tarefas);

        if(globais.pag.includes('editar_cotacao') || globais.pag.includes('ajustar_cotacao_DP')){
            //=====Cria o botão Sol. Aprov. Síndico=====\\
            criarBotao({page:globais.pag});
            if(globais.perfilResponsavel.includes("Depto. Pessoal") || globais.perfilResponsavel.includes("Controladoria"))
            {

                if(globais.perfilResponsavel === "Depto. Pessoal")
                {

                    //=====Remove todos os botões de classe remover-parcela e add-parcela=====\\
                    /*DESABILIEI POIS ELE PRECISA CRIAR AO MENOS UMA PARCELA
                    const parcelasElements = document.querySelectorAll('.remover-parcela, .add-parcela');
                    if (parcelasElements) {
                        parcelasElements.forEach(el => el.remove());
                    }
                    */

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

        }else if (globais.pag.includes("aprovar_cotacao")){
            //=====Cria o botão de Aprovar Cotação=====\\
            criarBotao({page: "aprovar_cotacao", removeExistingButtons:true});

        }else if(["confirmar_compra", "arquivar_cotacao", "duplicar_pdc", "ver_cotacao"].includes(globais.pag)){
            //=====Se for qualquer outro processo que precise apenas criar botão, cria o botão correspondente=====\\
            criarBotao({page:globais.pag, removeExistingButtons: true});

        } else if([
            "criar_numero_de_PDC", 
            "receber_compra", 
            "ajustar_compra_compras", 
            "checagem_final", 
            "autorizar_pagamento_subsindico", 
            "autorizar_pagamento_sindico", 
            "confirmar_todas_as_assinaturas",
            "lancar_pdc_ahreas", 
            "confirmar_pag_ahreas"
        ].includes(globais.pag)){
            //=====Cria o botão correspondente=====\\
            //=====Pode ou não remover os botões existentes antes de criar os novos=====\\
            criarBotao(
                {
                    page:globais.pag, 
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

            /*
            //=====Oculta o checkbox de pagamento antecipado=====\\
            const checkboxPagamentoAntecipado = document.getElementsByClassName('check-pag-antecipado')[0];
            if (checkboxPagamentoAntecipado) {
                checkboxPagamentoAntecipado.classList.add("hidden");
            }
                */

            //=====COLAPSA SEÇÕES PARA A TRIAGEM=====\\
            if(["lancar_pdc_ahreas", "confirmar_pag_ahreas"].includes(globais.pag))
            {
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

        }else
        {
            //=====Remove todos os botões=====\\
            criarBotao({removeExistingButtons:true});
            if (["ver_PDC_c_ret"].includes(globais.pag)) {
                mostrarCamposRetencao();
                criarBotao({page: globais.pag});
                
            }
        }

        //=====Mostra os campos de retenção se for necessário=====\\
        if (["ajustar_compra_compras", "checagem_final", "lancar_pdc_ahreas", "confirmar_pag_ahreas", "duplicar_pdc"].includes(globais.pag)) {
            mostrarCamposRetencao();
        }

        //=====Desabilita os campos baseado no globais.pag passado=====\\
        desabilitarCampos();
    }else
    {
        //==========TRATA TODAS AS EXCEÇÕES DE NOVA SOLICITAÇÃO E==========\\
        //==========ATUALIZA TODOS OS OUVINTES DA PÁGINA==========\\

        //=====Cria o botão de Sol. Aprov. Síndico=====\\
        preencherListaAnexosV2();
        criarBotao({page: globais.pag});

        if(globais.pag.includes('_DP') || globais.pag.includes("_controladoria") || globais.pag.includes("_asa_laranjeiras"))
        {
            if(globais.pag.includes('_DP'))
            {
                //=====Oculta o campo de Tipo de Solicitação=====\\
                const tipoElement = document.querySelector('select[name="Tipo_de_solicitacao"]');
                const tipoLabel = tipoElement.previousElementSibling;
                if (tipoElement && tipoLabel) {
                    tipoElement.style.display = 'none';
                    tipoLabel.style.display = 'none';
                }

                globais.perfilResponsavel = "Depto. Pessoal";

            }else if(globais.pag.includes("_asa_laranjeiras"))
            {
                globais.perfilResponsavel = "Comprador ASA";
                
            }else
            {
                globais.perfilResponsavel = "Controladoria";
                
            }

            //=====Oculta o checkbox de pagamento antecipado=====\\
            const checkboxPagamentoAntecipado = document.getElementsByClassName('check-pag-antecipado')[0];
            if (checkboxPagamentoAntecipado) {
                checkboxPagamentoAntecipado.classList.add("hidden");

            }

        }else
        {
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
    //const cPDC = "(" + (globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ? `id_temp=="${globais.numPDC_temp}"` : "ID==0")) + ")";
    const cPDC = "(" + globais.numPDC_temp?`id_temp=="${globais.numPDC_temp}"&&Status_geral!="Separado em parcelas")`:"ID==0)";
    const respPDC = await executar_apiZoho({ 
        tipo: "busc_reg", 
        criterios: cPDC, 
        nomeR: globais.nomeRelPDC 
    });

    if (respPDC.code == 3000) {
        globais.tipo = 'editar_pdc';
        preencherDadosPDC(respPDC);
    }
}

async function processarDadosCotacao() {
    //const idCriterio = globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ?`num_PDC_temp=="${globais.numPDC_temp}"` :"ID==0");
    const idCriterio =  globais.numPDC_temp ?`num_PDC_temp=="${globais.numPDC_temp}"` :"ID==0";

    const aprovadoCriterio = !["editar_cotacao", "aprovar_cotacao", "ver_cotacao", "editar_cotacao_DP", "ajustar_cotacao_DP","aprovar_cotacao_DP"].includes(globais.pag) ? 
        " && Aprovado==true" : "";
    
    let cCot = `(${idCriterio} && Ativo==true${aprovadoCriterio})`;
    const respCot = await executar_apiZoho({ 
        tipo: "busc_reg", 
        criterios: cCot, 
        nomeR: globais.nomeRelCot 
    });

    if (respCot.code == 3000) {

        prenchTabCot(respCot);
        atualizarValorOriginal();
        calcularValorTotalPagar();
    } else {
        console.log("Não tem Cotação");
    }
}

/**
 * Adiciona navegação por pontos (dots) para as seções da página
 * 
 * @function addNavDots
 * @returns {void}
 * 
 * @description
 * Esta função implementa:
 * 1. Observador de interseção para detectar seções visíveis
 * 2. Atualização automática dos pontos de navegação
 * 3. Navegação suave ao clicar nos pontos
 * 
 * Funcionalidades:
 * - Monitora a visibilidade das seções usando IntersectionObserver
 * - Atualiza o ponto ativo quando uma seção está 50% visível
 * - Permite navegação suave ao clicar nos pontos
 * - Usa margem de detecção para melhor precisão
 * 
 * @example
 * // Adiciona navegação por pontos à página
 * addNavDots();
 */
function addNavDots() {
    // Adiciona o observer para as seções
    const sections = document.querySelectorAll('.section');
    const dots = document.querySelectorAll('.dot');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove a classe active de todos os dots
                dots.forEach(dot => dot.classList.remove('active'));

                // Adiciona a classe active ao dot correspondente
                const sectionId = entry.target.id.replace('section', '');
                const activeDot = document.querySelector(`.dot[data-section="${sectionId}"]`);
                if (activeDot) {
                    activeDot.classList.add('active');
                }
            }
        });
    }, {
        threshold: 0.5, // Ativa quando 50% da seção está visível
        rootMargin: '-10% 0px -10% 0px' // Cria uma margem de detecção
    });

    // Observa todas as seções
    sections.forEach(section => observer.observe(section));

    // Adiciona click event nos dots para navegaço suave
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const sectionId = dot.dataset.section;
            const targetSection = document.getElementById(`section${sectionId}`);
            targetSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });
}

async function searchPageParams() {
    await ZOHO.CREATOR.init()
    .then(() => ZOHO.CREATOR.UTIL.getQueryParams())
    .then(params => {
        if (params) {
            globais.numPDC = params.idPdc ?? globais.numPDC;
            globais.numPDC_temp = params.num_PDC_temp ?? globais.numPDC_temp;
            globais.pag = params.pag ?? globais.pag;
            globais.userIP = params.user_ip ?? globais.userIP;
            globais.novoPerfilResponsavel = params.perfil_resp || globais.novoPerfilResponsavel;
            globais.entidades_permitidas = params.ent_perm ? params.ent_perm.split(",") : globais.entidades_permitidas;
            globais.usuario_logado = params.user ?? globais.usuarioLogado;
        }
    });
    console.log("pag => ", globais.pag);
    console.log("usuario_logado => ", globais.usuario_logado);
}

/**
 * Configura o comportamento de alternância (toggle) para as seções da página
 * 
 * Esta função adiciona event listeners aos cabeçalhos das seções para permitir
 * que o usuário expanda/recolha o conteúdo clicando neles.
 * 
 * Para cada cabeçalho de seção (.section-header):
 * - Adiciona um listener de clique
 * - Quando clicado, alterna a classe 'collapsed' tanto no cabeçalho quanto na seção
 * - A classe 'collapsed' controla a visibilidade/animação através do CSS
 */
function setupSectionToggle() {
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.nextElementSibling;
            if (section && section.classList.contains('section')) {
                section.classList.toggle('collapsed');
                header.classList.toggle('collapsed'); 
            }
        });
    });
}

// Adicionar esta nova função
export function handleEnterKeyNavigation(event) {
    const log = true;
    
    if (event.key === 'Enter') {
        if(log) console.log("++++++++++PULANDO PARA A CELULA DE BAIXO OU DE CIMA++++++++++");
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