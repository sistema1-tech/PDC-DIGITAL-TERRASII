import {
    formatToBRL_V2,
    converterStringParaDecimal,
    convertToNegative,
    restrictNumericInput,
    restrictIntegerInput,
    executar_apiZoho,
    customModal
} from './007_utils.js';
import { handleEnterKeyNavigation } from './001_main.js'
import { globais } from './999_config.js'

import { atualizarValorTotalClassificacoes, atualizarValorTotalParcelas, atualizarValorOrcado } from './002_forms_utils.js';

const qlt = 4; //Total de linhas de totalizadores, considerando linha com botão de adicionar produto
const ipcv = 3; //Indice da primeira coluna de valores (Valor unitário do primeiro fornecedor)
const mpcv = ipcv % 2 === 0 ? false : true; // Verifica se o indice da primeira coluna de valores é par ou impar, para definir o tipo de dados de cada célula criada
const vlrTolerancia = 1;

//====================================================================================================//
//===========================FUNÇÕES AUXILIARES PARA MANIPULAÇÃO DAS LINHAS===========================//
//====================================================================================================//
/**
 * Adiciona uma nova linha de produto na tab de cotação
 * 
 * @function addProductRow
 * @returns {void}
 * 
 * @description
 * Esta função:
 * - Insere uma nova linha na tab antes das linhas de totalizadores
 * - Configura um ID único para o novo produto
 * - Cria células editáveis para:
 *   - Descrição do produto (primeira coluna)
 *   - Quantidade (segunda coluna, apenas números inteiros)
 *   - Valores unitários (colunas pares, aceita decimais)
 * - Adiciona botão de remoção na última coluna
 * - Atualiza os listeners da tab
 */
export function addProductRow() {
    const log = false;
    if (log) console.log("++++++++++ADICIONANDO NOVA LINHA DE PRODUTO++++++++++");
    // Flag para verificar se a célula deve ser ímpar ou par

    // Obtém referência ao corpo da tab
    const table = document.getElementById('priceTable').getElementsByTagName('tbody')[0];

    // Insere nova linha antes dos totalizadores
    const newRow = table.insertRow(table.rows.length - qlt);
    newRow.dataset.id_produto = globais.idProduto;
    globais.idProduto = (globais.idProduto + 1);
    const rowCount = table.rows[0].cells.length;
    if (log) console.log("Linha criada.");
    if (log) console.log("Ordem do produto => ", globais.idProduto);

    if (log) console.log("Inserindo células na nova linha.");
    if (log) console.log("Quantidade de celulas => ", rowCount);
    // Configura as células da nova linha
    for (let i = 0; i < rowCount; i++) {
        const newCell = newRow.insertCell(i);
        if (log) console.log("Inserindo celula => ", i);

        if (i === 0 || i === 2) {
            // Coluna de descrição do produto
            newCell.contentEditable = "true";

        } else if (i === 1) {
            // Coluna de quantidade
            newCell.contentEditable = "true";
            newCell.classList.add('numeric-cell', 'quantidade');

        } else if (i === rowCount - 1) {
            // Última coluna - botão de remoção
            const removeButton = document.createElement('button');
            removeButton.classList.add('remove-btn', 'remove-product-btn');

            removeButton.addEventListener('click', () => {
                customModal({
                    botao: removeButton,
                    tipo: 'remover_produto',
                    mensagem: 'Deseja realmente remover este produto?<br>Todos os valores deste produto serão removidos.'
                }).then((confirmacao) => {
                    if (confirmacao === true) {
                        removeProductRow(removeButton);
                    }
                });
            });

            const icon = document.createElement('i');
            icon.classList.add('trash-icon', 'icons');
            removeButton.appendChild(icon);

            newCell.classList.add('action-buttons');
            newCell.appendChild(removeButton);
        } else if ((mpcv && i % 2 !== 0) || (!mpcv && i % 2 === 0) && i > ipcv) {
            // Colunas de valores unitários (aceita decimais)
            newCell.contentEditable = "true";
            newCell.classList.add('numeric-cell', 'valor-unit');
        } else {
            // Células de totais (não editáveis)
            newCell.innerText = "";
        }
    }

    // Atualiza os listeners da tab
    if (log) console.log("Atualizando ouvintes da tab.");
    atualizarOuvintesTabCot();

    if (log) console.log("----------NOVA LINHA DE PRODUTO ADICIONADA----------");
}

/**
 * Remove a linha do produto selecionado da tab de cotação
 * 
 * @function removeRow
 * @param {HTMLElement} button - Botão de remoção que foi clicado
 * @returns {void}
 * 
 * @description
 * - Verifica se existe mais de uma linha na tab antes de remover
 * - Remove a linha do produto selecionado se houver mais de uma linha
 * - Exibe alerta se tentar remover a última linha da tab
 */
export function removeProductRow(button) {
    // Obtém referência ao corpo da tab de preços
    const table = document.getElementById('priceTable');
    const tbody = table.getElementsByTagName('tbody')[0];
    const corpoTab = Array.from(tbody.rows).slice(0, - qlt);

    // Verifica se há mais de uma linha antes de remover
    if (corpoTab.length > 1) {
        // Navega do botão até a linha (tr) e remove
        const row = button.parentNode.parentNode;
        row.parentNode.removeChild(row);
    } else {
        // Impede remoção da última linha
        return "Não é possível remover a última linha."
    }
    calcularTotais();
    atualizarValorOrcado();
    atualizarValorTotalParcelas();
    atualizarValorTotalClassificacoes();
}

//====================================================================================================================//
//===========================FUNÇÕES AUXILIARES PARA MANIPULAÇÃO DAS COLUNAS (FORNECEDORES)===========================//
//====================================================================================================================//
/**
 * Adiciona um novo fornecedor à tab de cotação
 * 
 * @function addSupplierColumn
 * @returns {Promise<void>}
 * 
 * @description
 * Esta função:
 * 1. Cria um popup com interface para seleção de fornecedor:
 *    - Mostra spinner de carregamento inicial
 *    - Exibe dropdown com lista de fornecedores após carregar
 *    - Campo de pesquisa para filtrar fornecedores
 *    - Botão para fechar o popup
 * 
 * 2. Aguarda o carregamento dos dados dos fornecedores:
 *    - Verifica se globais.baseFornecedores está preenchido
 *    - Exibe mensagem de erro caso falhe o carregamento
 * 
 * 3. Permite interação do usuário:
 *    - Pesquisa dinâmica na lista de fornecedores
 *    - Seleção do fornecedor desejado
 *    - Fechamento do popup
 * 
 * @throws {Error} Erro ao carregar dados dos fornecedores
 */
