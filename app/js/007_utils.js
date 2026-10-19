import { saveTableData_V3, enviarParaPaybox, registrarLogNoZoho} from './006_save_utils.js';
import {globais, eventConfig} from './999_config.js';

const url = 'https://terrasii.zohocreatorportal.com/';
//   //========================================\\
//   ||===========ABERTURA DA PÁGINA===========||
//   \\========================================//
export function setupEventListeners() {
    Object.entries(eventConfig).forEach(([className, config]) => {
        const elements = className ? document.querySelectorAll(`.${className}`) : [document];

        elements.forEach(element => {
            const handler = () => config.handler(element);

            if (config.type === 'DOMContentLoaded') {
                document.readyState === 'loading' 
                ? document.addEventListener('DOMContentLoaded', handler)
                : handler();

            } else {
                element.addEventListener(config.type, handler);

            }
        });
    });
}

/**
 * Executa requisições para a API do Zoho Creator
 * 
 * @async
 * @function executar_apiZoho
 * @param {Object} params - Parâmetros da requisição
 * @param {string} [params.tipo] - Tipo de operação: "add_reg", "atualizar_reg", "busc_reg", "busc_reg_recursivo"
 * @param {string} [params.criterios] - Critérios de busca para operações de consulta
 * @param {string} [params.ID] - ID do registro para atualização
 * @param {Object} [params.corpo] - Dados para criação/atualização de registros
 * @param {string} [params.nomeR] - Nome do relatório (report) no Zoho
 * @param {string} [params.nomeF] - Nome do formulário no Zoho
 * @returns {Promise<Object>} Resultado da operação na API
 * 
 * @description
 * Esta função centraliza as operações com a API do Zoho Creator, permitindo:
 * - Buscar registros (simples ou recursivamente)
 * - Criar novos registros
 * - Atualizar registros existentes
 * - Buscar e armazenar dados de fornecedores
 * 
 * Funções internas:
 * - busc_reg: Busca registros com paginação
 * - criar_reg: Cria novo registro
 * - atualizar_reg: Atualiza registro existente
 * - buscarFornecedores: Popula o Map baseFornecedores
 * - buscarRecursivamente: Busca registros recursivamente com paginação
 */
export async function executar_apiZoho({
    tipo = null,
    criterios = null,
    ID = null,
    corpo = null,
    nomeR = null,
    nomeF = null,
    tentativas = null
} = {}) {
    try {
        const log = false;
        nomeR = nomeR ? nomeR : globais.nomeRelCot;
        nomeF = nomeF ? nomeF : globais.nomeFormCot;
        let recOps = globalThis.ZOHO?.CREATOR?.DATA;

        if (!recOps) {
            throw new Error('O SDK do Zoho Creator ainda não está disponível.');
        }

        const tiposIdempotentes = new Set(['busc_reg', 'busc_reg_recursivo', 'atualizar_reg', 'deletar_reg', 'subir_arq']);
        const totalTentativas = tentativas ?? (tiposIdempotentes.has(tipo) ? 3 : 1);
        const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        function respostaTransitoria(resp) {
            const status = Number(resp?.status || resp?.response?.status || 0);
            const code = Number(resp?.code || 0);
            return status === 408 || status === 429 || status >= 500 || code === 429 || code >= 5000;
        }

        function erroTransitorio(erro) {
            const status = Number(erro?.status || erro?.response?.status || 0);
            if (status) return status === 408 || status === 429 || status >= 500;

            const responseText = erro?.responseText || erro?.response?.responseText;
            if (typeof responseText === 'string') {
                try {
                    const code = Number(JSON.parse(responseText)?.code || 0);
                    if ([3100, 9280].includes(code)) return false;
                    if (code) return code === 429 || code >= 5000;
                } catch (_) {
                    // Sem status/código confiável, trata como falha de rede.
                }
            }
            return true;
        }

        async function executarComRetry(operacao) {
            let ultimoErro;
            for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
                try {
                    const resp = await operacao();
                    if (!respostaTransitoria(resp) || tentativa === totalTentativas) return resp;
                    ultimoErro = resp;
                } catch (erro) {
                    ultimoErro = erro;
                    if (tentativa === totalTentativas || !erroTransitorio(erro)) throw erro;
                }

                await esperar(300 * (2 ** (tentativa - 1)) + Math.floor(Math.random() * 150));
            }
            return ultimoErro;
        }

        function normalizarCorpo(valor) {
            if (typeof valor !== 'string') return valor;
            try {
                return JSON.parse(valor);
            } catch (_) {
                return valor;
            }
        }

        // Função de criar registro
        async function criar_reg(ddsCriacao) {
            ddsCriacao = { "data": normalizarCorpo(ddsCriacao) };
            if (log) console.log("Criando registro com dados => ", JSON.stringify(ddsCriacao, null, 2));
            const config = {
                app_name: globais.nomeApp,
                form_name: nomeF,
                payload: ddsCriacao
            };
            // Inclusões não são repetidas automaticamente. Se a resposta se perder,
            // o fluxo de salvamento reconcilia pela chave de negócio antes de criar de novo.
            return executarComRetry(() => recOps.addRecords(config));
        }

        // Função de atualizar registro
        async function atualizar_reg(nomeR, ID, criterios, corpo) {
            const data = { 
                "criteria": criterios,
                "data": corpo };
            if (log) console.log("Atualizando registro ID => ", ID, " com dados => ", JSON.stringify(data, null, 2));

            if(ID !== null)
            {
                return executarComRetry(() => recOps.updateRecordById({
                    app_name: globais.nomeApp,
                    report_name: nomeR,
                    id: ID,
                    payload: data
                }));
            }

            return executarComRetry(() => recOps.updateRecords({
                app_name: globais.nomeApp,
                report_name: nomeR,
                payload: data
            }));
            
        }

        async function buscar_reg(nomeR, criterio) {
            let baseApoio = new Map();
            let cursor = null

            do {
                const config = {
                    app_name: globais.nomeApp,
                    report_name: nomeR,
                    criteria: criterio,
                    record_cursor: cursor,
                    max_records: 1000
                };
                const resp = await executarComRetry(() => recOps.getRecords(config));
                if (!resp) throw new Error(`Resposta vazia ao consultar o relatório ${nomeR}.`);
                if ([3100, 9280].includes(Number(resp.code))) break;
                if (Number(resp.code) !== 3000) throw resp;
                if (!Array.isArray(resp.data)) throw new Error(`Resposta inválida ao consultar o relatório ${nomeR}.`);
                if (resp.data.length === 0) break;

                cursor = resp.record_cursor??null;

                // Processa os dados recebidos
                resp.data.forEach((item) => {
                    const id = item.ID || item.C_digo_da_classe_operacional;
                    baseApoio.set(id, item);
                });

            } while(cursor!=null)
            
            return Array.from(baseApoio.values());
        }

        async function subirArquivos() {
            try {
                console.log("Subindo arquivos...");
                
                recOps = globalThis.ZOHO?.CREATOR?.FILE;
                if (!recOps) throw new Error('O módulo de arquivos do Zoho Creator não está disponível.');
                const config = {
                    app_name: globais.nomeApp,
                    report_name: nomeR,
                    id: ID,
                    field_name: 'Arquivo',
                    file: corpo
                }
                console.log("Configuração para upload => ", JSON.stringify(config));
                console.log("Arquivo:", corpo);
                console.log(corpo);
                console.log(JSON.stringify(corpo));

                const resp = await executarComRetry(() => recOps.uploadFile(config));
                console.log("Resposta do upload => ", resp);
                if (!resp || (resp && !resp.code)) {
                    console.warn("Resposta anômala do upload:", resp);
                    return {
                        code: 5001,
                        message: 'Resposta inválida do servidor Zoho - upload pode ter falhado',
                        rawResponse: resp
                    };
                }
                return resp;
            } catch (uploadErr) {
                console.error("Erro específico no upload:", uploadErr);
                throw uploadErr;
            }
        }

        async function remover_reg(nomeR, criterios)
        {

                const config = {
                    app_name: globais.nomeApp,
                    report_name: nomeR,
                    payload: {criteria: criterios}
                }
                console.log("Deletando registros com critérios => ", JSON.stringify(config));
                return executarComRetry(() => recOps.deleteRecords(config));
        }

        // Funções solicitadas conforme tipo
        if (tipo === "add_reg") {
            return await criar_reg(corpo);

        } else if (tipo === "atualizar_reg") {
            return await atualizar_reg(nomeR, ID, criterios, corpo);

        } else if (tipo === "busc_reg") {
            return await buscar_reg(nomeR, criterios);

        } else if (tipo === "busc_reg_recursivo") {
            return await buscar_reg(nomeR, criterios);

        } else if (tipo === "subir_arq") {
            return await subirArquivos();

        } else if (tipo === "deletar_reg") {
            return await remover_reg(nomeR, criterios);

        }
    } catch (err) {
        const responseText = err?.responseText || err?.response?.responseText;
        let erroZoho = err;
        if (typeof responseText === 'string') {
            try {
                erroZoho = { ...err, ...JSON.parse(responseText) };
            } catch (_) {
                // Mantém o erro original quando o corpo não é JSON.
            }
        }

        if (tipo?.startsWith('busc_reg') && [3100, 9280].includes(Number(erroZoho?.code))) {
            return [];
        }

        console.error("Erro na API do Zoho => ", err);

        // Trata diferentes tipos de erro e retorna um objeto estruturado
        if (erroZoho?.code) {
            // Se já é uma resposta da API, retorna como está
            return erroZoho;
        } else if (err?.name === 'Error' || err?.message) {
            // Se é um erro JavaScript padrão
            return {
                code: 5000,
                message: `Erro ao executar operação: ${err.message || 'Erro desconhecido'}`,
                type: err.name,
                error: err
            };
        } else {
            // Erro desconhecido (ex: objeto Event com isTrusted)
            return {
                code: 5000,
                message: 'Erro ao conectar com o Zoho Creator - verifique a conexão e tente novamente',
                error: err,
                isTrusted: err?.isTrusted || false
            };
        }
    }
}

