const Router = require('koa-router');
const apiController = require('./controller/api');
const healthcheckController = require('./controller/healthcheck');

module.exports = function routes() {
    const router = new Router({});

    router.get('liveness', '/_hc_liveness', healthcheckController.live);
    router.get('readiness', '/_hc_readiness', healthcheckController.ready);

    // router.get('apiAdd', '/api/add', apiController.add);
    // router.get('apiStatus', '/api/status', apiController.setStatus);
    // router.get(
    //     'apiListItineraries',
    //     '/api/itinerary',
    //     apiController.listItineraries
    // );
    // router.get(
    //     'apiGetItinerary',
    //     '/api/itinerary/:id',
    //     apiController.getItinerary
    // );

    return router;
};
