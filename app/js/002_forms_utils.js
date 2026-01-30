import { globais } from './999_config.js';
import { formatToBRL_V2, converterStringParaDecimal, base64Size, formatDate, executar_apiZoho} from './007_utils.js';
let numeroParcela = 1;
let numParcelaInicial = null;

/**
 * Mostra/oculta campos de pagamento com base na forma de pagamento selecionada
 * 
 * @function mostrarCamposPagamento
 * @returns {void}
 * 
 * @description
 * Esta função:
 * - Obtém a forma de pagamento selecionada (Boleto, Dep. em CC ou Dep. em CP)
 * - Oculta todos os campos de boleto e depósito inicialmente
 * - Se selecionado Boleto, mostra apenas os campos de boleto
 * - Se selecionado Depósito (CC ou CP), mostra apenas os campos de depósito
 * - Utiliza a classe CSS "hidden" para controlar a visibilidade
 */
export function mostrarCamposPagamento() {
    const formaPagamento = document.querySelector('input[name="Forma_de_pagamento"]:checked').value;

    let camposBoleto = document.querySelectorAll("#campos-boleto > *");
    camposBoleto.forEach(campo => campo.classList.add("hidden"));

    let camposDeposito = document.querySelectorAll("#campos-deposito > *");
    camposDeposito.forEach(campo => campo.classList.add("hidden"));

    let camposPix = document.querySelectorAll("#campos-pix > *");
    camposPix.forEach(campo => campo.classList.add("hidden"));

    if (formaPagamento === "Boleto") {

        camposBoleto.forEach(campo => campo.classList.remove("hidden"));
    } else if (formaPagamento === "Dep. em CC" || formaPagamento === "Dep. em CP") {

        camposDeposito.forEach(campo => campo.classList.remove("hidden"));
    } else if (formaPagamento === "Pix") {
        camposPix.forEach(campo => campo.classList.remove("hidden"));
    }
}
//===================================================================//
//====================VALIDA ENTIDADES PERMITIDAS====================//
//===================================================================//
export async function validarEntidadesPermitidas() {
    // 2.1 Busca as entidades permitidas
    const condominios = await executar_apiZoho({ tipo: "busc_reg", criterios: `(ID in [${globais.entidades_permitidas?.map(BigInt).join(",")}])`, nomeR: "Entidades_cadastradas" });
    const entidades_aplicaveis = condominios.reduce((acc, cond) => {
        acc[cond.ID] = [
            cond.Cod_cond_ahreas,
            cond.Nome,
            cond.CNPJ
        ];
        return acc;
    }, {});

    const campo_entidades = document.querySelector('select[name="Entidade"]');
    if (campo_entidades) {
        //Criando a opção padrão
        campo_entidades.innerHTML = '';
        const option_invalid = document.createElement('option');
        option_invalid.value = '';
        option_invalid.disabled = true;
        option_invalid.selected = true;
        option_invalid.classList.add('invalid');
        option_invalid.textContent = 'Selecione uma entidade...';
        campo_entidades.appendChild(option_invalid);

        //Adicionando as opções válidas
        Object.entries(entidades_aplicaveis).forEach(([key, value]) => {
            const option = document.createElement('option');
            option.value = key;
            option.dataset.codCondAhreas = value[0];
            option.dataset.cnpjEnt = value[2];
            option.textContent = value[1];

            // Caso exista apenas uma entidade, seleciona automaticamente
            if (Object.entries(entidades_aplicaveis).length === 1) {
                option.selected = true;
            }

            campo_entidades.appendChild(option);
        });
    }
}

//=============================================================//
//====================PREENCHE DADOS DO PDC====================//
//=============================================================//
/**
 * Preenche os campos do formulário PDC com dados de uma cotação existente
 * 
 * @function preencherDadosPDC
 * @param {Object} resp - Resposta da API contendo os dados do PDC
 * @returns {void}
 * 
 * @description
 * Esta função:
 * - Define a flag global indicando que existe uma cotação
 * - Preenche os campos da Sessão 1 (Entidade, Descrição, Utilização)
 * - Preenche os campos da Sessão 3 (Forma de Pagamento)
 * - Configura campos específicos baseado na forma de pagamento:
 *   - Para Boleto: favorecido
 *   - Para Depósito: banco, agência, conta e favorecido
 * - Preenche as datas de vencimento, recriando os campos necessários
 * - Ajusta a visibilidade dos campos conforme a forma de pagamento
 */
