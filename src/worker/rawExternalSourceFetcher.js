#!/usr/bin/env node

const  logger  = require('../services/logger');
const sources = require('../dataSources');
const { inspect } = require('util');

const nsqService = require('../services/nsq');

const TTL = 300; // 5 minutes

let lastProcessedMessage = Date.now();
const availableSources = Object.keys(sources);

rawExternalSubscription = nsqService.readerRawExternalSource('process_fetcher.rawExternalSource_worker');

rawExternalSubscription.on('message', async (msg) => {
    const msgData = msg.json();
    lastProcessedMessage = Date.now();
    
    if (!availableSources.includes(msgData.source_id)) {
        logger.error(
            `Source ${msgData.source_id} is not expected`,
            {
                msgData,
            }
        );
        msg.finish();
        return;
    }

    try {
        await sources[msgData.source_id].processRawData(msgData.data);
        msg.finish();
    } catch (err) {
        logger.error(
            `Error processing raw data from ${msgData.source_id}`,
            {
                data: msgData.data,
                error: inspect(err),
            }
        );
        msg.requeue(1e4, false);
    }

}).on('error', (error) => {
    console.log(error)
    logger.error(
        `Error receiving message at "${nsqService.TOPIC_RAW_MATERIAL}"`,
        {
            error: inspect(error),
        }
    );
});


// availableSourcesDone = [];
availableSources.forEach(async (source) => {
    let date = new Date().toISOString();

    if (process.argv.length > 2) {
        date = process.argv[2];
    }
    console.log(`Browsing ${source} using date ${date}...`);
    await sources[source].browseData({date});
    // availableSourcesDone.push(source);
});

lastLastProcessedMessage = 0;
shownLog = false;

const hacf = () => {
    if (!shownLog && lastProcessedMessage === lastLastProcessedMessage) {
        console.log(`Should quit in ${TTL} seconds...`)
        shownLog = true; 
    }
    if (lastLastProcessedMessage != lastProcessedMessage) {
        shownLog = false;
    }
    if (lastProcessedMessage > 0 && lastProcessedMessage < (Date.now() - 1000*TTL)) {
        logger.info('All sources done, exiting.')
        console.log('All sources done, exiting.')
        process.exit(0);
    }

    lastLastProcessedMessage = lastProcessedMessage;
}
setInterval(hacf, 1000);