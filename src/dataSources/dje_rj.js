#!/usr/bin/env node

if (!process.env.npm_package_name) {
    require('dotenv').config({
        path: '../../.env'
    })
}

const fs = require('fs');
const request = require('../lib/request');
const {
    sleep,
    arrayUniqueElements
} = require('../lib/util');
const logger = require('../services/logger');
const nsqService = require('../services/nsq');
const courtHelper = require('../lib/courtHelper');
const auctionRepository = require('../repository/auction');
const auctionTimelineRepository = require('../repository/auctionTimeline');
const pdfProcessorRepository = require('../repository/pdfProcessor');
const partiesRepository = require('../repository/parties');
const mongoose = require('../mongoose');

const NAME = 'Diário de Justiça do Rio de Janeiro';
const ID = 'DJE-RJ';

const BACKUP_RAW_PDF_DATA = true;
const BASE_URL = 'https://www3.tjrj.jus.br/consultadje';

const TYPE_1A_CAPITAL = 'C';
const TYPE_1A_INTERIOR = 'I';
const TYPE_2A = 'S';
const TYPE_EDICT = 'E';

const TYPE_MAP = {}
TYPE_MAP[TYPE_1A_CAPITAL] = '1a Instância - Capital';
TYPE_MAP[TYPE_1A_INTERIOR] = '1a Instância - Interior';
TYPE_MAP[TYPE_2A] = '2a Instância';
TYPE_MAP[TYPE_EDICT] = 'Edital e demais publicações';

const AVAILABLE_TYPES = Object.keys(TYPE_MAP);

const PAGE_HEADER_REGEX = 'Ano ([0-9]{1,2}) – nº ([0-9]{1,3})\/[[CURRENT_YEAR]]';

const PAGE_FOOTER = "Publicação Oficial do Tribunal de Justiça do Estado do Rio de Janeiro – Lei Federal nº 11.419/2006, art. 4º e Resolução TJ/OE nº 10/2008.";

const PROC_PATTERNS = [
    /Proc\.\s+[REGEX]/,
    /Processo:\s+[REGEX]/,
    /[0-9]{3,4}\.\s+[A-ZÀ-ú\s\-]+[REGEX]/,
];

const MAX_CHAR_LENGTH_BEFORE_PARAGRAPH_AND_PROC = 2000; // at the beggining, first pages have no desired content and create a huge string

const BOOK_COMPLETED = {};

const AuctionDB = auctionRepository(mongoose).useReadPolicy();
const AuctionTimeline = auctionTimelineRepository(mongoose).useReadPolicy();
const PdfProcessorDB = pdfProcessorRepository(mongoose).useReadPolicy();
const PartiesDB = partiesRepository(mongoose).useReadPolicy();

const { STORE_PDF } = process.env;
const dynamicProcPattern = (proc) => {
    if (!proc) {
        proc = courtHelper.REGEXP_NUMERO_PROCESSO;
    }

    return PROC_PATTERNS.map((item) => new RegExp(item.toString().slice(1, -1).replace('[REGEX]', proc)));
}

const validateDate = async (date) => {
    const url = `${BASE_URL}/Caderno.asmx/ValidaDia?data="${date}"`;
    try {
        const req = await request.get(url, {
            headers: {
                'content-type': 'application/json'
            }
        });
        const data = req.data;

        return [data.d == "", data.d];

    } catch (error) {
        logger.error(`Error getting page qty for date ${date} and type ${type}`, {
            error,
            callee: 'dje_rj#getPageQty'
        });

        return [false, error];
    }
}

const getPageQty = async (date, type) => {
    const dateBr = date.split('-').reverse().join('/');
    const url = `${BASE_URL}/Caderno.asmx/ConsultarQuantidadePaginas?dtPub="${dateBr}"&codCaderno="${type}"`;

    if (!AVAILABLE_TYPES.includes(type)) {
        logger.error(`Invalid type ${type}`, {
            callee: 'dje_rj#getPageQty'
        });
        return new Error(`Invalid type ${type}`);
    }

    try {
        const req = await request.get(url, {
            headers: {
                'content-type': 'application/json'
            }
        });
        const data = req.data;

        return Number(data.d);

    } catch (error) {
        logger.error(`Error getting page qty for date ${date} and type ${type}`, {
            error,
            callee: 'dje_rj#getPageQty'
        });

        return error;
    }
}