export async function addSupplierColumn() {
    // Configurações iniciais
    const qtdCaract = 20; // Limite de caracteres para o nome do fornecedor
    const tab = document.getElementById('priceTable');
    const cabecalhoLinha1 = tab.rows[0];
    const cabecalhoLinha2 = tab.rows[1];

    //==========Criação do Container Inicial==========//
    const containerFornecedor = document.createElement('div');
    containerFornecedor.classList.add('container-fornecedor');
    containerFornecedor.style.position = 'relative';

    // Estado inicial de carregamento com spinner
    const loadingState = document.createElement('div');
    loadingState.classList.add('loading-state');

    const spinner = document.createElement('div');
    spinner.classList.add('loading-spinner');

    loadingState.appendChild(spinner);

    // Criar e mostrar o popup inicial
    const overlay = document.createElement('div');
    overlay.classList.add('popup-overlay');
    const popupFornecedor = criarPopupBase(loadingState); // Inicialmente mostra o estado de carregamento
    overlay.appendChild(popupFornecedor);
    document.body.appendChild(overlay);

    try {
        await new Promise((resolve) => {
            const checkBase = () => {
                if (globais.baseFornecedores && globais.baseFornecedores.size > 0) {
                    resolve();
                } else {
                    setTimeout(checkBase, 100);
                }
            };
            checkBase();
        });

        // Após carregar, substitui o conteúdo do popup
        const conteudoPopup = popupFornecedor.querySelector('.popup-content');
        conteudoPopup.innerHTML = ''; // Limpa o conteúdo de carregamento

        // Cria o dropdown após carregar
        const botaoAbrirDropdown = document.createElement('button');
        botaoAbrirDropdown.classList.add('dropdown-btn');
        botaoAbrirDropdown.innerText = 'Selecione um fornecedor...';

        const listaDropdown = document.createElement('div');
        listaDropdown.classList.add('dropdown-content');

        const campoPesquisa = document.createElement('input');
        campoPesquisa.type = 'text';
        campoPesquisa.placeholder = 'Pesquisar fornecedor...';
        campoPesquisa.classList.add('campo-pesquisa-fornecedor');
        listaDropdown.appendChild(campoPesquisa);

        const containerOpcoes = document.createElement('div');
        containerOpcoes.classList.add('opcoes-container');

        const botaoCadastrarFornecedor = document.createElement('button');
        botaoCadastrarFornecedor.classList.add('criar-fornecedor-btn', 'add-btn', 'add-icon');
        botaoCadastrarFornecedor.addEventListener('click', async () => {
            const idNovoForn = await abrirModalCadastroFornecedor();
            if (idNovoForn) {
                let cFornecedores = `(ID==${idNovoForn})`;

                try {
                    executar_apiZoho({
                        tipo: "busc_reg_recursivo",
                        criterios: cFornecedores,
                        nomeR: "Fornecedores_API"
                    }).then((resp) => {
                        resp.forEach((item) => {
                            globais.baseFornecedores.set(item.ID, [
                                item["Numero"],
                                item["Nome"],
                                item["Cpf_Cnpj"],
                                item["Telefone"],
                                item["E_mail"],
                                item["Dados_bancarios"]
                            ]);
                        });

                        // Busca o fornecedor na base de fornecedores usando o ID retornado
                        const dadosFornecedor = globais.baseFornecedores.get(idNovoForn); // Supondo que globais.baseFornecedores é um Map
                        if (dadosFornecedor) {

                            const nomeCompletoFornecedor = dadosFornecedor[1];
                            const nome_forn = nomeCompletoFornecedor.substring(0, qtdCaract) + '...';

                            //==========Criação das Colunas do Fornecedor==========//
                            const celulaCabecalho = document.createElement('th');
                            celulaCabecalho.colSpan = 2;
                            celulaCabecalho.dataset.id_forn = dadosFornecedor[0];
                            celulaCabecalho.title = `${nomeCompletoFornecedor} - ${dadosFornecedor[2]}`;

                            const nomeFornText = document.createElement('div');
                            nomeFornText.innerText = nome_forn;

                            // Botão de remoção do fornecedor
                            const removeButton = document.createElement('button');
                            removeButton.classList.add('remove-btn', 'remove-forn-btn', 'close-icon');
                            removeButton.addEventListener('click', () => {
                                customModal({
                                    botao: removeButton,
                                    tipo: 'remover_fornecedor',
                                    mensagem: `Deseja realmente remover o fornecedor <b>${nomeCompletoFornecedor}</b>?<br>Todos os valores deste fornecedor serão removidos.`
                                }).then((confirmacao) => {
                                    if (confirmacao === true) {
                                        removeSupplierColumn(removeButton);
                                    }
                                });
                            });

                            // Checkbox de seleção do fornecedor
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.classList.add('supplier-checkbox');
                            checkbox.addEventListener('change', function () {
                                // Obtém as linhas de cabeçalho diretamente
                                const headerRow1 = checkbox.closest('table').querySelector('thead tr:nth-child(1)');
                                const headerRow2 = checkbox.closest('table').querySelector('thead tr:nth-child(2)');

                                // Remove a classe 'forn-aprovado' de todas as células de cabeçalho
                                const allHeaderCells = headerRow1.querySelectorAll('th, td'); // Seleciona todas as células do cabeçalho
                                allHeaderCells.forEach(cell => {
                                    cell.classList.remove('forn-aprovado'); // Remove a classe de todas as células
                                });

                                // Remove a classe 'forn-aprovado' de todas as células de cabeçalho
                                const allHeaderCells2 = headerRow2.querySelectorAll('th, td'); // Seleciona todas as células do cabeçalho
                                allHeaderCells2.forEach(cell => {
                                    cell.classList.remove('forn-aprovado'); // Remove a classe de todas as células
                                });

                                if (checkbox.checked) {
                                    if (globais.selectedCheckbox && globais.selectedCheckbox !== checkbox) {
                                        globais.selectedCheckbox.checked = false;
                                    }
                                    globais.selectedCheckbox = checkbox;
                                    globais.idFornAprovado = dadosFornecedor[0];

                                    // Adiciona a classe 'forn-aprovado' às células do fornecedor selecionado
                                    const headerCell = checkbox.closest('th'); // Célula do cabeçalho correspondente
                                    headerCell.classList.add('forn-aprovado'); // Adiciona a classe ao cabeçalho do fornecedor

                                    // Adiciona a classe 'forn-aprovado' às células de valor unitário e total
                                    const colIndex = Array.from(headerRow1.cells).indexOf(headerCell); // Índice da célula do cabeçalho
                                    const unitPriceHeader = headerRow2.cells[colIndex * 2 - ipcv]; // Célula de valor unitário
                                    const totalPriceHeader = headerRow2.cells[colIndex * 2 - (ipcv - 1)]; // Célula de valor total
                                    unitPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor unitário
                                    totalPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor total

                                } else {
                                    globais.selectedCheckbox = null;
                                    globais.idFornAprovado = null;
                                }
                                atualizarValorTotalParcelas();
                                atualizarValorOrcado();
                                atualizarValorTotalClassificacoes();
                            });

                            // Montagem do container do fornecedor
                            const container = document.createElement('div');
                            container.classList.add('container-fornecedor');
                            container.style.display = 'flex';
                            container.style.alignItems = 'center';
                            container.style.justifyContent = 'space-between';
                            container.style.gap = '5px';

                            container.appendChild(checkbox);
                            container.appendChild(nomeFornText);
                            container.appendChild(removeButton);
                            celulaCabecalho.appendChild(container);
                            celulaCabecalho.style.position = 'relative';

                            // Inserção das colunas no cabeçalho
                            cabecalhoLinha1.insertBefore(celulaCabecalho, cabecalhoLinha1.cells[cabecalhoLinha1.cells.length - 1]);

                            const celulaPrecoUnitario = document.createElement('th');
                            celulaPrecoUnitario.innerText = 'Valor Unitário';
                            cabecalhoLinha2.insertBefore(celulaPrecoUnitario, cabecalhoLinha2.cells[cabecalhoLinha2.cells.length - 1]);

                            const celulaPrecoTotal = document.createElement('th');
                            celulaPrecoTotal.innerText = 'Valor Total';
                            cabecalhoLinha2.insertBefore(celulaPrecoTotal, cabecalhoLinha2.cells[cabecalhoLinha2.cells.length - 1]);

                            //==========Adição das Células nas Linhas==========//
                            const linhas = tab.getElementsByTagName('tbody')[0].rows;
                            for (let i = 0; i < linhas.length - 1; i++) {
                                if (i < linhas.length - qlt) {
                                    // Células para produtos
                                    const celulaPrecoUnitarioLinha = linhas[i].insertCell(linhas[i].cells.length - 1);
                                    celulaPrecoUnitarioLinha.contentEditable = "true";
                                    celulaPrecoUnitarioLinha.classList.add('numeric-cell', 'valor-unit');
                                    celulaPrecoUnitarioLinha.addEventListener('keydown', (elemento) => handleEnterKeyNavigation(elemento));

                                    const celulaPrecoTotalLinha = linhas[i].insertCell(linhas[i].cells.length - 1);
                                    celulaPrecoTotalLinha.classList.add('numeric-cell');
                                } else {
                                    // Células para totalizadores
                                    const celulaTotalizadora = linhas[i].insertCell(linhas[i].cells.length - 1);

                                    if (i >= (linhas.length - 4) && i < (linhas.length - 2)) {
                                        celulaTotalizadora.contentEditable = "true";
                                    } else if (i == (linhas.length - 2)) {
                                        celulaTotalizadora.classList.add("total-fornecedor");
                                        celulaTotalizadora.contentEditable = "false";
                                    }
                                    celulaTotalizadora.classList.add('numeric-cell');
                                    celulaTotalizadora.colSpan = 2;
                                }
                            }

                            //==========Atualização da tab de Dados Adicionais==========//
                            const otherTableBody = document.getElementById('otherDataTable').getElementsByTagName('tbody')[0];

                            if (otherTableBody.rows.length === 1 && !otherTableBody.rows[0].cells[0].textContent.trim()) {
                                otherTableBody.deleteRow(0);
                            }

                            const newRow = otherTableBody.insertRow();
                            const fornecedorCell = newRow.insertCell(0);
                            fornecedorCell.innerText = nome_forn;
                            fornecedorCell.dataset.id_forn = dadosFornecedor[0];

                            const condicoesPagamentoCell = newRow.insertCell(1);
                            const observacoesCell = newRow.insertCell(2);

                            [condicoesPagamentoCell, observacoesCell].forEach(cell => {
                                cell.contentEditable = "true";
                                cell.classList.add('editable-cell');
                            });

                            document.body.removeChild(overlay);
                            atualizarOuvintesTabCot();
                        }

                    });

                } catch (error) {
                    console.error("Erro ao buscar fornecedores:", error);
                    return new Map();
                }
            }
        });
        // Popula o dropdown com os fornecedores
        globais.baseFornecedores.forEach((dadosFornecedor) => {
            const opcao = document.createElement('div');
            opcao.classList.add('dropdown-opcao');

            opcao.dataset.fornecedor = dadosFornecedor[0]; // Número do fornecedor como dataset
            let nomeFornecedor = dadosFornecedor[1];
            if (nomeFornecedor.length > qtdCaract) {
                nomeFornecedor = nomeFornecedor.substring(0, qtdCaract) + '...';
            }
            opcao.innerText = `${nomeFornecedor} - ${dadosFornecedor[2]}`; // Nome - CNPJ
            opcao.title = dadosFornecedor[1];

            opcao.onclick = () => {
                const nomeCompletoFornecedor = opcao.title;
                const nome_forn = nomeCompletoFornecedor.substring(0, qtdCaract) + '...';

                //==========Criação das Colunas do Fornecedor==========//
                const celulaCabecalho = document.createElement('th');
                celulaCabecalho.colSpan = 2;
                celulaCabecalho.dataset.id_forn = dadosFornecedor[0];
                celulaCabecalho.title = `${nomeCompletoFornecedor} - ${dadosFornecedor[2]}`;

                const nomeFornText = document.createElement('div');
                nomeFornText.innerText = nome_forn;

                // Botão de remoção do fornecedor
                const removeButton = document.createElement('button');
                removeButton.classList.add('remove-btn', 'remove-forn-btn', 'close-icon');
                removeButton.addEventListener('click', () => {
                    customModal({
                        botao: removeButton,
                        tipo: 'remover_fornecedor',
                        mensagem: `Deseja realmente remover o fornecedor <b>${nomeCompletoFornecedor}</b>?<br>Todos os valores deste fornecedor serão removidos.`
                    }).then((confirmacao) => {
                        if (confirmacao === true) {
                            removeSupplierColumn(removeButton);
                        }
                    });
                });

                // Checkbox de seleção do fornecedor
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.classList.add('supplier-checkbox');
                checkbox.addEventListener('change', function () {
                    // Obtém as linhas de cabeçalho diretamente
                    const headerRow1 = checkbox.closest('table').querySelector('thead tr:nth-child(1)');
                    const headerRow2 = checkbox.closest('table').querySelector('thead tr:nth-child(2)');

                    // Remove a classe 'forn-aprovado' de todas as células de cabeçalho
                    const allHeaderCells = headerRow1.querySelectorAll('th, td'); // Seleciona todas as células do cabeçalho
                    allHeaderCells.forEach(cell => {
                        cell.classList.remove('forn-aprovado'); // Remove a classe de todas as células
                    });

                    // Remove a classe 'forn-aprovado' de todas as células de cabeçalho
                    const allHeaderCells2 = headerRow2.querySelectorAll('th, td'); // Seleciona todas as células do cabeçalho
                    allHeaderCells2.forEach(cell => {
                        cell.classList.remove('forn-aprovado'); // Remove a classe de todas as células
                    });

                    if (checkbox.checked) {
                        if (globais.selectedCheckbox && globais.selectedCheckbox !== checkbox) {
                            globais.selectedCheckbox.checked = false;
                        }
                        globais.selectedCheckbox = checkbox;
                        globais.idFornAprovado = dadosFornecedor[0];

                        // Adiciona a classe 'forn-aprovado' às células do fornecedor selecionado
                        const headerCell = checkbox.closest('th'); // Célula do cabeçalho correspondente
                        headerCell.classList.add('forn-aprovado'); // Adiciona a classe ao cabeçalho do fornecedor

                        // Adiciona a classe 'forn-aprovado' às células de valor unitário e total
                        const colIndex = Array.from(headerRow1.cells).indexOf(headerCell); // Índice da célula do cabeçalho
                        const unitPriceHeader = headerRow2.cells[colIndex * 2 - ipcv]; // Célula de valor unitário
                        const totalPriceHeader = headerRow2.cells[colIndex * 2 - (ipcv - 1)]; // Célula de valor total
                        unitPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor unitário
                        totalPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor total

                    } else {
                        globais.selectedCheckbox = null;
                        globais.idFornAprovado = null;
                    }
                    atualizarValorOrcado();
                    atualizarValorTotalParcelas();
                    atualizarValorTotalClassificacoes();
                });

                // Montagem do container do fornecedor
                const container = document.createElement('div');
                container.classList.add('container-fornecedor');
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'space-between';
                container.style.gap = '5px';

                container.appendChild(checkbox);
                container.appendChild(nomeFornText);
                container.appendChild(removeButton);
                celulaCabecalho.appendChild(container);
                celulaCabecalho.style.position = 'relative';

                // Inserção das colunas no cabeçalho
                cabecalhoLinha1.insertBefore(celulaCabecalho, cabecalhoLinha1.cells[cabecalhoLinha1.cells.length - 1]);

                const celulaPrecoUnitario = document.createElement('th');
                celulaPrecoUnitario.innerText = 'Valor Unitário';
                cabecalhoLinha2.insertBefore(celulaPrecoUnitario, cabecalhoLinha2.cells[cabecalhoLinha2.cells.length - 1]);

                const celulaPrecoTotal = document.createElement('th');
                celulaPrecoTotal.innerText = 'Valor Total';
                cabecalhoLinha2.insertBefore(celulaPrecoTotal, cabecalhoLinha2.cells[cabecalhoLinha2.cells.length - 1]);

                //==========Adição das Células nas Linhas==========//
                const linhas = tab.getElementsByTagName('tbody')[0].rows;
                for (let i = 0; i < linhas.length - 1; i++) {
                    if (i < linhas.length - qlt) {
                        // Células para produtos
                        const celulaPrecoUnitarioLinha = linhas[i].insertCell(linhas[i].cells.length - 1);
                        celulaPrecoUnitarioLinha.contentEditable = "true";
                        celulaPrecoUnitarioLinha.classList.add('numeric-cell', 'valor-unit');

                        const celulaPrecoTotalLinha = linhas[i].insertCell(linhas[i].cells.length - 1);
                        celulaPrecoTotalLinha.classList.add('numeric-cell');
                    } else {
                        // Células para totalizadores
                        const celulaTotalizadora = linhas[i].insertCell(linhas[i].cells.length - 1);

                        if (i >= (linhas.length - 4) && i < (linhas.length - 2)) {
                            celulaTotalizadora.contentEditable = "true";
                        } else if (i == (linhas.length - 2)) {
                            celulaTotalizadora.classList.add("total-fornecedor");
                            celulaTotalizadora.contentEditable = "false";
                        }
                        celulaTotalizadora.classList.add('numeric-cell');
                        celulaTotalizadora.colSpan = 2;
                    }
                }

                //==========Atualização da tab de Dados Adicionais==========//
                const otherTableBody = document.getElementById('otherDataTable').getElementsByTagName('tbody')[0];

                if (otherTableBody.rows.length === 1 && !otherTableBody.rows[0].cells[0].textContent.trim()) {
                    otherTableBody.deleteRow(0);
                }

                const newRow = otherTableBody.insertRow();
                const fornecedorCell = newRow.insertCell(0);
                fornecedorCell.innerText = nome_forn;
                fornecedorCell.dataset.id_forn = dadosFornecedor[0];

                const condicoesPagamentoCell = newRow.insertCell(1);
                const observacoesCell = newRow.insertCell(2);

                [condicoesPagamentoCell, observacoesCell].forEach(cell => {
                    cell.contentEditable = "true";
                    cell.classList.add('editable-cell');
                });

                document.body.removeChild(overlay);
                atualizarOuvintesTabCot();
            };

            containerOpcoes.appendChild(opcao);
        });

        listaDropdown.appendChild(containerOpcoes);
        containerFornecedor.appendChild(botaoAbrirDropdown);
        containerFornecedor.appendChild(listaDropdown);

        // Adiciona o containerFornecedor ao conteúdo do popup
        conteudoPopup.appendChild(containerFornecedor);
        conteudoPopup.appendChild(botaoCadastrarFornecedor);

        // Adiciona os eventos do dropdown
        botaoAbrirDropdown.onclick = () => {
            listaDropdown.classList.toggle('show');
            listaDropdown.style.display = listaDropdown.style.display === 'block' ? 'none' : 'block';
            campoPesquisa.focus();
        };

        // Adiciona o evento de pesquisa
        campoPesquisa.addEventListener('input', () => {
            const filtro = campoPesquisa.value.toLowerCase();
            const opcoes = containerOpcoes.getElementsByClassName('dropdown-opcao');
            for (let i = 0; i < opcoes.length; i++) {
                const opcao = opcoes[i];
                const texto = opcao.innerText.toLowerCase();
                opcao.style.display = texto.includes(filtro) ? '' : 'none';
            }
        });

    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        const conteudoPopup = popupFornecedor.querySelector('.popup-content');
        loadingText.innerText = 'Erro ao carregar fornecedores';
        loadingText.style.color = '#dc3545';
        spinner.style.display = 'none';
    }
}

