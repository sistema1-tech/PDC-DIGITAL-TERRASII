import { converterStringParaDecimal, executar_apiZoho, customModal_V2, formatDate} from './007_utils.js';
import { globais } from './999_config.js'
const qlt = 4; //Total de linhas de totalizadores, considerando linha com botão de adicionar produto
const ipcv = 3; //Indice da primeira coluna de valores (Valor unitário do primeiro fornecedor)
const qtdCssDecimais = 2; //Quantidade de casas decimais dos campos decimais (Atualmente o campo do zoho suporta apenas 2, para alterar precisa MEXER NO ZOHO)

//==================================================================================================//
//===========================MESCLA OS DADOS DO PDC, TOTAL OU POR PARCELA===========================//
//==================================================================================================//
async function splitDataByInstallments(status = null) {
    const log = false;
    const reqType = document.querySelector('select[name="Tipo_de_solicitacao"]').options[document.querySelector('select[name="Tipo_de_solicitacao"]').selectedIndex].text;
    const pgtoAnt = document.getElementById('pag_antecipado').checked;

    if(log) console.log("++++++++++CRIANDO DADOS DE CADA UMA DAS PARCELAS NÃO CRIADAS++++++++++");
    if(log) console.log("status => ", status);
    if(log) console.log("reqType => ", reqType);
    if(log) console.log("pgtoAnt => ", pgtoAnt);

    const advInstallment = document.getElementById('pag_antecipado').checked;
    if(log) console.log("advInstallment => ", advInstallment);

    let installments = [];
    console.log("pag => ", globais.pag);
    console.log("reqType => ", reqType);
    console.log("advInstallment => ", advInstallment);

    if((
        !globais.perfilResponsavel.includes("Controladoria")) &&
        advInstallment === true &&
        (
            (
                ["confirmar_compra"].includes(globais.pag) &&
                reqType !== "SERVIÇO"
            ) || 
            (
                ["criar_numero_de_PDC"].includes(globais.pag) &&
                globais.perfilResponsavel.includes("Depto. Pessoal")
            )
        )
    )
    {
        installments = [document.querySelectorAll('.parcela')[0]];

    } else {
        installments = document.querySelectorAll('.parcela');
        
    }

    const numInstallments = installments.length;
    if(log) console.log("numInstallments => ", numInstallments);

    const newPDCs = new Map();
    if(log) console.log("=> PEGANDO DADOS DA NF <=");
    const NFData = pegarDadosNF_V2();
    
    if(log) console.log("=> PEGANDO DADOS DE PARCELAS <=");
    installments.forEach((installment, index) => {

        if(log) console.log("indexInstallment => ", index);
        const isCreated = installment.querySelector('input[name="parcela_criada"]').hasAttribute('checked');
        if(log) console.log("isCreated => ", isCreated);

        if (!isCreated) {

            if(log) console.log("=> PARCELA AINDA NÃO CRIADA, PEGANDO DADOS <=");
            // Esta função sempre prepara filhotes (sepPorParc=true). Mesmo com
            // uma parcela, a chave deve ser distinta da do pai; do contrário a
            // reconciliação por id_temp reutiliza o original em vez de criar.
            const currTempPDC = `${globais.numPDC_temp}/${(index + 1).toString().padStart(2, '0')}`;
            if(log) console.log("currTempPDC => ", currTempPDC);

            const initialDataPDC = pegarDadosPDC_V2(index, currTempPDC);

            const currPDCInstallment = initialDataPDC.Datas[0].Num_PDC_parcela ? initialDataPDC.Datas[0].Num_PDC_parcela : globais.numPDC;
            if(log) console.log("initialDataPDC.Num_PDC_parcela => ", initialDataPDC.Datas[0].Num_PDC_parcela);
            if(log) console.log("currPDCInstallment => ", currPDCInstallment);

            const [priceTableData, extraDataPDC] = pegarDadostabPrecos(currTempPDC, currPDCInstallment, numInstallments);
            if(log) console.log("priceTableData => ", priceTableData);
            if(log) console.log("extraDataPDC => ", extraDataPDC);

            const classData = pegarDadosClassificacao_V2(numInstallments);

            const allDataPDC = { ...initialDataPDC, ...extraDataPDC, ...classData, ...NFData };
            if (status !== null) allDataPDC.Status_geral = status;
            newPDCs.set(index, { 'priceTableData': priceTableData, 'PDCsData': allDataPDC});
            //
            const parcelaCriadaInput = installment.querySelector('input[name="parcela_criada"]');
            if (parcelaCriadaInput) {
                parcelaCriadaInput.setAttribute('checked', 'checked');
            }
        }
    });
    if(log) console.log("----------DADOS CRIADOS, RETORNANDO MAPA----------");
    return newPDCs
}

async function meshData(status = null) {

    const NFData = pegarDadosNF_V2();
    const [priceTableData, extraDataPDC] = pegarDadostabPrecos();
    const initialDataPDC = pegarDadosPDC_V2();
    const classData = pegarDadosClassificacao_V2();
    console.log("NFDdata => ", NFData);
    const allDataPDC = { ...initialDataPDC, ...extraDataPDC, ...classData, ...NFData };
    if (status !== null) allDataPDC.Status_geral = status;
    console.log("allDataPDC => ", JSON.stringify(allDataPDC));
    const newPDCs = new Map();
    newPDCs.set(0, { 'priceTableData': priceTableData, 'PDCsData': allDataPDC, 'Files': {} });
    return newPDCs
}

//===========================================================================//
//===========================BUSCA OS DADOS DO PDC===========================//
//===========================================================================//
/**
 * Busca os dados do PDC.
 * 
 * @function pegarDadosPDC_V2
 * @param {number} ttlParc - Número total de parcelas.
 * @param {number} indiceParc - Índice da parcela a ser buscada.
 * @function pegarDadosPDC
 * @returns {Object} Os dados do PDC.
 * 
 * @description
 * Esta função busca os dados iniciais e detalhes do PDC a partir de formulários e os organiza em um objeto.
 * 
 * - Se ttlParc for informado, a função busca os dados de todas as parcelas.
 * - Se indiceParc for informado, a função busca os dados apenas da parcela com o índice especificado.
 */
