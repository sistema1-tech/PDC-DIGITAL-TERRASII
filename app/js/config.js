// Novo arquivo para configurações
export const CONFIG = {
    APPS: {
        nomeApp: "terras-de-sao-jose-ii",
        nomeRelPDC: "PDC_Digital_API",
        nomeFormCot: "Cotacoes",
        nomeRelCot: "Cotacoes_API",
        nomeFormPDC: "PDC_Digital"
    },
    //https://terrasii.zohocreatorportal.com/creator/v2.1/data/guillaumon/terras-de-sao-jose-ii/report/Centros_custo_API?criteria=(ID!%3D0)&max_records=1000
    INITIAL_STATE: {
        perfilResponsavel: null,
        novoPerfilResponsavel: null,
        selectedCheckbox: null,
        cotacaoExiste: false,
        pag: 'criar_cotacao',
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
    }
}; 
