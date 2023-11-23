const httpStatus = require('http-status');
const itineraryRepository = require('../repository/itinerary');
const ItinerarySchema = require('../repository/schemas/itinerary');
const priceHistoryRepository = require('../repository/priceHistory');
const { logger } = require('hotelurbano-microservices');
const populateCron = require('../worker/populateQueue');
const helper = require('../helper/itinerary');

let enabledAirports = require('../../public/assets/js/airports.json');

enabledAirports = enabledAirports
    .map((ap) => {
        return ap.iata ? ap.iata : ap.icao;
    })
    .filter((item) => {
        if (item == '') return false;
        if (item.includes('%')) return false;

        return true;
    });

const add = async (ctx) => {
    const origin = ctx.request.query.origin;
    const destination = ctx.request.query.destination;
    const nights = Number.parseInt(ctx.request.query.nights);
    const source = ctx.request.query.source;

    if (
        origin == destination ||
        !origin ||
        !destination ||
        !nights ||
        !source ||
        !enabledAirports.includes(origin) ||
        !enabledAirports.includes(destination) ||
        !ItinerarySchema.sources().includes(source) ||
        isNaN(nights)
    ) {
        ctx.status = httpStatus.BAD_REQUEST;
        ctx.body = {
            error: 'Please, check informed parameters',
        };
        return;
    }

    try {
        const item = {};
        item.origin = origin;
        item.destination = destination;
        item.nights = nights;
        item.source = source;

        const Itinerary = itineraryRepository().useReadPolicy();
        const itinerary = new Itinerary(item);
        await itinerary.save();
        populateCron.populate(itinerary, Date.now());
    } catch (err) {
        console.log(err);
        logger.error('Error creating itinerary', {
            error: String(err),
            queryParameters: ctx.request.query,
        });
        ctx.status = httpStatus.INTERNAL_SERVER_ERROR;
        ctx.body = { error: err };
        return;
    }

    ctx.body = { ok: true };
};

const setStatus = async (ctx) => {
    const id = ctx.request.query.id;
    const to = Number.parseInt(ctx.request.query.to);

    if ([id, to].includes(undefined) || ![0, 1].includes(to)) {
        ctx.status = httpStatus.BAD_REQUEST;
        ctx.body = {
            error: 'Please, check informed parameters',
        };
        return;
    }

    const Itinerary = itineraryRepository(ctx.mongoose).useReadPolicy();

    const itinerary = await Itinerary.byPk(id);

    if (itinerary.length === 0) {
        ctx.status = httpStatus.NOT_FOUND;
        ctx.body = {
            error: 'Itinerary not found',
        };
        return;
    }

    itinerary[0].running_state = to === 0 ? 'disabled' : 'queued';
    await itinerary[0].save();

    ctx.body = { ok: true };
};

const listItineraries = async (ctx) => {
    const Itinerary = itineraryRepository(ctx.mongoose).useReadPolicy();

    const itineraries = await Itinerary._find();

    ctx.body = {
        results: itineraries.map((item) => {
            return {
                id: item.id,
                source: item.source,
                aerodrome_departure: item.origin,
                aerodrome_arrival: item.destination,
                nights: item.nights,
                running_state: item.running_state,
                created_at: item.created_at,
                updated_at: item.updated_at,
            };
        }),
    };
};

const getItinerary = async (ctx) => {
    const priceRepositoryDB = priceHistoryRepository(
        ctx.mongoose
    ).useReadPolicy();

    const itineraryId = ctx.request.params.id;

    if (!itineraryId) {
        ctx.status = httpStatus.NOT_FOUND;
        return;
    }

    const foundData = await priceRepositoryDB._find(
        { itinerary_id: itineraryId, price_low: { $exists: true } },
        { limit: 100000, sort: { created_at: -1 } }
    );

    if (!foundData || foundData.length === 0) {
        ctx.status = httpStatus.NOT_FOUND;
        return;
    }

    let [origin, destination, nights] = itineraryId.split('_');
    nights = Number(nights);

    const multiple = {};
    const lowest = await helper.runLowestPricesFromRunId(itineraryId, 25);
    Object.values(lowest).forEach((data) => {
        multiple[data.date] = data.prices
            .map((item, index) => {
                const airline = data.airlines[index].split('_');
                return {
                    p: Number.parseInt(item * 100) / 100,
                    n: index + 1,
                    a: {
                        d: airline[0],
                        r: airline[1],
                    },
                };
            })
            .filter((item) => item);
    });

    let history = await helper.historicalPricesOfItinerary(itineraryId);
    history = history
        .map((item) => {
            return {
                d: item.date,
                l: Number.parseInt(item.low * 100) / 100,
                h: Number.parseInt(item.high * 100) / 100,
                a: Number.parseInt(item.average * 100) / 100,
                m: Number.parseInt(item.median * 100) / 100,
                s: Number.parseInt(item.stdev * 100) / 100,
                c: item.currency,
                p: item.source,
            };
        })
        .filter((item) => item);

    ctx.body = {
        metadata: {
            aerodrome_departure: origin,
            aerodrome_arrival: destination,
            duration_nights: nights,
            'legend_results.history': {
                d: 'date_departure',
                l: 'price_low',
                h: 'price_high',
                a: 'price_average',
                m: 'price_median',
                s: 'price_standard_deviation',
                c: 'price_currency',
                p: 'source_provider',
            },
            'legend_results.colected_dates_300_days_ahead': {
                a: 'airline',
                d: 'departure',
                r: 'return',
                p: 'price_low',
                n: 'day_ahead',
            },
        },
        results: {
            history,
            colected_dates_300_days_ahead: multiple,
        },
    };
};

module.exports = { add, setStatus, listItineraries, getItinerary };