export function preencherDadosPDC(data) {
    const log = false;
    if(log) console.log("++++++++++PREENCHENDO DADOS DO PDC++++++++++");
    if(log) console.log("data => ", JSON.stringify(data));
    if(log) console.log("Classificacao_contabil => ", data.Classificacao_contabil);
    globais.cotacaoExiste = true;
    globais.idPDC = data.ID;
    globais.numPDC = data.Numero_do_PDC;
    globais.perfilResponsavel = data.Perfil_responsavel;
    globais.numSolicPDC = data.num_sol;
    if(data.Perfil_responsavel)
    {
        globais.perfilResponsavel = data.Perfil_responsavel;
    }
    //https://terrasii.zohocreatorportal.com/creator/v2.1/data/guillaumon/condominio-laranjeiras/report/Cotacoes_API?criteria=(ID%3D%3D0%20%26%26%20Ativo%3D%3Dtrue)&max_records=1000
    //https://terrasii.zohocreatorportal.com/creator/v2.1/data/guillaumon/condominio-laranjeiras/report/PDC_Digital_API?criteria=id_temp%3D%3D%22null%22%26%26Status_geral!%3D%22Separado%20em%20parcelas%22)&max_records=1000
    //==========SESSÃO 1==========//
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de cabeçalho|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||");
    const formDadosPDC = document.querySelector('#dados-PDC');

    // Select da Entidade
    const selectEntidade = formDadosPDC.querySelector('#entidade');
    if (data.Entidade?.ID) {
        selectEntidade.value = data.Entidade.ID;
    }

    const selectTipo = formDadosPDC.querySelector('#tipo');
    // Acessando as propriedades corretamente
    const tipoSolicitacaoID = data["Tipo_de_solicitacao.ID"];
    const tipoSolicitacaoDescr = data["Tipo_de_solicitacao.descr_tipo_compra"];

    if (tipoSolicitacaoID) {
        // Verifica se o tipo já existe no select
        const optionExistente = Array.from(selectTipo.options).some(option => option.value === tipoSolicitacaoID);

        // Se não existir, cria uma nova opção
        if (!optionExistente) {
            const novaOpcao = document.createElement('option');
            novaOpcao.value = tipoSolicitacaoID;
            novaOpcao.textContent = tipoSolicitacaoDescr.toUpperCase();
            selectTipo.appendChild(novaOpcao);
        }

        // Seleciona a opção
        selectTipo.value = tipoSolicitacaoID;
    }

    // Descrição da Compra
    const textareaDescricao = formDadosPDC.querySelector('#descricao');
    if (data.Descricao_da_compra) {
        textareaDescricao.value = data.Descricao_da_compra;
    }

    // Utilizaão
    const textareaUtilizacao = formDadosPDC.querySelector('#utilizacao');
    if (data.Utilizacao) {
        textareaUtilizacao.value = data.Utilizacao;
    }

    // Justificativa
    const textareaJustificativa = formDadosPDC.querySelector('#justificativa');
    if (data.Justificativa) {
        textareaJustificativa.value = data.Justificativa;
    }

    // =====[SESSÃO DE FORMAS DE PAGAMENTO]=====//
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de formas de pagamento|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||||||||||");
    const formPagamento = document.querySelector('#form-pagamento');

    // Forma de Pagamento
    if (data.Forma_de_pagamento) {
        const radioFormaPagamento = formPagamento.querySelector(`input[name="Forma_de_pagamento"][value="${data.Forma_de_pagamento}"]`);
        if (radioFormaPagamento) {
            radioFormaPagamento.checked = true;
            mostrarCamposPagamento();
        }
    }

    // Campos específicos para Depósito
    if (data.Forma_de_pagamento === 'Dep. em CC' || data.Forma_de_pagamento === 'Dep. em CP') {
        const inputBanco = formPagamento.querySelector('#banco');
        const inputAgencia = formPagamento.querySelector('#agencia');
        const inputConta = formPagamento.querySelector('#conta');
        const inputFavorecidoDeposito = formPagamento.querySelector('#favorecido-deposito');
        const inputCPF_CNPJ_favorecido = formPagamento.querySelector('#cpf_cnpj_favorecido');
        
        if (data.Banco) inputBanco.value = data.Banco;
        if (data.AG) inputAgencia.value = data.AG;
        if (data.N_Conta) inputConta.value = data.N_Conta;
        if (data.Favorecido) inputFavorecidoDeposito.value = data.Favorecido;
        if (data.CPF_CNPJ_do_favorecido) inputCPF_CNPJ_favorecido.value = data.CPF_CNPJ_do_favorecido;

    }else if(data.Forma_de_pagamento === 'Pix'){
        const inputTipoPix = formPagamento.querySelector('#tipo-pix');
        const inputPixChave = formPagamento.querySelector('#pix-chave');

        if(data.Tipo_de_chave_pix) inputTipoPix.value = data.Tipo_de_chave_pix;
        if(data.Chave_pix) inputPixChave.value = data.Chave_pix;
    }

    // =====[LINHAS DE PARCELAS]=====//

    if (data.Datas && Array.isArray(data.Datas)) {
        if (log) console.log("|||||||||||||||||||||||||||||||||||||||");
        if (log) console.log("|||||Preenchendo dados de parcelas|||||");
        if (log) console.log("|||||||||||||||||||||||||||||||||||||||");
        if (log) console.log("Preenchendo datas de vencimento...");
        const camposData = document.getElementById('camposData');

        // Remove campos existentes
        while (camposData.children[1]) {
            camposData.removeChild(camposData.children[1]);
        }

        // Marca o pagamento antecipado, caso seja true
        if (data.pag_antecipado == "true"){
            const inputPagAntecipado = camposData.querySelector('#pag_antecipado');
            inputPagAntecipado.setAttribute('checked', true);
        }

        // Adiciona campos para cada data
        const qtdParcelas = data.Datas ? data.Datas.length : 0;

        data.Datas.forEach((dataObj, index) => {
            console.log("dataObj => ", dataObj);
            const dataStr = dataObj.Vencimento_previsto || "";
            const valor = dataObj.Valor || "0.0";
            const numPDC = dataObj.Num_PDC_parcela || "";
            const parcCriada = dataObj.parcela_criada || "false";
            const numParc = dataObj.Numero_da_parcela || "";
            
            const data = formatDate(dataStr, "YYYY-MM-DD");
        
            adicionarCampoVenc(data, valor, numPDC, parcCriada, numParc);

        });
    }

    // =====[LINHAS DE NOTAS FISCAIS]=====//
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de notas fiscais|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||||");
    const camposNF = document.querySelector('#linhas-nf');
    if(data.Dados_da_nota_fiscal1)
    {
        const dadosNF = data.Dados_da_nota_fiscal1;
        const linhaNF = camposNF.querySelector('.linha-nf');
        if (linhaNF) {
            camposNF.removeChild(linhaNF);
        }

        dadosNF.forEach(NF => {
            if(log) console.log("NF => ", NF);
            const emissao = formatDate(NF.Data_emissao_N_Fiscal || "", "YYYY-MM-DD");
            const num = NF.Numero_N_Fiscal || "";
            //
            const novaLinhaNF = adicionarLinhaNF();
            novaLinhaNF.querySelector('input[name="Data_emissao_N_Fiscal"]').value = emissao;
            novaLinhaNF.querySelector('input[name="Numero_N_Fiscal"]').value = num;
        })
    }

    // =====[SESSÃO DE RETENÇÕES]=====//
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de retenções|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||");
    const inputInss = document.querySelector('#inss');
    const inputIss = document.querySelector('#iss');
    const inputPisConfinsCssl = document.querySelector('#pis-confins-cssl');
    const inputDescontoComercial = document.querySelector('#desconto-comercial');
    const inputAcrescimo = document.querySelector('#acrescimo');

    if (data.INSS) inputInss.value = formatToBRL_V2(data.INSS);
    if (data.ISS) inputIss.value = formatToBRL_V2(data.ISS);
    if (data.PIS_COFINS_CSSL) inputPisConfinsCssl.value = formatToBRL_V2(data.PIS_COFINS_CSSL);
    if (data.Desconto_comercial_ou_parcela) inputDescontoComercial.value = formatToBRL_V2(data.Desconto_comercial_ou_parcela);
    if (data.Acrescimo_tarifa_bancaria) inputAcrescimo.value = formatToBRL_V2(data.Acrescimo_tarifa_bancaria);

    // Mostra os campos relevantes baseado na forma de pagamento
    const formaPagamentoSelecionada = formPagamento.querySelector('input[name="Forma_de_pagamento"]:checked');
    if (formaPagamentoSelecionada) {
        mostrarCamposPagamento();
    }
    if (log) console.log("|||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de documentos|||||");
    if (log) console.log("|||||||||||||||||||||||||||||||||||||||||");

    if (log) console.log("Anexos encontrados => ", data);
    if (data.Documentos && data.Documentos.length > 0) {
        globais.arquivospPaybox.push(...data.Documentos);
        preencherListaAnexosV2(data.Documentos);
    } else {
        preencherListaAnexosV2();
    }

    //=====[SESSÃO DE ASSINANTES]=====//
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de assinaturas|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||");
    const assinantes = data.Assinaturas ? data.Assinaturas : [];

    function criarAssinante(assinante) {
        const cargo = assinante.Cargo;
        const funcao = assinante.Funcao;
        const usuario = assinante.Usuario;
        const email = assinante.E_mail_usuario;
        const ip = assinante.IP;
        const dataAssinatura = assinante.Data_da_assinatura;
        const assinado = assinante.Assinado;

        const elementAssinante = document.createElement('div');
        elementAssinante.classList.add('assinante');

        //=====CARGO=====\\
        const inputCargo = document.createElement('input');
        inputCargo.classList.add('input-assinante');
        inputCargo.type = 'text';
        inputCargo.name = 'Cargo';
        inputCargo.value = cargo || "";
        elementAssinante.appendChild(inputCargo);

        //=====FUNCAO=====\\
        const inputFuncao = document.createElement('input');
        inputFuncao.classList.add('input-assinante');
        inputFuncao.type = 'text';
        inputFuncao.name = 'Funcao';
        inputFuncao.value = funcao || "";
        elementAssinante.appendChild(inputFuncao);

        //=====USUARIO=====\\
        const inputUsuario = document.createElement('input');
        inputUsuario.classList.add('input-assinante');
        inputUsuario.type = 'text';
        inputUsuario.name = 'Usuario';
        inputUsuario.value = usuario || "";
        elementAssinante.appendChild(inputUsuario);

        //=====EMAIL USUARIO=====\\
        const inputEmailUsuario = document.createElement('input');
        inputEmailUsuario.classList.add('input-assinante');
        inputEmailUsuario.type = 'email';
        inputEmailUsuario.name = 'E_mail_usuario';
        inputEmailUsuario.value = email || "";
        elementAssinante.appendChild(inputEmailUsuario);

        //=====IP=====\\
        const inputIP = document.createElement('input');
        inputIP.classList.add('input-assinante');
        inputIP.type = 'text';
        inputIP.name = 'IP';
        inputIP.value = ip || "";
        elementAssinante.appendChild(inputIP);

        //=====DATA ASSINATURA=====\\
        const inputDataAssinatura = document.createElement('input');
        inputDataAssinatura.classList.add('input-assinante');
        inputDataAssinatura.type = 'datetime-local';
        inputDataAssinatura.name = 'Data_da_assinatura';

        if (dataAssinatura) {
            const dataUTC = moment(dataAssinatura, 'DD/MM/YYYY HH:mm:ss').local();
            const segundos = dataUTC.seconds();
            if (segundos === 0) {
                dataUTC.add(1, 'second');
            }
            inputDataAssinatura.value = dataUTC.format('YYYY-MM-DDTHH:mm:ss');
        } else {
        inputDataAssinatura.value = ''; // ou algum valor padrão que você queira
        }

        elementAssinante.appendChild(inputDataAssinatura);

        //=====ASSINADO=====\\
        const inputAssinado = document.createElement('input');
        inputAssinado.classList.add('input-assinante');
        inputAssinado.type = 'checkbox';
        inputAssinado.name = 'Assinado';
        inputAssinado.checked = assinado === "true";
        elementAssinante.appendChild(inputAssinado);

        return elementAssinante;
    }

    if (assinantes.length > 0) {

        const formAssinantes = document.querySelector('form[id="form-assinatura"]').querySelector('div[id="campos-assinatura"]');

        const elementAssinantes = document.createElement('div');
        elementAssinantes.classList.add('assinantes');

        assinantes.forEach((assinante, index) => {
            const elementAssinante = criarAssinante(assinante);
            elementAssinantes.appendChild(elementAssinante);
        });
        
        formAssinantes.insertBefore(elementAssinantes, formAssinantes.querySelector('div[id="botoes"]'));
    }

    //====================CAMPO DE APOIO, VALOR ORÇADO====================//
    globais.valor_orcado = data.Valor_orcado;
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Preenchendo dados de classificação|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||||||||||");
    if(data.Classificacao_contabil)
    {
        preencherDadosClassificacao(data.Classificacao_contabil);

    }
    if (log) console.log("||||||||||||||||||||||||||||||||||||");
    if (log) console.log("|||||Calculando todos os totais|||||");
    if (log) console.log("||||||||||||||||||||||||||||||||||||");
    atualizarValorOriginal();
    calcularValorTotalPagar();
    atualizarValorOrcado();
}

