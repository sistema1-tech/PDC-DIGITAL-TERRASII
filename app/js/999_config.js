import {
    atualizarValorTotalClassificacoes,
    atualizarValorTotalParcelas,
    adicionarLinhaClassificacao,
    removerLinhaClassificacao,
    calcularValorTotalPagar,
    mostrarCamposPagamento,
    adicionarCampoVenc,
    setupPixValidation,
    adicionarLinhaNF,
    removerCampoVenc,
    removerLinhaNF,
} from './002_forms_utils.js';
import {
    addSupplierColumn,
    removeProductRow,
    addProductRow,
} from './003_table_utils.js'
import { customModal, customModal_V2, formatToBRL_V2 } from './007_utils.js';

//   //===============================================\\
//   ||==========DEFINE AS VARIÁVEIS GLOBAIS==========||
//   \\===============================================//
const CONFIG = {
    ENT_NAMES: {
        nomeApp: "terras-de-sao-jose-ii",
        nomeRelPDC: "PDC_Digital_API",
        nomeFormCot: "Cotacoes",
        nomeRelCot: "Cotacoes_API",
        nomeFormPDC: "PDC_Digital",
        pag: 'criar_cotacao',
    },
    BASES:
    {
        baseClassesOperacionais: new Map(),
        baseFornecedores: new Map(),
        baseCentrosCusto: new Map(),
        idsCotacao: new Array(),
        arquivosGaleria: new Array(),
        arquivospPaybox: new Array(),
        arquivosRemovidos: new Array(),
        usuarioLogado: new Map()
    },
    INITIAL_STATE: {
        perfilResponsavel: null,
        novoPerfilResponsavel: null,
        selectedCheckbox: null,
        cotacaoExiste: false,
        classificacoes: null,
        idFornAprovado: null,
        valor_orcado: null,
        centrosCusto: null,
        numPDC_temp: null,
        numPDC: null,
        idProduto: 2,
        idPDC: null,
        tipo: null,
        usuario_logado: null,
        entidades_permitidas: null,
        id_usuario_logado: null,
    },
    OTHER:
    {
        numSolicPDC: null,
        userIP: null,
        logs:[],
    }
};

class Globais {
    constructor() {
        this.state = {
            ...CONFIG.ENT_NAMES,
            ...CONFIG.BASES,
            ...CONFIG.INITIAL_STATE,
            ...CONFIG.OTHER
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

//   //=========================================\\
//   ||==========CONFIGURA OS OUVINTES==========||
//   \\=========================================//
const actions =
{
    buttons:
    {
        "add-supplier-btn": { handler: () => addSupplierColumn(), type: 'click' },
        "add-product-btn": { handler: () => addProductRow(), type: 'click' },
        "remove-product-btn": {
            handler: (elemento) => customModal({
                botao: elemento,
                tipo: 'remover_produto',
                mensagem: 'Deseja realmente remover este produto?'
            }).then(() => { removeProductRow(elemento); }),
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
        "add-linha-nf": { handler: () => adicionarLinhaNF(), type: 'click' },
        "remover-linha-nf": { handler: (elemento) => removerLinhaNF(elemento), type: 'click' },
        "add-parcela": { handler: () => adicionarCampoVenc(null, null, globais.numPDC), type: 'click' },
        "remover-parcela": { handler: (elemento) => removerCampoVenc(elemento), type: 'click' },
        "add-classificacao": { handler: () => adicionarLinhaClassificacao(), type: 'click' },
        "remover-classificacao": { handler: (elemento) => removerLinhaClassificacao(elemento), type: 'click' },
        "section-header": {
            handler:
                (header) => {
                    console.log("++++++++++Executando função de colapsar seção++++++++++");
                    function toggle(header) {
                        console.log("++++++++++COLAPSANDO A SEÇÃO++++++++++");
                        const section = header.nextElementSibling;
                        if (section && section.classList.contains('section')) {
                            section.classList.toggle('collapsed');
                            header.classList.toggle('collapsed');
                        }
                    };

                    toggle(header);

                }, type: 'click'
        }
        
    },
    inputs:
    {
        "formas-pagamento": { handler: (elemento) => mostrarCamposPagamento(), type: 'click' },
        "valor-parcela": { handler: (elemento) => { formatToBRL_V2(elemento); atualizarValorTotalParcelas(); }, type: 'blur' },
        "valor-classificacao": { handler: (elemento) => { formatToBRL_V2(elemento); atualizarValorTotalClassificacoes(); }, type: 'blur' },
        "campos-ret-desc": { handler: (elemento) => { formatToBRL_V2(elemento); calcularValorTotalPagar(); }, type: 'blur' },
        "campos-ret-acr": { handler: (elemento) => { formatToBRL_V2(elemento); calcularValorTotalPagar(); }, type: 'blur' },
        "numeric-cell": { handler: (elemento) => handleEnterKeyNavigation(elemento), type: 'keydown' },

    },
    globals:
    {
        "": { handler: () => setupPixValidation(), type: 'DOMContentLoaded' }

    }
}

//Adiciona os ouvintes a uma unica coleção (É separado antes para melhorar a legibilidade do código)//
export const eventConfig = {
    ...actions.buttons,
    ...actions.inputs,
    ...actions.globals
};