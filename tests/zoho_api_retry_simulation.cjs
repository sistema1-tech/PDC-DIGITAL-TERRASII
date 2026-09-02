const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('app/js/007_utils.js', 'utf8');
const start = source.indexOf('export async function executar_apiZoho');
const end = source.indexOf('export function formatToBRL_V2');
const apiSource = source.slice(start, end).replace('export async function', 'async function');

let getCalls = 0;
let addCalls = 0;
const DATA = {
    async getRecords() {
        getCalls++;
        if (getCalls === 1) throw { status: 503, message: 'temporary' };
        return { code: 3000, data: [{ ID: '1' }], record_cursor: null };
    },
    async addRecords() {
        addCalls++;
        throw { responseText: JSON.stringify({ code: 5000, message: 'uncertain create' }) };
    },
    async updateRecordById() { return { code: 3000 }; },
    async updateRecords() { return { code: 3000 }; },
    async deleteRecords() { return { code: 3000 }; }
};

const context = {
    console, setTimeout, Math, JSON, Number, Set,
    globais: { nomeRelCot: 'Cotacoes_API', nomeFormCot: 'Cotacoes', nomeApp: 'terras-de-sao-jose-ii' },
    ZOHO: { CREATOR: { DATA, FILE: { async uploadFile() { return { code: 3000 }; } } } }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${apiSource}\nthis.executar_apiZoho = executar_apiZoho;`, context);

(async () => {
    const records = await context.executar_apiZoho({ tipo: 'busc_reg', criterios: '(ID!=0)', nomeR: 'PDC_Digital_API' });
    assert.strictEqual(getCalls, 2, 'consultas seguras devem repetir após falha transitória');
    assert.strictEqual(records.length, 1);

    const create = await context.executar_apiZoho({ tipo: 'add_reg', corpo: { id_temp: 'X' }, nomeF: 'PDC_Digital' });
    assert.strictEqual(addCalls, 1, 'inclusões não podem ser repetidas cegamente');
    assert.strictEqual(Number(create.code), 5000);

    DATA.getRecords = async () => { throw { responseText: JSON.stringify({ code: 9280, message: 'no records' }) }; };
    const empty = await context.executar_apiZoho({ tipo: 'busc_reg', criterios: '(ID==0)', nomeR: 'PDC_Digital_API' });
    assert.deepStrictEqual([...empty], []);
    console.log('zoho api retry simulation: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