export function formatToBRL_V2(v, nd = 2, alt = true) {
    const log = false;
    if (log) console.log("[+++++FORMATANDO PARA BRL+++++]");
    if (log) console.log("Número de decimais => ", nd);
    let ap_vlrOrig = null;

    if (!v) return "0,00";//Se for vazio, volta 0,00

    if (v.dataset) {
        ap_vlrOrig = v.dataset.valor_original;
        delete v.dataset.valor_original;
    }

    let av; //Apoio ao valor
    let int = false; //Flag para inteiro
    let isNeg = false; //Flag para negativo

    //Busca o valor do evento e verifica se é um inteiro
    const elemento = v.target || v;
    if ((typeof elemento == "string" || typeof elemento == "number")) {
        av = converterStringParaDecimal(elemento);

    } else {
        if(alt)
        {
            av = elemento.innerText || elemento.value;
        
        }else
        {
            av = ap_vlrOrig ||elemento.innerText || elemento.value;
        }
        int = elemento.classList?.contains("integer-cell") || false;

    }
    if (!av) return "0,00";

    const vo = av; //Valor original, sem ajuste, para evitar arredondamento
    if (log) console.log("Valor original VO => ", vo);
    if (log) console.log("Valor em decimal => ", av);

    // Verifica se é negativo
    if (av.toString().startsWith('-')) {
        isNeg = true;
        av = av.toString().substring(1);
    }

    if (log) console.log("Valor bruto sem sinal => ", av);
    // Ajusta o tipo (Inteiro ou decimal) e adiciona os zeros
    av = int ? av : converterStringParaDecimal(av);
    const [pi, pd] = av.toString().split('.');


    if (log) console.log("Parte inteira => ", pi);
    if (log) console.log("Parte decimal => ", pd);
    //AJUSTA PARTE DECIMAL PARA O NUMERO DE CASAS DECIMAIS INDICADO
    let apd;
    if (pd && pd.length > nd) {
        apd = pd.slice(0, nd);
    } else {
        apd = (pd || '') + '0'.repeat(nd - (pd || '').length);
    }
    if (log) console.log("Apoio decimal => ", apd);

    // Cria o valor final em formato de BRL
    let vf;
    if ((pi === undefined && pd === undefined)) {
        vf = `0,${apd}`;
    } else if (int) {
        vf = `${pi || 0}${apd || ''}`;
    } else {
        vf = `${pi || 0},${apd}`;
    }

    //let vf = (pi === undefined && pd === undefined) ? '0,00' : int ? `${pi || 0}${pd || ''}` : `${pi || 0},${(pd || '').slice(0, nd)}`;
    if (log) console.log("Valor final sem sinal=> ", vf);
    // Adiciona o sinal negativo de volta se necessário
    if (isNeg) {
        vf = `-${vf}`;
    }

    if (log) console.log("Valor original => ", vo);
    if (log) console.log("Valor final => ", vf);
    if (log) console.log("[-----FORMATAÇÃO CONCLUÍDA-----]");

    if (v.innerText || v.value) {
        const target = 'value' in v ? 'value' : 'innerText';
        v[target] = vf;
        v.dataset.valor_original = vo;
        v.addEventListener('focus', () => { if (log) console.log("[+++++FOCUS+++++]"); v[target] = v.dataset.valor_original || '' });
        return;
    } else {
        return vf;
    }
}

/**
 * Converte uma string em um valor decimal, removendo caracteres não numéricos
 * e padronizando a formatação
 * 
 * @function converterStringParaDecimal 
 * @param {string|number|HTMLElement} valor - Valor ou elemento a ser convertido
 * @returns {number} Valor decimal formatado
 *
 * @example
 * converterStringParaDecimal("ABC123") // retorna 123.00
 * converterStringParaDecimal("ABC123.12") // retorna 123.12
 * converterStringParaDecimal(elementoHTML) // atualiza o innerText e retorna o valor
 */
export function converterStringParaDecimal(valor, nd = null) {

    const log = false;

    if (log) console.log("[+++++CONVERTENDO STRING PARA DECIMAL+++++]");
    // Verifica se é um elemento HTML
    const isElement = valor && typeof valor === 'object' && 'innerText' in valor;
    const valorOriginal = isElement ? valor.innerText : valor;

    if (!valorOriginal) return 0.00;
    // Remove todos os caracteres não numéricos exceto ponto e vírgula
    let numeroLimpo = valorOriginal.toString().replace(/[^\d.,\-]/g, '');

    if (log) console.log("Valor limpo => ", numeroLimpo);

    // Trata números negativos
    const isNegative = numeroLimpo.startsWith('-');
    numeroLimpo = numeroLimpo.replace('-', '');

    if (log) console.log("Valor limpo sem sinal => ", numeroLimpo);

    // Conta quantos pontos e vírgulas existem
    const qtdPontos = (numeroLimpo.match(/\./g) || []).length;
    const qtdVirgulas = (numeroLimpo.match(/,/g) || []).length;

    if (log) console.log("Quantidade de pontos => ", qtdPontos);
    if (log) console.log("Quantidade de vírgulas => ", qtdVirgulas);

    // Se tiver mais de um separador do mesmo tipo, considera como separador de milhar
    if (qtdPontos > 1 || qtdVirgulas > 1) {
        numeroLimpo = numeroLimpo.replace(/[.,]/g, '');
    } else if (qtdPontos === 1 && qtdVirgulas === 1) {
        const posicaoPonto = numeroLimpo.lastIndexOf('.');
        const posicaoVirgula = numeroLimpo.lastIndexOf(',');

        if (posicaoPonto > posicaoVirgula) {
            numeroLimpo = numeroLimpo.replace(',', '');
        } else {
            numeroLimpo = numeroLimpo.replace('.', '').replace(',', '.');
        }
    } else if (qtdVirgulas === 1) {
        numeroLimpo = numeroLimpo.replace(',', '.');
    }

    if (log) console.log("Valor limpo apenas com ponto => ", numeroLimpo);

    let [pi, pd] = numeroLimpo.toString().split('.');

    // Ajusta a quantidade de casas decimais
    if (nd !== null) {
        pd = pd ? pd.slice(0, nd) : '0'.repeat(nd);
    }

    if (log) console.log("Parte inteira => ", pi);
    if (log) console.log("Parte decimal => ", pd);
    // Converte para número e fixa em nd casas decimais
    const numConcat = (pi || '0') + '.' + pd;
    if (log) console.log("Numero concatenado => ", numConcat);
    let numeroFinal = parseFloat(numConcat);

    //if(log) console.log("Valor final sem ajuste de casas decimais => ", numeroFinal);

    //numeroFinal = isNaN(numeroFinal) ? 0.00 : nd !== null ? Math.floor(numeroFinal * 10**nd) / 10**nd : numeroFinal;

    if (log) console.log("Valor final => ", numeroFinal);

    // Aplica o sinal negativo se necessário
    if (isNegative) {
        numeroFinal = -numeroFinal;
    }

    if (log) console.log("Valor final com sinal => ", numeroFinal);
    if (log) console.log("[------CONVERSÃO FINALIZADA------]");

    // Se for um elemento HTML, atualiza o innerText com o valor formatado
    if (isElement) {
        valor.innerText = numeroFinal
    }

    return numeroFinal;
}

/**
 * Converte um número positivo para negativo
 * 
 * @function convertToNegative
 * @param {number} v - Valor numérico a ser convertido
 * @returns {number} Valor convertido para negativo se positivo, ou mantém o valor se já for negativo
 */
