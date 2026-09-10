const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync('app/js/006_save_utils.js', 'utf8');
const splitter = source.slice(source.indexOf('const STATUS_FILHO_EM_AJUSTE'), source.indexOf('async function meshData'));
const engine = source.slice(source.indexOf('const SAVE_JOURNAL_VERSION'), source.indexOf('export async function tratarSalvamentoPDC'))
    .replace(/export\s+async\s+function/g, 'async function');

class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}

function checkbox(checked = false) {
    return { checked, hasAttribute() { return this.checked; }, setAttribute() { this.checked = true; } };
}

function installment({ created = false, selected = false, status = '', value }) {
    const createdInput = checkbox(created);
    const selectedInput = checkbox(selected);
    return {
        dataset: { statusFilho: status },
        value,
        createdInput,
        selectedInput,
        querySelector(selector) {
            if (selector.includes('parcela_criada')) return createdInput;
            if (selector.includes('parcela_selecionada')) return selectedInput;
            return null;
        }
    };
}

const rows = [
    installment({ selected: true, value: 900 }),
    installment({ value: 200 })
];
const pdc = new Map([['100', {
    ID: '100', id_temp: 'ROOT', Status_geral: 'Chec. final',
    Datas: [{ parcela_criada: false }, { parcela_criada: false }]
}]]);
const quotes = [{ ID: 'q-root', num_pdc_temp: 'ROOT', Ativo: true, Produto: 'A' }];
let nextPdc = 101;
let createCalls = 0;
let failParentResolutionOnce = true;

function criterionValue(criteria, field) {
    return criteria.match(new RegExp(`${field}==\\"([^\\"]+)\\"`))?.[1];
}

async function executar_apiZoho({ tipo, criterios, ID, corpo, nomeR, nomeF }) {
    if (tipo.startsWith('busc_reg')) {
        if (nomeR === 'PDC_Digital_API') {
            const id = criterios.match(/ID==(\d+)/)?.[1];
            if (id) return pdc.has(id) ? [pdc.get(id)] : [];
            const temp = criterionValue(criterios, 'id_temp');
            return [...pdc.values()].filter(item => item.id_temp === temp);
        }
        if (nomeR === 'Cotacoes_API') {
            const temp = criterionValue(criterios, 'num_pdc_temp');
            return quotes.filter(item => item.num_pdc_temp === temp && item.Ativo);
        }
        if (nomeR === 'Documentos_API') return [];
    }
    if (tipo === 'add_reg' && nomeF === 'PDC_Digital') {
        const id = String(nextPdc++);
        createCalls++;
        pdc.set(id, { ID: id, ...corpo });
        return { code: 3000, data: { ID: id } };
    }
    if (tipo === 'add_reg' && nomeF === 'Cotacoes') {
        const records = Array.isArray(corpo) ? corpo : [corpo];
        records.forEach(record => quotes.push({ ID: `q-${quotes.length}`, ...record }));
        return { result: records.map((_, index) => ({ code: 3000, data: { ID: `q-${index}` } })) };
    }
    if (tipo === 'atualizar_reg' && ID) {
        const current = pdc.get(String(ID));
        assert.ok(current, `PDC ${ID} deve existir`);
        if (String(ID) === '100' && corpo.Status_geral === 'Separado em parcelas' && failParentResolutionOnce) {
            failParentResolutionOnce = false;
            return { code: 5000, message: 'interrupted before parent confirmation' };
        }
        pdc.set(String(ID), { ...current, ...corpo });
        return { code: 3000 };
    }
    if (tipo === 'atualizar_reg' && criterios) {
        const temp = criterionValue(criterios, 'num_pdc_temp');
        quotes.forEach(item => { if (item.num_pdc_temp === temp) item.Ativo = false; });
        return { code: 3000 };
    }
    if (tipo === 'deletar_reg') return { code: 3000 };
    throw new Error(`Unexpected call: ${JSON.stringify({ tipo, criterios, ID, nomeR, nomeF })}`);
}

const storage = new MemoryStorage();
const globais = {
    numPDC_temp: 'ROOT', idPDC: '100', tipo: 'editar_pdc', numPDC: '3008',
    pag: 'checagem_final', perfilResponsavel: 'Controladoria', cotacaoExiste: true,
    nomeRelPDC: 'PDC_Digital_API', nomeFormPDC: 'PDC_Digital',
    nomeRelCot: 'Cotacoes_API', nomeFormCot: 'Cotacoes',
    arquivosNovos: new Map(), arquivosExistentes: new Map(), arquivosRemovidos: []
};