const getInstancia = (caderno) => {
    if ([TYPE_1A_CAPITAL, TYPE_1A_INTERIOR].includes(caderno)) {
        return 1;
    } else if (caderno === TYPE_2A) {
        return 2;
    }

    return 0;
}

const storePdf = async (pdfBlob, pdfFileName, pdfMetadata) => {
    // TODO: where to real store the pdf?
    fs.writeFileSync(`/tmp/${pdfFileName}`, pdfBlob);
    fs.writeFileSync(`/tmp/${pdfFileName.replace('.pdf', '.metadata.json')}`, JSON.stringify(pdfMetadata, null, 4));

    return `/tmp/${pdfFileName}`;
}

const downloadPdf = async (url) => {
    const pdfBlob = await request({
        url,
        method: 'GET',
        responseType: 'arraybuffer'
    });
    if (pdfBlob.status !== 200) {
        throw new Error(`Error downloading PDF from ${url}`);
    }

    const blob = new Blob([pdfBlob.data], {
        type: 'application/pdf',
        encoding: 'UTF-8'
    })
    const content = Buffer.from(await blob.arrayBuffer());

    if (content.length == 0) {
        // console.log('zero', url)
        throw new Error(`Empty PDF from ${url}`);
    }
    return content;
}

const checkHeaderAndFooter = (pdfContent) => {
    const currentYear = new Date().getFullYear();
    const headerRegex = new RegExp(PAGE_HEADER_REGEX.replace('[[CURRENT_YEAR]]', currentYear), 'gm');
    const headerMatch = pdfContent.slice(0, 500).match(headerRegex);
    const footerMatch = pdfContent.slice(-500).includes(PAGE_FOOTER);

    return headerMatch && footerMatch;
}


const extractProcData = (text, proc) => {
    let textSplitted = [];
    let splitter = '';
    let found = false;

    for (const reg of dynamicProcPattern(proc)) {
        if (found) {
            break;
        }
        const matched = text.match(reg, 2);

        if (!matched) {
            continue;
        }

        splitter = matched[0];

        textSplitted = text.split(splitter);

        let pages = arrayUniqueElements(textSplitted[0].split("[page:").slice(1).map(item => item.split("]")[0]))
        
        if (textSplitted.length == 1 || pages.length > 7) {
            continue;
        }
        found = true;
    }

    // if (proc =='0876406-21.2023.8.19.0001' ) {

    //     console.log(textSplitted[0])
    // }

    if (!found) {
        logger.warn('No matching pattern found for desired process', {
            proc
        });
        return {};
    }

    let lastPos = textSplitted[0].length; // just the first part, because you can have another process inside the block itself

    // if (lastPos > 3800000) {
    //     console.log(textSplitted[0], splitter, 'TOO LONG')
    //     fs.writeFileSync(`/tmp/__${proc}.txt`, JSON.stringify({ts:textSplitted[0], text, splitter, reg},null, 4));
    //     process.exit(1)
    // }
    let page = 0;
    try {
        page = textSplitted[1].split('[[')[1].split(':')[1].split(']')[0];
    } catch (err) {
        console.log(text, 'NO PAGE');
        process.exit(1);
    }

    textSplitted[1] = textSplitted[1].replaceAll(/\[\[page:([0-9]+)\]\]/g, '');
    textSplitted[1] = textSplitted[1].replace("\n ", "\n");
    textSplitted[1] = textSplitted[1].split("\n\n")[0];

    const block = splitter + textSplitted[1];
    // if (splitter.includes('0089713-78.2023.8.19.0000')) {
    //     console.log(block)
    //     process.exit(1)
    // }

    if (block.length < 150) {
        return {};
    }

    const lawyers = courtHelper.extractLawyersFromTextByOAB({
        text: block,
        detectSide: true
    });
    if (lawyers.length > 35) {
        logger.warn('Too many lawyers', {callee: 'dje_rj#processPDFPage', proc, lawyers: lawyers.length});
    }

    let title = block.split(proc)[0].replace('Proc.', '').trim();
    if (title && title.search(/^[0-9]+\./) > -1) {
        title = title.replace(/^[0-9]+\./, '').trim();
    }
    if (!title) { // ''
        title = undefined;
    }

    const subjects = courtHelper.extractSubjectsFromText(block);

    return {
        text: block.trim(),
        page,
        proc,
        parts: lawyers,
        title,
        subjects,
        lastPos
    };
}