export function convertToNegative(v) {
    return v > 0 ? (v * -1) : v;
}

/**
 * Restringe o conteúdo de células a apenas valores numéricos
 * 
 * @function restrictNumericInput
 * @param {HTMLElement} obj - Elemento HTML que contém o texto a ser filtrado
 * @description
 * - Remove todos os caracteres não numéricos, exceto pontos e vírgulas
 * - Atualiza o innerText do elemento com o valor filtrado
 */
export function restrictNumericInput(obj) {
    const log = false;
    if(log) console.log("++++++++++RESTRINDO INPUTS A NUMERICOS++++++++++");
    const input = obj.innerText;
    const filteredInput = input.replace(/[^0-9.,-]/g, '');
    if (input !== filteredInput) {
        if(log) console.log("Substituíndo valor original por valor filtrado => ", filteredInput);
        obj.innerText = filteredInput;
    }
    if(log) console.log("----------INPUTS RESTRITOS A NUMERICOS----------");
}

/**
 * Restringe o conteúdo de células a apenas números inteiros
 * 
 * @function restrictIntegerInput
 * @param {Event|HTMLElement} event - Evento do DOM ou elemento HTML direto
 * @description
 * - Aceita tanto um evento quanto um elemento HTML direto
 * - Remove todos os caracteres não numéricos
 * - Atualiza o innerText do elemento com o valor filtrado
 */
export function restrictIntegerInput(event) {
    // Verifica se recebeu um evento ou um elemento direto
    const element = event.target || event;

    if (!element || !element.innerText) return;

    const input = element.innerText;
    const filteredInput = input.replace(/[^0-9]/g, '');

    if (input !== filteredInput) {
        element.innerText = filteredInput;
    }
}

/**
 * Converte um número para o formato brasileiro (0.000,00)
 * 
 * @function convertNumberFormat
 * @param {string|number} number - Número a ser formatado
 * @returns {string} Número formatado no padrão brasileiro ou string vazia em caso de erro
 * @description
 * - Remove formatação anterior de pontos e vírgulas
 * - Converte para número e formata com 2 casas decimais
 * - Retorna o valor formatado usando toLocaleString
 */
export function convertNumberFormat(number) {
    try {
        if (typeof number === 'string') {
            // Remove qualquer formatação anterior de pontos e vírgulas
            number = number.replace(/[^\d.-]/g, '');
        }
        let numericValue = parseFloat(number);
        if (!isNaN(numericValue)) {
            return numericValue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            return '';
        }
    } catch (err) {
        return '';
    }
}

function createEl(tag, className = '', innerHTML = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (innerHTML) element.innerHTML = innerHTML;
    return element;
}

/**
 * Cria e exibe um modal customizado com diferentes funcionalidades
 * 
 * @async
 * @function customModal
 * @param {Object} params - Parâmetros de configuração do modal
 * @param {HTMLElement} [params.botao=null] - Botão que acionou o modal (opcional)
 * @param {string} params.tipo - Tipo do modal ('ajustar_cot', 'arquivar_cot', 'salvar_cot', etc)
 * @param {string} [params.titulo=null] - Título do modal (opcional)
 * @param {string} params.mensagem - Mensagem principal do modal
 * @param {string} [params.confirmText='Confirmar'] - Texto do botão de confirmação
 * @param {string} [params.cancelText='Cancelar'] - Texto do botão de cancelamento
 * @param {string} [params.loadingText='Carregando, aguarde...'] - Texto exibido durante carregamento
 * 
 * @description
 * Esta função cria um modal customizado com as seguintes características:
 * 
 * - Estrutura base:
 *   - Overlay que cobre a tela
 *   - Popup central com título (opcional)
 *   - Mensagem principal
 *   - Área de input (para tipos específicos)
 *   - Botões de confirmação e cancelamento
 *   - Indicador de carregamento
 * 
 * - Tipos de modal suportados:
 *   - ajustar_cot: Modal para solicitar ajustes na cotação
 *   - arquivar_cot: Modal para arquivar cotação
 *   - salvar_cot: Modal para salvar cotação
 * 
 * - Funcionalidades:
 *   - Validação de campos obrigatórios
 *   - Feedback visual de erros
 *   - Estado de carregamento durante operações
 *   - Integração com API Zoho para atualizações
 *   - Recarregamento da página após operações bem-sucedidas
 * 
 * @example
 * // Modal básico de confirmação
 * customModal({
 *   tipo: 'salvar_cot',
 *   mensagem: 'Deseja salvar as alterações?'
 * });
 * 
 * // Modal com input e título
 * customModal({
 *   tipo: 'ajustar_cot',
 *   titulo: 'Solicitar Ajuste',
 *   mensagem: 'Descreva o ajuste necessário:',
 *   confirmText: 'Enviar'
 * });
 */