/**
 * Remove as colunas de um fornecedor selecionado da tab de cotação
 * 
 * @function removeSupplierColumn
 * @param {HTMLElement} button - Botão de remoção que foi clicado
 * @returns {void}
 * 
 * @description
 * - Remove as colunas relacionadas ao fornecedor selecionado da tab principal (valor unitário e total)
 * - Remove a célula mesclada do fornecedor no cabeçalho
 * - Remove as células de totalizadores para o fornecedor
 * - Remove a linha correspondente na tab de dados adicionais
 * - Mantém a estrutura e formatação da tab
 * - Usa o ID do fornecedor armazenado no dataset para garantir remoção correta
 */
export function removeSupplierColumn(button) {
    const table = document.getElementById('priceTable');
    const headerRow1 = table.rows[0];
    const headerRow2 = table.rows[1];
    const tbody = table.getElementsByTagName('tbody')[0];

    // Encontra a célula do cabeçalho e índices
    const headerCell = button.closest('th');
    const colIndex = Array.from(headerRow1.cells).indexOf(headerCell);
    const supplierId = headerCell.dataset.id_forn;

    // Função auxiliar para remover célula com verificação de índice válido
    const safeDeleteCell = (row, index) => {
        if (index >= 0 && index < row.cells.length) {
            row.deleteCell(index);
        }
    };

    // Remove células do corpo da tab
    const rows = tbody.rows;
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];

        if (i < rows.length - qlt) {
            // Remove células de produtos (2 colunas por fornecedor)
            const baseIndex = colIndex * 2 - ipcv;
            safeDeleteCell(row, baseIndex); // Valor unitário
            safeDeleteCell(row, baseIndex); // Valor total
        } else {
            // Remove células de totalizadores (células mescladas)
            safeDeleteCell(row, colIndex - (ipcv - 1));
        }
    }

    // Remove células do cabeçalho
    if (colIndex + 1 < headerRow2.cells.length) {
        const headerBaseIndex = colIndex * 2 - ipcv;
        safeDeleteCell(headerRow2, headerBaseIndex); // Valor Total
        safeDeleteCell(headerRow2, headerBaseIndex); // Valor Unitário
    }
    safeDeleteCell(headerRow1, colIndex); // Célula mesclada do fornecedor

    // Remove linha correspondente na tab de dados adicionais
    const otherTable = document.getElementById('otherDataTable');
    const otherRows = otherTable.getElementsByTagName('tbody')[0].rows;

    for (let i = 0; i < otherRows.length; i++) {

        const fornecedorCell = otherRows[i].cells[0];
        if (fornecedorCell?.dataset.id_forn === supplierId) {
            otherTable.getElementsByTagName('tbody')[0].deleteRow(i);
            break;
        }
    }
}