function pegarDadosPDC_V2(indiceParc = null, currTempPDC = null) {
    
    const log = false;

    if(log) console.log("++++++++++BUSCANDO DADOS DO PDC++++++++++");

    //====================BUSCA OS DADOS INICIAIS DO PDC====================\\
    if(log) console.log("=> BUSCANDO DADOS INICIAIS DO PDC <=");
    const formDdsInicais = document.querySelector('#dados-PDC');
    const dadosIniciaisPdc = {};

    // Obter todos os elementos do formulário
    const elementos = formDdsInicais.elements;
    for (let elemento of elementos) {
        // Verifica se o campo tem um valor e se está visível (caso de campos ocultos)
        if (elemento.name && (elemento.type !== 'radio' || elemento.checked)) {
            dadosIniciaisPdc[elemento.name] = elemento.value;
            if(log) console.log("Nome: " + elemento.name + ", Valor: " + elemento.value);
        }
    }
    dadosIniciaisPdc["id_temp"] = currTempPDC ? currTempPDC : globais.numPDC_temp;
    if(log) console.log("Nome: " + "id_temp" + ", Valor: " + JSON.stringify(dadosIniciaisPdc.id_temp));


    //====================BUSCA OS DADOS DETALHES DO PDC====================\\
    if(log) console.log("=> BUSCANDO DETALHES DO PDC <=");
    const formDdsDetalhes = document.querySelector('#form-pagamento');

    // Obter todos os elementos do formulário
    const parcelas = indiceParc !== null ? [formDdsDetalhes.querySelectorAll('.parcela')[indiceParc]] : formDdsDetalhes.querySelectorAll('.parcela');
    const vencimentos = [];

    parcelas.forEach(parcela => {
        const numParc = parcela.querySelector('label');
        const dataInput = parcela.querySelector('input[type="date"]');
        const valorInput = parcela.querySelector('input[name="Valor"]');
        const numPDC = parcela.querySelector('input[name="Num_PDC_parcela"]');
        const parcCriada = parcela.querySelector('input[name="parcela_criada"]');
        
        const vencimentoObj = {};
        if (numParc?.textContent) {
            vencimentoObj["Numero_da_parcela"] = parseInt(numParc.textContent.match(/\d+/)[0]);

        }
        if (dataInput?.value) {
            vencimentoObj["Vencimento_previsto"] = formatDate(dataInput.value, "DD/MM/YYYY");
        }
        if (valorInput?.value) {
            vencimentoObj["Valor"] = converterStringParaDecimal(valorInput.value, qtdCssDecimais);

        }
        if (numPDC?.value) {
            vencimentoObj["Num_PDC_parcela"] = numPDC.value;
            
        }
        vencimentoObj["parcela_criada"] = indiceParc !== null || parcCriada?.checked?true:false;

        // Adiciona o objeto ao array apenas se tiver pelo menos uma propriedade
        if (Object.keys(vencimentoObj).length > 0) {
            vencimentos.push(vencimentoObj);
        }

        if(log) console.log("Nome: " + "Numero_da_parcela" + ", Valor: " + vencimentoObj["Numero_da_parcela"]);
        if(log) console.log("Nome: " + "Vencimento_previsto" + ", Valor: " + vencimentoObj["Vencimento_previsto"]);
        if(log) console.log("Nome: " + "Valor" + ", Valor: " + vencimentoObj["Valor"]);
        if(log) console.log("Nome: " + "Num_PDC_parcela" + ", Valor: " + vencimentoObj["Num_PDC_parcela"]);
        if(log) console.log("Nome: " + "parcela_criada" + ", Valor: " + vencimentoObj["parcela_criada"]);
    });

    // Adiciona outros campos do formulário
    const elementosDetalhes = formDdsDetalhes.elements;
    for (let elemento of elementosDetalhes) {
        if (!elemento.classList.contains("campo-datas")) {
            if (elemento.type !== 'radio') {
                if (elemento.checked) {
                    dadosIniciaisPdc[elemento.name] = elemento.checked;
                } else {
                    dadosIniciaisPdc[elemento.name] = elemento.value;
                }
                if(log) console.log("Nome: " + elemento.name + ", Valor: " + elemento.value);

            } else if (elemento.checked) {
                dadosIniciaisPdc[elemento.name] = elemento.value;
                if(log) console.log("Nome: " + elemento.name + ", Valor: " + elemento.value);

            }
        }
    }

    if(log) console.log("=> BUSCANDO DETALHES DA PARCELA <=");
    if (vencimentos.length > 0) {
        dadosIniciaisPdc["Datas"] = vencimentos;
        // Adiciona o primeiro vencimento em um campo separado para referência
        if (vencimentos[0].Vencimento_previsto) {
            dadosIniciaisPdc["Vencimento_previsto"] = vencimentos[0].Vencimento_previsto;

        }
        if (vencimentos[0].Num_PDC_parcela) {
            dadosIniciaisPdc["Numero_do_PDC"] = indiceParc == null && vencimentos[0].Num_PDC_parcela.includes("/")?globais.numPDC:vencimentos[0].Num_PDC_parcela;
            dadosIniciaisPdc["Num_princ_PDC"] = (typeof globais.numPDC === 'string' && globais.numPDC.split) ? globais.numPDC.split("/")[0] : globais.numPDC;
        }

        if(log) console.log("Nome: " + "Vencimento_previsto" + ", Valor: " + vencimentos[0].Vencimento_previsto);
        if(log) console.log("Nome: " + "Num_PDC_parcela" + ", Valor: " + vencimentos[0].Num_PDC_parcela);

    }
    if (globais.perfilResponsavel != null && globais.pag != "checagem_final") {
        dadosIniciaisPdc["Perfil_responsavel"] = globais.perfilResponsavel;
    }

    if(log) console.log("----------RETORNANDO DADOS DO PDC----------");
    return dadosIniciaisPdc;
}

//================================================================================//
//====================BUSCA OS DADOS DA CLASSIFICAÇÃO CONTÁBIL====================//
//================================================================================//
/**
 * Busca os dados de classificação.
 * 
 * @function pegarDadosClassificacao
 * @returns {Object} Os dados de classificação.
 * 
 * @description
 * Esta função busca os dados de classificação a partir de um formulário e os organiza em um objeto.
 */
function pegarDadosClassificacao_V2(qtdParc = 1) {
    const log = false;

    if(log) console.log("++++++++++BUSCANDO DADOS DE CLASSIFICAÇÃO CONTÁBIL++++++++++");

    // Busca o formulário de classificação
    const formClassificacao = document.getElementById('form-classificacao');
    const linhasClassificacao = formClassificacao.querySelectorAll('.linha-classificacao');
    const dadosClassificacao = {};
    const classificacoes = [];

    // Itera sobre cada linha de classificação
    linhasClassificacao.forEach(linha => {
        const classificacao = {};

        // Busca os selects e inputs da linha atual
        const selects = linha.querySelectorAll('input[type="select"]');
        const inputs = linha.querySelectorAll('input[type="text"], input[type="number"]');

        // Adiciona os valores dos selects ao objeto da classificação
        selects.forEach(select => {
            if (select.name && select.dataset.id_opcao) {
                classificacao[select.name] = select.dataset.id_opcao;
            } else {
                classificacao[select.name] = select.value;
            }
            if(log) console.log("Nome: " + select.name + ", Valor: " + classificacao[select.name]);
        });

        // Adiciona os valores dos inputs ao objeto da classificação
        inputs.forEach(input => {
            if (input.name && input.value) {
                // Se for um campo de valor, converte para decimal
                if (input.classList.contains('input-number')) {
                    classificacao[input.name] = converterStringParaDecimal(converterStringParaDecimal(input.value) / qtdParc, qtdCssDecimais);
                } else {
                    classificacao[input.name] = input.value;
                }
                if(log) console.log("Nome: " + input.name + ", Valor: " + classificacao[input.name]);
            }

        });

        // Adiciona a classificação ao array apenas se tiver algum valor preenchido
        if (Object.keys(classificacao).length > 0) {
            classificacoes.push(classificacao);
        }
    });

    // Adiciona o array de classificações ao objeto final apenas se houver dados
    if (classificacoes.length > 0) {
        dadosClassificacao["Classificacao_contabil"] = classificacoes;
    }
    if(log) console.log("----------RETORNANDO DADOS DE CLASSIFICAÇÃO CONTÁBIL----------");
    return dadosClassificacao;
}

//===================================================================================//
//====================BUSCA OS DADOS DO FORMULÁRIO DE NOTA FISCAL====================//
//===================================================================================//
/**
 * Busca os dados do formulário de Nota Fiscal.
 * 
 * @function pegarDadosNF
 * @returns {Object} Os dados do formulário de Nota Fiscal.
 * 
 * @description
 * Esta função busca os dados do formulário de Nota Fiscal e os organiza em um objeto.
 */
