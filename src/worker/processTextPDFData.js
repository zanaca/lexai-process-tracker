#!/usr/bin/env node

const  logger  = require('../services/logger');
const { inspect } = require('util');
const sources = require('../dataSources');
const pdfProcessorRepository = require('../repository/pdfProcessor');
const mongoose = require('../mongoose');

const nsqService = require('../services/nsq');

const availableSources = Object.keys(sources);

rawExternalSubscription = nsqService.readerProcessedPDF('process_fetcher.PDFcategorizer_worker');
rawExternalSubscription.on('message', async (msg) => {
    const msgData = msg.json();
    
    if (!msgData.source_id)  {
        msgData.source_id = msgData.metadata.source;
    }

    if (!availableSources.includes(msgData.source_id)) {
        msgData.text = undefined
        logger.error(
            `Source ${msgData.source_id} is not expected`,
            {
                msgData,
            }
        );
        msg.finish();
        return;
    }

    if (msgData.text === undefined) {
        logger.error(
            `Error processing PDF data from ${msgData.source_id}`,
            {
                data: msgData.data,
                error: inspect(err),
            }
        );
        msg.finish();
        return;
    }
    try {
        await sources[msgData.source_id].processPDFPage({pdfContent: msgData.text, pdfMetadata: msgData.metadata });
        msg.finish();
    } catch (err) {
        logger.error(
            `Error processing PDF data from ${msgData.source_id}`,
            {
                data: msgData.data,
                error: inspect(err),
            }
        );
        msg.requeue(1e4, false);
    }

}).on('error', (error) => {
    logger.error(
        `Error receiving message at "${nsqService.TOPIC_RAW_MATERIAL}"`,
        {
            error: inspect(error),
        }
    );
});


if (process.argv.length > 2) {
    (async() => {
        console.log(`Processing PDFs from ${process.argv[2]}`)
        const PdfProcessorDB = pdfProcessorRepository(mongoose).useReadPolicy();    
        const PREFIX = process.argv[2];

        const pages = await PdfProcessorDB._find({bookId: { $regex: new RegExp(`^${PREFIX}`) }}).sort({pageNumber: 1}).exec();

        for (page of pages.filter(item => item.bookId.endsWith('-RAW'))) {
            // console.log('page', page.pageNumber)
            const idSplitted = page.bookId.split(':');

            await sources[idSplitted[0]].processPDFPage({pdfContent: page.content, pdfMetadata: {
                caderno: idSplitted[2].replace('-RAW', ''),
                date: idSplitted[1],
                page_qty: page.pageQty,
                page: page.pageNumber,
            }});
        }
        process.exit(0);
    })();
}