/**
 * Cria a estrutura base de um popup para seleção de fornecedor
 * 
 * @function criarPopupBase
 * @param {HTMLElement} conteudo - Elemento HTML que será inserido como conteúdo do popup
 * @returns {HTMLElement} Elemento div contendo a estrutura completa do popup
 * 
 * @description
 * Esta função:
 * - Cria um container principal para o popup
 * - Adiciona um botão de fechar no topo
 * - Cria uma área para o conteúdo
 * - Adiciona um cabeçalho com título
 * - Insere o conteúdo fornecido
 * - Monta a estrutura hierárquica dos elementos
 * - Configura o evento de fechar o popup
 */
function criarPopupBase(conteudo) {
    const popupFornecedor = document.createElement('div');
    popupFornecedor.classList.add('popup-fornecedor');

    const botaoFechar = document.createElement('button');
    botaoFechar.classList.add('btn-fechar', 'close-icon', 'remove-btn');
    botaoFechar.onclick = () => document.body.removeChild(botaoFechar.closest('.popup-overlay'));

    const conteudoPopup = document.createElement('div');
    conteudoPopup.classList.add('popup-content');

    conteudoPopup.appendChild(conteudo);
    popupFornecedor.appendChild(botaoFechar);
    popupFornecedor.appendChild(conteudoPopup);

    return popupFornecedor;
}

//=================================================================================================//
//===========================FUNÇÕES AUXILIARES PARA CALCULOS DE VALORES===========================//
//=================================================================================================//

/**
 * Calcula o valor total de cada uma das linhas de produto
 * 
 * @function calculateTotalPrices
 * @param {number} rowIndex - Índice da linha de produto
 * @returns {void}
 * 
 * @description
 * - Calcula o valor total de cada item na linha de produto
 * - Multiplica a quantidade pelo valor unitário para obter o valor total
 * - Formata o valor total em BRL e exibe na célula correspondente
 */
export function calculateTotalPrices(rowIndex) {
    const log = false;
    if (log) console.log("++++++++++CALCULANDO TOTAL DA LINHA++++++++++");
    const table = document.getElementById('priceTable').getElementsByTagName('tbody')[0];
    const row = table.rows[rowIndex]; //Linha a ser calculada
    if (log) console.log("row => ", row);
    const quantityCell = row.cells[1]; //Quantidade do item
    if (log) console.log("quantityCell => ", quantityCell);
    const quantity = converterStringParaDecimal(quantityCell.dataset.valor_original); //Converte a quantidade para um número decimal
    if (log) console.log("quantity => ", quantity);

    for (let i = ipcv; i < row.cells.length; i += 2) {
        const unitPriceCell = row.cells[i]; //Valor unitário do item
        const totalPriceCell = row.cells[i + 1]; //Valor total do item
        if (unitPriceCell && totalPriceCell) {
            const unitPrice = converterStringParaDecimal(unitPriceCell.dataset.valor_original); //Converte o valor unitário para um número decimal
            totalPriceCell.innerText = formatToBRL_V2((quantity * unitPrice)); //Calcula o valor total e formata para o padrão brasileiro
            totalPriceCell.dataset.valor_original = (quantity * unitPrice);

            if (log) console.log("totalPriceCell => ", formatToBRL_V2((quantity * unitPrice)));
        }

    }
}

/**
 * Calcula o valor total para cada fornecedor na tab de cotação
 * 
 * @function calcularTotais
 * @returns {void}
 * 
 * @description
 * - Seleciona todas as células de "Valor Total" dos fornecedores na linha de totais
 * - Para cada fornecedor:
 *   - Soma os valores totais de todos os produtos
 *   - Adiciona o valor do frete
 *   - Adiciona o valor do desconto
 *   - Formata e exibe o total calculado em BRL
 */
function calcularTotais() {
    const log = false;
    if (log) console.log("++++++++++CALCULANDO TOTAIS DOS FORNECEDORES++++++++++");
    // Seleciona todas as células de "Valor Total" dos fornecedores na linha de totais (linha N+2)
    const table = document.getElementById('priceTable').getElementsByTagName('tbody')[0];
    const totalCells = table.querySelectorAll('.total-fornecedor');

    totalCells.forEach((totalCell, index) => {
        let vt = 0; //Valor total
        const vlrsFrete = (converterStringParaDecimal(table.rows[table.rows.length - qlt].cells[index + 1].textContent) || 0);
        const vlrsDesconto = (converterStringParaDecimal(table.rows[table.rows.length - (qlt - 1)].cells[index + 1].textContent) || 0);
        for (let i = 0; i < table.rows.length - qlt; i++) {
            const ci = ipcv + 1; //Coluna inicial da busca | indice da coluna inicial + 1 (Indice começa com zero)
            const linha = table.rows[i];

            const valorTotalCell = linha.cells[(index * 2) + ci];
            vt += (converterStringParaDecimal(valorTotalCell.textContent || '0') || 0);
        }
        const valorTotal = (vt + vlrsFrete + vlrsDesconto).toFixed(2);
        totalCell.textContent = formatToBRL_V2(valorTotal);
    });
}

//====================================================================================================//
//===========================FUNÇÕES AUXILIARES PARA MANIPULAÇÃO DE COLAGEM===========================//
//====================================================================================================//

/**
 * Manipula o evento de colar (paste) na tab de preços
 * Permite colar dados de planilhas externas na tab de cotação, mantendo a formataão e cálculos
 * 
 * @function handlePasteEventPriceTable
 * @param {Event} event - Evento de colar (paste)
 * @returns {void}
 * 
 * @description
 * - Previne o comportamento padrão do evento paste
 * - Obtém os dados da área de transferência
 * - Identifica a célula inicial onde os dados serão colados
 * - Divide os dados em linhas e colunas
 * - Adiciona novas linhas de produto se necessário
 * - Cola os dados nas células correspondentes
 * - Recalcula os totais das linhas e da tab
 */
export function handlePasteEventPriceTable(event) {
    const log = false;

    if (log) console.log("++++++++++MANIPULANDO EVENTO DE COLAR (PASTE) NA TABELA DE PREÇOS++++++++++");
    event.preventDefault();

    const clipboardData = event.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text').trim();

    const table = document.getElementById('priceTable').getElementsByTagName('tbody')[0];
    let rows = Array.from(table.rows).slice(0, -qlt);
    const startRowIndex = Array.prototype.indexOf.call(rows, event.target.parentNode);
    const startCellIndex = Array.prototype.indexOf.call(Array.from(event.target.parentNode.cells), event.target);

    const pastedRows = pastedData.split('\n').map(row => row.split('\t'));


    for (let rowIndex = 0; rowIndex < pastedRows.length; rowIndex++) {
        if (startRowIndex + rowIndex >= rows.length) {
            addProductRow();
            rows = Array.from(table.rows).slice(0, -qlt); // Atualize a variável rows após adicionar uma nova linha
        }

        const cells = Array.from(rows[startRowIndex + rowIndex].cells);

        for (let cellIndex = 0; cellIndex < pastedRows[rowIndex].length; cellIndex++) {
            if (startCellIndex + cellIndex >= cells.length) {
                continue;
            }

            const cell = cells[startCellIndex + cellIndex];
            let value = pastedRows[rowIndex][cellIndex];

            // Converte para formato apropriado baseado na classe da célula \\
            if (cell.classList.contains('numeric-cell')) {
                cell.dataset.valor_original = converterStringParaDecimal(value);
                cell.innerText = cell.classList.contains('quantidade') ? formatToBRL_V2(value, 3) : formatToBRL_V2(value);

            } else {
                cell.innerText = value;

            }
        }
        calculateTotalPrices(rowIndex);
    }
    atualizarOuvintesTabCot();
    calcularTotais();
}

/**
 * Manipula o evento de colar (paste) na tab de detalhes dos fornecedores
 * Permite colar dados de planilhas externas nos campos de frete, condições de pagamento e observações
 * 
 * @function handlePasteEventDetailtable
 * @param {Event} event - Evento de colar (paste)
 * @returns {void}
 * 
 * @description
 * - Previne o comportamento padrão do evento paste
 * - Obtém os dados da área de transferência
 * - Divide os dados em linhas e colunas
 * - Cola os dados nas células correspondentes
 */
export function handlePasteEventDetailtable(event) {
    event.preventDefault();

    const clipboardData = event.clipboardData || window.clipboardData;
    const pasteData = clipboardData.getData('text');
    const table = document.getElementById('otherDataTable');
    const rows = pasteData.split('\n');

    for (let i = 0; i < rows.length; i++) {
        const dataRow = rows[i].split('\t');
        const tableRow = table.rows[i + 1];

        if (!tableRow) continue;

        for (let j = 1; j < tableRow.cells.length; j++) {
            const cell = tableRow.cells[j];
            const inputValue = dataRow[j - 1] || '';

            if (cell.querySelector('input')) {
                cell.querySelector('input').value = inputValue;
            } else {
                cell.innerText = inputValue;
            }
        }
    }
}