export async function customModal({ botao = null, tipo = null, titulo = null, mensagem, confirmText = 'Confirmar', cancelText = 'Cancelar', loadingText = 'Carregando, aguarde...' }) {
    if (tipo === null) {
        tipo = 'editar_pdc';
    }

    const pgtoAnt = document.getElementById('pag_antecipado').checked;
    /*
    if(globais.pag === "criar_cotacao_DP" || globais.pag === "editar_cotacao_DP")
    {
        tipo = globais.pag;
    }
    */

    // Criação da estrutura base
    const overlay = createEl('div', 'customConfirm-overlay-div');
    const popup = createEl('div', 'customConfirm-div');
    const messageElement = createEl('p', 'customConfirm-message', mensagem);
    // Cria o elemento de loading
    const loadingElement = createEl('div', 'customConfirm-loading',
        `<div class="customConfirm-loading-spinner"></div> ${loadingText}`);

    // Adiciona título se fornecido
    if (titulo) {
        popup.appendChild(createEl('h3', 'customConfirm-title', titulo));
    }

    // Configuração do input para tipos específicos
    const inputConfig = {
        'ajustar_cot': {
            placeholder: 'Ex.: Gostaria que o valor de frete fosse alterado...',
            buttonClass: 'customAdjust-confirmButton'
        },
        'arquivar_cot': {
            placeholder: 'Ex.: Arquivo devido a não resposta do fornecedor...',
            buttonClass: 'customArchive-confirmButton'
        },
        'solicitar_ajuste_ao_compras': {
            placeholder: 'Ex.: Produto veio quebrado, não recebido...',
            buttonClass: 'customAdjust-confirmButton'
        }
    };

    // Adiciona input se necessário
    let inputElement;
    if (inputConfig[tipo]) {
        inputElement = createEl('textarea', 'customAdjust-textarea');
        inputElement.placeholder = inputConfig[tipo].placeholder;
        Object.assign(inputElement.style, {
            width: '300px',
            height: '100px',
            resize: 'none',
        });
    }

    // Criação dos botões
    const buttonContainer = createEl('div', 'customConfirm-button-container');
    const confirmButton = createEl('button', `customConfirm-confirmButton ${inputConfig[tipo]?.buttonClass || ''}`, confirmText);
    const cancelButton = createEl('button', 'customConfirm-cancelButton', cancelText);

    // Aplica estilo ao container dos botões
    Object.assign(buttonContainer.style, {
        display: 'flex',
        gap: '10px',
        justifyContent: 'center',
        marginTop: '20px'
    });

    // Adiciona os botões ao container
    buttonContainer.append(confirmButton, cancelButton);

    // Função para esconder/mostrar elementos
    const toggleElements = (show) => {
        // Esconde/mostra o título se existir
        const titleElement = popup.querySelector('.customConfirm-title');
        if (titleElement) titleElement.style.display = show ? 'block' : 'none';

        // Esconde/mostra a mensagem
        messageElement.style.display = show ? 'block' : 'none';

        // Esconde/mostra a textarea se existir
        if (inputElement) {
            inputElement.style.display = show ? 'block' : 'none';
        }

        // Esconde/mostra os botões
        buttonContainer.style.display = show ? 'flex' : 'none';

        // Esconde/mostra o loading (inverso dos outros elementos)
        loadingElement.style.display = show ? 'none' : 'flex';

        // Remove a mensagem de erro quando mostrar o loading
        const errorMessage = popup.querySelector('.customConfirm-error-message');
        if (errorMessage) {
            errorMessage.style.display = show ? 'block' : 'none';
        }
    };

    // Handlers dos botões
    const handleConfirm = async () => {
        // Verifica se o tipo de solicitação é "SERVIÇO"
        const tipoSolicitacao = document.querySelector('select[name="Tipo_de_solicitacao"]').options[document.querySelector('select[name="Tipo_de_solicitacao"]').selectedIndex].text;

        function getDates(t = null) {
            console.log("\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ESTÁ USANDO O GETDATES//////////////////////////////////")
            let listDatas = [];
            const formDdsDetalhes = document.querySelector('#form-pagamento');
            const parcelas = formDdsDetalhes.querySelectorAll('.parcela');

            let indiceParcela = 0;
            parcelas.forEach(parcela => {
                const numParc = parcela.querySelector('label');
                const dataInput = parcela.querySelector('input[type="date"]');
                const valorInput = parcela.querySelector('input[name="Valor"]');
                const numPDC = parcela.querySelector('input[name="Num_PDC_parcela"]');

                const dadosParcela = {};
                if (numParc?.textContent) {
                    dadosParcela.Numero_da_parcela = parseInt(numParc.textContent.match(/\d+/)[0])
                }
                if (pgtoAnt && indiceParcela === 0 && t === "confirmar_compra") {
                    dadosParcela.parcela_criada = true
                } else {
                    dadosParcela.parcela_criada = false
                }
                if (dataInput?.value) {
                    const [ano, mes, dia] = dataInput.value.split('-');
                    dadosParcela.Vencimento_previsto = `${dia}/${mes}/${ano}`
                }
                if (valorInput?.value) {
                    dadosParcela.Valor = converterStringParaDecimal(valorInput.value)
                }
                if (numPDC?.value) {
                    dadosParcela.Num_PDC_parcela = numPDC.value
                }

                listDatas.push(dadosParcela);
                indiceParcela++;
            })
            return listDatas;
        }

        if (inputElement && !inputElement.value.trim()) {
            // Remove mensagem de erro anterior se existir
            const existingError = popup.querySelector('.customConfirm-error-message');
            if (existingError) {
                existingError.remove();
            }

            const errorMessage = createEl('p', 'customConfirm-error-message', "Preencha o campo de observação...");
            // Inserir após o inputElement ao invés de antes
            inputElement.insertAdjacentElement('afterend', errorMessage);

            // Aplicar estilos mantendo o textarea centralizado
            Object.assign(inputElement.style, {
                width: '300px',
                height: '100px',
                resize: 'none',
                border: '1px solid #ff5a5a',
                borderRadius: '4px',
                transition: 'border 0.2s ease',
                margin: '0 auto',  // Mantém centralizado
                display: 'block'   // Garante que ocupe a linha inteira
            });

            Object.assign(errorMessage.style, {
                margin: '5px 0 0 0',
                fontSize: '10pt',
                color: '#ff5a5a',
                textAlign: 'center' // Centraliza o texto de erro
            });

            return;
        }

        toggleElements(false);

        // Determina o payload baseado no tipo de ação
        let payload;
        // Mapeia os tipos de ação   para os payloads correspondentes
        const payloadMap = {
            'enviar_p_checagem_final': {
                Status_geral: 'Chec. final'
            },
            'enviar_p_assinatura':
            {
                Status_geral: 'Ass. control.'
            },
            'autorizar_pagamento_sindico': {
                Status_geral: 'Ass. sindico'
            },
            'autorizar_pagamento_subsindico': {
                Status_geral: 'Ass. subsindico'
            },
            'confirmar_todas_as_assinaturas': {
                Status_geral: 'Pag. aut.'
            }
        };

        // Verifica se o tipo está no mapa e cria o payload
        if (tipo === 'remover_fornecedor' || tipo === 'remover_produto') {
            overlay.remove();
            return Promise.resolve(true);
        } 
    };

    // Montagem final do popup
    popup.append(
        messageElement,
        ...(inputElement ? [inputElement] : []),
        buttonContainer,
        loadingElement
    );

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Retorna uma Promise que será resolvida quando o usuário interagir com o modal
    return new Promise((resolve) => {
        confirmButton.addEventListener('click', () => {
            handleConfirm().then(result => {
                resolve(result);
            });
        });
        cancelButton.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
}

export async function customModal_V2({ 
        acao = null, 
        tipoAcao = 'confirm', 
        titulo = null, mensagem, 
        confirmText = 'Confirmar', 
        cancelText = 'Cancelar', 
        loadingText = 'Carregando, aguarde...' 

}) {

    try {
        const log = false;
        if (log) console.log("++++++++++CRIANDO MODAL CUSTOMIZADO++++++++++");
        if (log) console.log("+++ACAO => ", acao);
        if (log) console.log("+++TIPO DE ACAO => ", tipoAcao);
        if (log) console.log("+++TITULO => ", titulo);
        if (log) console.log("+++MENSAGEM => ", mensagem);
        if (log) console.log("+++CONFIRM TEXT => ", confirmText);
        if (log) console.log("+++CANCEL TEXT => ", cancelText);
        if (log) console.log("+++LOADING TEXT => ", loadingText);

        //==========CRIA OS ELEMENTOS DO MODAL==========\\
        const popup = createEl('div', 'customConfirm-div');
        const overlay = createEl('div', 'customConfirm-overlay-div');
        const messageElement = createEl('p', 'customConfirm-message', mensagem);

        const loadingElement = createEl('div', 'customConfirm-loading',
            `<div class="customConfirm-loading-spinner"></div> ${loadingText}`);

        if (titulo) {
            popup.appendChild(createEl('h3', 'customConfirm-title', titulo));
        }

        //==========DEFINE CONFIGURAÇÕES PARA CAMPO DE INPUT, CASO PRECISE==========\\
        const inputConfig = {
            'ajustar_cot': {
                placeholder: 'Ex.: Gostaria que o valor de frete fosse alterado...',
                buttonClass: 'customAdjust-confirmButton'
            },
            'arquivar_cot': {
                placeholder: 'Ex.: Arquivo devido a não resposta do fornecedor...',
                buttonClass: 'customArchive-confirmButton'
            },
            'solicitar_ajuste_ao_compras': {
                placeholder: 'Ex.: Produto veio quebrado, não recebido...',
                buttonClass: 'customAdjust-confirmButton'
            },
            'lancar_pdc_ahreas': {
                placeholder: 'Número do lançamento no ahreas, Ex.: 9712345...',
                buttonClass: 'customAdjust-confirmButton'
            }
        };

        //==========CRIA O ELEMENTO DE INPUT, CASO PRECISE==========\\
        let inputElement;
        if (inputConfig[acao]) {
            inputElement = createEl('textarea', 'customAdjust-textarea');
            inputElement.placeholder = inputConfig[acao].placeholder;
            Object.assign(inputElement.style, {
                width: '300px',
                height: '100px',
                resize: 'none',
            });
            if (log) console.log("Input criado!");

        }
        if (log) console.log("Passou do input!");

        //==========CRIA OS BOTÕES BASEADO NA AÇÃO (ALERT OU CONFIRM)==========\\
        const buttonContainer = createEl('div', 'customConfirm-button-container');
        let confirmButton;
        if(tipoAcao === 'alert') {
            confirmButton = createEl('button', `archive-btn`, confirmText);
            
        }else
        {
            confirmButton = createEl('button', `customConfirm-confirmButton ${inputConfig[tipo]?.buttonClass || ''}`, confirmText);

        }

        buttonContainer.append(confirmButton);

        let cancelButton;
        if (tipoAcao === 'confirm') {
            cancelButton = createEl('button', 'customConfirm-cancelButton', cancelText);
            buttonContainer.append(cancelButton);

        }

        //==========ALTERNAR VISIBILIDADE DE ELEMENTOS==========\\
        const alternVisibEl = (show) => {
            // Esconde/mostra o título se existir
            const titleElement = popup.querySelector('.customConfirm-title');
            if (titleElement) titleElement.style.display = show ? 'block' : 'none';

            // Esconde/mostra a mensagem
            messageElement.style.display = show ? 'block' : 'none';

            // Esconde/mostra a textarea se existir
            if (inputElement) {
                inputElement.style.display = show ? 'block' : 'none';
            }

            // Esconde/mostra os botões
            buttonContainer.style.display = show ? 'flex' : 'none';

            // Esconde/mostra o loading (inverso dos outros elementos)
            loadingElement.style.display = show ? 'none' : 'flex';
            // Remove a mensagem de erro quando mostrar o loading
            const errorMessage = popup.querySelector('.customConfirm-error-message');
            if (errorMessage) {
                errorMessage.style.display = show ? 'block' : 'none';
            }
        };

        //==========FINALIZADA CRIAÇÃO DO MODAL E APLICA A PÁGINA PRINCIPAL==========\\
        popup.append(
            messageElement,
            ...(inputElement ? [inputElement] : []),
            buttonContainer,
            loadingElement
        );

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        //==========RETORNA UMA PROMISE QUE SERÁ RESOLVIDA QUANDO O USUÁRIO INTERAGIR COM O MODAL==========\\
        return new Promise((resolve) => {
            confirmButton.addEventListener('click', () => {
                if (tipoAcao === 'confirm') {
                    alternVisibEl(false);
                    tratarRespModal({ acao: acao, infoInserida: inputElement ? inputElement.value : null }).then(result => {
                        overlay.remove();
                        if(result != true){
                            customModal_V2({
                                tipoAcao:'alert', 
                                titulo: "Erro ao executar ação!, envie esse erro ao desenvolvedor!", 
                                mensagem:`<p>${result.message}</p><p style="max-width: 500px; word-wrap: break-word;">${result.stack}</p>`,
                                confirmText: 'Ok!'
                            });
                        }
                        resolve(result);

                    });

                } else {
                    overlay.remove();
                    resolve(true);
                }
            });

            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    overlay.remove();
                    resolve(false);
                });
            }
        });

    } catch (error) {
        customModal_V2({
            tipoAcao:'alert', 
            titulo: "Erro ao executar ação!, envie esse erro ao desenvolvedor!", 
            mensagem:`<p>${error.message}</p><p style="max-width: 500px; word-wrap: break-word;">${error.stack}</p>`,
            confirmText: 'Ok!'
        });

    }
}

