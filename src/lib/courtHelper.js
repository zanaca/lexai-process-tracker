

const zeroFill = (number, size) => String(number).padStart(size, '0');
const { RTF_KEYS, camelize } = require('../lib/util');

const REGEXP_NUMERO_PROCESSO = /\d{7}-\d{2}\.\d{4}\.\d{1,2}\.\d{1,2}\.\d{4}/g;
const REGEXP_OAB = /(\d{1,6}\/[A-Z]{2}|OAB\/[A-Z]{2}-\d{1,6}|[A-Z]{2}-\d{1,6})/g;

const LAWYER_SIDE_DEFENDANT = 'D';
const LAWYER_SIDE_PLANTIFF = 'P';
const LAWYER_SIDE_UNKNOWN = 'U';

// https://www.cnj.jus.br/tribunais-estaduais/

// regras numero CNJ: https://atos.cnj.jus.br/atos/detalhar/atos-normativos?documento=119
const ORGAO_NAME = {
        STF: 'Supremo Tribunal Federal',
        STJ: 'Superior Tribunal de Justiça', // Conselho Nacional de Justiça
        TST: 'Tribunal Superior do Trabalho', // Superior Tribunal de Justiça
        JF: 'Justiça Federal',
        JT: 'Justiça do Trabalho',
        JE: 'Justiça Eleitoral',
        JMU: 'Justiça Militar da União',
        JET: 'Justiça Estadual',
        JME: 'Justiça Militar Estadual',
};

const orgaoName = (id) => {
    if (id in ORGAO_NAME) {
        return ORGAO_NAME[id]
    } 

    throw Error('Invalid Orgao ID')
}
 
const orgaoCNJId = (id) => {
    const ids = {
        STF: 1,
        STJ: 2,
        TST: 3,
        JF: 4,
        JT: 5,
        JE: 6,
        JMU: 7,
        JET: 8,
        JME: 9,
    }

    if (id in ids) {
        return String(ids[id])
    } 

    throw Error('Invalid Orgao ID')
}

const tribunalCNJId = (name) => {
    const name_lower = name.lower()
    if (name_lower.startswidth('primeiro') || name_lower[0] == '1') {
        return '1';
    } else if (name_lower.startswidth('segundo') || name_lower[0] == '2') {
        return '2';
    } else if (name_lower.startswidth('terceiro') || name_lower[0] == '3') {
        return '3';
    } else if  (name_lower.startswidth('quarto') || name_lower[0] == '4') {
        return '4';
    } else if (name_lower.startswidth('quinto') || name_lower[0] == '5') {
        return '5';
    }

    return '0';
}

const getTribunalCNJDigit = (tribunal) => {
    if (['CJF', 'CSJT', 'JF'].includes(tribunal)) {
        return '90';
    } else if (tribunal.startswith('TRF')) {
        return '0' + tribunal[3];
    } else if (tribunal.startswith('TRT')) {
        return tribunal[3].padStart(2, '0');
    } else if (tribunal.startswith('TRE')) {
        return tribunal[3].padStart(2, '0');
    } else if (tribunal.startswith('STM')) {
        return tribunal[3].padStart(2, '0');
    }


    return '00';
}

const generateCNJ = ({sequencial, ano, orgao, tribunal, unidade}) => {
    //  NNNNNNN-DD.AAAA.J.TR.OOOO
    // FIXME: VERY WIP

    if (ano > new Date().getFullYear()) {
        throw Error('Invalid year')
    }
    
    
        sequencial = zeroFill(sequencial, 7);
        ano = zeroFill(ano, 4);
        orgao_id = orgaoCNJId(orgao);
        tribunal = zeroFill(tribunal, 2);
        unidade = zeroFill(unidade, 4);

        const tribunalDigit = getTribunalCNJDigit();
    
        let checkDigit = Number(sequencial) % 97;
        checkDigit = Number(checkDigit + ano + orgao_id + tribunal) % 97;
        checkDigit = zeroFill(98 - Number(checkDigit + unidade + '00') % 97, 2);

        return `${sequencial}-${checkDigit}.${ano}.${orgao_id}.${tribunalDigit}.${unidade}`;
}

const removeRTFtags = (text) => {
    let out = text.slice();
    for (const key of RTF_KEYS) {
        out = out.replaceAll(key, '');
    }

    return out;
}

const extractOABFromText = (text) => text.match(REGEXP_OAB);


const cleanPeopleName = (name) => {
    let cleanned = camelize(name.trim().replace(/\s+/g, ' '));

    return cleanned.replace(/[^a-zA-ZÀ-ú\s\-\']/g, '').replace(/\s+/g, ' ').trim();
}

const extractLawyersFromTextByOAB = ({text, oab = undefined, detectSide = false} = {}) => {
    let OABs = [];
    if (oab) {
        OABs.push(oab);
    } else {
        OABs = extractOABFromText(text);
        if (OABs == null) {
            OABs = []
        }
    }

    let halfParts = null;
    if (detectSide) {
        halfParts = text.search(' REQDO: ');
        if (halfParts == -1) {
            halfParts = null;
        }

        if (halfParts == null) {
            halfParts = text.search(/\)\s+X\s+/);
        }
    }

    const laywers = [];
    try {
    for (let oab of OABs) {
        const textSplitted = text.split(oab);
        textSplitted[0] = textSplitted[0].split('').reverse().join('');
        let lawyer = null;
        if (textSplitted[0].includes(':')) {
            lawyer = textSplitted[0].split(':')[0].split('').reverse().join('');
        } else {
            lawyer = textSplitted[0].split('.')[0].split('').reverse().join('');
        }
        const name = cleanPeopleName(lawyer);
        oab = oab.replace('OAB/','');
        let lawyerData = {name, oab};

        if (detectSide) {
            lawyerData.side = LAWYER_SIDE_UNKNOWN;
        }
        if (halfParts) {
            if (halfParts > text.search(oab)) {
                lawyerData.side = LAWYER_SIDE_PLANTIFF;
            } else {
                lawyerData.side = LAWYER_SIDE_DEFENDANT;
            }
        }
        laywers.push(lawyerData);
    }} catch (err) {
        console.log('ERROR', OABs)
        process.exit(1)
    }


    return laywers;
}

const extractSubjectsFromText = (text) => {
    // const matched = text.replace("\n"," ").replace(/\s+/g,' ').match(/Assunto: (.*) Origem:/);
    const matched = text.replace("\n"," ").replace(/\s+/g,' ').match(/Assunto: [^:]* Origem:/);
    if (matched) {
        return matched[0].replace(' Origem:','').replace('Assunto: ','').split(' / ').map(item => item.toLocaleLowerCase().trim()).filter(item=>item.length>0);
    }

    return null;
}


module.exports = {
    ORGAO_IDS: Object.keys(ORGAO_NAME),
    ORGAOS: ORGAO_NAME,
    LAWYER_SIDE_DEFENDANT,
    LAWYER_SIDE_PLANTIFF,
    LAWYER_SIDE_UNKNOWN,

    REGEXP_NUMERO_PROCESSO,
    REGEXP_OAB,

    generateCNJ,
    orgaoName,
    removeRTFtags,
    extractOABFromText,
    extractLawyersFromTextByOAB,
    extractSubjectsFromText,
    
}