function pegarDadosNF_V2() {
    const log = false;
    if(log) console.log("++++++++++BUSCANDO DADOS DA NOTA FISCAL++++++++++");
    const formDdsNF = document.querySelector('#dados-nf');
    const dadosNF = {};

    // Obter todos os elementos do formulário, exceto os das linhas dinâmicas de NF
    const elementosNF = formDdsNF.querySelectorAll(':scope > :not(#linhas-nf) input, :scope > :not(#linhas-nf) select, :scope > :not(#linhas-nf) textarea');
    elementosNF.forEach(elemento => {
        if (elemento.classList.contains('input-number')) {
            dadosNF[elemento.name] = converterStringParaDecimal(elemento.value, qtdCssDecimais);
        } else if (elemento.type == "date" && elemento.value) { // Verifica se o campo não está vazio
            dadosNF[elemento.name] = formatDate(elemento.value, "DD/MM/YYYY");
        } else {
            dadosNF[elemento.name] = elemento.value;
        }
    });

    // Adicionar dados das linhas dinâmicas de NF
    const linhasNF = document.querySelectorAll('#linhas-nf .linha-nf');
    dadosNF.Dados_da_nota_fiscal1 = [];
    linhasNF.forEach(linha => {
        const linhaDados = {};
        const inputs = linha.querySelectorAll('input');
        inputs.forEach(input => {
            if (input.type === 'date' && input.value) {
                linhaDados[input.name] = formatDate(input.value, "DD/MM/YYYY");

            } else {
                linhaDados[input.name] = input.value;
            }
        });
        dadosNF.Dados_da_nota_fiscal1.push(linhaDados);
    });

    // Adiciona os dados dos tds usando o atributo name como chave
    const valorOriginal = document.querySelector('#valor-original');
    const totalDescontos = document.querySelector('#descontos-total');
    const valorTotalPagar = document.querySelector('#valor-total-pagar');

    if (valorOriginal && valorOriginal.hasAttribute('name')) {
        dadosNF[valorOriginal.getAttribute('name')] = converterStringParaDecimal(valorOriginal.textContent || '', qtdCssDecimais);
    }
    if (totalDescontos && totalDescontos.hasAttribute('name')) {
        dadosNF[totalDescontos.getAttribute('name')] = converterStringParaDecimal(totalDescontos.textContent || '', qtdCssDecimais);
    }
    if (valorTotalPagar && valorTotalPagar.hasAttribute('name')) {
        dadosNF[valorTotalPagar.getAttribute('name')] = converterStringParaDecimal(valorTotalPagar.textContent || '', qtdCssDecimais);
    }
    if(log) console.log("dadosNF => ", JSON.stringify(dadosNF));

    return dadosNF;
}

//====================================================================================//
//====================BUSCA OS DADOS DA TABELA DE PREÇOS (COTAÇÃO)====================//
//====================================================================================//
/**
 * Busca os dados da tab de preços.
 * 
 * @function pegarDadostabPrecos
 * @returns {Object} Os dados da tab de preços e dados extras do PDC.
 * 
 * @description
 * Esta função busca os dados da tab de preços, incluindo os fornecedores, valores unitários, totais, frete, descontos e outros detalhes.
 */
function pegarDadostabPrecos(currTempPDC = null, currPDC = null, qtdParc = 1) {
    //====================BUSCA OS DADOS DA TAB DE PREÇOS====================//
    const tab = document.getElementById('priceTable');

    // Variáveis da primeira tab (Tabela de Preços)
    const cabecalho1 = tab.rows[0];
    const linhaFrete = tab.rows[tab.rows.length - qlt];
    const linhaDescontos = tab.rows[tab.rows.length - (qlt - 1)];
    const linhaTotal = tab.rows[tab.rows.length - (qlt - 2)];

    const corpoTab = tab.getElementsByTagName('tbody')[0].rows;
    const dadosExtras = {};
    const dados = [];

    // Variáveis da segunda tab (Detalhes das Cotações)
    const tabDetalhes = document.getElementById('otherDataTable');
    const linhasDetalhes = tabDetalhes.getElementsByTagName('tbody')[0].rows;

    const fornecedores = [];
    const custosFrete = [];
    const descontos = [];
    const totalGeral = [];
    const idsFornecedores = [];

    // Captura os fornecedores da tab
    for (let i = 0; i < cabecalho1.cells.length; i++) {
        if (cabecalho1.cells[i].colSpan > 1) {
            const nomeFornecedor = cabecalho1.cells[i].innerText.trim().replace(/ \u00d7$/, '');
            const idFornecedor = cabecalho1.cells[i].dataset.id_forn;
            idsFornecedores.push(idFornecedor);
            fornecedores.push(nomeFornecedor);

            const frete = converterStringParaDecimal((linhaFrete.cells[i - (ipcv - 1)].innerText) || '0', qtdCssDecimais);//É -1 PORQUE BUSCA O INDICE DA ULTIMA LINHA DE APOIO E NÃO DA PRIMEIRA LINHA DE VALORES
            custosFrete.push(frete);

            const desconto = converterStringParaDecimal((linhaDescontos.cells[i - (ipcv - 1)].innerText) || '0', qtdCssDecimais);//É -1 PORQUE BUSCA O INDICE DA ULTIMA LINHA DE APOIO E NÃO DA PRIMEIRA LINHA DE VALORES
            descontos.push(desconto);

            const total = converterStringParaDecimal((linhaTotal.cells[i - (ipcv - 1)].innerText) || '0', qtdCssDecimais);//É -1 PORQUE BUSCA O INDICE DA ULTIMA LINHA DE APOIO E NÃO DA PRIMEIRA LINHA DE VALORES
            totalGeral.push(total);
        }
    }

    // Captura os produtos e valores da tab //
    for (let i = 0; i < corpoTab.length - qlt; i++) {
        const linha = corpoTab[i];
        const idProduto = linha.dataset.id_produto;
        const produto = linha.cells[0]?.innerText || '';
        const quantidade = converterStringParaDecimal(linha.cells[1]?.dataset.valor_original || '0', qtdCssDecimais);
        const unidade = linha.cells[2]?.innerText || '';

        if (fornecedores.length > 0) {
            for (let j = 0; j < fornecedores.length; j++) {
                const idFornecedor = idsFornecedores[j];
                const indicePrecoUnitario = ipcv + j * 2;
                const indicePrecoTotal = indicePrecoUnitario + 1;
                const fornecedor = fornecedores[j];
                const valorFrete = custosFrete[j];
                const valorDesconto = descontos[j];
                const valorTotalGeral = totalGeral[j];

                const valorUnitario = converterStringParaDecimal((linha.cells[indicePrecoUnitario]?.dataset.valor_original) || '0', qtdCssDecimais);
                const valorTotal = converterStringParaDecimal((linha.cells[indicePrecoTotal]?.dataset.valor_original) || '0', qtdCssDecimais);

                const condicaoPagamento = linhasDetalhes[j].cells[1]?.innerText || '';
                const observacao = linhasDetalhes[j].cells[2]?.innerText || '';

                const fornecedorAprovado = cabecalho1.cells[j + ipcv].querySelector('input[type="checkbox"]')?.checked || fornecedores.length === 1;
                if (fornecedorAprovado) {
                    dadosExtras["Beneficiario"] = fornecedor;
                    dadosExtras["Valor_orcado"] = converterStringParaDecimal((valorTotalGeral / qtdParc) || 0, qtdCssDecimais);
                }

                const dadosLinha = {
                    id_produto: idProduto,
                    id_fornecedor: idFornecedor,
                    Produto: produto,
                    Quantidade: quantidade,
                    Unidade: unidade,
                    Fornecedor: fornecedor,
                    Valor_unitario: valorUnitario,
                    Valor_total: valorTotal,
                    Valor_do_frete: valorFrete,
                    Descontos: valorDesconto,
                    Total_geral: valorTotalGeral,
                    Condicoes_de_pagamento: condicaoPagamento,
                    Observacoes: observacao,
                    numero_de_PDC: currPDC ? currPDC : globais.numPDC,
                    num_pdc_temp: currTempPDC ? currTempPDC : globais.numPDC_temp,
                    Aprovado: fornecedorAprovado,
                    Versao: 1,
                    Ativo: true
                };
                dados.push(dadosLinha);
            }
        } else {
            const dadosLinha = {
                id_produto: idProduto,
                Produto: produto,
                Quantidade: quantidade,
                Unidade: unidade,
                numero_de_PDC: currPDC ? currPDC : globais.numPDC,
                num_pdc_temp: currTempPDC ? currTempPDC : globais.numPDC_temp,
                Versao: 1,
                Ativo: true,
            };
            dados.push(dadosLinha);
        }
    }
    return [dados, dadosExtras];
}

//================================================================\\
//===========================SALVA TUDO===========================\\
//================================================================\\
/*
export async function saveTableData_V4()
{
    //===============================\\
    //VALIDA OS DADOS ANTES DE SALVAR\\
    //===============================\\

    //==========Valida os documentos==========\\
    Object.values(globais.documentosNovos).forEach(doc => {
        if(!doc.name || !doc.data) {
            customModal_V2({
                tipoAcao:'alert', 
                titulo: "Documento com erro!", 
                mensagem:`<p>Um dos documentos não foi carregado corretamente. Mantenha esta tela aberta e contate o administrador do sistema<br>Documento: ${doc}</p>`,
                confirmText: 'Ok!'
            });
            return false;
        }
    });





}
    */