//=====================================================================================================//
//===========================FUNÇÕES AUXILIARES PARA MANIPULAÇÃO DE OUVINTES===========================//
//=====================================================================================================//

/**
 * Atualiza os listeners da tab de cotação
 * Remove todos os listeners existentes e adiciona novamente para garantir funcionamento correto
 * 
 * @function atualizarOuvintesTabCot
 * @returns {void}
 * 
 * @description
 * - Remove todos os listeners existentes
 * - Adiciona novamente os listeners necessários para garantir o funcionamento correto
 */
export function atualizarOuvintesTabCot() {
    const log = false;
    if (log) console.log("++++++++++ATUALIZANDO OUVINTES DA TABELA DE COTAÇÃO++++++++++");

    const tab = document.getElementById('priceTable').getElementsByTagName('tbody')[0];
    const lv = tab.rows;

    if (!tab) {
        if (log) console.log("TABELA DE COTAÇÃO NÃO ENCONTRADA");
        return;

    }

    if (log) console.log("Removendo ouvintes existentes...");
    // Remove listeners existentes
    function removeAllListeners(element) {
        const clone = element.cloneNode(true);
        if (log) console.log("Clonando elementos...");
        const elementString = element.outerHTML;
        if (log) console.log("Elemento original: ", elementString);
        Object.keys(element.dataset).forEach(key => {
            clone.dataset[key] = element.dataset[key];
        });
        const cloneString = clone.outerHTML;
        if (log) console.log("Elemento clonado: ", cloneString);

        element.parentNode.replaceChild(clone, element);
        return clone;

    }

    for (let i = 0; i < lv.length - 1; i++) {
        const c = lv[i].cells;
        for (let j = 0; j < c.length - 1; j++) {
            removeAllListeners(c[j]);
        }
    }
    if (log) console.log("Ouvintes removidos com sucesso!");

    if (log) console.log("Adicionando ouvintes nas células numéricas...");
    // Adiciona listeners para células numéricas
    tab.querySelectorAll('.numeric-cell').forEach(celula => {
        celula.addEventListener('blur', () => {
            restrictNumericInput(celula);
            atualizarValorOrcado();
            atualizarValorTotalParcelas();
            atualizarValorTotalClassificacoes();
        });

        celula.addEventListener('keydown', (elemento) => handleEnterKeyNavigation(elemento));
    });
    if (log) console.log("Ouvintes adicionados com sucesso!");

    if (log) console.log("Adicionando ouvintes nas Células Negativas...");
    // Adiciona listener para converter valores negativos na antepenúltima linha
    const atpl = tab.rows[tab.rows.length - (qlt - 1)];

    for (let i = 0; i < atpl.cells.length; i++) {
        const celula = atpl.cells[i];
        celula.addEventListener('blur', () => {
            const valor = converterStringParaDecimal(celula.innerText);
            if (!isNaN(valor)) {
                celula.innerText = convertToNegative(valor);
            }
        }, { capture: true });
    }
    if (log) console.log("Ouvintes adicionados com sucesso!");

    if (log) console.log("Adicionando ouvintes nas Celtulas da Tabela Principal...");
    // Adiciona listeners para células da tab principal
    for (let i = 0; i < lv.length - 1; i++) {
        const linha = lv[i];
        const isTotalizador = i >= (lv.length - qlt);

        // Adiciona listeners específicos para cada coluna
        for (let j = 0; j < linha.cells.length - 1; j++) {
            const celula = linha.cells[j];

            // Adiciona paste event para todas as células
            celula.addEventListener('paste', (event) => handlePasteEventPriceTable(event));

            if (isTotalizador) {
                // Tratamento específico para linhas de totalizadores
                if (j > 0) { // Células após a célula com título da linha
                    celula.addEventListener('blur', () => {
                        formatToBRL_V2(celula);
                        calcularTotais();
                        atualizarValorOrcado();
                        atualizarValorTotalParcelas();
                        atualizarValorTotalClassificacoes();
                    });
                }
            } else {
                // Tratamento para linhas normais de produtos
                if (j === 1) { // Coluna de quantidade
                    celula.addEventListener('blur', (event) => {

                        if (globais.pag === "checagem_final") {
                            const valorAtual = converterStringParaDecimal(event.target.dataset.valor_original) || 0; // Obtém o valor original
                            const novoValor = converterStringParaDecimal(event.target.innerText) || 0; // Obtém o novo valor
                            if (novoValor > valorAtual) {
                                event.target.innerText = event.target.dataset.valor_original; // Reverte para o valor original
                                // Exibe modal de aviso com apenas um botão de OK
                                showAlertModal('Quantidade de itens não pode ser aumentada!');
                            }
                        }
                        formatToBRL_V2(celula, 3);
                        calculateTotalPrices(i);
                    });

                    celula.addEventListener('focus', (event) => {
                        // Armazena o valor atual quando a célula é focada, se ainda não estiver armazenado
                        if (!event.target.hasAttribute('data-valor_original')) {
                            event.target.dataset.valor_original = event.target.innerText;
                        } else {
                            event.target.innerText = event.target.dataset.valor_original;
                        }

                    });

                } else if (j === 2) { // Coluna de unidade - apenas texto
                    continue;
                } else if (j > 2) { // Colunas de valores após a unidade
                    celula.addEventListener('focus', (event) => {
                        // Armazena o valor atual quando a célula é focada, se ainda não estiver armazenado
                        if (!event.target.hasAttribute('data-valor_original')) {
                            event.target.dataset.valor_original = event.target.innerText;
                        } else {
                            event.target.innerText = event.target.dataset.valor_original;
                        }
                    });

                    celula.addEventListener('blur', (event) => {

                        const valor_result = limitarValorPreenchido(event.target.dataset.valor_inicial, event.target.innerText, vlrTolerancia);

                        event.target.innerText = valor_result;
                        event.target.dataset.valor_original = valor_result;
                        formatToBRL_V2(celula);
                        calculateTotalPrices(i);
                    });
                }

                // Adiciona cálculo de totais para todas as células exceto a unidade
                if (j !== 2) {
                    celula.addEventListener('blur', () => {
                        calcularTotais();
                        atualizarValorOrcado();
                        atualizarValorTotalParcelas();
                        atualizarValorTotalClassificacoes();
                    });
                }
            }
        }
    }
    if (log) console.log("Ouvintes adicionados com sucesso!");

    if (log) console.log("----------TODOS OS OUVINTES ADICIONADOS COM SUCESSO----------");
}

function limitarValorPreenchido(valor_inicial, valor_atual, variacao) {
    if (globais.pag === "ajustar_compra_" || globais.pag === "checagem_final") {
        const ap_valor_inicial = converterStringParaDecimal(valor_inicial) || 0; // Obtém o valor original
        const ap_valor_atual = converterStringParaDecimal(valor_atual) || 0; // Obtém o novo valor
        if (ap_valor_atual > ap_valor_inicial + variacao || ap_valor_atual < ap_valor_inicial - variacao) {
            // Exibe modal de aviso com apenas um botão de OK

            let msg = `Este valor não pode ser maior que o valor atual`;
            if (variacao > 0) {
                msg += ` + tolerância de ${formatToBRL_V2(variacao)}`;
            }
            msg += `!`;
            showAlertModal(msg);
            return valor_inicial;
        }
    }
    return valor_atual;
}

/**
 * Atualiza os ouvintes de eventos da tab de detalhes dos fornecedores.
 * Adiciona um ouvinte de evento 'paste' para cada linha da tab, exceto o cabeçalho.
 * Isso permite que os dados sejam colados corretamente na tab de detalhes.
 * 
 * @function atualizarOuvintesTabDetlhesForn
 * @returns {void}
 * 
 * @description
 * - Adiciona um ouvinte de evento 'paste' para cada linha da tab, exceto o cabeçalho
 * - Isso permite que os dados sejam colados corretamente na tab de detalhes
 */
export function atualizarOuvintesTabDetlhesForn() {
    const table = document.getElementById('otherDataTable');
    const rows = table.rows;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        row.addEventListener('paste', handlePasteEventDetailtable);
    }
}

//====================================================================================//
//===========================PREENCHE A TAB DE COTAÇÃOES===========================//
//====================================================================================//