export async function tratarRespModal({ acao, infoInserida = null }) {
    try {
        const log = false;
        if (log) console.log("++++++++++TRATANDO RESPOSTA POSITIVA DO MODAL++++++++++");
        if (log) console.log("acao => ", acao);
        if (log) console.log("infoInserida => ", infoInserida);
    
        if (
            [
                'salvar_cot',
                'criar_cotacao',
                'editar_cot',
                'solicitar_aprovacao_sindico',
                'corrigir_erros',
                'ajustar_cot',
                'aprov_cot',
                'arquivar_cot',
                'finalizar_provisionamento',
                'confirmar_compra',
                'confirmar_recebimento',
                'solicitar_ajuste_ao_compras',
                'enviar_p_checagem_final',
                'tratar_control',
                'enviar_p_ass_control',
                'enviar_p_assinatura',
                'autorizar_pagamento_sindico',
                'autorizar_pagamento_subsindico',
                'confirmar_todas_as_assinaturas',
                "lancar_pdc_ahreas",
                "confirmar_pag_ahreas",
                "suspender_pagamento",
                "duplicar_pdc"
            ].includes(acao)) {
            /*
            const valido = validateFields(acao);
            if (!valido) return false;
            */
            //const resp = validateFields(acao);
            //if (resp !== true) return true;
            await prepararParaSalvar(acao, infoInserida);
        }
        if (log) console.log("----------RESPOSTA TRATADA, RETORNANDO TRUE----------");
        return true;
        
    } catch (error) {
        return error;
    }
}

