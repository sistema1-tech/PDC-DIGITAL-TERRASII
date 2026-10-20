const LIMITE_NOME_ARQUIVO_ZOHO = 150;

function removerAcentos(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza o nome do arquivo para o formato aceito pelo Zoho Creator,
 * preservando a extensão e evitando caracteres que quebram o upload.
 */
export function sanitizarNomeArquivoZoho(nomeOriginal, nomePadrao = 'anexo') {
    const nome = removerAcentos(nomeOriginal).trim();
    const ultimoPonto = nome.lastIndexOf('.');
    const possuiExtensao = ultimoPonto > 0 && ultimoPonto < nome.length - 1;
    const baseOriginal = possuiExtensao ? nome.slice(0, ultimoPonto) : nome;
    const extensaoOriginal = possuiExtensao ? nome.slice(ultimoPonto + 1) : '';

    let base = baseOriginal
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[-_]+|[-_]+$/g, '');
    let extensao = extensaoOriginal
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toLowerCase();

    if (!base) base = removerAcentos(nomePadrao).replace(/[^a-zA-Z0-9_-]+/g, '_') || 'anexo';
    if (extensao.length > 20) extensao = extensao.slice(0, 20);

    const sufixo = extensao ? `.${extensao}` : '';
    const limiteBase = Math.max(1, LIMITE_NOME_ARQUIVO_ZOHO - sufixo.length);
    base = base.slice(0, limiteBase).replace(/[-_]+$/g, '') || 'anexo';
    return `${base}${sufixo}`;
}

/**
 * Retorna um File com nome seguro, mantendo conteúdo, tipo e data originais.
 */
export function prepararArquivoParaUploadZoho(arquivo, nomePreferido = arquivo?.name) {
    if (!(arquivo instanceof Blob)) return arquivo;
    const nomeSeguro = sanitizarNomeArquivoZoho(nomePreferido || arquivo.name);
    if (arquivo instanceof File && arquivo.name === nomeSeguro) return arquivo;
    return new File([arquivo], nomeSeguro, {
        type: arquivo.type || 'application/octet-stream',
        lastModified: arquivo.lastModified || Date.now()
    });
}
