const Koa = require('koa');
const routesFactory = require('./routes');
const mongoose = require('./mongoose');
const logger = require('hotelurbano-microservices').logger;
const compress = require('koa-compress');
const robotstxt = require('koa-robotstxt');
const favicon = require('koa-favicon');
const bodyParser = require('koa-body-parser');
const handlebars = require('koa-handlebars-next');
const serve = require('koa-static');
const session = require('koa-generic-session');
const memcachedStore = require('koa-memcached');
const errorMiddleware = require('@hurb/koa-error');
const loggerMiddleware = require('@hurb/koa-logger');

const app = new Koa();
app.keys = ['5x__sVeapca3bzZr', 'RsBls_saxa2a/'];

const routes = routesFactory(app);

async function setupEnv(ctx, next) {
  logger.contextFields = {
    app_hostname: ctx.headers.host,
    remote_addr: ctx.request.ip,
    request_uri: ctx.path,
    origin: ctx.headers.origin || undefined
  };
  ctx.logger = logger;
  ctx.mongoose = mongoose;

  let origin = '*';
  if (ctx.headers.origin) {
    origin = ctx.headers.origin;
  }
  ctx.set('Access-Control-Allow-Credentials', true);
  ctx.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With');
  ctx.set('Access-Control-Max-Age', 1000);
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  ctx.set('Access-Control-Allow-Origin', origin);

  await next();
}

app
  .use(robotstxt('./public/robots.txt'))
  .use(favicon('./public/favicon.ico'))
  .use(serve('./public/assets'))
  .use(
    session({
      key: 'aSID',
      cookie: {
        signed: true,
        maxAge: 1000 * 60 * 5
      },
      signed: true,
      store: memcachedStore({ host: process.env.SESSION_MEMCACHE_HOST, port: process.env.SESSION_MEMCACHE_PORT })
    })
  )
  .use(bodyParser())
  .use(
    compress({
      filter: function cType(contentType) {
        return /(text|javascript|json)/i.test(contentType);
      },
      threshold: 2048,
      flush: require('zlib').Z_SYNC_FLUSH
    })
  )
  .use(
    handlebars({
      cache: process.env.NODE_ENV !== 'development',
      defaultLayout: 'main',
      extension: ['html', 'js', 'tpl'],
      root: process.cwd() + '/src/templates'
    })
  )
  .use(setupEnv)
  .use(errorMiddleware())
  .use(loggerMiddleware({ loggerInstance: logger }))
  .use(routes.routes())
  .use(routes.allowedMethods());

module.exports = app;