function filtrarCot(data) {
    const log = false;
    if (log) console.log("++++++++++PREENCHENDO TAB DE COTAÇÕES COM DADOS DA API++++++++++");

    if (log) console.log("Data original => ", data);
    // Restringe a leitura à fotografia ativa mais recente. Dados antigos sem
    // versão continuam elegíveis enquanto não houver uma versão numerada.
    const ativas = data.filter(item => item.Ativo === true || item.Ativo === "true");
    const versoes = ativas.map(item => Number(item.Versao)).filter(Number.isFinite);
    const maiorVersao = versoes.length ? Math.max(...versoes) : null;
    data = maiorVersao === null ? ativas : ativas.filter(item => Number(item.Versao) === maiorVersao);
    const ids_forns = [...new Set(data.map(item => item.id_fornecedor))]
        .filter(id => id !== null && id !== undefined && String(id).trim() !== "");
    const itens_aprov = data.filter(item => item.Aprovado === true || item.Aprovado === "true").map(item => item.id_produto);
    if (log) console.log("IDs dos fornecedores encontrados => ", ids_forns);
    if (log) console.log("IDs dos itens aprovados e ativos encontrados => ", itens_aprov);
    const filteredData = Array.from(

        data.reduce((map, item) => {
            const temFornecedor = item.id_fornecedor !== null && item.id_fornecedor !== undefined && String(item.id_fornecedor).trim() !== "";
            if (ids_forns.length > 0 && temFornecedor) {
                if (log) console.log("Tem fornecedores");
                if (item.Valor_unitario == null || item.Quantidade == null || item.Quantidade <= 0 || item.id_fornecedor === "") {
                    if (log) console.log("Item com valor inválido => ", item);
                    return map;
                }

                const key = `${item.id_fornecedor}_${item.id_produto}`;
                const existing = map.get(key);

                if (itens_aprov.length > 0) {
                    if (log) console.log("Tem itens aprovados");
                    //BUSCA APENAS OS ITENS APROVADOS E ATIVOS
                    if (itens_aprov.includes(item.id_produto) && ids_forns.includes(item.id_fornecedor)) {
                        if (log) console.log("Item faz parte da lista de aprovados");

                        if (!existing) {
                            if (log) console.log("Item não existe no mapa, adicionando");
                            map.set(key, item);
                        } else {

                            if ((existing.Aprovado !== true && existing.Aprovado !== "true") && (item.Aprovado === true || item.Aprovado === "true")) {
                                map.set(key, item);
                            } else {
                                const existingTime = new Date(existing.Added_time);
                                const currentTime = new Date(item.Added_time);
                                if (currentTime > existingTime) {
                                    map.set(key, item);
                                }
                            }
                        }
                    }
                } else {
                    if (log) console.log("Não tem itens aprovados");
                    //NÃO HÁ ITENS APROVADOS E ATIVOS, ENTÃO BUSCA TODOS OS ITENS QUE TENHAM FORNECEDOR, INDEPENDENTE DE ESTAREM APROVADOS OU ATIVOS, MAS CONSIDERANDO APENAS ITENS COM QUANTIDADE E VALOR UNITÁRIO MAIORES QUE ZERO E NÃO NULOS
                    if (!existing) {

                        map.set(key, item);
                    } else {
                        // Compara Added_Time e mantém o mais recente
                        const existingTime = new Date(existing.Added_time);
                        const currentTime = new Date(item.Added_time);
                        if (currentTime > existingTime) {
                            map.set(key, item);
                        }
                    }
                }

            } else {
                if (log) console.log("Não tem fornecedores");
                //BUSCA TODOS OS ITENS, INDEPENDENTE DE TER FORNECEDOR OU VALOR UNITÁRIO E QUANTIDADE MAIORES QUE ZERO
                const key = item.id_produto;
                const existing = map.get(key);
                if (!existing) {
                    map.set(key, item);
                } else {
                    // Compara Added_Time e mantém o mais recente
                    const existingTime = new Date(existing.Added_time);
                    const currentTime = new Date(item.Added_time);
                    if (currentTime > existingTime) {
                        map.set(key, item);
                    }
                }
            }
            return map;
        }, new Map()).values()
    );
    return filteredData;
}

/**
 * Preenche a tab de cotações com os dados recebidos da API
 * 
 * @async
 * @function prenchTabCot
 * @param {Object} resp - Resposta da API contendo os dados das cotaçes
 * @param {number} resp.code - Código de resposta da API
 * @param {Array} resp.data - Array com os dados das cotações
 * @returns {void}
 * 
 * @description
 * Esta função:
 * - Verifica se existem dados válidos na resposta
 * - Remove a linha inicial da tab se existir
 * - Processa os dados para extrair:
 *   - IDs dos produtos
 *   - Lista de fornecedores
 *   - Valores de frete
 *   - Status de aprovação
 *   - Valores de desconto
 * - Para cada produto:
 *   - Cria uma nova linha na tab
 *   - Preenche nome e quantidade
 *   - Para cada fornecedor:
 *     - Adiciona colunas de valor unitário e total
 *   - Adiciona botão para remover o produto
 * - Adiciona cabeçalhos dos fornecedores com:
 *   - Checkbox de aprovação
 *   - Nome do fornecedor
 *   - Botão para remover fornecedor
 * - Preenche linhas de totalizadores:
 *   - Frete
 *   - Descontos  
 *   - Total por fornecedor
 * - Preenche tab de detalhes com:
 *   - Condi��ões de pagamento
 *   - Observações
 */
