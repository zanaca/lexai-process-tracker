const slugify = (text) =>
    text
        .toString()
        .normalize('NFKD')
        .toLocaleLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\_/g, '-')
        .replace(/\-\-+/g, '-')
        .replace(/\-$/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const arrayUniqueElements = (data) => [...new Set(data)];

const cnpjOnlyNumbers = (cnpj) => cnpj.replace(/![\D]/g, '');

const cnpjFromNumbers = (numbers) => String(numbers).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

const camelize = (str) => str.toLocaleLowerCase().split(' ').map(item => item[0].toLocaleUpperCase() + item.slice(1)).join(' ')


const RTF_REPLACEMENTS = {
    '\\b0': '</strong>',
    '\\b': '<strong>',
    '\\ulnone': '</u>',
    '\\ul': '<u>',
    '\\i0': '</em>',
    '\\i': '<em>',
    '\\par \\pard': "\n\n",
}

RTF_REPLACEMENTS_KEYS =  Object.keys(RTF_REPLACEMENTS);

const replaceRtfToHtml = (text_raw) => {
    let text = text_raw.slice();
    for (const key of RTF_REPLACEMENTS_KEYS) {
        text = text.replaceAll(key, RTF_REPLACEMENTS[key]);
    }

    return text;
}
module.exports = {
    RTF_KEYS: RTF_REPLACEMENTS_KEYS,

    slugify,
    sleep,
    arrayUniqueElements,
    cnpjOnlyNumbers,
    cnpjFromNumbers,
    replaceRtfToHtml,
    camelize,
};