const SAVE_JOURNAL_VERSION = 3;
const SAVE_STORAGE_PREFIX = 'tsj2-pdc-digital:save:v3:';
const SAVE_PAGE_POINTER_PREFIX = 'tsj2-pdc-digital:save-page:v3:';
const SAVE_LOCK_PREFIX = 'tsj2-pdc-digital:save-lock:v3:';
const SAVE_DB_NAME = 'tsj2-pdc-digital-pending-saves';
const SAVE_DB_STORE = 'files';
const ATTACHMENT_FORM = 'Documentos';
const ATTACHMENT_REPORT = 'Documentos_API';
const ATTACHMENT_FIELD = 'Arquivo';
const ATTACHMENT_PDC_FIELD = 'PDC_Digital';
const QUOTE_TEMP_FIELD = 'num_pdc_temp';
let salvamentoEmAndamento = null;

function valoresDaColecao(colecao) {
    if (!colecao) return [];
    if (colecao instanceof Map) return [...colecao.values(), ...Object.values(colecao)];
    return Object.values(colecao);
}

function escaparCriterio(valor) {
    return String(valor ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function gerarIdOperacao() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function obterStorage() {
    const storages = [];
    for (const nome of ['localStorage', 'sessionStorage']) {
        try {
            storages.push(globalThis[nome]);
        } catch (_) {
            // O iframe pode bloquear um dos mecanismos de armazenamento.
        }
    }

    for (const storage of storages) {
        if (!storage) continue;
        const teste = `${SAVE_STORAGE_PREFIX}storage-test`;
        try {
            storage.setItem(teste, '1');
            storage.removeItem(teste);
            return storage;
        } catch (_) {
            // Tenta o próximo storage disponível.
        }
    }
    throw new Error('O navegador bloqueou o armazenamento necessário para retomar o salvamento após um F5.');
}

function chaveOperacao(numPdcTemp) {
    return `${SAVE_STORAGE_PREFIX}${encodeURIComponent(numPdcTemp)}`;
}

function chavePaginaAtual() {
    const href = globalThis.location?.href || 'pagina-sem-url';
    return `${SAVE_PAGE_POINTER_PREFIX}${encodeURIComponent(href)}`;
}

function normalizarOperacaoPersistida(operacao) {
    if (operacao?.resolution?.type !== 'enviar_p_ass_control') return operacao;

    operacao.items?.slice(1).forEach(item => {
        const tinhaAssinaturas = Array.isArray(item.pdcData.Assinaturas) && item.pdcData.Assinaturas.length > 0;
        item.pdcData.Assinaturas = [];
        // Uma operação gravada pela versão anterior pode já ter criado essas
        // linhas. Reabre somente esse checkpoint para removê-las no Zoho.
        if (tinhaAssinaturas && item.pdcId) item.pdcDone = false;
    });

    // O código original aplicava Ass. control. somente depois de receber o ID
    // criado. Em toda retomada, esse checkpoint final deve ser confirmado de novo.
    operacao.resolution.firstPdcStatusDone = false;
    operacao.resolution.done = false;

    if (operacao.items?.length === 1 && operacao.resolution.originalItem) {
        // Na parcela única o item principal já é o PDC original. Não pode haver
        // uma segunda fase que o devolva para "Separado em parcelas".
        operacao.resolution.originalItem = null;
    }
    return operacao;
}

function lerOperacaoPorChave(storageKey) {
    const json = obterStorage().getItem(storageKey);
    if (!json) return null;
    try {
        const operacao = JSON.parse(json);
        return operacao?.version === SAVE_JOURNAL_VERSION ? normalizarOperacaoPersistida(operacao) : null;
    } catch (_) {
        return null;
    }
}

function lerOperacaoPendente(numPdcTemp) {
    if (numPdcTemp) {
        const porPdc = lerOperacaoPorChave(chaveOperacao(numPdcTemp));
        if (porPdc) return porPdc;
    }
    const storageKey = obterStorage().getItem(chavePaginaAtual());
    return storageKey ? lerOperacaoPorChave(storageKey) : null;
}

function persistirOperacao(operacao) {
    operacao.updatedAt = new Date().toISOString();
    const storage = obterStorage();
    storage.setItem(operacao.storageKey, JSON.stringify(operacao));
    storage.setItem(operacao.pagePointerKey, operacao.storageKey);
}

function removerOperacao(operacao) {
    const storage = obterStorage();
    storage.removeItem(operacao.storageKey);
    if (storage.getItem(operacao.pagePointerKey) === operacao.storageKey) {
        storage.removeItem(operacao.pagePointerKey);
    }
}

function abrirBancoArquivos() {
    return new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) {
            reject(new Error('IndexedDB não está disponível para preservar os anexos.'));
            return;
        }
        const request = indexedDB.open(SAVE_DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(SAVE_DB_STORE)) {
                db.createObjectStore(SAVE_DB_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function executarNoBanco(modo, executor) {
    const db = await abrirBancoArquivos();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(SAVE_DB_STORE, modo);
            const store = tx.objectStore(SAVE_DB_STORE);
            let resultado;
            tx.oncomplete = () => resolve(resultado);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Transação de arquivos cancelada.'));
            try {
                resultado = executor(store);
            } catch (erro) {
                reject(erro);
            }
        });
    } finally {
        db.close();
    }
}

async function guardarArquivo(id, arquivo) {
    if (!(arquivo instanceof Blob)) {
        throw new Error(`O anexo ${arquivo?.name || id} não pôde ser preservado para retomada.`);
    }
    await executarNoBanco('readwrite', store => store.put({
        id,
        blob: arquivo,
        name: arquivo.name || 'anexo',
        type: arquivo.type || 'application/octet-stream',
        lastModified: arquivo.lastModified || Date.now()
    }));
}

async function recuperarArquivo(descritor) {
    const request = await executarNoBanco('readonly', store => store.get(descritor.storageId));
    const dados = request?.result;
    if (!dados?.blob) {
        throw new Error(`O anexo "${descritor.name}" não está mais disponível. Selecione-o novamente e repita a ação.`);
    }
    return new File([dados.blob], dados.name, {
        type: dados.type,
        lastModified: dados.lastModified
    });
}

async function limparArquivosDaOperacao(operacao) {
    const todosItens = [...operacao.items, ...(operacao.resolution?.originalItem ? [operacao.resolution.originalItem] : [])];
    const ids = [...new Set(todosItens.flatMap(item => item.attachments.map(anexo => anexo.storageId)))];
    if (ids.length === 0) return;
    try {
        await executarNoBanco('readwrite', store => ids.forEach(id => store.delete(id)));
    } catch (erro) {
        console.warn('Não foi possível limpar os anexos temporários do navegador:', erro);
    }
}

function itensResposta(resp) {
    if (Array.isArray(resp?.result)) return resp.result;
    return resp ? [resp] : [];
}

function respostaSemRegistros(resp) {
    const code = Number(resp?.code);
    return resp === '' || (Array.isArray(resp) && resp.length === 0) || code === 3100 || code === 9280;
}

function respostaBemSucedida(resp) {
    const itens = itensResposta(resp);
    return itens.length > 0 && itens.every(item => Number(item?.code) === 3000);
}

function erroZoho(etapa, resp) {
    let detalhe;
    try {
        detalhe = JSON.stringify(resp);
    } catch (_) {
        detalhe = String(resp);
    }
    return new Error(`${etapa}. Resposta do Zoho: ${detalhe}`);
}

function extrairIdCriado(resp) {
    const item = itensResposta(resp).find(resultado => Number(resultado?.code) === 3000 && resultado?.data?.ID);
    return item?.data?.ID ? String(item.data.ID) : null;
}

async function buscarRegistros({ criterios, nomeR }) {
    const resp = await executar_apiZoho({ tipo: 'busc_reg_recursivo', criterios, nomeR });
    if (Array.isArray(resp)) return resp;
    if (respostaSemRegistros(resp)) return [];
    throw erroZoho(`Erro ao consultar ${nomeR}`, resp);
}

function normalizarOpcoes(opcoes, sepPorParcLegado = false, paramsExtraLegado = {}) {
    if (opcoes && typeof opcoes === 'object' && !Array.isArray(opcoes)) {
        return {
            status: opcoes.status ?? null,
            sepPorParc: Boolean(opcoes.sepPorParc),
            paramsExtraPDC: opcoes.paramsExtraPDC || opcoes.paramExtra || {},
            resolucaoAposSalvar: opcoes.resolucaoAposSalvar || null
        };
    }
    return {
        status: opcoes ?? null,
        sepPorParc: Boolean(sepPorParcLegado),
        paramsExtraPDC: paramsExtraLegado || {},
        resolucaoAposSalvar: null
    };
}

function idsArquivosRemovidos(arquivos) {
    return arquivos
        .map(arquivo => String(arquivo || '').match(/Documentos\.Arquivo\/(\d+)\/download\?filepath/)?.[1])
        .filter(Boolean);
}

async function criarDescritoresAnexos(operationId, novos, existentes) {
    const descritores = { novos: [], existentes: [] };
    const armazenados = [];
    try {
        for (const [origem, arquivos] of Object.entries({ novos, existentes })) {
            for (let index = 0; index < arquivos.length; index++) {
                const arquivo = arquivos[index];
                const storageId = `${operationId}:${origem}:${index}`;
                await guardarArquivo(storageId, arquivo);
                const descritor = {
                    storageId,
                    name: arquivo.name || `anexo-${index + 1}`,
                    type: arquivo.type || 'application/octet-stream',
                    recordId: null,
                    uploaded: false
                };
                descritores[origem].push(descritor);
                armazenados.push(descritor);
            }
        }
        return descritores;
    } catch (erro) {
        if (armazenados.length > 0) {
            await executarNoBanco('readwrite', store => armazenados.forEach(anexo => store.delete(anexo.storageId)));
        }
        throw erro;
    }
}

function criarItem({ chave, pdcData, paramsExtraPDC, anexos, mode, pdcId = null, collectAsCreated = false }) {
    return {
        key: String(chave),
        tempId: pdcData.PDCsData.id_temp,
        mode,
        collectAsCreated,
        pdcId: pdcId ? String(pdcId) : null,
        pdcDone: false,
        quoteDone: false,
        pdcData: { ...pdcData.PDCsData, ...paramsExtraPDC },
        priceTableData: pdcData.priceTableData,
        attachments: anexos.map(anexo => ({ ...anexo }))
    };
}

async function criarOperacao({ status, sepPorParc, paramsExtraPDC, resolucaoAposSalvar }) {
    if (!globais.numPDC_temp) globais.numPDC_temp = `pdc_${gerarIdOperacao()}`;

    const operationId = gerarIdOperacao();
    const tipoOriginal = globais.tipo;
    const pdcOriginalId = globais.idPDC ? String(globais.idPDC) : null;
    const PDCsToSave = sepPorParc ? await splitDataByInstallments(status) : await meshData(status);
    if (PDCsToSave.size === 0) throw new Error('Não há parcelas pendentes para salvar.');

    let dadosOriginaisResolucao = null;
    if (resolucaoAposSalvar?.tipo === 'enviar_p_ass_control' && resolucaoAposSalvar.salvarPdcOriginalSeparado) {
        if (!pdcOriginalId) throw new Error('Não foi possível identificar o PDC original para concluir enviar_p_ass_control.');
        dadosOriginaisResolucao = await meshData('Separado em parcelas');
    }

    const novos = [...new Set(valoresDaColecao(globais.arquivosNovos))];
    const existentes = [...new Set(valoresDaColecao(globais.arquivosExistentes))];
    const descritores = await criarDescritoresAnexos(operationId, novos, sepPorParc ? existentes : []);
    const anexosPrincipais = [...descritores.novos, ...descritores.existentes];

    const ehEnvioAssControl = resolucaoAposSalvar?.tipo === 'enviar_p_ass_control';
    const items = Array.from(PDCsToSave.entries()).map(([chave, pdcData], indice) => {
        const primeiroDestino = indice === 0;
        let extrasDoItem = paramsExtraPDC;

        if (ehEnvioAssControl && !primeiroDestino) {
            // Somente a primeira parcela entra no fluxo de assinaturas. O array
            // vazio também corrige uma parcela reconciliada de uma tentativa anterior.
            extrasDoItem = { ...paramsExtraPDC, Assinaturas: [] };
        }

        const item = criarItem({
            chave,
            pdcData,
            paramsExtraPDC: extrasDoItem,
            anexos: anexosPrincipais,
            mode: sepPorParc ? 'criar_pdc' : tipoOriginal,
            pdcId: !sepPorParc && tipoOriginal === 'editar_pdc' ? pdcOriginalId : null,
            collectAsCreated: sepPorParc || tipoOriginal !== 'editar_pdc'
        });

        return item;
    });

    let resolution = null;
    if (resolucaoAposSalvar?.tipo === 'enviar_p_ass_control') {
        let originalItem = null;
        if (resolucaoAposSalvar.salvarPdcOriginalSeparado) {
            const entradaOriginal = dadosOriginaisResolucao.entries().next().value;
            originalItem = criarItem({
                chave: 'pdc-original',
                pdcData: entradaOriginal[1],
                paramsExtraPDC: {},
                anexos: descritores.novos,
                mode: 'editar_pdc',
                pdcId: pdcOriginalId,
                collectAsCreated: false
            });
        }
        resolution = {
            type: 'enviar_p_ass_control',
            firstPdcStatus: resolucaoAposSalvar.statusPrimeiroPdc || 'Ass. control.',
            firstPdcStatusDone: false,
            originalQuotesDeactivated: false,
            originalItem,
            done: false
        };
    }

    const operacao = {
        version: SAVE_JOURNAL_VERSION,
        id: operationId,
        storageKey: chaveOperacao(globais.numPDC_temp),
        pagePointerKey: chavePaginaAtual(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        context: {
            rootTempId: globais.numPDC_temp,
            originalType: tipoOriginal,
            originalPdcId: pdcOriginalId,
            sepPorParc
        },
        oldQuotesDeactivated: false,
        replaceActiveQuotes: !sepPorParc,
        removedAttachmentIds: idsArquivosRemovidos(globais.arquivosRemovidos || []),
        removedAttachmentsDone: false,
        resolution,
        items
    };

    try {
        persistirOperacao(operacao);
        return operacao;
    } catch (erro) {
        await limparArquivosDaOperacao(operacao);
        throw erro;
    }
}

async function desativarCotacoes(criterio) {
    const resp = await executar_apiZoho({
        tipo: 'atualizar_reg',
        criterios: criterio,
        corpo: { Ativo: false },
        nomeR: globais.nomeRelCot
    });
    if (!respostaBemSucedida(resp) && !respostaSemRegistros(resp)) {
        throw erroZoho('Erro ao desativar a cotação anterior', resp);
    }
}

async function garantirPDC(operacao, item) {
    if (item.pdcDone && item.pdcId) {
        if (!globais.idPDC) globais.idPDC = item.pdcId;
        return;
    }

    let pdcId = item.pdcId;
    const criterioTemp = `(id_temp=="${escaparCriterio(item.tempId)}")`;
    if (!pdcId) {
        const existentes = await buscarRegistros({ criterios: criterioTemp, nomeR: globais.nomeRelPDC });
        pdcId = existentes[0]?.ID ? String(existentes[0].ID) : null;
        if (existentes.length > 1) {
            console.warn(`Foram encontrados ${existentes.length} PDCs com id_temp ${item.tempId}. O primeiro será reutilizado.`);
        }
    }

    if (pdcId) {
        const resp = await executar_apiZoho({
            tipo: 'atualizar_reg',
            ID: pdcId,
            corpo: item.pdcData,
            nomeR: globais.nomeRelPDC
        });
        if (!respostaBemSucedida(resp)) throw erroZoho('Erro ao atualizar o PDC', resp);
    } else {
        const resp = await executar_apiZoho({
            tipo: 'add_reg',
            corpo: item.pdcData,
            nomeF: globais.nomeFormPDC
        });
        pdcId = extrairIdCriado(resp);
        if (!pdcId) {
            const reconciliados = await buscarRegistros({ criterios: criterioTemp, nomeR: globais.nomeRelPDC });
            pdcId = reconciliados[0]?.ID ? String(reconciliados[0].ID) : null;
        }
        if (!pdcId) throw erroZoho('Erro ao criar o PDC', resp);
    }

    item.pdcId = pdcId;
    item.pdcDone = true;
    if (!globais.idPDC) globais.idPDC = pdcId;
    persistirOperacao(operacao);
}

const CAMPOS_NUMERICOS_COTACAO = new Set([
    'Quantidade', 'Valor_unitario', 'Valor_total', 'Valor_do_frete',
    'Descontos', 'Total_geral', 'Versao'
]);

function normalizarValorCotacao(campo, valor) {
    if (valor && typeof valor === 'object') {
        valor = valor.ID ?? valor.id ?? valor.display_value ?? JSON.stringify(valor);
    }
    if (CAMPOS_NUMERICOS_COTACAO.has(campo)) {
        const numero = Number(String(valor ?? 0).replace(',', '.'));
        return Number.isFinite(numero) ? numero : String(valor ?? '');
    }
    if (campo === 'Aprovado' || campo === 'Ativo') {
        return valor === true || String(valor).toLowerCase() === 'true';
    }
    return String(valor ?? '').trim();
}

function assinaturaCotacao(registro, campos) {
    const normalizado = {};
    campos.forEach(campo => {
        normalizado[campo] = normalizarValorCotacao(campo, registro?.[campo]);
    });
    return JSON.stringify(normalizado);
}

function cotacoesConferem(atuais, esperadas) {
    if (atuais.length !== esperadas.length) return false;
    const campos = [...new Set(esperadas.flatMap(registro => Object.keys(registro)))].sort();
    const a = atuais.map(registro => assinaturaCotacao(registro, campos)).sort();
    const b = esperadas.map(registro => assinaturaCotacao(registro, campos)).sort();
    return a.every((assinatura, index) => assinatura === b[index]);
}

async function garantirCotacoes(operacao, item) {
    if (item.quoteDone) return;
    const criterioAtivas = `(${QUOTE_TEMP_FIELD}=="${escaparCriterio(item.tempId)}" && Ativo==true)`;
    let atuais = await buscarRegistros({ criterios: criterioAtivas, nomeR: globais.nomeRelCot });
    if (cotacoesConferem(atuais, item.priceTableData)) {
        item.quoteDone = true;
        persistirOperacao(operacao);
        return;
    }

    if (atuais.length > 0) {
        await desativarCotacoes(criterioAtivas);
        atuais = [];
    }
    if (item.priceTableData.length === 0) {
        item.quoteDone = true;
        persistirOperacao(operacao);
        return;
    }

    const resp = await executar_apiZoho({
        tipo: 'add_reg',
        corpo: item.priceTableData,
        nomeF: globais.nomeFormCot
    });
    if (!respostaBemSucedida(resp)) {
        const reconciliadas = await buscarRegistros({ criterios: criterioAtivas, nomeR: globais.nomeRelCot });
        if (!cotacoesConferem(reconciliadas, item.priceTableData)) {
            throw erroZoho('Erro ao salvar a cotação', resp);
        }
    }
    item.quoteDone = true;
    persistirOperacao(operacao);
}

function textoArquivoZoho(valor) {
    if (!valor) return '';
    let texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
    try {
        texto = decodeURIComponent(texto);
    } catch (_) {
        // Alguns nomes não usam URL encoding.
    }
    return texto.toLowerCase();
}

function registroTemArquivo(registro, nome) {
    return textoArquivoZoho(registro?.[ATTACHMENT_FIELD]).includes(String(nome || '').toLowerCase());
}

function registroSemArquivo(registro) {
    return textoArquivoZoho(registro?.[ATTACHMENT_FIELD]).trim() === '';
}

async function buscarAnexosDoPDC(pdcId) {
    return buscarRegistros({
        criterios: `(${ATTACHMENT_PDC_FIELD}==${pdcId})`,
        nomeR: ATTACHMENT_REPORT
    });
}

async function garantirAnexos(operacao, item) {
    if (item.attachments.every(anexo => anexo.uploaded)) return;
    let registros = await buscarAnexosDoPDC(item.pdcId);
    const idsReservados = new Set(item.attachments.map(anexo => anexo.recordId).filter(Boolean).map(String));

    for (const anexo of item.attachments) {
        if (anexo.uploaded) continue;
        if (!anexo.recordId) {
            const jaEnviado = registros.find(registro =>
                !idsReservados.has(String(registro.ID)) && registroTemArquivo(registro, anexo.name)
            );
            if (jaEnviado) {
                anexo.recordId = String(jaEnviado.ID);
                anexo.uploaded = true;
                idsReservados.add(anexo.recordId);
                persistirOperacao(operacao);
                continue;
            }

            const vazio = registros.find(registro =>
                !idsReservados.has(String(registro.ID)) && registroSemArquivo(registro)
            );
            if (vazio) {
                anexo.recordId = String(vazio.ID);
            } else {
                const respCriacao = await executar_apiZoho({
                    tipo: 'add_reg',
                    corpo: { [ATTACHMENT_PDC_FIELD]: item.pdcId },
                    nomeF: ATTACHMENT_FORM
                });
                anexo.recordId = extrairIdCriado(respCriacao);
                if (!anexo.recordId) {
                    registros = await buscarAnexosDoPDC(item.pdcId);
                    const reconciliado = registros.find(registro =>
                        !idsReservados.has(String(registro.ID)) && registroSemArquivo(registro)
                    );
                    anexo.recordId = reconciliado?.ID ? String(reconciliado.ID) : null;
                }
                if (!anexo.recordId) throw erroZoho(`Erro ao criar o registro do anexo "${anexo.name}"`, respCriacao);
                registros.push({ ID: anexo.recordId, [ATTACHMENT_FIELD]: '' });
            }
            idsReservados.add(String(anexo.recordId));
            persistirOperacao(operacao);
        }

        const arquivo = await recuperarArquivo(anexo);
        const respUpload = await executar_apiZoho({
            tipo: 'subir_arq',
            nomeR: ATTACHMENT_REPORT,
            ID: anexo.recordId,
            corpo: arquivo
        });
        if (!respostaBemSucedida(respUpload)) {
            throw erroZoho(`Erro ao enviar o anexo "${anexo.name}"`, respUpload);
        }
        anexo.uploaded = true;
        persistirOperacao(operacao);
    }
}

async function removerAnexosDaOperacao(operacao) {
    if (operacao.removedAttachmentsDone) return;
    if (operacao.removedAttachmentIds.length > 0) {
        const criterio = `(${operacao.removedAttachmentIds.map(id => `ID==${id}`).join(' || ')})`;
        const resp = await executar_apiZoho({
            tipo: 'deletar_reg',
            criterios: criterio,
            nomeR: ATTACHMENT_REPORT
        });
        if (!respostaBemSucedida(resp) && !respostaSemRegistros(resp)) {
            throw erroZoho('Erro ao remover anexos excluídos', resp);
        }
    }
    operacao.removedAttachmentsDone = true;
    persistirOperacao(operacao);
}

async function processarItem(operacao, item) {
    await garantirPDC(operacao, item);
    await garantirAnexos(operacao, item);
    await garantirCotacoes(operacao, item);
}

async function confirmarStatusPrimeiroPDC(operacao, primeiroItem) {
    const statusEsperado = operacao.resolution.firstPdcStatus;
    const corpo = {
        Status_geral: statusEsperado,
        Assinaturas: primeiroItem.pdcData.Assinaturas || []
    };
    let ultimaResposta;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
        ultimaResposta = await executar_apiZoho({
            tipo: 'atualizar_reg',
            ID: primeiroItem.pdcId,
            corpo,
            nomeR: globais.nomeRelPDC
        });
        if (!respostaBemSucedida(ultimaResposta)) {
            throw erroZoho('Erro ao aplicar a resolução de enviar_p_ass_control', ultimaResposta);
        }

        const confirmacao = await buscarRegistros({
            criterios: `(ID==${primeiroItem.pdcId})`,
            nomeR: globais.nomeRelPDC
        });
        if (String(confirmacao[0]?.Status_geral || '').trim() === statusEsperado) {
            operacao.resolution.firstPdcStatusDone = true;
            persistirOperacao(operacao);
            return;
        }

        if (tentativa < 3) {
            await new Promise(resolve => setTimeout(resolve, 300 * tentativa));
        }
    }

    throw erroZoho(
        `O Zoho não confirmou o status ${statusEsperado} para o PDC ${primeiroItem.pdcId}`,
        ultimaResposta
    );
}

async function executarResolucaoAposSalvar(operacao) {
    const resolucao = operacao.resolution;
    if (!resolucao || resolucao.done) return;

    if (resolucao.originalItem) {
        if (!resolucao.originalQuotesDeactivated) {
            const criterio = `(${QUOTE_TEMP_FIELD}=="${escaparCriterio(operacao.context.rootTempId)}" && Ativo==true)`;
            await desativarCotacoes(criterio);
            resolucao.originalQuotesDeactivated = true;
            persistirOperacao(operacao);
        }
        await processarItem(operacao, resolucao.originalItem);
    }

    // Mantém a ordem do fluxo original: somente depois de todas as parcelas e
    // da separação do PDC original, usa o primeiro ID retornado para promover.
    if (!resolucao.firstPdcStatusDone) {
        const primeiroItem = operacao.items.find(item => item.collectAsCreated && item.pdcId);
        if (!primeiroItem) throw new Error('enviar_p_ass_control não retornou o ID da primeira parcela criada.');
        await confirmarStatusPrimeiroPDC(operacao, primeiroItem);
    }

    resolucao.done = true;
    persistirOperacao(operacao);
}

function idsPDCsCriados(operacao) {
    return operacao.items
        .filter(item => item.collectAsCreated && item.pdcId)
        .map(item => String(item.pdcId));
}

async function processarOperacao(operacao) {
    if (operacao.replaceActiveQuotes && !operacao.oldQuotesDeactivated) {
        const criterio = `(${QUOTE_TEMP_FIELD}=="${escaparCriterio(operacao.context.rootTempId)}" && Ativo==true)`;
        await desativarCotacoes(criterio);
        operacao.oldQuotesDeactivated = true;
        persistirOperacao(operacao);
    }

    for (const item of operacao.items) await processarItem(operacao, item);
    await executarResolucaoAposSalvar(operacao);
    await removerAnexosDaOperacao(operacao);

    const idsCriados = idsPDCsCriados(operacao);
    globais.cotacaoExiste = true;
    globais.tipo = operacao.context.originalType;
    removerOperacao(operacao);
    await limparArquivosDaOperacao(operacao);
    document.dispatchEvent(new CustomEvent('pdc:save-complete', {
        detail: { operationId: operacao.id, resumed: Boolean(operacao.resumed), idsPDCs: idsCriados }
    }));
    return idsCriados;
}

async function comBloqueioDeSalvamento(operacao) {
    const nomeBloqueio = `${SAVE_LOCK_PREFIX}${operacao.context.rootTempId}`;
    const executar = async () => {
        const maisRecente = lerOperacaoPorChave(operacao.storageKey);
        if (!maisRecente) return idsPDCsCriados(operacao);
        return processarOperacao(maisRecente);
    };

    if (globalThis.navigator?.locks?.request) {
        return navigator.locks.request(nomeBloqueio, { mode: 'exclusive' }, executar);
    }

    const storage = obterStorage();
    const lockKey = `${nomeBloqueio}:fallback`;
    const owner = gerarIdOperacao();
    const agora = Date.now();
    let lockAtual;
    try {
        lockAtual = JSON.parse(storage.getItem(lockKey) || 'null');
    } catch (_) {
        lockAtual = null;
    }
    if (lockAtual?.expiresAt > agora) {
        await new Promise(resolve => setTimeout(resolve, Math.min(lockAtual.expiresAt - agora + 50, 16000)));
        try {
            lockAtual = JSON.parse(storage.getItem(lockKey) || 'null');
        } catch (_) {
            lockAtual = null;
        }
        if (lockAtual?.expiresAt > Date.now()) {
            throw new Error('Este PDC já está sendo salvo em outra aba. Aguarde a conclusão.');
        }
    }

    const renovarLock = () => storage.setItem(lockKey, JSON.stringify({ owner, expiresAt: Date.now() + 15000 }));
    renovarLock();
    const heartbeat = setInterval(renovarLock, 5000);
    try {
        return await executar();
    } finally {
        clearInterval(heartbeat);
        let lockFinal;
        try {
            lockFinal = JSON.parse(storage.getItem(lockKey) || 'null');
        } catch (_) {
            lockFinal = null;
        }
        if (lockFinal?.owner === owner) storage.removeItem(lockKey);
    }
}

/**
 * Salva PDC, anexos, cotações e resoluções posteriores usando um diário
 * persistente. O retorno contém os IDs dos PDCs criados pela operação.
 */
export async function saveTableData_V3(opcoes = {}, sepPorParcLegado = false, paramsExtraLegado = {}) {
    if (salvamentoEmAndamento) return salvamentoEmAndamento;
    const parametros = normalizarOpcoes(opcoes, sepPorParcLegado, paramsExtraLegado);
    salvamentoEmAndamento = (async () => {
        let operacao = lerOperacaoPendente(globais.numPDC_temp);
        if (operacao) {
            operacao.resumed = true;
            persistirOperacao(operacao);
            console.info(`Retomando o salvamento ${operacao.id} a partir do último checkpoint.`);
        } else {
            operacao = await criarOperacao(parametros);
        }

        try {
            return await comBloqueioDeSalvamento(operacao);
        } catch (causa) {
            const erro = causa instanceof Error ? causa : erroZoho('Falha inesperada durante o salvamento', causa);
            erro.message = `${erro.message} O progresso foi preservado e será retomado automaticamente nesta mesma página.`;
            document.dispatchEvent(new CustomEvent('pdc:save-pending', {
                detail: { operationId: operacao.id, error: erro.message }
            }));
            throw erro;
        }
    })();

    try {
        return await salvamentoEmAndamento;
    } finally {
        salvamentoEmAndamento = null;
    }
}

export async function retomarSalvamentoPendente({ exibirMensagem = true } = {}) {
    if (salvamentoEmAndamento) return false;
    let operacao;
    try {
        operacao = lerOperacaoPendente(globais.numPDC_temp);
    } catch (erro) {
        console.warn('Não foi possível consultar o salvamento pendente:', erro);
        return false;
    }
    if (!operacao) return false;
    if (!globais.numPDC_temp) globais.numPDC_temp = operacao.context.rootTempId;

    try {
        await saveTableData_V3();
        if (exibirMensagem) {
            await customModal_V2({
                tipoAcao: 'alert',
                titulo: 'Salvamento retomado',
                mensagem: 'O processo interrompido foi concluído com segurança.',
                confirmText: 'Ok'
            });
        }
        return true;
    } catch (erro) {
        console.error('Não foi possível retomar o salvamento pendente:', erro);
        if (exibirMensagem) {
            await customModal_V2({
                tipoAcao: 'alert',
                titulo: 'Salvamento ainda pendente',
                mensagem: `${erro.message}<br><br>Você pode tentar novamente sem duplicar os dados.`,
                confirmText: 'Ok'
            });
        }
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', event => {
        if (!salvamentoEmAndamento) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

export async function tratarSalvamentoPDC({ acao = null }) {
    //TODOS OS DADOS//
    /**
     * Dados iniciais do PDC
     * Toda a tabela de cotação
     * Tabela do fornecedor aprovado
     * Detalhes dos fornecedores
     * Dados de forma de pagamento
     * Dados de parcelas (Sem separar)
     * Dados de parcelas separando as marcadas (Pagamento de sinal)
     * Dados de parcelas separando as não separadas (Compra recebida)
     * Dados de nota fiscal
     * Dados de retenção
     * Dados de classificação (Sem separar)
     * Dados de classificação separando as marcadas (Pagamento de sinal)
     * Dados de classificação separando as não separadas (Compra recebida)
     * Anexos novos e removidos
     * Duplicar anexos (Pagamento de sinal)
     * Duplicar anexos (Compra recebida)
     * Alterar Status
     */

}

export async function enviarParaPaybox(){
    try{

        //==========VARIÁVEIS DE APOIO==========\\
        const corpo = new Array();
        const lancamento = new Map();
        const fornAprov = Array.from(globais.baseFornecedores.values()).find((fornecedor) => fornecedor[0] === globais.idFornAprovado);
        const formDdsDetalhes = document.querySelector('#form-pagamento');
        const parcelas = formDdsDetalhes ? formDdsDetalhes.querySelectorAll('.parcela') : [];
        const cpf_cnpj_forn_ajust = fornAprov[2].replace(/\D/g, '');
        const ap_tipo_forn = cpf_cnpj_forn_ajust.length == 11?"F":"J";
        const descr_compra = document.getElementById("descricao").value
        let descricao_curta = "";
        let descr_compra_temp = descr_compra;
    
        if(typeof descr_compra_temp === "undefined")
        {
            descr_compra_temp = "";
        }
        
        if(descr_compra_temp.length > 120)
        {
            descricao_curta = descr_compra_temp.toUpperCase().slice(0, 120) + "...";
        }
        else
        {
            descricao_curta = descr_compra_temp.toUpperCase();
        }
    
        const entidade = document.getElementById("entidade");
        const selectedOption = entidade.options[entidade.selectedIndex];
    
        const dds_pgto = document.getElementById("dados-nf");
        const dds_impostos = dds_pgto.getElementsByClassName("campos-retencao-nf")[0].getElementsByTagName("tbody");
        const dds_nf = dds_pgto.getElementsByClassName("campos-iniciais-nf")[0].getElementsByClassName("linha-nf")[0];
        //==========POPULANDO CORPO DA REQUISIÇÃO==========\\
        lancamento["cnpj_administradora"]= 58109067000149;
        lancamento["cnpj_remetente"]= 58109067000149;
        lancamento["cnpj_fornecedor"]= cpf_cnpj_forn_ajust;
        lancamento["cnpj_condominio"]= selectedOption.dataset.cnpj_ent;
        lancamento["condominio"]= selectedOption.dataset.cod_cond_ahreas;
        lancamento["tipo_inscr_condo"]= "J";
        lancamento["tipo_inscr_fornec"]= ap_tipo_forn;
    
        lancamento["valor_total_nf"]= converterStringParaDecimal(dds_impostos[0].rows[0].cells[1].innerText||0.00);
        lancamento["vr_inss"]= converterStringParaDecimal(dds_impostos[0].rows[1].cells[1].innerText || 0.00);
        lancamento["vr_iss"]= converterStringParaDecimal(dds_impostos[0].rows[2].cells[1].innerText || 0.00);
        lancamento["vr_csll_pis_cofins"]= converterStringParaDecimal(dds_impostos[0].rows[3].cells[1].innerText || 0.00);
        lancamento["vr_irrf"]= 0.00;
    
        lancamento["data_emissao_nf"]= formatDate(dds_nf.querySelector("input[name='Data_emissao_N_Fiscal']").value, "DD/MM/YYYY");
        lancamento["nro_nf"]= dds_nf.querySelector("input[name='Numero_N_Fiscal']").value;
        //
        let urls = new Array();
    
        globais.arquivospPaybox.forEach((arquivo)=>{
            const filepathIndex = arquivo.display_value.indexOf("filepath=");
            const filepathValue = arquivo.display_value.substring(filepathIndex + "filepath=".length);
            const url = `https://creatorexport.zoho.com/guillaumon/app-envio-de-notas-boletos-guillaumon/Documentos_API/Arquivos/image/FQtZbOGWVpPX4WD9Q0Qb8jwGtz8380Mx4QB70JMazOQh5r7PbHPUBs6WZOX1jf2mFP3bODn97z0tAQphFnfAYsHy2ZjZqMU36a4y/${filepathValue}`
            urls.push({url: url});
    
        } );
        lancamento["url"]= urls;
        //
        parcelas.forEach((parcela) => {
    
            const dataInput = parcela.querySelector('input[type="date"]');
            const valorInput = converterStringParaDecimal(parcela.querySelector('input[name="Valor"]').value);
            const numPDC = parcela.querySelector('input[name="Num_PDC_parcela"]').value;
    
            lancamento["ano"] = dataInput.value.split("-")[0];
            lancamento["mes"] = dataInput.value.split("-")[1];
            lancamento["vencimento"] = dataInput.value;
            lancamento["valor"] = valorInput;
            lancamento["desc_produto"] = globais.numSolicPDC + "|" + descricao_curta + " | PDC: " + numPDC;
            corpo.push(lancamento);
        });
    
        let header_data = new Map();
        header_data = {"Content-Type":"application/json","Authorization":"Bearer NTgxMDkwNjcwMDAxNDl8Kys4TmNBKy1zLW0tSDhDdF8tLTQrYmgrOWk9X0RNdU1NM195K2pfLStWY2E7dF5hcGheXzY9V15xLV9Yb1E9My09eF5EeQ=="};
        //
        const url = "https://api.ahreas.net/producao/paybox/inserecontas";
        const raw_data = JSON.stringify(corpo);
        console.log("raw_data => ", raw_data);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: header_data,
            body: raw_data,
            responseType: 'full'
        })
        console.log("response => ", response);
        
    }catch(e){
        console.log(e);
    }
}

export async function registrarLogNoZoho(numPDC)
{
    // Filtra e sanitiza os logs para evitar problemas com caracteres especiais
    let logText = '';
    
    if (globais.logs && globais.logs.length > 0) {
        // Processa cada log, removendo JSON objects muito grandes
        const filteredLogs = globais.logs
            .map(log => {
                // Se for um string muito longo (provável JSON grande), trunca
                if (log.length > 500) {
                    return log.substring(0, 500) + '...';
                }
                return log;
            })
            .filter(log => log && log.trim().length > 0);
        
        logText = filteredLogs.join('\n');
        
        // Limita o tamanho total do log para evitar rejeição do Zoho
        if (logText.length > 40000) {
            logText = logText.substring(0, 40000) + '\n[Log truncado - tamanho máximo atingido]';
        }
    } else {
        logText = 'Nenhum log registrado';
    }
    
    const body = {
        "Numero_do_PDC": numPDC,
        "Log": logText
    };
    console.log("body => ", body);
    const respFilesRec = await executar_apiZoho({ tipo: "add_reg", corpo: body, nomeF: "Logs_PDC_Digital" });

}

export async function removerArquivosZoho()
{
    console.log("Removendo arquivos marcados para remoção no Zoho...");
    console.log("Arquivos marcados para remoção => ", globais.arquivosRemovidos);
    //"/api/v2.1/guillaumon/terras-de-sao-jose-ii/report/PDC_Digital_API/3938561000116768677/Documentos.Arquivo/3938561000116768681/download?filepath=1773148141768840_arquivo.pdf"
    const idRecArquivosRemovidos = globais.arquivosRemovidos.map(arquivo => arquivo.match(/Documentos\.Arquivo\/(\d+)\/download\?filepath/)[1]).filter(id => id !== null);
    console.log("IDs dos arquivos marcados para remoção => ", idRecArquivosRemovidos);
    const criterio = `(ID == ${idRecArquivosRemovidos.join(" || ID == ")})`;
    const resp = await executar_apiZoho({ tipo: "deletar_reg", criterios: criterio, nomeR: "Documentos_API" });
    console.log("Resposta da remoção dos arquivos => ", resp);
    return resp;
}
