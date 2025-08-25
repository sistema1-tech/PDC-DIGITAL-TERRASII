function formatarNumeroDecimal(input) {
    // Converte o input para string e remove caracteres não numéricos
    let numeroStr = input.toString().replace(/[^0-9]/g, '');

    // Verifica se há pelo menos 2 dígitos
    if (numeroStr.length < 2) {
        throw new Error('O número deve conter pelo menos dois dígitos.');
    }

    // Separa os dois últimos dígitos para a parte decimal
    let parteInteira = numeroStr.slice(0, -2);
    let parteDecimal = numeroStr.slice(-2);

    // Se não houver parte inteira, define como '0'
    if (parteInteira === '') {
        parteInteira = '0';
    }

    // Monta o número formatado em decimal
    let numeroFormatado = `${parteInteira}.${parteDecimal}`;

    return parseFloat(numeroFormatado).toFixed(2); // Retorna como número com 2 casas decimais
}