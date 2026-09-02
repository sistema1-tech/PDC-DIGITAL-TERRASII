const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('app/js/006_save_utils.js', 'utf8');
const start = source.indexOf('const SAVE_JOURNAL_VERSION');
const end = source.indexOf('export async function tratarSalvamentoPDC');
const engine = source.slice(start, end).replace(/export\s+async\s+function/g, 'async function');

class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}

const pdc = new Map([['100', { ID: '100', id_temp: 'ROOT', Status_geral: 'Prop. criada' }]]);
const quotes = [{ ID: 'q-old', num_pdc_temp: 'ROOT', Ativo: true, Produto: 'A', Quantidade: 1 }];
let addPdcCalls = 0;

function criterionValue(criteria, field) {
    return criteria.match(new RegExp(`${field}==\\"([^\\"]+)\\"`))?.[1];
}

async function executar_apiZoho({ tipo, criterios, ID, corpo, nomeR, nomeF }) {
    if (tipo.startsWith('busc_reg')) {
        if (nomeR === 'PDC_Digital_API') {
            const temp = criterionValue(criterios, 'id_temp');
            return [...pdc.values()].filter(item => item.id_temp === temp);
        }
        if (nomeR === 'Cotacoes_API') {
            const temp = criterionValue(criterios, 'num_pdc_temp');
            return quotes.filter(item => item.num_pdc_temp === temp && item.Ativo === true);
        }
        if (nomeR === 'Documentos_API') return [];
    }
    if (tipo === 'add_reg' && nomeF === 'PDC_Digital') {
        addPdcCalls++;
        return { code: 5000 };
    }
    if (tipo === 'add_reg' && nomeF === 'Cotacoes') {
        const records = Array.isArray(corpo) ? corpo : [corpo];
        records.forEach((record, index) => quotes.push({ ID: `q${index + 1}`, ...record }));
        return { result: records.map((_, index) => ({ code: 3000, data: { ID: `q${index + 1}` } })) };
    }
    if (tipo === 'atualizar_reg' && ID) {
        pdc.set(String(ID), { ...pdc.get(String(ID)), ...corpo });
        return { code: 3000 };
    }
    if (tipo === 'atualizar_reg' && criterios) {
        const temp = criterionValue(criterios, 'num_pdc_temp');
        quotes.forEach(item => { if (item.num_pdc_temp === temp && item.Ativo === true) item.Ativo = false; });
        return { code: 3000 };
    }
    if (tipo === 'deletar_reg') return { code: 3000 };
    throw new Error(`Unexpected API call: ${JSON.stringify({ tipo, criterios, ID, nomeR, nomeF })}`);
}

const storage = new MemoryStorage();
const globais = {
    numPDC_temp: 'ROOT', idPDC: '100', tipo: 'editar_pdc', cotacaoExiste: true,
    nomeRelPDC: 'PDC_Digital_API', nomeFormPDC: 'PDC_Digital',
    nomeRelCot: 'Cotacoes_API', nomeFormCot: 'Cotacoes',
    arquivosNovos: new Map(), arquivosExistentes: new Map(), arquivosRemovidos: []
};

async function meshData(status) {
    return new Map([[0, {
        PDCsData: { id_temp: 'ROOT', Status_geral: status },
        priceTableData: [{ num_pdc_temp: 'ROOT', Ativo: true, Produto: 'A', Quantidade: 1 }]
    }]]);
}

const context = {
    console, Blob, File: global.File || class File extends Blob { constructor(parts, name, opts) { super(parts, opts); this.name = name; this.lastModified = opts.lastModified; } },
    globalThis: null, crypto: require('crypto').webcrypto, localStorage: storage, sessionStorage: storage,
    location: { href: 'https://example.test/widget?num_pdc_temp=ROOT' },
    navigator: { locks: { request: async (_name, _opts, action) => action() } },
    document: { dispatchEvent() {}, addEventListener() {} }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setInterval, clearInterval, setTimeout, Map, Set, Date, Math, JSON, String, Number, Array, Object,
    globais, executar_apiZoho, customModal_V2: async () => {}, splitDataByInstallments: async () => { throw new Error('não deve separar'); }, meshData
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${engine}\nthis.saveTableData_V3 = saveTableData_V3;`, context);

(async () => {
    const ids = await context.saveTableData_V3({
        status: 'Ass. control.',
        sepPorParc: false,
        paramsExtraPDC: { Assinaturas: [{ Usuario: 'Controladoria', Assinado: true }] }
    });
    assert.deepStrictEqual([...ids], []);
    assert.strictEqual(addPdcCalls, 0, 'parcela única deve atualizar o PDC original');
    assert.strictEqual(pdc.size, 1);
    assert.strictEqual(pdc.get('100').Status_geral, 'Ass. control.');
    assert.strictEqual(pdc.get('100').Assinaturas.length, 1);
    console.log('single installment simulation: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
