import { saveTableData_V2, enviarParaPaybox } from './save_utils.js';
import { globais } from './main.js';

const url = 'https://terrasii.zohocreatorportal.com/';

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
export async function executar_apiZoho({ tipo = null, criterios = null, ID = null, corpo = null, nomeR = null, nomeF = null } = {}) {
    try {
        const log = false;
        nomeR = nomeR ? nomeR : globais.nomeRelCot;
        nomeF = nomeF ? nomeF : globais.nomeFormCot;
        let recOps = await ZOHO.CREATOR.DATA;


        // Função de criar registro
        async function criar_reg(ddsCriacao) {

            ddsCriacao = { "data": ddsCriacao };
            if (log) console.log("Criando registro com dados => ", JSON.stringify(ddsCriacao, null, 2));
            const config = {
                app_name: globais.nomeApp,
                form_name: nomeF,
                payload: ddsCriacao
            };
            const resp = await recOps.addRecords(config);
            return resp;
        }

        // Função de atualizar registro
        async function atualizar_reg(nomeR, ID, corpo) {
            if (log) console.log("Atualizando registro ID => ", ID, " com dados => ", corpo);
            return await recOps.updateRecordById({
                app_name: globais.nomeApp,
                report_name: nomeR,
                id: ID,
                payload: corpo
            });
        }

        async function buscar_reg(nomeR, criterio) {
            let baseApoio = new Map();
            let cursor = null

            do{
                const config = {
                    app_name: globais.nomeApp,
                    report_name: nomeR,
                    criteria: criterio,
                    record_cursor: cursor,
                    max_records: 1000
                };
                const resp  = await recOps.getRecords(config);
                //Verifica possíveis erros
                if (!resp || resp.code !== 3000 || !Array.isArray(resp.data) || resp.data.length === 0) {
                    break;
                }

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
            recOps = ZOHO.CREATOR.FILE;
            const config = {
                app_name: globais.nomeApp,
                report_name: nomeR,
                id: ID,
                field_name: 'Arquivo',
                file: corpo
            }

            return await recOps.uploadFile(config);
        }

        // Funções solicitadas conforme tipo
        if (tipo === "add_reg") {

            return await criar_reg(corpo);
        } else if (tipo === "atualizar_reg") {

            return await atualizar_reg(nomeR, ID, corpo);
        } else if (tipo === "busc_reg") {

            return await buscar_reg(nomeR, criterios);
        } else if (tipo === "busc_reg_recursivo") {

            return await buscar_reg(nomeR, criterios);
        } else if (tipo === "subir_arq") {
            return await subirArquivos();
        }
        
    } catch (err) {
        console.log("Erro na API do Zoho => ", err);
        return err;
    }
}

export function formatToBRL_V2(v, nd = 2, alt = true) {
    const log = false;
    if (log) console.log("[+++++FORMATANDO PARA BRL+++++]");
    if (log) console.log("Número de decimais => ", nd);
    let ap_vlrOrig = null;

    if (v.dataset && v.dataset.valor_original) {
        ap_vlrOrig = v.dataset.valor_original;
        delete v.dataset.valor_original;
    }

    if (!v) return "0,00";//Se for vazio, volta 0,00


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
        //av = ap_vlrOrig ||elemento.innerText || elemento.value;
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
        if (payloadMap[tipo]) {

            // Verifica se o tipo é valido//
            ////{Ação:seprara por parcela}////
            const tiposValidos = {
                "criar_cotacao_DP": false,
                "editar_cotacao_DP": false,
                "criar_cotacao_controladoria": false,
                "editar_cotacao_controladoria": false,
                "solicitar_aprovacao_sindico": false,
                "finalizar_provisionamento": false,
                "enviar_p_checagem_final": false,
                "enviar_p_assinatura": false,
                "confirmar_compra": pgtoAnt ? true : false,
                "confirmar_recebimento": true
            };

            if (Object.keys(tiposValidos).includes(tipo)) {
                let status = null;
                if (tipo === "confirmar_recebimento") {
                    status = "Chec. final";
                } else if (tipo === "criar_cotacao_controladoria" || tipo === "editar_cotacao_controladoria") {
                    status = "Propostas criadas controladoria";
                } else if (tipo === "confirmar_compra") {
                    status = "Chec. final";
                }
                await saveTableData_V2(status, tiposValidos[tipo]);
            }

            payload = { data: [{ ...payloadMap[tipo] }] };
            //payload = { data: [{ ...payloadMap[tipo], Datas: getDates(tipo) }] };

        } else if (tipo === 'salvar_cot' || tipo === 'editar_pdc') {

            toggleElements(false);
            try {
                console.log("TENTANDO SALVAR COTACAO")
                await saveTableData_V2();

                window.open(`${url}#Script:page.refresh`, '_top');
                return;
            } catch (erro) {
                console.error('Erro ao salvar cotação:', erro);
                toggleElements(true);
                messageElement.innerHTML = 'Ocorreu um erro ao salvar a cotação. Tente novamente.';
                return;
            }
        } else if (tipo === 'remover_fornecedor' || tipo === 'remover_produto') {
            overlay.remove();
            return Promise.resolve(true);
        } else if (tipo === 'duplicar_pdc') {
            //MODIFICA PARA QUE UMA CÓPIA SEJA CRIADA
            globais.cotacaoExiste = false;

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

            //MUDA O TIPO DE SALVAMENTO
            globais.tipo = "criar_pdc";

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

            await saveTableData_V2("Prop. criada");
            window.open(`${url}#Report:Solicitacoes_em_andamento`, '_top');
            return;
        }

        try {
            console.log("PAYLOAD => ", JSON.stringify(payload));
            const resposta = await executar_apiZoho({
                tipo: "atualizar_reg",
                ID: globais.idPDC,
                corpo: payload,
                nomeR: globais.nomeRelPDC
            });
            console.log("RESPOSTA => ", JSON.stringify(resposta));

            // Fecha o modal após sucesso
            if (resposta && resposta.code === 3000) {
                overlay.remove();
                if (tipo == "confirmar_compra") {
                    const layoutName = "pedido_PDF";
                    const link_layout = `${url}guillaumon/${globais.nomeApp}/pdf/${layoutName}?id_pdc=${globais.idPDC}&zc_PdfSize=A4&zc_FileName=${globais.numPDC}_${layoutName.split('_')[0]}`;
                    window.open(`${link_layout}`, '_blank', 'noopener,noreferrer');
                }

                // Opcional: recarregar a página ou atualizar a interface
                window.open(`${url}#Script:page.refresh`, '_top');
            } else {
                throw new Error('Falha na atualização');
            }
        } catch (erro) {
            console.error('Erro ao processar requisição:', erro);
            // Volta para o estado normal do modal em caso de erro
            toggleElements(true);
            // Opcional: mostrar mensagem de erro para o usuário
            messageElement.innerHTML = 'Ocorreu um erro ao processar sua solicitação. Tente novamente.';
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
        if (log) console.log("infoInserida => ", infoInserida);
    
        const tipoSolicitacao = document.querySelector('select[name="Tipo_de_solicitacao"]').options[document.querySelector('select[name="Tipo_de_solicitacao"]').selectedIndex].text;
        const parcelaCriadaElement = document.getElementsByName('parcela_criada')[0];
        const parcelaCriada = parcelaCriadaElement ? parcelaCriadaElement.checked : false;
        const data_atual = moment();
        const data_atual_formatada = data_atual.format('DD/MM/YYYY HH:mm:ss');
        // Nova constante no formato 'aa-mmm-dd' com mês em inglês
        //const data_atual_formatada_en = data_atual.format('DD-MMM-YYYY HH:mm:ss');
        let alcada_temp = null;
        let ap_status_subsindico;
        
        if(acao === "autorizar_pagamento_subsindico")
        {
            let crit = `(Inicio <="${data_atual_formatada}" && Fim>="${data_atual_formatada}")`;
            ap_status_subsindico = "Ass. subsindico";
            /*
            const resp = await executar_apiZoho({
                tipo: "busc_reg", 
                criterios: crit, 
                nomeR: "ADM_Alcadas_temporarias_cadastradas"
            });
            if(resp.code == 3000)
            {
                ap_status_subsindico = "Pag. aut.";
            }
            console.log("ap_status_subsindico => ", ap_status_subsindico);
            */
            //{status: 404, statusText: 'error', responseText: '{"code":3100,"message":"No records found for the given criteria."}'}
        }
        
        const paramExtra = {};
        const pgtoAnt = document.getElementById('pag_antecipado').checked;
    
        let stats_salvarCot = "Prop. criada";
        if (globais.pag === "criar_numero_de_PDC") {
            stats_salvarCot = null;

        } else if (globais.pag === "ajustar_compra_compras") {
            stats_salvarCot = "Chec. final";

        } else if (globais.pag === "checagem_final") {
            stats_salvarCot = "Chec. final";

        }
    
        let apoio_paramExtras = {};
        apoio_paramExtras.Assinaturas = [];
        let tudoAssinado = false;
    
        if ([
            "enviar_p_assinatura",
            "autorizar_pagamento_sindico",
            "autorizar_pagamento_subsindico",
            "confirmar_todas_as_assinaturas"
        ].includes(acao)) {
            console.log("globais.user => ", globais.usuario_logado);
            const apoio_assin_inic = 
            globais.usuario_logado == "patrick_kum@hotmail.com"?
            {
                "Patrick": {
                    Cargo: "Controladoria",
                    Funcao: "Auxiliar controladoria",
                    Usuario: "Patrick",
                    E_mail_usuario: "patrick_kum@hotmail.com",
                    IP: globais.userIP,
                    Data_da_assinatura: data_atual_formatada,
                    Assinado: true
                }
            }:
            {
                "Financeiro": {
                    Cargo: "Controladoria",
                    Funcao: "Auxiliar controladoria",
                    Usuario: "Maiara",
                    E_mail_usuario: "Controladoriatsj2@gmail.com",
                    IP: globais.userIP,
                    Data_da_assinatura: data_atual_formatada,
                    Assinado: true
                }
            }
            //
            const assinaturasIniciais = {
                ...apoio_assin_inic,
                "Gilson": {
                    Cargo: "Administrativo",
                    Funcao: "Gerente operacional",
                    Usuario: "Gilson",
                    E_mail_usuario: "gerente.operacional@tsj2.com.br",
                    IP: "",
                    Data_da_assinatura: "",
                    Assinado: false
                },
                "Joana": {
                    Cargo: "Administrativo",
                    Funcao: "Síndico",
                    Usuario: "Joana",
                    E_mail_usuario: "sindico@tsj2.com.br",
                    IP: "",
                    Data_da_assinatura: "",
                    Assinado: false
                }
            }
            if(log) console.log("assinaturasIniciais => ", JSON.stringify(assinaturasIniciais));
            function buscarAssinaturas() {
                const log = true;
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
    
            if (acao === "enviar_p_assinatura") {
                apoio_paramExtras.Assinaturas.push(...Object.values(assinaturasIniciais));
    
            } else {
                buscarAssinaturas();

                console.log("assinaturas já criadas", apoio_paramExtras.Assinaturas);
                if (acao === "autorizar_pagamento_subsindico") {
                    apoio_paramExtras.Assinaturas[1].IP = globais.userIP;
                    apoio_paramExtras.Assinaturas[1].Data_da_assinatura = data_atual_formatada;
                    apoio_paramExtras.Assinaturas[1].Assinado = true;

                } else if (acao === "autorizar_pagamento_sindico") {
                    apoio_paramExtras.Assinaturas[2].IP = globais.userIP;
                    apoio_paramExtras.Assinaturas[2].Data_da_assinatura = data_atual_formatada;
                    apoio_paramExtras.Assinaturas[2].Assinado = true;

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
            enviar_p_assinatura: {
                status: "Ass. control.",
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
            lancar_pdc_ahreas: { status: "Lanç ERP", paramsExtraPDC: { Status_Guillaumon: "Lançado no ahreas", num_lanc_ahreas: infoInserida } },
            confirmar_pag_ahreas: { status: "Pag. real.", paramsExtraPDC: { Status_Guillaumon: "Pagamento confirmado", Hora_confirm_pagto: data_atual_formatada} },
            suspender_pagamento: {status: "Pagamento suspenso"}
        };

        if (acao in statusMap) {
            const params = statusMap[acao];
    
            await saveTableData_V2(params);
            
            if (acao.includes("finalizar_provisionamento")) {
                if (globais.perfilResponsavel.includes("Depto. Pessoal")) {
                    document.getElementById('pag_antecipado').setAttribute('checked', 'checked');
                    await saveTableData_V2({ status: "Chec. final", sepPorParc: true });
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
    
                    await saveTableData_V2({ status: "Prop. criada", sepPorParc: true, paramExtra: {pag_antecipado: false}});
    
                }
            } else if (acao === 'confirmar_compra') {
                if (tipoSolicitacao === 'SERVIÇO' || globais.perfilResponsavel.includes("Controladoria")) {
                    await saveTableData_V2({ status: "Separado em parcelas" });

                } else if (pgtoAnt) {
                    await saveTableData_V2({ status: "Compra real.", paramExtra: { pag_antecipado: false } });
                    
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
                await saveTableData_V2({ status: "Separado em parcelas" });
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
    
            await saveTableData_V2("Prop. criada");
    
            window.parent.location.href = `${url}#Report:Solicitacoes_em_andamento`;
            setTimeout(function () {
                window.open(`${url}#Script:page.refresh`, '_top');
    
            }, 1000);
    
            return;
        }
        if (log) console.log("----------PROCESSO DE SALVAMENTO CONCLUÍDO----------");
        
    } catch (error) {
        customModal_V2({
            tipoAcao:'alert', 
            titulo: "Erro ao executar ação!, envie esse erro ao desenvolvedor!", 
            mensagem:`<p>${error.message}</p><p style="max-width: 500px; word-wrap: break-word;">${error.stack}</p>`,
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
    const log = true;
    if (log) console.log("++++++++++DESABILITANDO CAMPOS++++++++++");
    if (log) console.log("globais.pag => ", globais.pag);

    let camposParaManterHabilitados = [];
    let botoesParaManterHabilitados = [];
    let formsParaManterHabilitados = [];
    let aTagsParaManterHabilitados = [];

    if (['editar_cotacao', 'ajustar_cotacao', 'ajustar_compra'].some(str => globais.pag?.includes(str))) {
        return;
    }
    if(log) console.log("Passou do if inicial!");
    if (globais.pag === "ajustar_compra_compras" || globais.pag === "checagem_final") {
        camposParaManterHabilitados = ["Entidade", "Tipo_de_solicitacao","Datas", "Valor", ""];//name
        botoesParaManterHabilitados = ["add-parcela", "remover-parcela", "add-linha-nf", "remover-linha-nf"];//classe
        formsParaManterHabilitados = ["form-pagamento", "dados-nf", "form-classificacao", ];//forms
        aTagsParaManterHabilitados = ["gallery-item"];
    } else if (globais.pag === "criar_numero_de_PDC") {
        camposParaManterHabilitados = ["Num_PDC_parcela",];
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
    }

    // Seleciona todos os elementos de input, textarea e select
    const campos = document.querySelectorAll('input, textarea, select');
    campos.forEach(elemento => {
        // Verifica se o elemento deve ser mantido visível
        if (!camposParaManterHabilitados.includes(elemento.name)) {
            elemento.disabled = true;
            elemento.readOnly = true; // Adiciona o atributo readonly
            elemento.style.cursor = 'not-allowed';
        }
    });
    const botoes = document.querySelectorAll('button');
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

function validateFields(action) {
    const log = false;
    if (log) console.log("++++++++++VALIDANDO CAMPOS OBRIGATÓRIOS++++++++++");
    if (log) console.log("action => ", action);
    let all = {};
    let atLeastOne = {};
    let otherFormats = {};
    const fieldNames = {
        'Entidade': 'Entidade',
        'Tipo_de_solicitacao': 'Tipo de Solicitação',
        'Descricao_da_compra': 'Descrição da Compra',
        'Utilizacao': 'Utilização',
        'id_forn': 'Fornecedor',
        'quantidade': 'Quantidade',
        'valor-unit': 'Valor Unitário',
        'supplier-checkbox': 'Fornecedor Aprovado',
        'tipo-pag': 'Tipo de Pagamento',
        'parcela': 'Parcelas'
    };

    switch (action) {
        case 'solicitar_aprovacao_sindico':
            all = {
                'Entidade': 'name',
                'Tipo_de_solicitacao': 'name',
                'Descricao_da_compra': 'name',
                'Utilizacao': 'name',
                'dp-field-input': 'class'
            };
            atLeastOne = {
                'supplier-checkbox': 'class',
            };

            otherFormats = {
                'tipo-pag': 'name',
                'parcela': 'class'
            }

            break;
        case '':
            break;
        default:
            break;
    };

    function validateField(field) {

        if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
            if (log) console.log("-----> É input ou textarea");
            // Verifica o valor do campo
            if (field.value === '') {
                return false;

            }

        } else if (field.tagName === 'SELECT') {
            if (log) console.log("-----> É select");
            // Verifica se o campo select tem um valor selecionado
            const selectedOption = field.options[field.selectedIndex];
            if (selectedOption.classList.contains('invalid')) {
                return false;

            }

        } else if (field.tagName === 'TD') {
            if (log) console.log("-----> É td");
            // Verifica o texto do campo TD
            if (field.innerText === '') {
                throw new Error(`O campo "${field.name}" deve ser preenchido.`);
            }

        } else {
            if (log) console.log("-----> É um tipo não reconhecido");
            // Se o campo não for reconhecido, lança um erro
            throw new Error(`Tipo de campo não reconhecido: ${field.tagName}`);

        }
    };

    const errorMessage = document.createElement('span');
    errorMessage.id = 'error-message';
    errorMessage.textContent = 'Este campo é obrigatório';
    errorMessage.style.color = 'red';


    //==========ALL VALUES ARE REQUIRED==========\\
    if (log) console.log("-----> Iterando sobre tipos de campos completamente obrigatórios <-----");
    for (let [key, value] of Object.entries(all)) {
        if (log) console.log("Campo: ", key, " Tipo: ", value);
        let campos;
        if (value === 'dataset') {
            campos = document.querySelector(`[data-${key}]`);

        } if (['name'].includes(value))//Busca por atributos
        {
            campos = document.querySelectorAll(`[${value}="${key}"]`);

        } else if (['class'].includes(value))//busca por classe (Aparentemente não é um atributo)
        {
            campos = document.querySelectorAll(`.${key}`);

        }

        if (log) console.log("Campos encontrados: ", (campos || ""));
        //=====Validando todos os campos encontrados=====\\
        if (!campos) {
            if (log) console.log("-----> Nenhum campo foi encontrado, lançando erro!");
            const overlayElements = document.getElementsByClassName("customConfirm-overlay-div");
            if (overlayElements) {
                Array.from(overlayElements).forEach(el => el.remove());
            }

            customModal_V2({ acao: "alert_campo_obrig", tipoAcao: "alert", titulo: "Campo obrigatório não preenchido", mensagem: `O campo "${fieldNames[key]}" deve ser preenchido.`, confirmText: "Ok" });
            throw new Error(`Campo obrigatório não preenchido`);

        } else {
            if (log) console.log("-----> Iterando sobre os campos do tipo atual <-----");

            campos.forEach(campo => {
                if (log) console.log("Campo: ", campo);
                const ret = validateField(campo);
                if (log) console.log("Campo preenchido: ", ret);

                if (!ret) {

                    campo.addEventListener('input', () => errorMessage.remove());

                    campo.insertAdjacentElement('afterend', errorMessage);
                    campo.focus();

                    const overlayElement = document.querySelector(".customConfirm-overlay-div");
                    if (overlayElement) {
                        overlayElement.remove();

                    }
                    throw new Error(`Campo obrigatório não preenchido`);
                };
            });

        }


    }

    ////////////////////////////////////////////////////////////////////////
    /*
    //=====At least one value is required=====\\
    for (let [key, value] of Object.entries(atLeastOne)) {
        console.log("key: ", key, "value: ", value);
        if (value === 'class') {
            const elements = document.querySelectorAll(`.${key}`);
            let ret = false;
            elements.forEach(element => {
                console.log("element: ", element);
                ret = validateField(element);
                if(ret) {
                    return true;
                }
            })

            if(!ret) {
                campo.addEventListener('input', () => errorMessage.remove());
                campo.parentNode.appendChild(errorMessage);
                campo.parentNode.style.display = 'grid';
                
                campo.focus();

                const overlayElement = document.querySelector(".customConfirm-overlay-div");
                if (overlayElement) {
                    overlayElement.remove();
                }

                throw new Error(`Campo obrigatório não preenchido`);
            }
        }
    }

    //=====Other formats=====\\
    for (let [key, value] of Object.entries(otherFormats)) {
        console.log("key: ", key, "value: ", value);

        const campos = document.querySelectorAll(`[${value}="${key}"]`);
        campos.forEach(campo => {
            console.log("campo: ", campo);
            console.log("campo.innerText: ", campo.innerText);
            console.log("campo.value: ", campo.value);
        })

        if (["tipo-pag"].includes(key)) {
            const opcaoMarcada = campos[0].querySelector('input:checked');
            console.log("opcaoMarcada: ", opcaoMarcada);
            console.log("opcaoMarcada.value: ", opcaoMarcada.value);
            if (!opcaoMarcada) {
                throw new Error(`O campo "${key}" deve ser preenchido.`);
                return false;
            }

            if (opcaoMarcada.value.includes("Dep. em")) {
                // Verificar se todos os inputs estão preenchidos
                const inputs = document.getElementById('campos-deposito').querySelectorAll('input');
                inputs.forEach(input => {
                    console.log("input: ", input);
                    if(input.value.trim() === '') {
                        throw new Error(`Os campos de depósito devem ser preenchidos.`);
                        return false;
                    }
                })

                if (![...inputs].every(input => input.value.trim() !== '')) {
                    throw new Error(`Os campos de depósito devem ser preenchidos.`);
                    return false;
                }
            }

            if (["Pix"].some(valor => opcaoMarcada.value.includes(valor))) {
                // Verificar se todos os inputs do tipo text dentro do elemento #campos-pix estão preenchidos
                const inputs = document.querySelectorAll('#campos-pix input[type="text"]');
                if (![...inputs].every(input => input.value.trim() !== '')) {
                    throw new Error(`Os campos de pix devem ser preenchidos.`);
                    return false;
                }
                // Verificar se o select do tipo de pix está preenchido
                const select = document.querySelector('#campos-pix select[name="Tipo_de_chave_pix"]');
                if (select.value === '') {
                    throw new Error(`O tipo de pix deve ser selecionado.`);
                    return false;
                }
            }
        }

        if (["parcela"].includes(key)) {
            campos.forEach(campo => {

                const inputs = [...campo.querySelectorAll('input')].filter(input => input.name !== 'parcela_criada');
                if (![...inputs].some(input => input.value.trim() !== '')) {
                    throw new Error(`O campo "${key}" deve ser preenchido.`);
                    return false;
                }
            });
        }
    }
    */
    if (log) console.log("----------VALIDAÇÃO FINALIZADA, CAMPOS OBRIGATÓRIOS ESTÃO PREENCHIDOS----------");
    throw new Error(`TODOS OS CAMPOS ESTÃO PREENCHIDOS`);

    return true;
}

function printErrorModal(erro) {
    // Cria o modal
    const modal = document.createElement('div');
    modal.classList.add('error-modal');
    modal.innerHTML = `
      <div class="error-modal-content">
        <p>${erro.message}</p>
        <pre>${erro.stack}</pre>
        <button class="close-modal">Fechar</button>
      </div>
    `;
  
    // Adiciona o modal no topo do body
    document.body.appendChild(modal);
  
    // Adiciona evento de fechar o modal
    const closeModalButton = modal.querySelector('.close-modal');
    closeModalButton.addEventListener('click', () => {
      modal.remove();
    });
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