const processPDFPage = async ({
    pdfContent,
    pdfMetadata
}) => {
    if (BACKUP_RAW_PDF_DATA) {
        const bookIdRaw = `${ID}:${pdfMetadata.date}:${pdfMetadata.caderno}-RAW`;

        try {
            await PdfProcessorDB.addPage({
                pageNumber: pdfMetadata.page,
                bookId: bookIdRaw,
                content: pdfContent,
                pageQty: pdfMetadata.page_qty
            });
        } catch (error) {
            logger.error(error);
        }
    }

    const ok = checkHeaderAndFooter(pdfContent);
    if (!ok) {
        throw new Error(`PDF page ${pdfMetadata.page} from "${pdfMetadata.caderno}" is not in the expected format`);
    }

    // tmp
    // if (pdfMetadata.caderno != '2a Instância') {
    //     return
    // }


    const pagePlaceholder = `\n[[page:${pdfMetadata.page}]]`;
    body = pdfContent;
    if (pdfMetadata.page > 1) {
        const pageSplit = ` \n\n${pdfMetadata.page} \n\n`;
        body = pdfContent.split(pageSplit)[1].split(PAGE_FOOTER)[0];
    } else {
        body = pdfContent.split(PAGE_FOOTER)[0];
    }
    body = `\n\n${pagePlaceholder}${body.trim().replace(/\n/g, pagePlaceholder)}`;

    const bookId = `${ID}:${pdfMetadata.date}:${pdfMetadata.caderno}`;

    if (BOOK_COMPLETED[bookId]) {
        logger.info(`Book ${bookId} is already completed`);
        // console.log(`Book ${bookId} is already completed - page ${pdfMetadata.page}`);
        return;
    }

    try {
        await PdfProcessorDB.addPage({
            pageNumber: pdfMetadata.page,
            bookId,
            content: body
        });
    } catch (error) {
        logger.error(error);
    }

    let lastBookLength = Infinity;
    let sameBookLength = 0;
    if (await PdfProcessorDB.isBookCompleted({
            bookId,
            qty: pdfMetadata.page_qty
        })) {
        BOOK_COMPLETED[bookId] = true;


        let book = await PdfProcessorDB.getBook(bookId);

        let processosNum = book.match(courtHelper.REGEXP_NUMERO_PROCESSO);
        // console.log(bookId, pdfMetadata.page, book.length);
        let procCount = 0;
        for (let proc of processosNum) {
            procCount += 1;

            if (procCount %100 == 0 ) {
                const msg = `Book ${bookId} is ${procCount} of ${processosNum.length} completed (${(procCount/processosNum.length*100).toFixed(2)}%)`;
                logger.info(msg, {callee: 'dje_rj#processPDFPage'})
                console.log(msg);
            }
            // console.log(processosNum.indexOf(proc), processosNum.length, proc)
            // proc = '0008892-16.2021.8.19.0208';
            // book = book.slice(1941312, book.length);;
    
            // console.log(proc)
            let procPart = {}
            try {
                procPart = extractProcData(book, proc);
                // console.log(book.search(proc),book.length)
                // console.log(procPart, book.slice(book.search(proc)-300,book.search(proc)+ 1400));
                // process.exit(1)
                if (procPart.lastPos > 0) {
                    book = book.slice(procPart.lastPos, book.length);
                }

                
            } catch (err) {
                console.log(err);
                logger.warn(`Error extracting proc ${proc} from book ${bookId}`, {
                    callee: 'dje_rj#processPDFPage'
                });
            }
/*

            if (book.length == lastBookLength) {
                sameBookLength += 1;
            } else {
                sameBookLength = 0;
            }

            if (sameBookLength > 5) {
                logger.warn(`Error extracting proc ${proc} from book ${bookId}`, {
                    callee: 'dje_rj#processPDFPage'
                });
                console.log(proc, pdfMetadata,procPart, 'BOOKLENGTHSAME')
                process.exit(1)
                break;
            }
*/
            lastBookLength = book.length;
            

            if (Object.keys(procPart).length === 0) {
                continue;
            }

            if (procPart.text.search(proc) < 0) {
                logger.error(`Error extracting proc ${proc} from book ${bookId}`, { callee: 'dje_rj#processPDFPage' });
            }
            try {
                procPart.text = courtHelper.removeRTFtags(procPart.text);
            } catch (err) {
                console.log(err);
                logger.error(`Error removing RTF tags from proc ${proc} from book ${bookId}`, {
                    callee: 'dje_rj#processPDFPage',
                    error: err
                });
            }

            const plantiffs = [];
            const defendants = [];

            if (procPart.parts) {
                const oabs = procPart.parts.map((part) => part.oab);
                const personas = await PartiesDB._find({
                    document: {
                        $in: oabs
                    },
                    documentType: 'OAB'
                }).exec();
                const oabsExists = [];

                for (part of personas) {

                    const lawyer = procPart.parts.filter((p) => p.oab == part.document)[0];

                    oabsExists.push(part.document);
                    if (lawyer.side === courtHelper.LAWYER_SIDE_DEFENDANT) {
                        defendants.push(part._id);
                    } else if (lawyer.side === courtHelper.LAWYER_SIDE_PLANTIFF) {
                        plantiffs.push(part._id);
                    }
                }

                for (laywer of procPart.parts.filter(item => !oabsExists.includes(item.oab))) {
                    const persona = new PartiesDB();
                    persona.document = laywer.oab;
                    persona.documentType = 'OAB'
                    persona.name = laywer.name;
                    try {
                        const partiesSaved = await persona.save();
                        if (laywer.side === courtHelper.LAWYER_SIDE_DEFENDANT) {
                            defendants.push(partiesSaved._id);
                        } else if (laywer.side === courtHelper.LAWYER_SIDE_PLANTIFF) {
                            plantiffs.push(partiesSaved._id);
                        }
                    } catch (err) {
                        if (err.code !== 11000) {
                            console.log(err)
                            logger.error('error saving parties', err);

                        }
                    }

                }
            }

            let auction = await AuctionDB._find({
                proc: proc
            }).exec();

            if (auction.length > 0) {
                const update = {};
                if (!auction[0].plantiff) {
                    auction[0].plantiff = [];
                }
                if (!auction[0].defendant) {
                    auction[0].defendant = [];
                }
                update.plantiff = arrayUniqueElements(auction[0].plantiff.concat(plantiffs));
                update.defendant = arrayUniqueElements(auction[0].defendant.concat(defendants));
                if (procPart.title) {
                    update.title = procPart.title;
                }

                try {
                    await AuctionDB.updateOne({
                        _id: auction[0]._id
                    }, update, { upsert: false });
                } catch (err) {
                    console.log(err, 'UPDATE_AUCTION');
                    if (err.code !== 11000) {
                        console.log(err)
                        logger.error('error saving parties', err);
                    }
                }
            } else {
                let auctionFresh = new AuctionDB();
                auctionFresh.source = ID;
                auctionFresh.proc = proc;
                auctionFresh.instance = pdfMetadata.instancia;
                auctionFresh.plantiff = plantiffs;
                auctionFresh.defendant = defendants;
                auctionFresh.subjects = procPart.subjects;
                if (procPart.title) {
                    auctionFresh.title = procPart.title;
                }
                try {
                    await auctionFresh.save();
                } catch (err) {
                    console.log(err, auction, 'ADD_NEW_AUCTION');
                    if (err.code !== 11000) {
                        console.log(err)
                        logger.error('error saving parties', err);
                    }

                }
            }

            const auctionTL = new AuctionTimeline();
            // pdfMetadata vem da  página atual do PDF, não tem a ver com TODO O BOOK
            auctionTL.proc = proc;
            auctionTL.timeline = pdfMetadata.date
            auctionTL.page = procPart.page;
            auctionTL.text = procPart.text;
            auctionTL.book = pdfMetadata.caderno;
            auctionTL.origin = ID;
            auctionTL.url = pdfMetadata.url;

            if (!auctionTL.page) {
                console.log(auctionTL)
                process.exit(1)

            }

            try {
                await auctionTL.save();
            } catch (err) {
                if (err.code !== 11000) {
                    console.log(err)
                    logger.error('error saving parties', err);
                }
            }
        };

        await PdfProcessorDB.removeBook(bookId);
        logger.info(`Book ${bookId} is completed`);
    } else {
        logger.debug(`Book ${bookId} is not completed yet`);
    }
}

