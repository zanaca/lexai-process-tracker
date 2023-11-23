const nsq = require('../lib/nsq');
const logger = require('./logger');
const util = require('util');
const queue = nsq.writer({ logger });


const { NSQ_TOPIC_RAW_MATERIAL, NSQ_TOPIC_PROCESSED_PDF, NSQ_TOPIC_CONVERT_PDF } = process.env;

let retries = 1;
queue
  .on('closed', () => {
    setTimeout(() => {
      logger.notice(`Lost connection with NSQ. Reconnecting (retry #${retries})`);
      queue.connect();
      retries += 1;
    }, 1000 * retries);
  })
  .on('ready', () => {
    retries = 1;
  })
  .on('error', (err) => {
    logger.error(util.inspect(err));
  });

const publishRawExternalSourceEvent = ({ payload }) => {
  const message = payload;
  try {
    queue.publish(NSQ_TOPIC_RAW_MATERIAL, message, (err) => {
      if (err) {
        throw err;
      }
    });
  } catch (error) {
    logger.error(`failed to publish raw external source event `, {
      error: util.inspect(error)
    });
  }
};


const extractPDFdata = ({ base64pdf, pdfMetadata }) => {
  try {
    queue.publish(NSQ_TOPIC_CONVERT_PDF, { base64pdf, pdfMetadata }, (err) => {
      if (err) {
        throw err;
      }
    });
  } catch (error) {
    logger.error(`failed to publish raw pdf data`, {
      error: util.inspect(error)
    });
  }
};


const readerRawExternalSource = (channel) => {
  const data = {
      topic: NSQ_TOPIC_RAW_MATERIAL,
      channel ,
      options: {
          maxInFlight: 5,
          logger,
      },
  };

  const reader = nsq.reader(data);
  reader.connect();

  return reader;
}

const readerProcessedPDF = (channel) => {
  const data = {
      topic: NSQ_TOPIC_PROCESSED_PDF,
      channel ,
      options: {
          maxInFlight: 5,
          logger,
      },
  };

  const reader = nsq.reader(data);
  reader.connect();

  return reader;
}



module.exports = {
  NSQ_TOPIC_RAW_MATERIAL,
  NSQ_TOPIC_PROCESSED_PDF,

    publishRawExternalSourceEvent,
    extractPDFdata,
    readerRawExternalSource,
    readerProcessedPDF,
};