//==============================================================================//
//====================FUNÇÕES PARA TRATAR CAMPOS DE PARCELAS====================//
//==============================================================================//
/**
 * Adiciona um campo de data para parcelas de pagamento
 * 
 * @function adicionarCampoVenc
 * @returns {void}
 * 
 * @description
 * - Cria um novo campo de data para parcelas de pagamento
 */
export function adicionarCampoVenc(data = null, valor = null, numPDC = null, parcCriada = null, numParcela =  null) {
    const log = false;
    if(log) console.log("++++++++++ADICIONANDO LINHAS DE PARCELAS++++++++++");

    if(numParcela !== 1) numeroParcela++;
    if(log) console.log("numParcela => ", numParcela);
    if(log) console.log("data => ", data);
    if(log) console.log("valor => ", valor);
    if(log) console.log("numPDC => ", numPDC);
    if(log) console.log("parcCriada => ", parcCriada);
    if(log) console.log("numParcela => ", numParcela);

    //====================CRIA UM NOVO CONTAINER PARA O CAMPO DE DATA E O BOTÃO DE REMOVER====================//
    const novoCampo = document.createElement('div');
    novoCampo.classList.add('parcela');

    //====================CRIA O RÓTULO PARA O CAMPO DE DATA====================//
    const novoLabel = document.createElement('label');
    novoLabel.innerText = `Parcela nº ${numParcela === null?numeroParcela:numParcela}:`;
    if(numParcela !== null && numParcelaInicial === null) numParcelaInicial = parseInt(numParcela);

    //====================CRIA O CAMPO DE DATA====================//
    const novoInput = document.createElement('input');
    novoInput.type = 'date';
    novoInput.name = 'Datas';
    if (data) novoInput.value = data;

    //====================CRIA O CAMPO DE VALOR====================//
    const novoInputValor = document.createElement('input');
    novoInputValor.type = 'text';
    novoInputValor.name = 'Valor';
    novoInputValor.classList.add('input-number', 'valor-parcela');
    novoInputValor.placeholder = 'R$ 0,00';
    if (valor) novoInputValor.value = formatToBRL_V2(valor);
    novoInputValor.addEventListener('blur', () => {
        formatToBRL_V2(novoInputValor);
        atualizarValorTotalParcelas();
    });

    //====================CRIA UM CAMPO DE NÚMERO DO PDC====================//
    let novoInputNumPDC;
    if (numPDC) {
        const camposParcelas = document.querySelectorAll('.parcela');
        const numPDCInput = camposParcelas.length > 0 ? camposParcelas[0].querySelector('input[name="Num_PDC_parcela"]') : null;

        novoInputNumPDC = document.createElement('input');
        novoInputNumPDC.type = 'text';
        novoInputNumPDC.name = 'Num_PDC_parcela';
        novoInputNumPDC.classList.add('campo-datas', "num-pdc");
        // Verifica se numPDC já possui a parte /NN
        novoInputNumPDC.value = numPDC;

        novoInputNumPDC.addEventListener('change', () => {
            /*Verifica se o numero do PDC possui o / , caso possua, verifica a quantidade de caracteres depois da barra, caso tenha apenas 1 caractere, adiciona um zero a esquerda*/
            if (novoInputNumPDC.value.includes('/')) {
                const partes = novoInputNumPDC.value.split('/');
                if (partes[1].length === 1) {
                    novoInputNumPDC.value = `${partes[0]}/${partes[1].padStart(2, '0')}`;
                }
            }
        })
    }

    //====================CRIA UM CAMPO DE PARCELA CRIADA (BOOLEAN)====================//
    const novoInputParcelaCriada = document.createElement('input');
    novoInputParcelaCriada.type = 'checkbox';
    novoInputParcelaCriada.name = 'parcela_criada';
    novoInputParcelaCriada.classList.add('campo-datas', 'hidden');
    if(parcCriada == 'true') novoInputParcelaCriada.setAttribute('checked', 'checked');

    //====================CRIA O BOTÃO DE REMOVER====================//
    const removerButton = document.createElement('button');
    removerButton.type = 'button';
    removerButton.classList.add('remover-parcela', 'close-icon', 'remove-btn');

    //====================ADICIONA A FUNÇÃO DE REMOVER AO BOTÃO DE REMOVER====================//
    removerButton.addEventListener('click', function () {
        removerCampoVenc(this);
    });
    //====================ADICIONA O CAMPO DE DATA, O RÓTULO E O BOTÃO DE REMOVER AO CONTAINER====================//
    novoCampo.appendChild(novoLabel);
    novoCampo.appendChild(novoInput);
    novoCampo.appendChild(novoInputValor);
    if (novoInputNumPDC) novoCampo.appendChild(novoInputNumPDC);
    novoCampo.appendChild(novoInputParcelaCriada);
    novoCampo.appendChild(removerButton);

    //====================ADICIONA O NOVO CAMPO AO CONTAINER DE CAMPOS====================//
    document.getElementById('camposData').appendChild(novoCampo);

    //====================ATUALIZA OS RÓTULOS DE PARCELA PARA MANTER A SEQUÊNCIA CORRETA====================//
    atualizarLabels();
    if(log) console.log("----------LINHA DE PARCELA CRIADA----------");
}

/**
 * Adiciona um campo de data para parcelas de pagamento
 * 
 * @function adicionarCampoVenc
 * @returns {void}
 * 
 * @description
 * - Cria um novo campo de data para parcelas de pagamento
 */
export function removerCampoVenc(elemento) {
    const log = false;
    if(log) console.log("++++++++++REMOVENDO LINHA DE PARCELA++++++++++");
    const parentElement = elemento.parentElement;
    const parentClass = parentElement.className;
    if(log) console.log("parentElement => ", parentElement);
    if(log) console.log("parentClass => ", parentClass);

    const elementosSimilares = document.getElementsByClassName(parentClass);
    if(log) console.log("elementosSimilares => ", elementosSimilares);
    if(log) console.log("elementosSimilares.length => ", elementosSimilares.length);

    if (elementosSimilares.length > 1) {
        if(log) console.log("----------LINHA DE PARCELA REMOVIDA----------");

        parentElement.remove();
        numeroParcela--;

        atualizarLabels();
        atualizarValorTotalParcelas();
        return;
    }
    if(log) console.log("----------LINHA NÃO PODE SER REMOVIDA POR SER A ÚLTIMA----------");
}

/**
 * Atualiza os rótulos das parcelas para manter a sequência correta
 * 
 * @function atualizarLabels
 * @returns {void}
 * 
 * @description
 * Esta função:
 * - Busca todas as parcelas existentes no container de campos de data
 * - Atualiza o texto do rótulo de cada parcela para manter a numeração sequencial
 * - Garante que as parcelas sejam numeradas de 1 até N, onde N é o total de parcelas
 */
function atualizarLabels() {
    const parcelas = document.querySelectorAll('#camposData .parcela');
    parcelas.forEach((parcela, index) => {
        //let newNumParc = numeroParcela + index - 1;
        parcela.querySelector('label').innerText = `Parcela nº ${(numParcelaInicial !== null?numParcelaInicial:1) + index}:`;
    });
}

//============================================================================================\\
//====================FUNÇÕES PARA TRATAR CAMPOS DE CLASSIFICAÇÃO CONTÁBIL====================\\
//============================================================================================\\