const processRawData = async ({
    date,
    type,
    page,
    page_qty,
    version = 1
} = {}) => {
    if (!AVAILABLE_TYPES.includes(type)) {
        logger.error(`Invalid type ${type}`, {
            callee: 'dje_rj#processRawData'
        });
        throw new Error(`Invalid type ${type}`);
    }

    const url = `${BASE_URL}/pdf.aspx?dtPub=${date}&caderno=${type}&pagina=${page}&_dc=${Date.now()}`;

    try {
        const pdfData = await downloadPdf(url);
        // const pdfFileName = `${ID}_${date.split('/').reverse().join('-')}_caderno_${type}_page_${page}.pdf`;
        const pdfMetadata = {
            source: ID,
            caderno: TYPE_MAP[type],
            url,
            date,
            page,
            page_qty,
            // fileName: pdfFileName,
            instancia: getInstancia(type),
        }

        if (STORE_PDF) {
            await storePdf(pdfData, pdfFileName, pdfMetadata);
        }

        return nsqService.extractPDFdata({
            base64pdf: Buffer.from(pdfData).toString('base64'),
            pdfMetadata
        });

    } catch (error) {
        logger.error(`Error getting page qty for date ${date} and type ${type}`, {
            error,
            callee: 'dje_rj#processRawData'
        });

        throw error;
    }

}