async function prepararParaSalvar(acao, infoInserida = null) {
    try {
        const log = false;
    
        if (log) console.log("++++++++++PREPARANDO PARA SALVAR++++++++++");
        if (log) console.log("acao => ", acao);
        if (log) console.log("page => ", globais.pag);
        if (log) console.log("infoInserida => ", infoInserida);
    
        const tipoSolicitacao = document.querySelector('select[name="Tipo_de_solicitacao"]').options[document.querySelector('select[name="Tipo_de_solicitacao"]').selectedIndex].text;
        const parcelaCriadaElement = document.getElementsByName('parcela_criada')[0];
        let parcelaCriada = parcelaCriadaElement ? parcelaCriadaElement.checked : false;
        const data_atual = moment();
        const data_atual_formatada = data_atual.format('DD/MM/YYYY HH:mm:ss');
        // Nova constante no formato 'aa-mmm-dd' com mês em inglês
        //const data_atual_formatada_en = data_atual.format('DD-MMM-YYYY HH:mm:ss');
        let alcada_temp = null;

        const paramExtra = {};
        const pgtoAnt = document.getElementById('pag_antecipado').checked;
    
        let stats_salvarCot = "Prop. criada";
        let apoio_sep_parcela = globais.perfilResponsavel.includes("Controladoria");

        if (globais.pag === "criar_numero_de_PDC") {
            stats_salvarCot = null;

        } else if (acao === "enviar_p_assinatura") {
            stats_salvarCot = parcelaCriada? "Ass. control." : "Chec. final";
            apoio_sep_parcela = false;

        } 
        else if (acao === "enviar_p_ass_control") {
            // Mantém a decisão do fluxo original: o que define a separação é
            // a parcela já ter sido criada, não a quantidade de parcelas.
            // Uma solicitação nova da Controladoria, mesmo com uma parcela,
            // precisa passar pelo separador para gerar o filhote com índice 0.
            stats_salvarCot = parcelaCriada ? "Ass. control." : "Prop. criada";
            apoio_sep_parcela = parcelaCriada ? false : true;

        }else if (globais.pag === "checagem_final") {
            stats_salvarCot = "Chec. final";

        }
    
        let apoio_paramExtras = {};
        apoio_paramExtras.Assinaturas = [];
        let tudoAssinado = false;


        let ap_status_subsindico = "Ass. subsindico";
    
        if ([
            "enviar_p_ass_control",
            "enviar_p_assinatura",
            "autorizar_pagamento_sindico",
            "autorizar_pagamento_subsindico",
            "confirmar_todas_as_assinaturas"
        ].includes(acao)) {
            const apoio_assin_inic = new Map();
            apoio_assin_inic["Financeiro"] = 
            {
                Cargo: "Controladoria",
                Funcao: "Auxiliar controladoria",
                Usuario: "Maiara",
                E_mail_usuario: "Controladoriatsj2@gmail.com",
                IP: globais.userIP,
                Data_da_assinatura: data_atual_formatada,
                Assinado: true
            }
            
            if(converterStringParaDecimal(document.querySelector('.valor-parcela').dataset.valor_original) >= 800)
            {
                apoio_assin_inic["Mario"]={
                    Cargo: "Administrativo",
                    Funcao: "Síndico",
                    Usuario: "Mario",
                    E_mail_usuario: "sindico@tsj2.com.br",
                    IP: "",
                    Data_da_assinatura: "",
                    Assinado: false
                }
            }
            
            const assinaturasIniciais = {
                ...apoio_assin_inic,
                "Weverton": {
                    Cargo: "Administrativo",
                    Funcao: "Gerente operacional",
                    Usuario: "Weverton",
                    E_mail_usuario: "controladoriatsj2@gmail.com",
                    IP: "",
                    Data_da_assinatura: "",
                    Assinado: false
                }
            }
            if(log) console.log("assinaturasIniciais => ", JSON.stringify(assinaturasIniciais));
            function buscarAssinaturas() {
                const log = false;
                if (log) console.log("++++++++++BUSCANDO ASSINATURAS++++++++++");
    
                const assinantes = document.querySelectorAll('.assinantes .assinante');
                if (log) console.log("assinantes => ", assinantes);
                assinantes.forEach((assinante) => {
                    const dadosAssinante = {};
                    if (log) console.log("assinante => ", assinante);
                    assinante.querySelectorAll('input').forEach((input) => {
                        if (log) console.log("nome => ", input.name, ", valor => ", input.value);
                        if (input.name === "Assinado") {
                            dadosAssinante[input.name] = input.checked;
                        } else if (input.name === "Data_da_assinatura") {
                            if (input.value) {
                                //dadosAssinante[input.name] = moment(input.value, 'YYYY-MM-DDTHH:mm:ss').format('DD/MM/YYYY HH:mm:ss');
                                dadosAssinante[input.name] = formatDate(input.value, 'DD/MM/YYYY HH:mm:ss');
    
                            } else {
                                dadosAssinante[input.name] = ""; // ou você pode atribuir um valor padrão, como ""
                            }
                        }
                        else {
                            dadosAssinante[input.name] = input.value;
                        }
                    });
    
                    if (log) console.log("dadosAssinante => ", dadosAssinante);
    
                    apoio_paramExtras.Assinaturas.push({ ...dadosAssinante });
                    if (log) console.log("assinaturas => ", JSON.stringify(apoio_paramExtras.Assinaturas));
                });
    
            }
    
            if (acao === "enviar_p_assinatura" || acao === "enviar_p_ass_control") {
                apoio_paramExtras.Assinaturas.push(...Object.values(assinaturasIniciais));
    
            } else {
                buscarAssinaturas();
                console.log("assinaturas j  criadas", apoio_paramExtras.Assinaturas);
                if (acao === "autorizar_pagamento_subsindico") {
                    let indice = 1;
                    if(apoio_paramExtras.Assinaturas.length >2)
                    {
                        indice = 2;
                    }

                    apoio_paramExtras.Assinaturas[indice].IP = globais.userIP || "";
                    apoio_paramExtras.Assinaturas[indice].Data_da_assinatura = data_atual_formatada;
                    apoio_paramExtras.Assinaturas[indice].Assinado = true;
                    
                } else if (acao === "autorizar_pagamento_sindico") {
                    const indice = 1;
                    if (apoio_paramExtras.Assinaturas.length > indice) {
                        apoio_paramExtras.Assinaturas[indice].IP = globais.userIP || "";
                        apoio_paramExtras.Assinaturas[indice].Data_da_assinatura = data_atual_formatada;
                        apoio_paramExtras.Assinaturas[indice].Assinado = true;
                    }
                }
            }
            tudoAssinado = apoio_paramExtras.Assinaturas.every(assinatura => assinatura.Assinado);
            ap_status_subsindico = tudoAssinado ? "Pag. aut." : ap_status_subsindico;
        }
    
        const statusMap = {
            salvar_cot: {
                status: stats_salvarCot
            },
            criar_cotacao: { status: globais.pag === "criar_numero_de_PDC" ? null : "Prop. criada" },
            editar_cot: { status: globais.pag === "criar_numero_de_PDC" ? null : "Prop. criada" },
            corrigir_erros: { status: globais.pag === "criar_numero_de_PDC" ? null : "Prop. criada" },
            solicitar_aprovacao_sindico: { status: "Aguard. aprov. prop." },
            ajustar_cot: { status: "Ajuste sol.", paramsExtraPDC: { Solicitacao_de_ajuste: infoInserida } },
            aprov_cot: {
                status:
                    globais.perfilResponsavel.includes("Depto. Pessoal") &&
                        parcelaCriada ? "Chec. final" :
                        "Prop. aprov."
            },
            arquivar_cot: {status: "Prop. arquivada"},
            finalizar_provisionamento: {
                status:
                    globais.perfilResponsavel.includes("Depto. Pessoal") &&
                        !parcelaCriada ? "Separado em parcelas" :
                        "Aguard. compra"
            },
            confirmar_compra: {
                status: globais.perfilResponsavel.includes("Controladoria")? 'Chec. final': tipoSolicitacao === 'SERVIÇO' || pgtoAnt?'Chec. final' : 'Compra real.',
                sepPorParc: tipoSolicitacao === 'SERVIÇO' || pgtoAnt || globais.perfilResponsavel.includes("Controladoria"),
                paramsExtraPDC: {pag_antecipado: false}
            },
            confirmar_recebimento: { status: "Chec. final", sepPorParc: true },
            solicitar_ajuste_ao_compras: { status: "Ajuste sol. control.", paramsExtraPDC: { Solicitacao_de_ajuste: infoInserida }},
            enviar_p_checagem_final: { status: "Chec. final" },
            tratar_control: { paramsExtraPDC: { Status_controladoria: "Tratado" } },
            enviar_p_ass_control:
            {
                status: stats_salvarCot,
                sepPorParc: apoio_sep_parcela,
                paramsExtraPDC: apoio_paramExtras,
                resolucaoAposSalvar: apoio_sep_parcela ? {
                    tipo: 'enviar_p_ass_control',
                    statusPrimeiroPdc: 'Ass. control.',
                    salvarPdcOriginalSeparado: globais.tipo === 'editar_pdc'
                } : null
            },
            enviar_p_assinatura: {
                status: stats_salvarCot,
                sepPorParc: apoio_sep_parcela,
                paramsExtraPDC: apoio_paramExtras
            },
            autorizar_pagamento_subsindico: {
                status: ap_status_subsindico,//status: tudoAssinado ? "Pag. aut." : "Ass. subsindico",
                paramsExtraPDC: apoio_paramExtras
            },
            autorizar_pagamento_sindico: {
                status: tudoAssinado ? "Pag. aut." : "Ass. sindico",
                paramsExtraPDC: apoio_paramExtras
            },
            confirmar_todas_as_assinaturas: {
                status: "Pag. aut.",
                paramsExtraPDC: apoio_paramExtras
            },
            lancar_pdc_ahreas: { status: "Lanç. ERP", paramsExtraPDC: { Status_Guillaumon: "Lançado no ahreas", num_lanc_ahreas: infoInserida } },
            confirmar_pag_ahreas: { status: "Pag. real.", paramsExtraPDC: { Status_Guillaumon: "Pagamento confirmado", Hora_confirm_pagto: data_atual_formatada} },
            suspender_pagamento: {status: "Pag. suspenso"}
        };

        if (acao in statusMap) {
            const params = statusMap[acao];
            if(["aprov_cot", "enviar_p_ass_control"].includes(acao) && !globais.numPDC)
            {
                await gerar_num_pdc();
            }
            console.log(`params: ${JSON.stringify(params, null, 2)}`);
            const ids_pdcs_criados = await saveTableData_V3(params);
            console.log('IDs de PDC retornados pelo salvamento resiliente => ', ids_pdcs_criados);
            /*
            if(ids_pdcs_criados == false)
            {
                return false;
            }
                */

            if (acao.includes("finalizar_provisionamento")) {
                if (globais.perfilResponsavel.includes("Depto. Pessoal")) {
                    document.getElementById('pag_antecipado').setAttribute('checked', 'checked');
                    await saveTableData_V3({ status: "Chec. final", sepPorParc: true });
                    //=====REMOVE ALGUNS DADOS DO PDC E FAZ A COPIA DAS PARCELAS=====\\
                    //CRIA UM NOVO ID TEMPORÁRIO PARA A CÓPIA E LIMPA O NUMERO DO PDC
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const seconds = String(now.getSeconds()).padStart(2, '0');
    
                    globais.numPDC_temp = `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
                    globais.numPDC = null;
    
                    //LIMPA AS CÉLULAS DE QUANTIDADE E VALOR UNITÁRIO
                    const valorUnitTds = document.querySelectorAll('td.valor-unit');
                    const totalForns = document.querySelectorAll('td.total-fornecedor');
                    [...valorUnitTds, ...totalForns].forEach(td => {
                        td.textContent = '';
                        if (td.dataset.valor_original) delete td.dataset.valor_original;
    
                        // Limpar a célula do lado direito se for valor unitário
                        if (td.classList.contains('valor-unit')) {
                            const nextTd = td.nextElementSibling;
                            if (nextTd) {
                                nextTd.textContent = '';
                                if (nextTd.dataset.valor_original) delete nextTd.dataset.valor_original;
                            }
                        }
                    });
    
                    //LIMPA AS CÉLULAS DE VALOR DA CLASSIFICAÇÃO CONTÁBIL
                    const formClassificacao = document.querySelector('#form-classificacao');
                    const inputsValor = formClassificacao.querySelectorAll('input[name="Valor"]');
                    inputsValor.forEach(input => {
                        input.value = '';
                    });
                    document.getElementById('pag_antecipado').removeAttribute('checked');
    
                    await saveTableData_V3({ status: "Prop. criada", sepPorParc: true, paramExtra: {pag_antecipado: false}});
    
                }
            } else if (acao === 'confirmar_compra') {
                if ((tipoSolicitacao === 'SERVIÇO' || globais.perfilResponsavel.includes("Controladoria")) &&
                    ids_pdcs_criados.length > 0) {
                    await saveTableData_V3({ status: "Separado em parcelas" });

                } else if (pgtoAnt) {
                    await saveTableData_V3({ status: "Compra real.", paramExtra: { pag_antecipado: false } });
                    
                }
    
                const entidadeSelecionada = document.getElementById('entidade').value;
                const layoutMap = {
                    "1": "pedido_PDF",
                };

                const layoutName = "pedido_PDF";
                if (layoutName) {
                    const link_layout = `${url}guillaumon/${globais.nomeApp}/pdf/${layoutName}?id_pdc=${globais.idPDC}&zc_PdfSize=A4&zc_FileName=${globais.numPDC}_${layoutName.split('_')[0]}`;
                    window.open(link_layout, '_blank', 'noopener,noreferrer');
                }
            } else if (acao === 'confirmar_recebimento') {
                // Sem IDs retornados, todas as parcelas já existiam e a própria
                // operação sepPorParc concluiu o status do PDC original.
                if (ids_pdcs_criados.length > 0) {
                    await saveTableData_V3({ status: "Separado em parcelas" });
                }
            }
            /*
            if(params.status == "Pag. aut.")
            {
                await enviarParaPaybox()
            }
            */
            var config = {
                action: "reload"
            };
            const res =await registrarLogNoZoho(globais.numPDC_temp);
            console.log("res do log => ", JSON.stringify(res));
            if (log) console.log("----------PROCESSO DE SALVAMENTO CONCLUÍDO----------");
                
            ZOHO.CREATOR.UTIL.navigateParentURL(config);

        } else if (acao === 'duplicar_pdc') {
            //MODIFICA PARA QUE UMA CÓPIA SEJA CRIADA
            globais.cotacaoExiste = false;
            globais.tipo = "criar_pdc";
            globais.perfilResponsavel = globais.novoPerfilResponsavel;
    
            //CRIA UM NOVO ID TEMPORÁRIO PARA A CÓPIA E LIMPA O NUMERO DO PDC
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
    
            globais.numPDC_temp = `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
            globais.numPDC = null;
    
            //LIMPA AS CÉLULAS DE QUANTIDADE E VALOR UNITÁRIO
            const quantidadeTds = document.querySelectorAll('td.quantidade');
            const valorUnitTds = document.querySelectorAll('td.valor-unit');
            const totalForns = document.querySelectorAll('td.total-fornecedor');
            [...quantidadeTds, ...valorUnitTds, ...totalForns].forEach(td => {
                td.textContent = '';
                if (td.dataset.valor_original) delete td.dataset.valor_original;
    
                // Limpar a célula do lado direito se for valor unitário
                if (td.classList.contains('valor-unit')) {
                    const nextTd = td.nextElementSibling;
                    if (nextTd) {
                        nextTd.textContent = '';
                        if (nextTd.dataset.valor_original) delete nextTd.dataset.valor_original;
                    }
                }
            });
    
            //LIMPA OS FORNECEDORES APROVADOS
            const elemsAprovados = document.querySelectorAll('.forn-aprovado');
            elemsAprovados.forEach(elem => {
                elem.classList.remove('forn-aprovado');
            });
    
            //LIMPA AS LINHAS DE PARCELAS
            const divsParcela = document.querySelectorAll('div.parcela');
            divsParcela.forEach(div => {
                div.remove();
            });
            //LIMPA AS CÉLULAS DE VALOR DA CLASSIFICAÇÃO CONTÁBIL
            const formClassificacao = document.querySelector('#form-classificacao');
            const inputsValor = formClassificacao.querySelectorAll('input[name="Valor"]');
            inputsValor.forEach(input => {
                input.value = '';
            });
    
            await saveTableData_V3({status: "Prop. criada"});
    
            //window.parent.location.href = `${url}#Report:Solicitacoes_em_andamento`;
            /*setTimeout(function () {
                window.open(`${url}#Script:page.refresh`, '_top');
    
            }, 1000);
            */
           var config = {
                action: "open",
                url: `${url}${globais.novoPerfilResponsavel=="Controladoria"?"#Report:Provisionado":"#Report:Solicitacoes_em_andamento"}`,
                window: "same"
            };
            ZOHO.CREATOR.UTIL.navigateParentURL(config);
        }
        /*
        const res =await registrarLogNoZoho(globais.numPDC);
        console.log("res do log => ", JSON.stringify(res));
        if (log) console.log("----------PROCESSO DE SALVAMENTO CONCLUÍDO----------");
        */
    } catch (error) {
        customModal_V2({
            tipoAcao:'alert', 
            titulo: "Erro ao executar ação!, envie esse erro ao desenvolvedor!", 
            mensagem:`<p>${error}</p><p style="max-width: 500px; word-wrap: break-word;">${error.stack}</p>`,
            confirmText: 'Ok!'
        });
    }
}

/**
 * Oculta todos os campos da página, exceto os especificados
 * 
 * @function ocultarCamposExcessao
 * @description
 * Esta função oculta todos os campos da página, exceto:
 * - Entidade
 * - Datas
 * - Valor
 * - Campos que precisam estar habilitados:
 *   let campos = ["Entidade", "Datas", "Valor", "Valor"];
 *   let camposCond = {"quantidade": "Poder alterar somente para menos", "valor-unit": "Poder alterar somente para menos, ou até um real a mais"};
 *   let botoes = ["add-parcela", "remover-parcela"];
 *   let forms = ["form-pagamento", "dados-nf"];
 */
export function desabilitarCampos() {
    const log = false;
    if (log) console.log("++++++++++DESABILITANDO CAMPOS++++++++++");
    if (log) console.log("globais.pag => ", globais.pag);

    let camposParaManterHabilitados = [];
    let botoesParaManterHabilitados = [];
    let formsParaManterHabilitados = [];
    let aTagsParaManterHabilitados = [];

    if (['editar_cotacao', 'ajustar_cotacao', 'ajustar_compra', 'lancamentos_provisionados'].some(str => globais.pag?.includes(str))) {
        if (globais.pag === 'lancamentos_provisionados') document.getElementsByClassName('check-pag-antecipado')[0].style.display = 'none';
        return;
    }
    if(log) console.log("Passou do if inicial!");
    if (globais.pag === "ajustar_compra_compras" || globais.pag === "checagem_final") {
        camposParaManterHabilitados = ["Entidade", "Tipo_de_solicitacao","Datas", "Valor", "valor-unit", "Justificativa"];//name
        botoesParaManterHabilitados = ["add-classificacao", "add-parcela", "remover-parcela", "add-linha-nf", "remover-linha-nf"];//classe
        formsParaManterHabilitados = ["form-pagamento", "dados-nf", "form-classificacao", ];//forms
        aTagsParaManterHabilitados = ["gallery-item"];
    } else if (globais.pag === "criar_numero_de_PDC") {
        camposParaManterHabilitados = ["Num_PDC_parcela", "Justificativa"];
        botoesParaManterHabilitados = ["add-parcela", "remover-parcela"];
        formsParaManterHabilitados = ["form-classificacao"];
        aTagsParaManterHabilitados = ["gallery-item"];
    } else if (globais.pag === "confirmar_compra") {
        //formsParaManterHabilitados = ["form-pagamento"];//forms
        camposParaManterHabilitados = [
            "Forma_de_pagamento",
            "Banco",
            "AG",
            "N_Conta",
            "Favorecido",
            "CPF_CNPJ_do_favorecido",
            "Tipo_de_chave_pix",
            "Chave_pix",
            "pag_antecipado",
            "Datas",
            "Valor"
        ];
    }else
    {
        aTagsParaManterHabilitados = ["gallery-item"];
    }

    // Seleciona todos os elementos de input, textarea e select
    const campos = document.querySelectorAll('input, textarea, select');
    campos.forEach(elemento => {
        // Verifica se o elemento deve ser mantido visível
        const manterHabilitado = camposParaManterHabilitados.includes(elemento.name)
            || elemento.classList.contains('input-adicionar-anexo');
        if (!manterHabilitado) {
            elemento.disabled = true;
            elemento.readOnly = true; // Adiciona o atributo readonly
            elemento.style.cursor = 'not-allowed';
        }
    });
    const botoes = document.querySelectorAll('button');
    console.log("botoes => ", botoes);
    botoes.forEach(botao => {
        if (!botao.closest('.save-btn-container') && !botao.classList.contains('toggle-section')) {

            // Verifica se o botão deve ser mantido visível
            const deveManterVisivel = botoesParaManterHabilitados.some(classe => botao.classList.contains(classe));
            if (!deveManterVisivel) {
                const computedStyle = getComputedStyle(botao);
                const placeholder = document.createElement('div'); // Cria um elemento vazio

                // Verifica o tamanho do before
                const beforeWidth = parseFloat(computedStyle.getPropertyValue('width')) + parseFloat(computedStyle.getPropertyValue('padding-left')) + parseFloat(computedStyle.getPropertyValue('padding-right'));
                const beforeHeight = parseFloat(computedStyle.getPropertyValue('height')) + parseFloat(computedStyle.getPropertyValue('padding-top')) + parseFloat(computedStyle.getPropertyValue('padding-bottom'));

                // Verifica o tamanho do after
                const afterWidth = parseFloat(computedStyle.getPropertyValue('width')) + parseFloat(computedStyle.getPropertyValue('padding-left')) + parseFloat(computedStyle.getPropertyValue('padding-right'));
                const afterHeight = parseFloat(computedStyle.getPropertyValue('height')) + parseFloat(computedStyle.getPropertyValue('padding-top')) + parseFloat(computedStyle.getPropertyValue('padding-bottom'));

                // Define o tamanho do placeholder com base nos tamanhos verificados
                placeholder.style.width = `${Math.max(beforeWidth, afterWidth, botao.offsetWidth)}px`;
                placeholder.style.height = `${Math.max(beforeHeight, afterHeight, botao.offsetHeight)}px`;
                placeholder.style.display = 'inline-block'; // Mantém o layout
                botao.parentNode.replaceChild(placeholder, botao); // Substitui o botão pelo placeholder
            }
        }
    });

    // Seleciona todos os elementos com contenteditable
    const elementosEditaveis = document.querySelectorAll('[contenteditable="true"], [contenteditable="false"]');
    elementosEditaveis.forEach(elemento => {
        // Verifica se o elemento deve ser mantido visível
        const temClasseVisivel = camposParaManterHabilitados.some(classe => elemento.classList.contains(classe));
        if (temClasseVisivel) {
            if (elemento.tagName.toLowerCase() === 'tr') {
                const tds = elemento.querySelector('td');
                tds.forEach(td => {
                    td.contentEditable = true;
                    td.style.cursor = 'text';
                });

            } else {
                elemento.contentEditable = true; // Habilita para edição
                elemento.style.cursor = 'text'; // Altera o cursor para indicar que é editável

            }

        } else {
            elemento.contentEditable = false; // Desabilita para edição
            elemento.style.cursor = 'not-allowed'; // Altera o cursor para indicar que não é editável

        }
    });

    // Seleciona todos os elementos a tag
    const elementosComHref = document.querySelectorAll('a');
    elementosComHref.forEach(elemento => {
        // Verifica se o elemento deve ser mantido visível
        const temClasseVisivel = aTagsParaManterHabilitados.some(classe => elemento.classList.contains(classe));
        if (temClasseVisivel) {
            elemento.style.cursor = 'pointer'; // Altera o cursor para indicar que é clicável
            elemento.style.removeProperty('pointer-events');

        } else {
            elemento.style.cursor = 'not-allowed'; // Altera o cursor para indicar que não é clicável
            elemento.style.pointerEvents = 'none';

        }
    });

    // Habilita campos nos formulários que devem ser mantidos Habilitados
    formsParaManterHabilitados.forEach(formClass => {
        const formulario = document.querySelector(`#${formClass}`);
        if (formulario) {
            const camposFormulario = formulario.querySelectorAll('input, textarea, select');

            camposFormulario.forEach(campo => {
                campo.disabled = false; // Habilita o campo
                campo.readOnly = false; // Remove o atributo readonly
                // Altera o cursor dependendo do tipo de campo
                campo.style.cursor = campo.tagName.toLowerCase() === 'select' ? 'pointer' : 'text';

            });
        }
    });
}

function validateFields(acao)
{
    if(
        [
            'solicitar_aprovacao_sindico'
        ].includes(acao)
    )
    {
        const log = false;
        if(log) console.log("++++++++++VALIDANDO CAMPOS++++++++++");
        //     //=====================================================\\
        //     ||==========ANALIZANDO CLASSIFICAÇÃO CONTÁBIL==========||
        //     \\=====================================================//
        if(log) console.log("Analisando classificação contábil...");
        const linhas_class = document.querySelectorAll('#form-classificacao .linha-classificacao');
    
        if(linhas_class.length === 0)
        {
            if(log) console.log("Nenhuma classificação contábil adicionada.");
            printError({message: "Adicione ao menos uma classificação contábil!"});
            return false;
        }
    
        const validacao_contas = Array.from(document.querySelectorAll('#form-classificacao input[name="Conta_a_debitar"]')).every(conta => conta.dataset.id_opcao);
        const validacao_classes_op = Array.from(document.querySelectorAll('#form-classificacao input[name="Classe_operacional"]')).every(classe => classe.dataset.id_opcao);
        if(log) console.log("validacao_contas => ", validacao_contas);
        if(log) console.log("validacao_classes_op => ", validacao_classes_op);
    
        if(!validacao_contas || !validacao_classes_op)
        {
            printError({message: "Todos os dados de classe operacional devem ser preenchidos!"});
            return false;
        }
    
        if(log) console.log("Validando soma dos valores das classes operacionais...");
        let valor_total_class = 0.00;
    
        if(log) console.log("document.querySelectorAll('input[name='Valor']')", document.querySelectorAll('input[name="Valor"]'));
        document.querySelectorAll('#form-classificacao input[name="Valor"]').forEach(input => {
    
            const valor_original = converterStringParaDecimal(input.dataset?.valor_original || 0);
            if(log) console.log("valor_original => ", valor_original);
            if(valor_original === 0)
            {
                printError({message: "Todos os dados de classe operacional devem ser preenchidos!"});
                return false;
            }
            
            valor_total_class += valor_original;
        });
    
        if(log) console.log("valor_total_class => ", valor_total_class);
        if(log) console.log("globais.valor_orcado => ", globais.valor_orcado);
    
        if(valor_total_class != globais.valor_orcado)
        {
            if(log) console.log("A soma dos valores das classes operacionais deve ser igual ao valor total!");
            printError({message: "A soma dos valores das classes operacionais deve ser igual ao valor total!"});
            return false;
        }
        
        function printError({message, response})
        {
            customModal_V2({
                tipoAcao:'alert', 
                titulo: "Preenchimento incorreto!",
                mensagem: message,
                confirmText: "OK"
            });
        }
    }
    return true;
}

export function base64Size(base64String) {
    // Remove prefixo (ex: "data:image/png;base64,")
    let cleaned = base64String.split(',')[1] || base64String;
    
    // Comprimento da string em base64
    let len = cleaned.length;

    // Cada caractere em base64 representa 6 bits
    // Fórmula: (tamanho_base64 * 3 / 4) - padding
    let padding = (cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0);
    let sizeInBytes = (len * 3) / 4 - padding;

    return sizeInBytes;
}

/**
 * Formata uma data string para o formato especificado
 * 
 * @function formatDate
 * @param {string} dateStr - String contendo a data a ser formatada
 * @param {string} format - Formato desejado para saída (ex: 'YYYY-MM-DD', 'DD/MM/YYYY', etc)
 * @returns {string} Data formatada
 * 
 * @example
 * // Retorna '2025-09-11'
 * formatDate('11/09/2025', 'YYYY-MM-DD')
 * 
 * // Retorna '11/09/2025'
 * formatDate('2025-09-11', 'DD/MM/YYYY')
 * 
 * // Retorna '11-Sep-2025'
 * formatDate('2025-09-11', 'DD-MMM-YYYY')
 * 
 * @description
 * Esta função:
 * - Aceita datas em diversos formatos de entrada
 * - Permite especificar o formato de saída desejado
 * - Utiliza moment.js para parsing e formatação
 * - Retorna string vazia se a data for inválida
 * - Suporta formatos localizados através do moment.js
 */
export function formatDate(dateStr, format) {
    if (!dateStr) return '';

    // Tenta criar um objeto moment com a data usando os formatos possíveis
    //const formats = ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MMM-YYYY'];
    const formats = ['DD-MM-YY', 'DD-MM-YYYY', 'DD-MMM-YYYY', 'YYYY-MM-DD', 'DD/MM/YY', 'DD/MM/YYYY', 'DD/MMM/YYYY', 'YYYY/MM/DD', 'DD MM YYYY', 'DD MMM YYYY', 'DD MMMM YYYY', 'YYYY MM DD'];
    const momentDate = moment(dateStr, formats);
    
    if (momentDate.isValid()) {
        // Data válida no formato atual
        return momentDate.format(format);
    }

    // Data inválida em todos os formatos fornecidos
    console.error('Data inválida:', dateStr);
    return '';
}

async function gerar_num_pdc()
{
    const log = false;
    if(log) console.log("++++++++++GERANDO NÚMERO DO PDC++++++++++");

    //Busca o último número de PDC criado
    const ult_num_pdc = await executar_apiZoho({tipo:'busc_reg', criterios: '(ID!=0)', nomeR: 'Ultimo_PDC_criado', nomeF: 'PDC_Digital'});
    const numeroPDC = (Number(ult_num_pdc[0]?.Num_princ_PDC || 0)) + 1;
    globais.numPDC = numeroPDC;
    if(log) console.log("Número do último PDC => ", numeroPDC);

    //Adiciona o novo número de PDC em cada parcela
    const parcelas = document.querySelectorAll('#camposData .parcela');
    if(log) console.log("Quantidade de parcelas => ", parcelas.length);

    parcelas.forEach((parcela, index) => {
        if(log) console.log("Parcela => ", parcela, " Index => ", index);
        const btnRemovParcela = parcela.querySelector('.remover-parcela')
        const pdcValue = parcelas.length > 1 ? `${numeroPDC}/${String(index + 1).padStart(2, '0')}` : numeroPDC;
        if(log) console.log("Botão de remover parcela => ", btnRemovParcela);
        if(log) console.log("Valor do PDC para a parcela => ", pdcValue);

        //Cria o input do número do PDC
        const inputPDC = document.createElement('input');
        inputPDC.classList.add("campo-datas");
        inputPDC.type = 'text';
        inputPDC.value = pdcValue;
        inputPDC.contentEditable = true; // Campo somente leitura
        inputPDC.name = 'Num_PDC_parcela';
        if(log) console.log("Input do número do PDC => ", inputPDC);

        //Adiciona evento para formatar o valor ao mudar
        inputPDC.addEventListener('change', () => {
            if (inputPDC.value.includes('/')) {
                const partes = inputPDC.value.split('/');
                if (partes[1].length === 1) {
                    inputPDC.value = `${partes[0]}/${partes[1].padStart(2, '0')}`;
                }
            }
        })

        if (btnRemovParcela) {
            parcela.insertBefore(inputPDC, btnRemovParcela);
        } else {
            parcela.appendChild(inputPDC);
        }
    });
}
