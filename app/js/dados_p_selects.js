import { executar_apiZoho } from "./utils.js";
import { globais } from "./main.js";

const nomeRelFornecedores = "Fornecedores_API";
const nomeRelCentroCusto = "Centros_custo_API";
const nomeRelClasseOperacional = "Classes_Operacionais_API";

/**
 * Busca e armazena todos os fornecedores na base de dados
 * 
 * @function buscarFornecedores
 * @async
 * @returns {Promise<Map>} Map contendo os dados dos fornecedores
 * 
 * @description
 * Esta função realiza uma busca recursiva na API do Zoho para obter todos os fornecedores cadastrados.
 * Para cada fornecedor encontrado, armazena em um Map os seguintes dados:
 * - Chave: Número do fornecedor 
 * - Valor: Array contendo:
 *   [0] Nome do fornecedor
 *   [1] CPF/CNPJ
 *   [2] Valor do frete
 *   [3] Condições de pagamento
 *   [4] Observações
 * 
 * Em caso de erro na busca, retorna um Map vazio e registra o erro no console.
 * 
 * @example
 * const fornecedores = await buscarFornecedores();
 * // fornecedores.get("123") retorna:
 * // ["Empresa ABC", "12.345.678/0001-90", "100.00", "30 dias", "Obs..."]
 */
export async function buscarFornecedores() {
    const log = false;
    if (log) console.log("++++++++++BUSCANDO FORNECEDORES++++++++++");
    let cFornecedores = `(Tipo!="DEPARTAMENTO PESSOAL")`;
    if (globais.pag.includes('_DP')) {
        cFornecedores = `(Tipo=="DEPARTAMENTO PESSOAL")`;
    }
    
    if(log) console.log("Criterio fornecedores: ", cFornecedores);

    try {
        const resp = await executar_apiZoho({
            tipo: "busc_reg_recursivo", 
            criterios: cFornecedores, 
            nomeR: nomeRelFornecedores
        });

        if (log) console.log("Resposta fornecedores: ", resp);
        let baseFornecedores = new Map();
        resp.forEach((item) => {
            baseFornecedores.set(item.ID, [
                item["Numero"],
                item["Nome"],
                item["Cpf_Cnpj"], 
                item["Telefone"], 
                item["E_mail"],
                item["Dados_bancarios"]
            ]);
        });
        if (log) console.log("Fornecedores carregados: ", baseFornecedores);
        if (log) console.log("----------FIM BUSCA FORNECEDORES----------");
        return baseFornecedores;
    } catch (error) {
        console.error("Erro ao buscar fornecedores:", error);
        return new Map();
    }
}

/**
 * Busca e mapeia os centros de custo cadastrados
 * 
 * @function buscarCentrosCusto
 * @async
 * @returns {Promise<Map>} Map contendo os dados dos centros de custo
 * 
 * @description
 * Esta função realiza uma busca recursiva na API do Zoho para obter todos os centros de custo.
 * Para cada centro encontrado, armazena em um Map os seguintes dados:
 * - Chave: ID do centro de custo
 * - Valor: Objeto contendo:
 *   - codigoCentro: Código do centro de custo
 *   - nomeCentro: Nome do centro de custo
 * 
 * Em caso de erro na busca, retorna null e registra o erro no console.
 */
export async function buscarCentrosCusto() {
    let crit = "(ID!=0)";
    
    try {
        // Aguarda a resposta da API
        const resp = await executar_apiZoho({
            tipo: "busc_reg_recursivo", 
            criterios: crit, 
            nomeR: nomeRelCentroCusto
        });

        // Mapeia os centros de custo
        const centrosCustoMap = new Map();
        
        resp.forEach((item) => {
            // Monta o par centro de custo
            const codigoCentro = item.Codigo;
            const nomeCentro = item.Nome;
            centrosCustoMap.set(item.ID, {codigoCentro, nomeCentro});
        });

        return centrosCustoMap;
    } catch (error) {
        console.error("Erro ao buscar centros de custo:", error);
        return null;
    }
}

/**
 * Busca e mapeia as classes operacionais cadastradas
 * 
 * @function buscarClassesOperacionais
 * @async
 * @returns {Promise<Map>} Map contendo os dados das classes operacionais
 * 
 * @description
 * Esta função realiza uma busca recursiva na API do Zoho para obter todas as classes operacionais.
 * Para cada classe encontrada, armazena em um Map os seguintes dados:
 * - Chave: ID da classe operacional
 * - Valor: Objeto contendo:
 *   - codigoClasse: Código da classe operacional
 *   - nomeClasse: Nome da classe operacional
 * 
 * Em caso de erro na busca, retorna null e registra o erro no console.
 */
export async function buscarClassesOperacionais() {
    let crit = "(ID!=0)";
    
    try {
        // Aguarda a resposta da API
        const resp = await executar_apiZoho({
            tipo: "busc_reg_recursivo", 
            criterios: crit, 
            nomeR: nomeRelClasseOperacional
        });

        // Mapeia apenas as classificações
        const classificacoesMap = new Map();
        
        resp.forEach((item) => {
            // Monta o par classe operacional
            const codigoClasse = item.Codigo;
            const nomeClasse = item.Nome;
            const contaReduzida = item.Codigo_conta_reduzida;
            classificacoesMap.set(item.ID, {codigoClasse, nomeClasse, contaReduzida});
        });

        return classificacoesMap;
    } catch (error) {
        console.error("Erro ao buscar plano de contas:", error);
        return null;
    }
}