export function adicionarLinhaClassificacao() {

    const log = false;
    if(log) console.log("++++++++++ADICIONANDO LINHA DE CLASSIFICAÇÃO++++++++++");

    const classFields = document.getElementById('camposClassificacao');

    //====================Cria uma nova linha de classificação====================\\
    const newRowClass = document.createElement('div');
    newRowClass.classList.add('linha-classificacao');

    //====================Classe para criar campos de classificação====================\\
    class ClassContField {
        constructor({ placeholder = null, inputType, inputName, id = null, class_name = null, options = null }) {
            this.inputType = inputType;
            this.inputName = inputName;
            this.id = id;
            this.class_name = class_name;
            this.options = options;
            this.placeholder = placeholder;
        }

        create() {
            //==========Criando o container geral do campo==========//
            const field = document.createElement('div');
            field.id = this.id;
            field.classList.add('campo', 'dp-field-master-container', this.class_name);

            const input = document.createElement('input');
            input.type = this.inputType;
            input.name = this.inputName;
            input.classList.add('dp-field-input');
            input.placeholder = this.placeholder || 'Selecione...';

            field.appendChild(input);

            function optFilter(inputField, optContainer) {
                const filter = inputField.value.toUpperCase();

                const options = optContainer.querySelectorAll('.dropdown-opcao');
                options.forEach((option) => {
                    const txtValue = option.textContent || option.innerText;
                    if (txtValue.toUpperCase().indexOf(filter) > -1) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                });
            }

            //==========Criando o campo de pesquisa e as opções==========//
            if (this.inputType === 'select') {

                input.classList.add('dp-field-sel-btn');

                //=====Criando o container das opções + pesquisa=====//
                const optContainer = document.createElement('div');
                optContainer.style.display = 'none';
                optContainer.classList.add('dp-field-opt-container');
                field.appendChild(optContainer);

                input.addEventListener('blur', () => {
                    const valorDigitado = input.value;
                    const opcoes = this.options.map(([value, text]) => text);
                    if (!opcoes.includes(valorDigitado)) {
                        input.value = '';
                        // Adiciona um atraso de 100ms antes de restaurar a visibilidade das opções
                        setTimeout(() => {
                            const optContainer = field.querySelector('.dp-field-opt-container');
                            const options = optContainer.querySelectorAll('.dropdown-opcao');
                            options.forEach((option) => {
                                option.style.display = '';
                            });
                        }, 100);
                    }else{
                        const opcaoFinal = this.options.find(([value, text]) => text === valorDigitado);
                        input.dataset.id_opcao = opcaoFinal[0];
                        optContainer.style.display = 'none';
                    }
                });

                //=====Adicionando evento para alterar visualização container das opções + pesquisa=====//
                input.addEventListener('click', () => {
                    optContainer.style.display = 'block';
                });

                input.addEventListener('input', () => {
                    optFilter(input, optContainer);
                })

                document.addEventListener('click', (ev) => {
                    if (!optContainer.contains(ev.target) && !input.contains(ev.target)) {
                        optContainer.style.display = 'none';
                    }
                });
                //Criando o restante das opções//
                this.options.forEach(([value, text]) => {
                    const option = document.createElement('div');
                    
                    option.classList.add(`option-${this.inputName}`, 'dropdown-opcao');
                    option.textContent = text;
                    option.dataset.id_opcao = value;
                    optContainer.appendChild(option);

                    option.onclick = (ev) => {
                        const trgt = ev.target;
                        input.value = trgt.textContent;
                        input.dataset.id_opcao = trgt.dataset.id_opcao;
                        optContainer.style.display = 'none';
                    }
                });
            } else {
                if (this.inputType === 'number') {
                    input.classList.add('input-number');
                    input.type = 'text';
                    input.name = this.inputName;
                    input.addEventListener('blur', () => { formatToBRL_V2(input); atualizarValorTotalClassificacoes(); });
                }
            }
            return field;
        }
    }

    //====================Buscando bases de classificação====================\\
    const accOptions = [
        ['ORDINARIA', 'ORDINARIA'],
        ['FUNDO DE RESERVA', 'FUNDO DE RESERVA'],
        ['FUNDO DE INVESTIMENTO', 'FUNDO DE INVESTIMENTO'],
        ['TAXA DE BENFEITORIAS', 'TAXA DE BENFEITORIAS'],
        ['TAXA EXTRA - SEGURANÇA', 'TAXA EXTRA - SEGURANÇA'],
        ['FUNDO TRABALHISTA', 'FUNDO TRABALHISTA'],
        ['OBRAS', 'OBRAS'],
        ['RESGATE/APLICAÇÃO', 'RESGATE/APLICAÇÃO'],
        ['EVENTOS', 'EVENTOS'],
        ['ACADEMIA', 'ACADEMIA'],
        ['BAGS', 'BAGS']
    ];

    
    const opClassOpt = Array.from(globais.baseClassesOperacionais.entries()).map(([id, dados]) => [
        id,
        `${dados.contaReduzida} - ${dados.nomeClasse} - ${dados.codigoClasse}`
    ]);
    const accCenterOpt = Array.from(globais.baseCentrosCusto.entries()).map(([id, dados]) => [
        id,
        `${dados.codigoCentro} - ${dados.nomeCentro}`
    ]);

    const fieldsToCreate = [
        { placeholder: 'Conta...', inputType: 'select', inputName: 'Conta_a_debitar', id: 'conta', options: accOptions },
        { placeholder: 'Centro Custo...', inputType: 'select', inputName: 'Centro_de_custo', id: 'centro', class_name: 'hidden',options: accCenterOpt },
        { placeholder: 'Classe Op...', inputType: 'select', inputName: 'Classe_operacional', id: 'classe', options: opClassOpt },
        { placeholder: 'R$ 0,00', inputType: 'number', inputName: 'Valor', id: 'valor' }
    ];

    fieldsToCreate.forEach((field) => {
        newRowClass.appendChild(new ClassContField({ placeholder: field.placeholder, inputType: field.inputType, inputName: field.inputName, id: field.id, class_name: field.class_name || null,options: field.options }).create());
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.classList.add('remover-classificacao', 'close-icon', 'remove-btn', 'transl-because-title');
    
    removeBtn.addEventListener('click', () => removerLinhaClassificacao(removeBtn));

    newRowClass.appendChild(removeBtn);
    classFields.appendChild(newRowClass);
    if(log) console.log("----------LINHA DE CLASSIFICAÇÃO ADICIONADA----------");
}

/**
 * Remove uma linha de classificação contábil
 * 
 * @function removerLinhaClassificacao
 * @param {HTMLElement} botao - O botão de remoção que foi clicado
 * @returns {void}
 * 
 * @description
 * - Verifica se existe mais de uma linha antes de permitir a remoção
 * - Remove a linha de classificação contábil correspondente ao botão clicado
 */
export function removerLinhaClassificacao(botao) {
    // Busca o form pai mais próximo
    const formPai = botao.closest('form');

    // Busca todas as linhas de classificão dentro deste form específico
    const linhas = formPai.getElementsByClassName('linha-classificacao');

    // Impede a remoção se houver apenas uma linha
    if (linhas.length <= 1) {
        return;
    }

    // Remove a linha específica
    const linhaAtual = botao.closest('.linha-classificacao');
    linhaAtual.remove();
}

//===================================================================================//
//====================PREENCHE OS DADOS DE CLASSIFICAÇÃO CONTÁBIL====================//
//===================================================================================//
function preencherDadosClassificacao(classificacoes) {
    const log = true;
    if(log) console.log("++++++++++PREENCHENDO DADOS DE CLASSIFICAÇÃO++++++++++");
    if(log) console.log("classificacoes => ", JSON.stringify(classificacoes));
    const formClassificacao = document.querySelector('#form-classificacao');

    // Limpa as linhas existentes
    formClassificacao.querySelectorAll('.linha-classificacao').forEach(linha => {
        linha.remove();
    });

    // Para cada classificação, cria uma nova linha
    classificacoes.forEach(classificacao => {
        // Extrai os valores do display_value
        if(log) console.log("classificacao => ", classificacao);
        const conta = classificacao.Conta_a_debitar || "";
        const centro = classificacao.Centro_de_custo.Codigo || "";
        const classe = classificacao.Classe_operacional.Codigo || "";
        const valor = classificacao.Valor || "";
        const id = classificacao.ID || "";

        if(log) console.log("conta => ", conta);
        if(log) console.log("centro => ", centro);
        if(log) console.log("classe => ", classe);
        if(log) console.log("valor => ", valor);
        if(log) console.log("id => ", id);
        //const [conta, centro, classe, valor, id] = classificacao.display_value.split('|SPLITKEY|');

        // Adiciona uma nova linha
        adicionarLinhaClassificacao();

        // Pega a última linha adicionada
        const ultimaLinha = formClassificacao.querySelector('.linha-classificacao:last-child');

        // Preenche os campos
        const selectConta = ultimaLinha.querySelector('.dp-field-input[name="Conta_a_debitar"]');
        const selectCentro = ultimaLinha.querySelector('.dp-field-input[name="Centro_de_custo"]');
        const selectClasse = ultimaLinha.querySelector('.dp-field-input[name="Classe_operacional"]');
        const inputValor = ultimaLinha.querySelector('input[name="Valor"]');

        // Extrai apenas o código antes do hífen para fazer o match
        const codigoClasse = classe.split(' - ')[0].trim();
        const codigoCentro = centro.split(' - ')[0].trim();

        // Encontra e seleciona a opção correta em cada select
        Array.from(selectCentro.parentNode.querySelectorAll('.dropdown-opcao')).forEach(option => {
            if (option.textContent.startsWith(codigoCentro) && codigoCentro !== '') {
                option.click();
            }
        });

        Array.from(selectClasse.parentNode.querySelectorAll('.dropdown-opcao')).forEach(option => {
            if (option.textContent.endsWith(codigoClasse) && codigoClasse !== '') {
                option.click();
            }
        });

        // Adiciona seleção da conta a debitar
        Array.from(selectConta.parentNode.querySelectorAll('.dropdown-opcao') ).forEach(option => {
            if (option.textContent === conta.trim() && conta !== '') {
                option.click();
            }
        });

        // Formata e define o valor
        inputValor.value = formatToBRL_V2({ target: { value: valor } });
        inputValor.dataset.valor_original = formatToBRL_V2({ target: { value: valor } });
    });
}

/**
 * Inicializa o formulário de classificação após carregar os dados
 * 
 * @function initClassificacaoForm
 * @param {Map} classificacoes - Map contendo as classificações operacionais
 * @param {Map} centrosCusto - Map contendo os centros de custo
 * @returns {void}
 */
export function initClassificacaoForm(classificacoes, centrosCusto) {

    // Oculta mensagem de carregamento
    const loadingMessage = document.getElementById('loading-classificacao');
    loadingMessage.style.display = 'none';

    // Mostra o formulário
    const form = document.getElementById('form-classificacao');
    // Adiciona ouvinte para formatar o campo valor como moeda brasileira
    const camposValor = form.querySelectorAll('input[name="Valor"]');
    camposValor.forEach(campo => {
        campo.type = 'text';
        campo.addEventListener('blur', function () {
            formatToBRL_V2(this);
        });
    });

    // Adiciona ouvinte para formatar o campo valor como moeda brasileira
    form.style.display = 'block';

    // Popula os selects
    popularSelects(classificacoes, centrosCusto);

    // Mostra o primeiro conjunto de campos de classificação
    const camposClassificacao = document.getElementById('camposClassificacao');
    camposClassificacao.classList.remove('hidden');
}

/**
 * Popula os selects de classificação contábil e centro de custo
 * 
 * @function popularSelects
 * @param {Map} classificacoes - Map contendo as classificações operacionais
 * @param {Map} centrosCusto - Map contendo os centros de custo
 * @returns {void}
 */
export function popularSelects(classificacoes, centrosCusto) {
    // Busca todos os conjuntos de selects dentro do form-classificacao
    const classificacaoForm = document.getElementById('form-classificacao');
    const todasClassificacoes = classificacaoForm.querySelectorAll('.linha-classificacao');

    todasClassificacoes.forEach(container => {
        // Seleciona os selects dentro de cada container de classificação
        const selectCentro = container.querySelector('select[name="Centro_de_custo"]');
        const selectClassificacao = container.querySelector('select[name="Classe_operacional"]');

        // Popula select de centros de custo
        if (selectCentro) {
            selectCentro.innerHTML = '<option value="" disabled selected>Selecione...</option>';
            centrosCusto.forEach((dados, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `${dados.codigoCentro} - ${dados.nomeCentro}`;
                selectCentro.appendChild(option);
            });
        }

        // Popula select de classificações
        if (selectClassificacao) {
            selectClassificacao.innerHTML = '<option value="" disabled selected>Selecione...</option>';
            classificacoes.forEach((dados, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `${dados.codigoClasse} - ${dados.nomeClasse}`;
                selectClassificacao.appendChild(option);
            });
        }
    });
}

function preencherLinhaInicialClassificacao() {
    const log = true;
    if (log) console.log("++++++++++PREENCHENDO LINHA INICIAL DE CLASSIFICAÇÃO++++++++++");

    let linhasClassificacao = document.querySelectorAll('#form-classificacao .linha-classificacao');
    const valorInput = linhasClassificacao?.[0]?.querySelector('input[name="Valor"]');
    if(log) console.log("linhasClassificacao.length => ", linhasClassificacao?.length);
    if(log) console.log("valorInput => ", valorInput);
    if (linhasClassificacao?.length > 1) {
        return;
    }else if(linhasClassificacao?.length === 0) {
        adicionarLinhaClassificacao();
        linhasClassificacao = document.querySelectorAll('#form-classificacao .linha-classificacao');
    }

    const valorTotalGeral = converterStringParaDecimal(document.getElementById("valor-total-pagar").innerText, 2);
    if(log) console.log("valorTotalGeral => ", valorTotalGeral);
    if(log) console.log("globais.valor_orcado => ", globais.valor_orcado);

    let total = 0;
    if(valorTotalGeral > 0)
    {
        total = converterStringParaDecimal(valorTotalGeral, 2);

    }else{
        total = globais.valor_orcado;
        
    }
    //Adiciona valor de fornecedor aprovado na linha de classificação
    if (globais.idFornAprovado && valorInput.value == "") {
        if (log) console.log("Fornecedor aprovado, preenchendo valor na linha de classificação");
        valorInput.value = formatToBRL_V2(total);
    }
}

/**
 * Atualiza o valor total das classificações contábeis sempre que um campo de valor é alterado
 * 
 * @function atualizarValorTotalClassificacoes
 * @returns {void}
 */
export function atualizarValorTotalClassificacoes() {
    const log = false;
    if (log) console.log("++++++++++ATUALIZANDO VALOR TOTAL DAS CLASSIFICAÇÕES++++++++++");

    const labelTotal = document.getElementById('valor-total-classificacoes');
    const valorTotalGeral = converterStringParaDecimal(document.getElementById("valor-total-pagar").innerText, 2);
    if(log) console.log("valorTotalGeral => ", valorTotalGeral);
    if(log) console.log("globais.valor_orcado => ", globais.valor_orcado);
    if(log) console.log("globais.idFornAprovado => ", globais.idFornAprovado);

    let total = 0;
    if (globais.idFornAprovado) {
        if (log) console.log("Novo fornecedor selecionado");
        const table = document.getElementById('priceTable');
        const headerRow = table.rows[0];
        const totalRow = table.rows[table.rows.length - 2];

        const colIndex = Array.from(headerRow.cells).findIndex(cell => cell.dataset.id_forn === globais.idFornAprovado);

        if(log) console.log("colIndex => ", colIndex);
        if (colIndex !== -1) {

            const valorTotalFornecedor = totalRow.cells[colIndex - 2].innerText;
            if(valorTotalGeral > 0)
            {
                total = converterStringParaDecimal(valorTotalGeral, 2);

            }else{
                total = converterStringParaDecimal(valorTotalFornecedor, 2);

            }
            if(log) console.log("valorTotalFornecedor => ", valorTotalFornecedor);
            if(log) console.log("total => ", total);

            const valoresClassificacoes = document.querySelectorAll('#form-classificacao input[name="Valor"]');
            if(valoresClassificacoes.length == 1)
            {
                preencherLinhaInicialClassificacao();
            }
            
            valoresClassificacoes.forEach(input => {
                const valor = converterStringParaDecimal(input.value).toFixed(2) || 0;
                total -= valor; // Reduz o valor da classificação do total
                total = parseFloat(total).toFixed(2); // Converte total para número antes de usar toFixed
            });
            if(log) console.log("total - valoresClassificacoes => ", total);

            labelTotal.innerText = formatToBRL_V2(total);

            if (total == 0) {
                labelTotal.classList.add('valor-igual');
                labelTotal.classList.remove('valor-diferente');
            } else {
                labelTotal.classList.add('valor-diferente');
                labelTotal.classList.remove('valor-igual');
            }
        } else {
            labelTotal.innerText = "-";
            labelTotal.classList.add('valor-diferente');
            labelTotal.classList.remove('valor-igual');
        }
    } else if(globais.valor_orcado)
    {   
        if(log) console.log("Fornecedor já aprovado");
        if(valorTotalGeral > 0)
        {
            total = converterStringParaDecimal(valorTotalGeral, 2);

        }else{
            total = globais.valor_orcado;
            
        }

        const valoresClassificacoes = document.querySelectorAll('#form-classificacao input[name="Valor"]');
        valoresClassificacoes.forEach(input => {

            const valor = converterStringParaDecimal(input.value).toFixed(2) || 0;
            total -= valor; // Reduz o valor da classificação do total
            total = parseFloat(total).toFixed(2); // Converte total para número antes de usar toFixed

        });

        labelTotal.innerText = formatToBRL_V2(total);

        labelTotal.classList.remove(['valor-igual','valor-diferente']);
        labelTotal.classList.add(total == 0 ?'valor-igual':'valor-diferente');

    }else {
        labelTotal.innerText = "-";
        labelTotal.classList.add('valor-diferente');
        labelTotal.classList.remove('valor-igual');
    }
}

//===============================================================//
//====================OUTRAS FUNÇÕES DE APOIO====================//
//===============================================================//

export function setupPixValidation() {
    const tipoPix = document.getElementById('tipo-pix');
    const chavePix = document.getElementById('pix-chave');

    // Cria elemento para mensagem de erro
    const errorMessage = document.createElement('span');
    errorMessage.classList.add('error-message');
    errorMessage.style.color = 'red';
    errorMessage.style.fontSize = '12px';
    errorMessage.style.display = 'none';
    chavePix.parentNode.appendChild(errorMessage);

    const formatacoes = {
        CPF: {
            mascara: (valor) => {
                valor = valor.replace(/\D/g, '');
                return valor.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            },
            validacao: /^[0-9.-]*$/,
            validacaoCompleta: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
            maxLength: 14,
            mensagemErro: 'CPF inválido. Use o formato: 123.456.789-00'
        },
        CNPJ: {
            mascara: (valor) => {
                valor = valor.replace(/\D/g, '');
                return valor.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
            },
            validacao: /^[0-9./-]*$/,
            validacaoCompleta: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
            maxLength: 18,
            mensagemErro: 'CNPJ inválido. Use o formato: 12.345.678/0001-90'
        },
        Email: {
            mascara: (valor) => valor,
            validacao: /^[a-zA-Z0-9@._-]*$/,
            validacaoCompleta: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            maxLength: 100,
            mensagemErro: 'E-mail inválido. Use um formato válido: exemplo@dominio.com'
        },
        Telefone: {
            mascara: (valor) => {
                valor = valor.replace(/\D/g, '');
                return valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
            },
            validacao: /^[0-9() -]*$/,
            validacaoCompleta: /^\(\d{2}\) \d{5}-\d{4}$/,
            maxLength: 15,
            mensagemErro: 'Telefone inválido. Use o formato: (24) 98765-4321'
        },
        'Chave Aleatória': {
            mascara: (valor) => valor,
            validacao: /^[a-zA-Z0-9-]*$/,
            validacaoCompleta: /^[a-zA-Z0-9-]*$/,
            maxLength: 256,
            mensagemErro: 'Chave aleatória inválida!'
        }
    };

    tipoPix.addEventListener('change', () => {
        const tipo = tipoPix.value;
        chavePix.value = '';
        chavePix.maxLength = formatacoes[tipo].maxLength;
        errorMessage.style.display = 'none';
        chavePix.classList.remove('invalid');
    });

    /*
    chavePix.addEventListener('input', (e) => {
        const tipo = tipoPix.value;
        let valor = e.target.value;

        if (!formatacoes[tipo].validacao.test(valor)) {
            valor = valor.slice(0, -1);
        }

        e.target.value = formatacoes[tipo].mascara(valor);
    });

    // Adiciona validação no blur (quando o campo perde o foco)
    chavePix.addEventListener('blur', (e) => {
        const tipo = tipoPix.value;
        const valor = e.target.value;

        if (valor && !formatacoes[tipo].validacaoCompleta.test(valor)) {
            errorMessage.textContent = formatacoes[tipo].mensagemErro;
            errorMessage.style.display = 'block';
            chavePix.classList.add('invalid');
        } else {
            errorMessage.style.display = 'none';
            chavePix.classList.remove('invalid');
        }
    });
    */

}


export function atualizarValorOrcado()
{
    const log = false;

    if(log) console.log("++++++++++ATUALIZANDO VALOR ORÇADO++++++++++");
    const table = document.getElementById('priceTable');
    const headerRow = table.rows[0]; // Primeira linha do cabeçalho
    const totalRow = table.rows[table.rows.length - 2]; // Última linha (linha de total)

    if (globais.idFornAprovado) {
        const colIndex = Array.from(headerRow.cells).findIndex(cell => cell.dataset.id_forn === globais.idFornAprovado); // Encontra o índice da coluna do fornecedor aprovado

        if (colIndex !== -1) {
            // Obtém o valor total do fornecedor na linha de total
            const valorTotalFornecedor = totalRow.cells[colIndex - 2].innerText; // +1 para pegar a célula correta

            globais.valor_orcado = converterStringParaDecimal(valorTotalFornecedor).toFixed(2) || 0; // Inicializa o total com o valor do fornecedor aprovado
        } else {
            
            globais.valor_orcado = 0;
        }
    } else {
        globais.valor_orcado = 0;
    }
}

/**
 * Atualiza o valor total das parcelas sempre que um campo de valor é alterado
 * 
 * @function atualizarValorTotalParcelas
 * @returns {void}
 * 
 * @description
 * Esta função:
 * - Obtém a tabela de preços e a linha de total
 * - Verifica se um fornecedor aprovado está definido
 * - Se sim, encontra o índice da coluna correspondente ao fornecedor
 * - Calcula o total subtraindo os valores das parcelas do valor total do fornecedor
 * - Atualiza o rótulo do total com o valor formatado
 * - Adiciona classes CSS para indicar se o total é igual ou diferente do esperado
 */
export function atualizarValorTotalParcelas() {
    const log = false;
    if(log) console.log("++++++++++ATUALIZANDO VALOR TOTAL DAS PARCELAS++++++++++");
    const valorTotalGeral = converterStringParaDecimal(document.getElementById('valor-total-pagar').innerText, 2);

    const table = document.getElementById('priceTable');
    const headerRow = table.rows[0]; // Primeira linha do cabeçalho
    const totalRow = table.rows[table.rows.length - 2]; // Última linha (linha de total)

    const labelTotal = document.getElementById('valor-total-parcelas');
    let total = 0;
    if (globais.idFornAprovado && !globais.valor_orcado) {
        const colIndex = Array.from(headerRow.cells).findIndex(cell => cell.dataset.id_forn === globais.idFornAprovado); // Encontra o índice da coluna do fornecedor aprovado

        if (colIndex !== -1) {
            // Obtém o valor total do fornecedor na linha de total
            const valorTotalFornecedor = totalRow.cells[colIndex - 2].innerText; // +1 para pegar a célula correta

            const valoresParcelas = document.querySelectorAll('#camposData input[name="Valor"]');
            
            
            if(valorTotalGeral > 0)
            {
                total = valorTotalGeral;

            }else
            {
                total = converterStringParaDecimal(valorTotalFornecedor,2); // Inicializa o total com o valor do fornecedor aprovado

            }
                
            valoresParcelas.forEach(input => {
                const valor = converterStringParaDecimal(input.value, 2);
                total -= valor; // Reduz o valor da parcela do total
            });
            labelTotal.innerText = formatToBRL_V2(total, 2);

            // Compara os valores
            if (total == 0) {
                labelTotal.classList.add('valor-igual');
                labelTotal.classList.remove('valor-diferente');
            } else {
                labelTotal.classList.add('valor-diferente');
                labelTotal.classList.remove('valor-igual');
            }
        } else {
            //DEIXA ZERADO
            labelTotal.innerText = "-";
            labelTotal.classList.add('valor-diferente');
            labelTotal.classList.remove('valor-igual');

        }
    } else if(globais.valor_orcado)
    {   
        if(valorTotalGeral > 0)
        {
            total = valorTotalGeral;
        }else 
        {
            total = globais.valor_orcado;
            
        }

        const valoresParcelas = document.querySelectorAll('#camposData input[name="Valor"]');
        valoresParcelas.forEach(input => {
            const valor = converterStringParaDecimal(input.value).toFixed(2) || 0;
            total -= valor; // Reduz o valor da parcela do total
            total = total.toFixed(2);
        });
        labelTotal.innerText = formatToBRL_V2(total);

        // Compara os valores
        if (total == 0) {
            labelTotal.classList.add('valor-igual');
            labelTotal.classList.remove('valor-diferente');
        } else {
            labelTotal.classList.add('valor-diferente');
            labelTotal.classList.remove('valor-igual');
        }

    } else {
        labelTotal.innerText = "-";
        labelTotal.classList.add('valor-diferente');
        labelTotal.classList.remove('valor-igual');
    }
}

//=========================================================//
//====================DADOS DE RETENÇÃO====================//
//=========================================================//
// Função para atualizar o valor original com o total do fornecedor aprovado
export function atualizarValorOriginal() {
    const table = document.getElementById('priceTable');
    const headerRow = table.rows[0]; // Primeira linha do cabeçalho
    const totalRow = table.rows[table.rows.length - 2]; // Última linha (linha de total)
    const colIndex = Array.from(headerRow.cells).findIndex(cell => cell.dataset.id_forn === globais.idFornAprovado); // Encontra o índice da coluna do fornecedor aprovado

    const totalFornecedor = totalRow.cells[colIndex - 2]?.innerText || 0;

    const valorOriginalCell = document.getElementById('valor-original');
    valorOriginalCell.innerText = formatToBRL_V2(totalFornecedor);
}

// Função para calcular o valor total a pagar com base nos descontos
export function calcularValorTotalPagar() {
    const valorOriginal = converterStringParaDecimal(document.getElementById('valor-original').innerText) || 0;
    const descontoCells = document.querySelectorAll('.campos-ret-desc'); // Selecione os inputs de desconto
    let totalDescontos = 0;

    descontoCells.forEach(cell => {
        totalDescontos += converterStringParaDecimal(cell.value) || 0; // Acesse o valor do input
    });

    // Atualiza o valor total de descontos no campo "campos-ret-total-desc"
    const totalDescElements = document.getElementsByClassName('campos-ret-total-desc');
    if (totalDescElements.length > 0) {
        totalDescElements[0].innerText = formatToBRL_V2(totalDescontos); // Acessa o primeiro elemento da coleção
    }

    // Inicializa o valor total a pagar com o valor original
    const valorTotalPagar = valorOriginal - totalDescontos;

    // Soma todos os campos "campos-ret-acr"
    const acrescimoCells = document.querySelectorAll('.campos-ret-acr'); // Selecione os inputs de acréscimo
    let totalAcrescimos = 0;

    acrescimoCells.forEach(cell => {
        totalAcrescimos += converterStringParaDecimal(cell.value) || 0; // Acesse o valor do input
    });

    // Atualiza o valor total a pagar com os acréscimos
    const valorTotalFinal = valorTotalPagar + totalAcrescimos;
    document.getElementById('valor-total-pagar').innerText = formatToBRL_V2(valorTotalFinal);
    atualizarValorTotalClassificacoes();
    atualizarValorTotalParcelas();
}

//==============================================//
//====================ANEXOS====================//
//==============================================//
export async function preencherListaAnexosV2(anexos) {
    const log = false;
    if(log) console.log("++++++++++PREENCHENDO LISTA DE ANEXOS++++++++++");
    
    const typesToView = ['JPG', 'JPEG', 'PNG', 'GIF', 'PDF'];
    const convertTypes = {
        "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", 
        "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", 
        "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        ".vnd.ms-excel": "xls",
        "octet-stream": "msg",
        "plain": "txt",
    };
    const galleryElement = document.getElementById('gallery');
    
    if (!galleryElement) {
        console.error('Elemento gallery não encontrado');
        return;
    }

    const elLibConfig = {
        buttons: [
            "download",
            "close"
        ],
        download: true,
        enableDownload: true,
        beforeClose: function() {
            var scrollPosition = document.querySelector('.meu-body').scrollTop;
            window.sessionStorage.setItem('scrollPosition', scrollPosition);
        },
        afterClose: function() {
            var scrollPosition = window.sessionStorage.getItem('scrollPosition');
            setTimeout(function() {
                document.body.scrollTop = parseInt(scrollPosition);
            }, 100);
        }
    };

    function createLoadingSpinner() {
        const loadingSpinnerContainer = document.createElement('div');
        loadingSpinnerContainer.className = 'customConfirm-loading-spinner-container';
        loadingSpinnerContainer.style.width = '100px';
        loadingSpinnerContainer.style.height = '100px';
        loadingSpinnerContainer.style.display = 'flex';
        loadingSpinnerContainer.style.justifyContent = 'center';
        loadingSpinnerContainer.style.alignItems = 'center';

        const loadingSpinner = document.createElement('div');
        loadingSpinner.className = 'customConfirm-loading-spinner';

        loadingSpinnerContainer.appendChild(loadingSpinner);

        return loadingSpinnerContainer;
    }

    galleryElement.innerHTML = '';
    if(log) console.log("anexos => ", anexos);
    if (anexos && anexos.length > 0) {
        const promises = [];
        for (const anexo of anexos) {
            promises.push(new Promise((resolve) => {
                //==========VARIÁVEIS DE APOIO==========//
                if(log) console.log("anexo => ", anexo);
                const newAnexo = anexo.Arquivo;
                const fileType = convertTypes[newAnexo.split('.').pop().toLowerCase()] || newAnexo.split('.').pop().toUpperCase() || '';
                if(log) console.log("fileType => ", fileType);
                //const fileType = newAnexo.split('.').pop().toUpperCase();
                const fileName = newAnexo.split('?filepath=')[1];
                if(log) console.log("fileName => ", fileName);

                //==========BUSCANDO O ARQUIVO NO ZOHO==========//
                const imgEl = document.createElement('img');
                ZOHO.CREATOR.UTIL.setImageData(imgEl, newAnexo);

                //==========CRIANDO ITEM DA GALERIA==========//
                const fileContainer = document.createElement('div');
                fileContainer.classList.add('gallery-item');

                //==========CRIANDO O ELEMENTO DE CARREGAMENTO DE IMAGEM==========//
                const newLoadingSpinner = createLoadingSpinner();
                fileContainer.appendChild(newLoadingSpinner);

                //==========ADICIONANDO ITEM A GALERIA==========//
                galleryElement.appendChild(fileContainer);

                //==========CRIANDO ELEMENTO PARA ARQUIVO==========//
                let fileElement = document.createElement('img');
                fileElement.classList.add('anexo-no-zoho');
                fileElement.setAttribute('data-fancybox', 'gallery');
                fileElement.setAttribute('file-name', fileName);
                fileElement.alt = 'Minitatura da imagem ou PDF';
                fileElement.style.display = 'none';
                

                const checkSrcInterval = setInterval(() => {
                    if (imgEl && imgEl.src && imgEl.src !== "") {
                        const fileSize = (base64Size(imgEl.src) / (1024 * 1024)).toFixed(2);
                        //==========ADICIONANDO ARQUIVOS EM SEUS RESPECTIVOS FORMATOS==========//
                        const initUrl = 'https://terrasii.zohocreatorportal.com';
                        if (typesToView.includes(fileType) && fileSize < 20) {
                            fileElement.src = imgEl.src;
                            if (fileType === 'PDF') {
                                fileElement.setAttribute('data-type', 'iframe');
                                fileElement.setAttribute('data-download-url', `${initUrl}${newAnexo}`);
                                fileElement.src = `https://placehold.co/100?text=${fileType}`;

                            }else
                            {
                                fileElement.setAttribute('data-download-src', imgEl.src);

                            }

                        } else {
                            const cloneFileElement = fileElement.cloneNode(true);
                            cloneFileElement.style.width = '100px';
                            cloneFileElement.style.height = '100px';
                            cloneFileElement.style.display = 'block';
                            cloneFileElement.removeAttribute('data-fancybox');

                            //==========CRIANDO UM PLACEHOLDER PARA OS ARQUIVOS QUE NÃO POSSUEM MINIATURAS==========//
                            cloneFileElement.src = `https://placehold.co/100?text=${fileType}`;
                            fileElement = document.createElement('a');
                            fileElement.href = `${initUrl}${newAnexo}`;
                            fileElement.download = `${initUrl}${newAnexo}`;
                            fileElement.appendChild(cloneFileElement);
                        }
                        fileElement.setAttribute('data-src', imgEl.src);
                        fileElement.insertAdjacentText('afterend',fileName.slice(fileName.indexOf('_')+1,fileName.length));

                        //==========CRIANDO UM ELEMENTO COM O NOME DO ARQUIVO==========//
                        const fileNameElement = document.createElement('p');
                        fileNameElement.style.maxWidth = '100px';
                        fileNameElement.style.fontSize = '11pt';
                        fileNameElement.style.marginLeft = 'auto';
                        fileNameElement.style.marginRight = 'auto';
                        fileNameElement.style.wordBreak = 'break-word';
                        fileNameElement.classList.add('file-name');
                        fileNameElement.textContent = fileName.slice(fileName.indexOf('_')+1,fileName.length);

                        //==========ADICIONANDO O ELEMENTO A GALERIA==========//
                        fileElement.style.display = 'block';

                        fileContainer.appendChild(fileElement);
                        fileContainer.appendChild(fileNameElement);

                        newLoadingSpinner.remove();


                        // Adiciona um evento de clique ao elemento
                        console.log('Adicinoando botão direito');
                        const opcaoDownload = document.createElement('a');
                        opcaoDownload.href = `${initUrl}${newAnexo}`; // Define o caminho para o arquivo que deseja baixar
                        opcaoDownload.textContent = 'Baixar arquivo'; // Define o texto da opção de menu
                        opcaoDownload.download = fileName; 

                        fileElement.addEventListener('contextmenu', function(event) {
                            event.preventDefault(); // Previne o comportamento padrão do botão direito do mouse
                            console.log('Botão direito clicado');

                            // Adiciona a opção de menu ao contexto do mouse
                            document.body.appendChild(opcaoDownload);
                            opcaoDownload.click(); // Simula um clique no link para iniciar o download
                            document.body.removeChild(opcaoDownload); // Remove a opção de menu do contexto do mouse
                        });
                        console.log('Arquivo adicionado');

                        clearInterval(checkSrcInterval);
                        resolve();
                    }
                }, 100);

            }))
        }
        await Promise.all(promises);
    } else {

        //==========CRIANDO MENSAGEM DE NÃO HÁ ANEXOS==========//
        const pContainer = document.createElement('div');
        pContainer.classList.add('gallery-item', 'mensagem-anexos-container');

        const p = document.createElement('p');
        p.style.textAlign = 'center';
        p.style.margin = '20px';
        p.style.color = 'gray';
        p.style.fontSize = '14px';
        p.style.fontWeight = 'bold';
        p.classList.add('mensagem-anexos');
        p.textContent = 'Não há anexos...';
        pContainer.appendChild(p);
        galleryElement.appendChild(pContainer);
    }

    const btnContainer = document.createElement('div');
    btnContainer.classList.add('btn-container', 'gallery-item');

    const botaoAdicionar = document.createElement('a');
    botaoAdicionar.classList.add('botao-adicionar', 'add-btn', 'add-icon', 'gallery-item');
    botaoAdicionar.style.padding = '10px 20px';
    botaoAdicionar.style.fontSize = '60px';
    botaoAdicionar.style.cursor = 'pointer';
    botaoAdicionar.style.borderLeft = '1px solid transparent';
    botaoAdicionar.style.borderImage = 'linear-gradient(to bottom, transparent, gray, gray, gray, gray, gray, gray, transparent) 1';

    // Cria um input do tipo file, escondido
    const inputFile = document.createElement('input');
    inputFile.type = 'file';

    inputFile.style.display = 'none';

    // Evento para abrir o seletor de arquivos ao clicar no botão
    botaoAdicionar.addEventListener('click', () => {
        inputFile.disabled = false;
        inputFile.readOnly = false;
        inputFile.click();
    });

    // Evento de mudança no input, para processar o arquivo selecionado
    inputFile.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            const file = files[0];
            const fileName = file.name;

            globais.arquivosGaleria.push(file);
            const fileType = file.name.split('.').pop().toUpperCase();

            // Cria o container para o arquivo
            const fileContainer = document.createElement('div');
            fileContainer.classList.add('gallery-item');
            galleryElement.insertBefore(fileContainer, btnContainer);

            const blobUrl = URL.createObjectURL(file);

            const newLoadingSpinner = createLoadingSpinner();
            fileContainer.appendChild(newLoadingSpinner);

            let fileElement = document.createElement('img');
            fileElement.classList.add('novo-anexo');
            fileElement.style.display = 'none';

            if (typesToView.includes(fileType)) {

                fileElement.alt = 'Minitatura do arquivo';
                fileElement.setAttribute('data-fancybox', 'gallery');
                fileElement.setAttribute('data-src', blobUrl);
                fileElement.setAttribute('data-download-src', blobUrl); // Permitir download

                if (fileType === 'PDF') {
                    fileElement.setAttribute('data-type', 'iframe'); // Define como iframe no Fancybox
                    fileElement.src = 'https://placehold.co/150?text=PDF';
                } else {
                    fileElement.src = blobUrl;
                }

            } else {
                const cloneFileElement = fileElement.cloneNode(true);
                cloneFileElement.classList.add('novo-anexo');
                cloneFileElement.style.width = '100px';
                cloneFileElement.style.height = '100px';
                cloneFileElement.style.display = 'block';
                cloneFileElement.src = 'https://placehold.co/100?text=' + fileType;

                fileElement = document.createElement('a');
                fileElement.display = 'none';
                fileElement.href = blobUrl;
                fileElement.download = file.name;
                fileElement.appendChild(cloneFileElement);

            }

            fileContainer.appendChild(fileElement);
            fileElement.style.display = 'block';
            newLoadingSpinner.remove();
            $('[data-fancybox="gallery"]').fancybox(elLibConfig);
            // Remove a mensagem de anexos
            const mensagemAnexos = document.querySelector('.mensagem-anexos-container');
            if (mensagemAnexos) {
                mensagemAnexos.remove();
            }
        }
    });

    //==========INICIANDO O FANCYBOX==========//
    await $('[data-fancybox="gallery"]').fancybox(elLibConfig);

    const disabledElements = document.querySelectorAll('.wait-file');
    disabledElements.forEach(el => el.classList.remove('wait-file'));
    // Adiciona o botão e o input ao DOM;
    btnContainer.appendChild(inputFile);
    btnContainer.appendChild(botaoAdicionar);
    galleryElement.appendChild(btnContainer);
}
//=================================================//
//====================LINHAS NF====================//
//=================================================//
export function adicionarLinhaNF() {
    const log = false;
    if(log) console.log("++++++++++ADICIONANDO LINHA DE NOTA FISCAL++++++++++");
    const linhasNF = document.getElementById('linhas-nf');

    const novaLinha = document.createElement('div');
    novaLinha.classList.add('linha-nf');

    const dataEmissaoInput = document.createElement('input');
    dataEmissaoInput.type = 'date';
    dataEmissaoInput.name = 'Data_emissao_N_Fiscal';

    const numeroNFInput = document.createElement('input');
    numeroNFInput.type = 'text';
    numeroNFInput.classList.add('input-number');
    numeroNFInput.name = 'Numero_N_Fiscal';

    const removerButton = document.createElement('button');
    removerButton.type = 'button';
    removerButton.classList.add('remover-linha-nf', 'close-icon', 'remove-btn');
    removerButton.name = 'botao_remover';
    removerButton.addEventListener('click', (el) => removerLinhaNF(el.target));

    novaLinha.appendChild(dataEmissaoInput);
    novaLinha.appendChild(numeroNFInput);
    novaLinha.appendChild(removerButton);
    linhasNF.appendChild(novaLinha);
    return novaLinha;
}

