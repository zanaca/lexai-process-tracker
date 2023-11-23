const assert = require('assert');
const inspect = require('util');
const nsq = require('nsqjs');

let npmPackage = {};
try {
  npmPackage = require(`${process.cwd()}/package.json`); // to be used for packages wich install this module
} catch (err) {
  // Silent
}

const { SERVICE_NSQ_WRITER, SERVICE_NSQ_READER } = process.env;

const defaultOptions = {
  deflate: true,
  snappy: false
};

let loggerService = null;

const nameCapitalize = (process.env.npm_package_name || npmPackage.name || process.env.COMMAND_MODE).replace(/\b[a-z]/g, (item) =>
  item.toUpperCase()
);
const versionSuffix = process.env.NODE_ENV !== 'production' ? ` ${process.env.NODE_ENV}` : '';

const writer = ({ options = {} } = {}) => {
  Object.assign(options, defaultOptions);

  const server = options.serverAddress || SERVICE_NSQ_WRITER;
  assert.ok(Boolean(server), 'NSQ writer server NOT defined');
  options.serverAddress = undefined;

  if (options.logger) {
    loggerService = options.logger;
    options.logger = undefined;
  }

  const writer = new nsq.Writer(
    server.includes(':') ? server.split(':')[0] : server,
    server.includes(':') ? server.split(':')[1] : 4150,
    options
  );

  if (!writer.connected) {
    writer.connect();
  }

  writer.on('ready', () => {
    if (loggerService && loggerService.debug) {
      loggerService.debug('NSQ writer connection is ready');
    }
  });


  writer.on('error', (error) => {
    if (loggerService && loggerService.error) {
      loggerService.error('NSQ writer connection had an error', {
        error: inspect.inspect(error)
      });
    }
  });

  writer.on('closed', () => {
    if (loggerService && loggerService.info) {
      loggerService.info('NSQ writer connection is closed');
    }
  });

  return writer;
};

const topics = [];

const reader = ({ topic = undefined, channel = undefined, options = {} } = {}) => {
  Object.assign(options, defaultOptions);
  if (options.logger) {
    loggerService = options.logger;
    options.logger = undefined;
  }

  options.lookupdHTTPAddresses = options.lookupdHTTPAddresses || SERVICE_NSQ_READER;
  options.clientId = `SEQUOAI_${nameCapitalize}/${process.env.npm_package_version || npmPackage.version}${versionSuffix}`;

  options.maxInFlight = options.maxInFlight || 1;
  options.messageTimeout = options.messageTimeout || 6e4;
  options.maxAttempts = options.maxAttempts || 3;

  assert.ok(options.lookupdHTTPAddresses, 'NSQ reader server NOT defined');

  const readerChannel = channel || nameCapitalize.toLowerCase();
  const reader = new nsq.Reader(topic, readerChannel, options);

  if (!topics.includes(`t${topic}-c${readerChannel}`)) {
    reader.connect();
    topics.push(`t${topic}-c${readerChannel}`);
  }

  return reader;
};

module.exports = {
  reader,
  writer
};