const context = {
    console, Blob, crypto: require('node:crypto').webcrypto,
    localStorage: storage, sessionStorage: storage,
    location: { href: 'https://example.test/widget?num_pdc_temp=ROOT&pag=checagem_final' },
    navigator: { locks: { request: async (_name, _options, action) => action() } },
    document: {
        querySelector() { return { options: [{ text: 'PRODUTO' }], selectedIndex: 0 }; },
        getElementById() { return { checked: false }; },
        querySelectorAll() { return rows; },
        dispatchEvent() {}, addEventListener() {}
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setInterval, clearInterval, setTimeout, Map, Set, Date, Math, JSON, String, Number, Array, Object,
    globais, executar_apiZoho,
    pegarDadosNF_V2: () => ({}),
    pegarDadosClassificacao_V2: () => ({}),
    pegarDadosPDC_V2: (index, temp) => ({
        id_temp: temp,
        Descricao: `valor-${rows[index].value}`,
        Datas: [{ Numero_da_parcela: index + 1, Valor: rows[index].value, parcela_criada: true }]
    }),
    pegarDadostabPrecos: temp => [[{ num_pdc_temp: temp, Ativo: true, Produto: 'A' }], {}],
    meshData: async status => new Map([[0, {
        PDCsData: globais.numPDC_temp === 'ROOT' ? {
            id_temp: 'ROOT', Status_geral: status,
            Datas: rows.map((row, index) => ({ Numero_da_parcela: index + 1, parcela_criada: row.createdInput.checked }))
        } : {
            id_temp: globais.numPDC_temp, Status_geral: status,
            Datas: [{ Numero_da_parcela: 1, parcela_criada: true }]
        },
        priceTableData: [{ num_pdc_temp: globais.numPDC_temp, Ativo: true, Produto: 'A' }]
    }]])
};
vm.createContext(context);
vm.runInContext(`${splitter}\n${engine}\nthis.saveTableData_V3 = saveTableData_V3;`, context);

const options = {
    status: 'Ass. control.',
    sepPorParc: true,
    parcelasSelecionadas: true,
    permitirAtualizacaoAjuste: true,
    finalizarParcelasNaChecagem: true,
    paramsExtraPDC: {
        Assinaturas: [
            { Usuario: 'Controladoria', Assinado: true },
            { Usuario: 'Mario', Assinado: false }
        ]
    }
};

(async () => {
    await context.saveTableData_V3(options);
    assert.equal(pdc.get('100').Status_geral, 'Chec. final');
    assert.deepEqual(pdc.get('100').Datas.map(item => item.parcela_criada), [true, false]);
    assert.equal(pdc.get('101').id_temp, 'ROOT/01');
    assert.equal(pdc.get('101').Status_geral, 'Ass. control.');
    assert.deepEqual(pdc.get('101').Assinaturas.map(item => item.Usuario), ['Controladoria', 'Mario']);

    rows[0].createdInput.checked = true;
    rows[0].selectedInput.checked = false;
    rows[1].selectedInput.checked = true;
    await assert.rejects(() => context.saveTableData_V3(options), /progresso foi preservado/);
    await context.saveTableData_V3(options);
    assert.equal(pdc.get('100').Status_geral, 'Separado em parcelas');
    assert.deepEqual(pdc.get('100').Datas.map(item => item.parcela_criada), [true, true]);
    assert.equal(pdc.get('102').id_temp, 'ROOT/02');
    assert.deepEqual(pdc.get('102').Assinaturas.map(item => item.Usuario), ['Controladoria']);
    assert.equal(createCalls, 2);

    rows[1].createdInput.checked = true;
    globais.numPDC_temp = 'ROOT/01';
    globais.idPDC = '101';
    await context.saveTableData_V3({
        status: 'Ajuste sol. control.',
        paramsExtraPDC: { Solicitacao_de_ajuste: 'Corrigir vencimento' },
        resolucaoAposSalvar: {
            tipo: 'solicitar_ajuste_parcela',
            parentTempId: 'ROOT',
            solicitacaoDeAjuste: 'Corrigir vencimento'
        }
    });
    assert.equal(pdc.get('101').Status_geral, 'Ajuste sol. control.');
    assert.equal(pdc.get('100').Status_geral, 'Chec. final');
    assert.equal(pdc.get('100').Solicitacao_de_ajuste, 'Corrigir vencimento');

    globais.numPDC_temp = 'ROOT';
    globais.idPDC = '100';
    rows[0].dataset.statusFilho = 'Ajuste sol. control.';
    rows[0].selectedInput.checked = true;
    rows[1].selectedInput.checked = false;
    rows[0].value = 150;
    await context.saveTableData_V3(options);
    assert.equal(createCalls, 2, 'reenvio de ajuste deve atualizar o filhote existente');
    assert.equal(pdc.get('101').Descricao, 'valor-150');
    assert.equal(pdc.get('101').Status_geral, 'Ass. control.');
    assert.deepEqual(pdc.get('101').Assinaturas.map(item => item.Usuario), ['Controladoria']);
    assert.equal(pdc.get('100').Status_geral, 'Separado em parcelas');
    console.log('final check installments simulation: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
