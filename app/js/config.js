// Novo arquivo para configurações
export const CONFIG = {
    APPS: {
        nomeApp: "condominio-laranjeiras",
        nomeRelPDC: "PDC_Digital_API",
        nomeFormCot: "Cotacoes",
        nomeRelCot: "Cotacoes_API",
        nomeFormPDC: "PDC_Digital"
    },
    INITIAL_STATE: {//https://guillaumon8.zohocreatorportal.com/creator/v2.1/data/guillaumon/condominio-laranjeiras/report/Cotacoes_API?criteria=(num_pdc_temp%3D%3D%222025_09_02_11_45_40%22%20%26%26%20Ativo%3D%3Dtrue%20%26%26%20Aprovado%3D%3Dtrue)&max_records=1000
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
