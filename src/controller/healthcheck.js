const httpStatus = require('http-status');
const instance = require('../mongoose');
const { logger } = require('hotelurbano-microservices');

const live = async (ctx) => {
  ctx.status = httpStatus.OK;
  ctx.body = { message: 'app is alive', error: false };
};

const ready = async (ctx) => {
  if (instance.connection.readyState != 1) {
    logger.error('MongoDB is down');
    ctx.status = httpStatus.SERVICE_UNAVAILABLE;
    ctx.body = { message: 'MongoDB is down', error: true };
    return;
  }
  ctx.status = httpStatus.OK;
  ctx.body = { message: 'app is ready', error: false };
};

module.exports = {
  live,
  ready
};