const browseData = async ({
    date = new Date.UTC().toISOString()
} = {}) => {
    if (date.split('T')[1].split(':')[0] >= 22) {
        logger.debug("Using tomorrow's date", {
            callee: 'dje_rj#main'
        });
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        date = tomorrow.toISOString().split('T')[0];
    } else {
        date = date.split('T')[0];
    }

    const validDate = await validateDate(date);
    if (validDate[1].length > 0) {
        logger.error(`Invalid date ${date}: ${validDate[1]}`, {
            callee: 'dje_rj#browseData'
        });
        return false;
    }

    const queryPages = [];
    AVAILABLE_TYPES.forEach((type) => {
        queryPages.push(getPageQty(date, type));
    });

    const typePages = await Promise.all(queryPages);

    const messages = [];
    typePages.forEach((pageQtyReq, index) => {
        const type = AVAILABLE_TYPES[index];
        logger.info(`Sending ${typePages[index]} pages from [${NAME}] ${TYPE_MAP[type]} to process`, {
            callee: 'dje_rj#main'
        });
        for (let i = 1; i <= pageQtyReq; i++) {
            const message = {
                version: 1,
                source_id: ID,
                data: {
                    type,
                    page: i,
                    page_qty: pageQtyReq,
                    date,
                }
            }
            logger.debug(`Sending page ${i} for date ${date} of type ${type}`, {
                callee: 'dje_rj#main'
            });
            messages.push(message);
        }
    });

    for (const message of messages) {
        nsqService.publishRawExternalSourceEvent({
            payload: message
        });
        await sleep(10);
    }

    return {
        pageQty: messages.length
    };
}


module.exports = {
    NAME,
    ID,
    TYPE_1A_CAPITAL,
    TYPE_1A_INTERIOR,
    TYPE_2A,
    TYPE_EDICT,

    processRawData,
    processPDFPage,
    browseData,
};