export function removerLinhaNF(elemento) {
    const log = false
    if (log) console.log('++++++++++REMOVENDO LINHA NF++++++++++');
    if (log) console.log(elemento);
    const linha = elemento.closest('.linha-nf');
    const linhasNF = document.querySelectorAll('.linha-nf');

    if (linha && linhasNF.length > 1) {
        linha.remove();
    }

    if (log) console.log('----------LINHA DE NF REMOVIDA----------');
}

export function mostrarCamposRetencao() {

    const camposNF = document.getElementById('section5');
    // Remove a classe 'hidden' da section-header que está acima de section5
    const sectionHeader = camposNF.previousElementSibling;
    if (sectionHeader && sectionHeader.classList.contains('section-header')) {
        sectionHeader.classList.remove("hidden");
    }

    camposNF.classList.remove("hidden");

    // Verifica se o tipo de solicitação é "SERVIÇO"
    const tipoSolicitacao = document.querySelector('select[name="Tipo_de_solicitacao"]').options[document.querySelector('select[name="Tipo_de_solicitacao"]').selectedIndex].text;
    camposNF.querySelector('.campos-iniciais-nf').classList.remove("hidden");
}

export function formatarCPFouCNPJ(elemento) {
    const valor = elemento.value.replace(/\D/g, '');
    let mensagemErro = '';

    if (valor.length === 11) {
        if (validarCPF(valor)) {
            elemento.value = valor.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        } else {
            mensagemErro = 'CPF inválido!';
        }
    } else if (valor.length === 14) {
        if (validarCNPJ(valor)) {
            elemento.value = valor.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        } else {
            mensagemErro = 'CNPJ inválido!';
        }
    } else {
        mensagemErro = 'CPF ou CNPJ inválido!';
    }

    const errorElementId = elemento.id + '-error';
    let errorElement = document.getElementById(errorElementId);

    if (mensagemErro) {
        if (!errorElement) {
            errorElement = document.createElement('span');
            errorElement.id = errorElementId;
            errorElement.style.color = 'red';
            elemento.parentNode.insertBefore(errorElement, elemento.nextSibling);
        }
        errorElement.textContent = mensagemErro;
        elemento.value = '';
    } else if (errorElement) {
        errorElement.textContent = '';
    }
}