export async function prenchTabCot(data) {
    const log = true;
    if (log) console.log("++++++++++PREENCHENDO TAB DE COTAÇÕES COM DADOS DA API++++++++++");
    const filteredData = filtrarCot(data);
    if (log) console.log("Data filtrada => ", filteredData);

    if (filteredData.length > 0) {

        globais.cotacaoExiste = true;
        const table = document.getElementById('priceTable').getElementsByTagName('tbody')[0];
        const linhaInicial = document.getElementById('linha-inicial');
        if (linhaInicial) {
            linhaInicial.remove();
        }

        //=====Preparando dados da cotação (Fornecedores, produtos, valores e etc...)=====//
        const idProdutos = [...new Set(filteredData.map(item => item.id_produto))].sort((a, b) => a - b);
        globais.idProduto = Math.max(...idProdutos) + 1;

        const fornecedores = [...new Set(filteredData
            .filter(item => item.id_fornecedor !== null && item.id_fornecedor !== undefined && String(item.id_fornecedor).trim() !== "")
            .map(item => JSON.stringify({
            Fornecedor: String(item.Fornecedor || '').trim(),
            id_fornecedor: item.id_fornecedor
        })))].map(item => JSON.parse(item));

        const valoresAprovado = [...new Map(filteredData.map(item => [item.id_fornecedor, item])).values()].map(item => item.Aprovado + "_" + item.Ativo);
        const valoresFrete = fornecedores.map(fornecedor => filteredData.filter(item => item.id_fornecedor === fornecedor.id_fornecedor)[0].Valor_do_frete);
        const valoresDescontos = fornecedores.map(fornecedor => filteredData.filter(item => item.id_fornecedor === fornecedor.id_fornecedor)[0].Descontos);
        console.log("Valores frete => ", valoresFrete);
        console.log("Valores desconto => ", valoresDescontos);

        globais.idsCotacao = [...new Set(filteredData.map(item => item.ID))].sort((a, b) => a - b);

        //=====Cria linhas dos produtos=====//
        idProdutos.forEach((idProduto, index) => {
            //Busca dados do produto atual//
            let objProduto = filteredData.filter(item => item.id_produto === idProduto);

            //Cria linha do produto//
            const newRow = table.insertRow(index);
            newRow.dataset.id_produto = objProduto[0].id_produto;  // Preencher o dataset com o ID do produto

            //NOME//
            const produtoCell = newRow.insertCell(0);
            produtoCell.classList.add('product-cell');
            produtoCell.innerText = objProduto[0].Produto || '';
            produtoCell.contentEditable = 'true';

            //QUANTIDADE//
            const quantidadeCell = newRow.insertCell(1);
            quantidadeCell.classList.add('numeric-cell', 'quantidade');
            quantidadeCell.innerText = formatToBRL_V2(objProduto[0].Quantidade || '', 3);
            quantidadeCell.dataset.valor_original = converterStringParaDecimal(objProduto[0].Quantidade || '');
            quantidadeCell.contentEditable = 'true';
            quantidadeCell.addEventListener('input', restrictNumericInput);

            //UNIDADE//
            const unidadeCell = newRow.insertCell(2);
            unidadeCell.innerText = objProduto[0].Unidade || '';
            unidadeCell.contentEditable = 'true';

            //Insere as colunas dos fornecedores na ordem correta
            fornecedores.forEach((fornecedorObj, fornecedorIndex) => {
                //VALOR UNITÁRIO//
                const valorUnitarioCell = newRow.insertCell(fornecedorIndex * 2 + ipcv);
                valorUnitarioCell.classList.add('numeric-cell', 'valor-unit');
                valorUnitarioCell.contentEditable = "true";

                //VALOR TOTAL//
                const valorTotalCell = newRow.insertCell(fornecedorIndex * 2 + (ipcv + 1));
                valorTotalCell.classList.add('numeric-cell');

                //Busca dados do fornecedor atual//
                const valoresFornProd = objProduto.filter(item => item.Fornecedor === fornecedorObj.Fornecedor);
                //Preenche os valores
                if (valoresFornProd.length > 0) {
                    valorUnitarioCell.innerText = formatToBRL_V2(valoresFornProd[0].Valor_unitario || '');
                    valorUnitarioCell.dataset.valor_original = converterStringParaDecimal(valoresFornProd[0].Valor_unitario || '');
                    valorUnitarioCell.dataset.valor_inicial = converterStringParaDecimal(valoresFornProd[0].Valor_unitario || '');
                    valorTotalCell.innerText = formatToBRL_V2(valoresFornProd[0].Valor_total || '');
                    valorTotalCell.dataset.valor_original = converterStringParaDecimal(valoresFornProd[0].Valor_total || '');
                }
            });

            //Cria os botões de excluir as linhas de produto//
            if (fornecedores.length > 0) {
                // Cria a nova célula na linha//
                const cell = newRow.insertCell(fornecedores.length * 2 + ipcv);

                // Cria o botão//
                const removeButton = document.createElement('button');

                removeButton.classList.add('remove-btn', 'remove-product-btn');

                // Adiciona o evento de clique ao botão//
                removeButton.addEventListener('click', () => {
                    customModal({
                        botao: removeButton,
                        tipo: 'remover_produto',
                        mensagem: 'Deseja realmente remover este produto?'
                    }).then(() => { removeProductRow(removeButton); })
                });

                // Cria o ícone dentro do botão//
                const icon = document.createElement('i');
                icon.classList.add('trash-icon', 'icons');

                // Anexa o ícone ao botão//
                removeButton.appendChild(icon);

                // Anexa o botão à célula//
                cell.appendChild(removeButton);
            } else {
                // Cria a nova célula na linha
                const cell = newRow.insertCell(3);

                // Cria o botão
                const removeButton = document.createElement('button');
                removeButton.classList.add('remove-btn', 'remove-product-btn');
                // Adiciona o evento de clique ao botão
                removeButton.addEventListener('click', () => {
                    customModal({
                        botao: removeButton,
                        tipo: 'remover_produto',
                        mensagem: 'Deseja realmente remover este produto?<br>Todos os valores deste produto serão removidos.'
                    });
                });

                // Cria o ícone dentro do botão
                const icon = document.createElement('i');
                icon.classList.add('trash-icon', 'icons');

                // Anexa o ícone ao botão
                removeButton.appendChild(icon);

                // Anexa o botão à célula
                cell.appendChild(removeButton);
            }
        });

        //Função para adicionar os cabeçalhos de fornecedores na ordem correta//
        function addHeaderForn(fornecedores) {
            //Busca as 2 primeiras linhas da tab (1 - Nome do fornecedor e 2 - Valor unitário e Valor total)//
            const headerRow1 = table.parentElement.querySelector('thead tr:nth-child(1)');
            const headerRow2 = table.parentElement.querySelector('thead tr:nth-child(2)');

            const linhaFrete = table.querySelector('#linha-frete');
            const linhaDescontos = table.querySelector('#linha-descontos');
            const linhaTotal = table.querySelector('#linha-valor-total');
            let foundChecked = false;
            fornecedores.forEach((fornecedorObj, index) => {
                //Cria a célula com o nome do fornecedor//
                const celulaCabecalho = document.createElement('th');
                celulaCabecalho.dataset.id_forn = fornecedorObj.id_fornecedor;
                celulaCabecalho.colSpan = 2;

                //Cria a checkbox//
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.classList.add('supplier-checkbox');

                let removeButton;
                if (valoresAprovado[index] == 'true_true') {
                    if (!foundChecked) {
                        checkbox.checked = true;
                        globais.selectedCheckbox = checkbox;
                        globais.idFornAprovado = fornecedorObj.id_fornecedor;
                        foundChecked = true;
                    }
                }

                // Cria o botão de remover fornecedor//
                removeButton = document.createElement('button');
                removeButton.classList.add('remove-btn', 'remove-forn-btn', 'close-icon');

                checkbox.addEventListener('change', function () {
                    // Obtém as linhas de cabeçalho diretamente
                    const headerRow1 = checkbox.closest('table').querySelector('thead tr:nth-child(1)');
                    const headerRow2 = checkbox.closest('table').querySelector('thead tr:nth-child(2)');

                    // Remove a classe 'forn-aprovado' de todas as células de cabeçalho
                    const allHeaderCells = headerRow1.querySelectorAll('th, td'); // Seleciona todas as células do cabeçalho
                    allHeaderCells.forEach(cell => {
                        cell.classList.remove('forn-aprovado'); // Remove a classe de todas as células
                    });

                    // Remove a classe 'forn-aprovado' de todas as células de cabeçalho
                    const allHeaderCells2 = headerRow2.querySelectorAll('th, td'); // Seleciona todas as células do cabeçalho
                    allHeaderCells2.forEach(cell => {
                        cell.classList.remove('forn-aprovado'); // Remove a classe de todas as células
                    });

                    //
                    if (checkbox.checked) {
                        if (globais.selectedCheckbox && globais.selectedCheckbox !== checkbox) {
                            globais.selectedCheckbox.checked = false;
                        }
                        globais.selectedCheckbox = checkbox;
                        globais.idFornAprovado = fornecedorObj.id_fornecedor;

                        // Adiciona a classe 'forn-aprovado' às células do fornecedor selecionado
                        const headerCell = checkbox.closest('th'); // Célula do cabeçalho correspondente
                        headerCell.classList.add('forn-aprovado'); // Adiciona a classe ao cabeçalho do fornecedor

                        // Adiciona a classe 'forn-aprovado' às células de valor unitário e total
                        const colIndex = Array.from(headerRow1.cells).indexOf(headerCell); // Índice da célula do cabeçalho
                        const unitPriceHeader = headerRow2.cells[colIndex * 2 - ipcv]; // Célula de valor unitário
                        const totalPriceHeader = headerRow2.cells[colIndex * 2 - (ipcv - 1)]; // Célula de valor total
                        unitPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor unitário
                        totalPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor total

                    } else {
                        globais.selectedCheckbox = null;
                        globais.idFornAprovado = null;
                    }
                    atualizarValorOrcado();
                    atualizarValorTotalParcelas();
                    atualizarValorTotalClassificacoes();

                });

                removeButton.addEventListener('click', () => {
                    customModal({
                        botao: removeButton,
                        tipo: 'remover_fornecedor',
                        mensagem: `Deseja realmente remover o fornecedor <b>${fornecedorObj.Fornecedor}</b>?<br>Todos os valores deste fornecedor serão removidos.`
                    }).then((confirmacao) => {
                        if (confirmacao === true) {
                            removeSupplierColumn(removeButton);
                        }
                    });
                });


                // Cria um container para o nome do fornecedor//
                const container = document.createElement('div');
                container.classList.add('supplier-name-container');

                // Adiciona o nome do fornecedor centralizado//
                const fornecedorText = document.createElement('span');
                fornecedorText.innerText = fornecedorObj.Fornecedor;
                fornecedorText.style.margin = '0 auto'; // Centraliza o texto

                // Adiciona o texto ao container//
                container.appendChild(checkbox);
                container.appendChild(fornecedorText);
                if (removeButton) {
                    container.appendChild(removeButton);
                }
                celulaCabecalho.appendChild(container);
                celulaCabecalho.style.position = 'relative';

                headerRow1.insertBefore(celulaCabecalho, headerRow1.cells[headerRow1.cells.length - 1]);

                const unitPriceHeader = document.createElement('th');
                unitPriceHeader.innerText = 'Valor Unitário';
                headerRow2.insertBefore(unitPriceHeader, headerRow2.cells[headerRow2.cells.length - 1]);

                const totalPriceHeader = document.createElement('th');
                totalPriceHeader.innerText = 'Valor Total';
                headerRow2.insertBefore(totalPriceHeader, headerRow2.cells[headerRow2.cells.length - 1]);

                //=====ADICIONA A CELULA DE FRETE=====//
                const cellFrete = document.createElement('td');
                cellFrete.innerText = formatToBRL_V2(valoresFrete[index] || '0,00');
                cellFrete.classList.add('numeric-cell');
                cellFrete.colSpan = 2;
                cellFrete.contentEditable = "true";
                cellFrete.style.margin = '0 auto';
                linhaFrete.insertBefore(cellFrete, linhaFrete.cells[linhaFrete.cells.length - 1]);


                //=====ADICIONA A CELULA DE DESCONTO=====//
                const cellDescontos = document.createElement('td');
                cellDescontos.innerText = formatToBRL_V2(valoresDescontos[index] || '0,00');
                cellDescontos.classList.add('numeric-cell');
                cellDescontos.addEventListener('blur', () => calcularTotais());
                cellDescontos.colSpan = 2;
                cellDescontos.contentEditable = "true";
                cellDescontos.style.margin = '0 auto';
                linhaDescontos.insertBefore(cellDescontos, linhaDescontos.cells[linhaDescontos.cells.length - 1]);

                //=====ADICIONA A CÉLULA DE TOTAL===//
                const totalFornecedor = filteredData
                    .filter(item => item.id_fornecedor === fornecedorObj.id_fornecedor)
                    .reduce((acc, item) => acc + (parseFloat(item.Valor_total) || 0), 0);

                const cellTotal = document.createElement('td');
                cellTotal.innerText = formatToBRL_V2(totalFornecedor);
                cellTotal.classList.add('numeric-cell', "total-fornecedor");
                cellTotal.colSpan = 2;
                cellTotal.contentEditable = "true";
                cellTotal.style.margin = '0 auto';
                linhaTotal.insertBefore(cellTotal, linhaTotal.cells[linhaTotal.cells.length - 1]);

                // Adiciona linha na tab de detalhes das propostas
                const otherTable = document.getElementById('otherDataTable');
                const tbodyOther = otherTable.getElementsByTagName('tbody')[0];

                if (tbodyOther.rows.length === 1 &&
                    !tbodyOther.rows[0].cells[0].textContent.trim() &&
                    !tbodyOther.rows[0].cells[1].textContent.trim() &&
                    !tbodyOther.rows[0].cells[2].textContent.trim()) {
                    tbodyOther.deleteRow(0);
                }

                const detailRow = tbodyOther.insertRow();

                const fornCell = detailRow.insertCell();
                fornCell.textContent = fornecedorObj.Fornecedor;
                fornCell.dataset.id_forn = fornecedorObj.id_fornecedor;

                const condPagCell = detailRow.insertCell();
                const dadosFornecedor = filteredData.find(item => item.id_fornecedor === fornecedorObj.id_fornecedor);
                condPagCell.textContent = dadosFornecedor?.Condicoes_de_pagamento || '';
                condPagCell.contentEditable = "true";

                const obsCell = detailRow.insertCell();
                obsCell.textContent = dadosFornecedor?.Observacoes || '';
                obsCell.contentEditable = "true";

                // Adiciona a classe 'forn-aprovado' se o fornecedor estiver aprovado
                if (valoresAprovado[index] == 'true_true') {
                    celulaCabecalho.classList.add('forn-aprovado');

                    // Adiciona a classe 'forn-aprovado' às células de valor unitário e total
                    unitPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor unitário
                    totalPriceHeader.classList.add('forn-aprovado'); // Adiciona a classe ao valor total
                }
            });
        }
        // Adiciona os cabeçalhos dos fornecedores na ordem correta
        addHeaderForn(fornecedores);

        // Calcula os totais
        calcularTotais();
        atualizarOuvintesTabCot();
    }
}

