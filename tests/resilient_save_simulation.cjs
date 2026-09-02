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
let nextPdc = 101;
let nextQuote = 1;
let losePdcCreate = true;
let failResolutionOnce = true;

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
            return quotes.filter(item => item.num_pdc_temp === temp && item.Ativo === true);
        }
        if (nomeR === 'Documentos_API') return [];
    }

    if (tipo === 'add_reg' && nomeF === 'PDC_Digital') {
        const id = String(nextPdc++);
        pdc.set(id, { ID: id, ...corpo });
        if (losePdcCreate) {
            losePdcCreate = false;
            return { code: 5000, message: 'lost response' };
        }
        return { code: 3000, data: { ID: id } };
    }

    if (tipo === 'add_reg' && nomeF === 'Cotacoes') {
        const records = Array.isArray(corpo) ? corpo : [corpo];
        const result = records.map(record => {
            const ID = `q${nextQuote++}`;
            quotes.push({ ID, ...record });
            return { code: 3000, data: { ID } };
        });
        return { result };
    }

    if (tipo === 'atualizar_reg' && ID) {
        const current = pdc.get(String(ID));
        if (!current) return { code: 404 };
        if (String(ID) === '101' && corpo.Status_geral === 'Ass. control.' && failResolutionOnce) {
            failResolutionOnce = false;
            return { code: 5000, message: 'temporary interruption' };
        }
        pdc.set(String(ID), { ...current, ...corpo });
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

async function splitDataByInstallments(status) {
    return new Map([
        [0, {
            PDCsData: { id_temp: 'ROOT/01', Status_geral: status },
            priceTableData: [{ num_pdc_temp: 'ROOT/01', Ativo: true, Produto: 'A', Quantidade: 1 }]
        }],
        [1, {
            PDCsData: { id_temp: 'ROOT/02', Status_geral: status },
            priceTableData: [{ num_pdc_temp: 'ROOT/02', Ativo: true, Produto: 'A', Quantidade: 1 }]
        }]
    ]);
}

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
    globais, executar_apiZoho, customModal_V2: async () => {}, splitDataByInstallments, meshData
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${engine}\nthis.saveTableData_V3 = saveTableData_V3;`, context);

(async () => {
    const options = {
        status: 'Prop. criada', sepPorParc: true,
        paramsExtraPDC: { Assinaturas: [{ Usuario: 'Controladoria', Assinado: true }] },
        resolucaoAposSalvar: { tipo: 'enviar_p_ass_control', statusPrimeiroPdc: 'Ass. control.', salvarPdcOriginalSeparado: true }
    };

    await assert.rejects(() => context.saveTableData_V3(options), /progresso foi preservado/);

    // Simula um diário gravado pela implementação anterior, que já havia
    // colocado assinaturas também na segunda parcela.
    const pendingEntry = [...storage.data.entries()].find(([, value]) => value.includes('"version":3'));
    const pending = JSON.parse(pendingEntry[1]);
    pending.items[1].pdcData.Assinaturas = [{ Usuario: 'Assinatura indevida' }];
    pending.items[1].pdcDone = true;
    storage.setItem(pendingEntry[0], JSON.stringify(pending));
    pdc.get('102').Assinaturas = [{ Usuario: 'Assinatura indevida' }];

    const ids = await context.saveTableData_V3(options);
    assert.deepStrictEqual([...ids], ['101', '102']);
    assert.strictEqual(pdc.get('101').Status_geral, 'Ass. control.');
    assert.strictEqual(pdc.get('101').Assinaturas.length, 1);
    assert.strictEqual(pdc.get('102').Status_geral, 'Prop. criada');
    assert.strictEqual(pdc.get('102').Assinaturas.length, 0);
    assert.strictEqual(pdc.get('100').Status_geral, 'Separado em parcelas');
    assert.strictEqual([...pdc.values()].filter(item => item.id_temp === 'ROOT/01').length, 1);
    assert.strictEqual([...pdc.values()].filter(item => item.id_temp === 'ROOT/02').length, 1);
    assert.strictEqual(quotes.filter(item => item.num_pdc_temp === 'ROOT/01' && item.Ativo).length, 1);
    assert.strictEqual(quotes.filter(item => item.num_pdc_temp === 'ROOT/02' && item.Ativo).length, 1);
    assert.strictEqual(quotes.filter(item => item.num_pdc_temp === 'ROOT' && item.Ativo).length, 1);
    console.log('resilient save simulation: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