function validarCPF(cpf) {
    let soma = 0;
    let resto;

    if (cpf === "00000000000") return false;

    for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    resto = (soma * 10) % 11;

    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    resto = (soma * 10) % 11;

    if ((resto === 10) || (resto === 11)) resto = 0;
    return resto === parseInt(cpf.substring(10, 11));
}

function validarCNPJ(cnpj) {
    const log = false;
    if (log) console.log("++++++++++VALIDANDO CNPJ++++++++++");
    if (log) console.log("cnpj: " + cnpj);

    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;

    if(log) console.log("tamanho: " + tamanho);
    if(log) console.log("numeros: " + numeros);
    if(log) console.log("digitos: " + digitos);
    if(log) console.log("soma: " + soma);
    if(log) console.log("pos: " + pos);

    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }

    if(log) console.log("soma: " + soma);
    if(log) console.log("pos: " + pos);

    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if(log) console.log("resultado: " + resultado);
    if (resultado.toString() != digitos.charAt(0)) return false;

    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    if(log) console.log("numeros: " + numeros);
    if(log) console.log("soma: " + soma);
    if(log) console.log("pos: " + pos);

    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }

    if(log) console.log("soma: " + soma);
    if(log) console.log("pos: " + pos);

    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if(log) console.log("resultado: " + resultado);
    
    return resultado === digitos.charAt(1);
}