// Função para exibir um modal de alerta com um botão de OK
function showAlertModal(message) {
    const modal = document.createElement('div');
    modal.classList.add('popup-overlay'); // Usando a classe de overlay da customModal

    const popupFornecedor = document.createElement('div');
    popupFornecedor.classList.add('popup-fornecedor'); // Usando a classe do popup

    const modalContent = document.createElement('div');
    modalContent.classList.add('popup-content');

    const messageText = document.createElement('p');
    messageText.innerText = message;
    messageText.style.color = 'red'; // Define a cor do texto como vermelho

    // Botão de fechar no topo
    const closeButton = document.createElement('button');
    closeButton.classList.add('btn-fechar', 'close-icon'); // Adiciona classes para estilo
    closeButton.onclick = () => {
        document.body.removeChild(modal);
    };

    // Estilizando o botão de fechar para ficar mais próximo da borda
    closeButton.style.position = 'absolute';
    closeButton.style.top = '0px'; // Distância do topo
    closeButton.style.right = '0px'; // Distância da direita
    closeButton.style.border = 'none'; // Remove borda
    closeButton.style.background = 'transparent'; // Fundo transparente
    closeButton.style.cursor = 'pointer'; // Cursor de ponteiro

    modalContent.appendChild(closeButton); // Adiciona o botão de fechar ao conteúdo do modal
    modalContent.appendChild(messageText);
    popupFornecedor.appendChild(modalContent);
    modal.appendChild(popupFornecedor);
    document.body.appendChild(modal);
}

//===================================================================================//
//===========================MODAL DE CADASTRAR FORNECEDOR===========================//
//===================================================================================//
async function abrirModalCadastroFornecedor() {
    // Criação do overlay do modal
    const overlay = document.createElement('div');
    overlay.classList.add('popup-overlay');
    document.body.appendChild(overlay);

    // Criação do modal
    const modal = document.createElement('div');
    modal.classList.add('modal-cadastro-fornecedor'); // Classe para estilização
    overlay.appendChild(modal);

    // Criação do botão de fechar
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('btn-fechar', 'close-icon', 'remove-btn');
    closeBtn.onclick = () => {
        document.body.removeChild(overlay);
    };
    modal.appendChild(closeBtn);

    // Cabeçalho do modal
    const cabecalho = document.createElement('h2');
    cabecalho.classList.add('cadastro-fornecedor-titulo');
    cabecalho.innerText = 'Cadastro de Fornecedor';
    modal.appendChild(cabecalho);

    // Formulário de cadastro
    const formulario = document.createElement('form');
    formulario.classList.add('form-colunas'); // Adiciona classe para colunas
    modal.appendChild(formulario);


    const tipo = globais.perfilResponsavel.includes("Depto. Pessoal") ? 'DEPARTAMENTO PESSOAL' : 'FORNECEDOR';
    // Campos do formulário
    const campos = [
        { label: 'Tipo', name: 'Tipo', display: 'none', initialContent: tipo },
        { label: 'Nome:', name: 'Nome' },
        { label: 'Cpf/Cnpj:', name: 'Cpf_Cnpj' },
        { label: 'Serviços prestados:', name: 'Servicos_prestados' },
        { label: 'Dados bancários:', name: 'Dados_bancarios' },
        { label: 'E-mail:', name: 'E_mail' },
        { label: 'Telefone:', name: 'Telefone' },
    ];

    campos.forEach(campo => {
        const divCampo = document.createElement('div');

        divCampo.classList.add('campo'); // Adiciona a classe 'campo' para o layout flexível

        if (campo.display) divCampo.style.display = campo.display;

        const label = document.createElement('label');
        label.innerText = campo.label;

        const input = document.createElement('input');
        input.type = 'text';
        input.name = campo.name;
        input.value = campo.initialContent || '';

        // Adiciona ouvintes de eventos para validação
        input.addEventListener('input', () => {
            switch (campo.name) {
                case 'Telefone':
                    // Permite apenas números e formata o telefone
                    input.value = input.value.replace(/\D/g, ''); // Remove caracteres não numéricos
                    if (input.value.length > 11) {
                        input.value = input.value.slice(0, 11); // Limita a 10 dígitos
                    }

                    if (input.value.length > 6) {
                        input.value = `(${input.value.slice(0, 2)}) ${input.value.slice(2, 3)} ${input.value.slice(3, 7)}-${input.value.slice(7)}`;
                    } else if (input.value.length > 2) {
                        input.value = `(${input.value.slice(0, 2)}) ${input.value.slice(2)}`;
                    }
                    break;
                case 'Cpf_Cnpj':
                    // Permite apenas números e formata CPF ou CNPJ
                    input.value = input.value.replace(/\D/g, ''); // Remove caracteres não numéricos
                    if (input.value.length > 14) {
                        input.value = input.value.slice(0, 14); // Limita a 14 dígitos
                    }
                    if (input.value.length === 11) {
                        input.value = input.value.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{2})$/, '$1-$2'); // Formata CPF
                    } else if (input.value.length === 14) {
                        input.value = input.value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); // Formata CNPJ
                    }
                    break;
                default:
                    break;
            }
        });

        // Adicionando evento blur para o campo de e-mail
        input.addEventListener('blur', () => {
            if (campo.name === 'E_mail' && !input.value.includes('@')) {
                alert('Por favor, insira um e-mail válido que contenha "@"');
            }
        });

        divCampo.appendChild(label);
        divCampo.appendChild(input);
        formulario.appendChild(divCampo);
    });

    // Checkbox para fornecedor online
    const divCheckbox = document.createElement('div');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'Fornecedor_online';
    const checkboxLabel = document.createElement('label');
    checkboxLabel.innerText = 'Fornecedor online';
    divCheckbox.appendChild(checkbox);
    divCheckbox.appendChild(checkboxLabel);
    formulario.appendChild(divCheckbox);

    // Botão de salvar
    const botaoSalvar = document.createElement('button');
    botaoSalvar.type = 'button'; // Mantenha como 'button' para evitar envio do formulário
    botaoSalvar.innerText = 'Salvar';
    botaoSalvar.classList.add('botao-salvar', 'save-btn'); // Adiciona a classe para estilização
    modal.appendChild(botaoSalvar);

    // Cria o onclick do botão de salvar
    return new Promise((resolve) => {
        botaoSalvar.onclick = () => {
            const formularioData = {};
            const inputs = formulario.querySelectorAll('input');

            // Coleta todos os dados do formulário
            inputs.forEach(input => {
                if (input.type === 'checkbox') {
                    formularioData[input.name] = input.checked; // Para checkboxes, armazena o estado (true/false)
                } else {
                    formularioData[input.name] = input.value; // Para outros inputs, armazena o valor
                }
            });

            // Validação dos campos
            const requiredFields = ['Nome'];
            if (formularioData['Tipo'] !== 'DEPARTAMENTO PESSOAL') {
                requiredFields.push('Cpf_Cnpj');

            }

            const missingFields = requiredFields.filter(field => !formularioData[field]);

            if (missingFields.length) {
                alert(`Por favor, preencha os campos obrigatórios: ${missingFields.join(', ')}.`);
                return;

            }

            // Verifica se o CNPJ do fornecedor já existe na base de fornecedores
            const cnpjFornecedor = formularioData['Cpf_Cnpj'].replace(/\D/g, '');
            const fornecedorExistente = Array.from(globais.baseFornecedores.values()).find(fornecedor => fornecedor[2].replace(/\D/g, '') === cnpjFornecedor);

            if (fornecedorExistente && formularioData['Tipo'] !== 'DEPARTAMENTO PESSOAL') {
                alert(`O CNPJ ${formularioData['Cpf_Cnpj']} do fornecedor ${formularioData['Nome']} já existe na base de fornecedores.\n\nDados do fornecedor já existente:\n\n${Object.entries(fornecedorExistente).map(([key, value]) => `* ${key}: ${value}`).join('\n')}`);
                return;

            }

            // Adiciona o fornecedor na base de fornecedores
            executar_apiZoho({ tipo: "add_reg", corpo: formularioData, nomeF: "Fornecedores" }).then((resp) => {
                if (resp.code === 3000) {
                    document.body.removeChild(overlay); // Fecha o modal
                    resolve(resp.data.ID); // Resolve a Promise com o ID

                } else {
                    alert("Falha ao realizar o envio, tente novamente ou contate o adminsitrador do sistema!")
                    resolve(null); // Resolve com null em caso de falha

                }

            });
        };
    });
}
