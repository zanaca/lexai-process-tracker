const Cache = require('hotelurbano-microservices').cache;
const ss = require('simple-statistics');
const mongoose = require('../mongoose');
const priceHistoryRepository = require('../repository/priceHistory');
const PriceHistorySchema = require('../repository/schemas/priceHistory');
const {
    genBoxplot,
    flight2airline,
    arrayUniqueElements,
} = require('../lib/util');

const LAST_DAY = Number.parseInt(process.env.MAX_DAYS_AHEAD_FLIGHT || 300);

const cacheTTL = 3600 * 3;

const fetItineraryPrices = async (itineraryId, maxDays = 548) => {
    const cacheKey = `fetItineraryPrices::${itineraryId}::${maxDays}`;
    let cache = new Cache();

    const fromCache = await cache.get(cacheKey);
    if (fromCache) {
        return fromCache;
    }

    const priceRepositoryDB = priceHistoryRepository(mongoose).useReadPolicy();

    let days = await priceRepositoryDB.aggregate([
        {
            $match: {
                itinerary_id: itineraryId,
                price_low: { $gt: 0 },
            },
        },
        {
            $group: {
                _id: { run_id: '$date_flight_departure' },
            },
        },
        { $sort: { _id: -1 } },
        { $limit: maxDays },
    ]);

    days = days.map((item) => item._id.run_id);
    firstDate = new Date(days.slice(-1)[0]);
    days.reverse();

    let daysFound = [];

    let ok = false;
    let page = 1;
    let foundData = [];
    while (!ok) {
        let result = await priceRepositoryDB._find(
            {
                state: PriceHistorySchema.STATE_OK(),
                itinerary_id: itineraryId,
                price_low: { $gt: 0 },
            },
            { limit: 5000, page, sort: { created_at: -1, day_number: -1 } }
        );

        const foundDays = result.map((item) => item.date_flight_departure);

        daysFound = arrayUniqueElements(daysFound.concat(foundDays));

        if (daysFound.length >= days.length) {
            ok = true;
        }
        result = result
            .filter((item) => new Date(item.date_flight_departure) > firstDate)
            .map((item) => item._doc);
        foundData = foundData.concat(result);
        page += 1;
    }

    foundData.reverse();

    await cache.set(cacheKey, foundData, cacheTTL);

    return foundData;
};

const runLowestPricesFromRunId = async (itineraryId, runs_qtd = 25) => {
    const prices = await fetItineraryPrices(itineraryId);

    const dataTmp = {};
    let dataDate = [];
    for (let index in prices) {
        const item = prices[index];
        if (!item.created_at) {
            continue;
        }

        let runDate =
            typeof item.created_at == 'string'
                ? item.created_at
                : item.created_at.toISOString();
        runDate = runDate.split(':')[0].replace('T', ' ') + 'h';
        if (item.flight_data) {
            const airline = item.flight_data.split('_');
            airline[0] = flight2airline(airline[0]);
            airline[1] = flight2airline(airline[1]);
            item.flight_data = airline.join('_');
        }

        if (!dataTmp[item.run_id]) {
            dataDate.push(runDate);
            dataTmp[item.run_id] = {
                date: runDate,
                prices: Array(LAST_DAY),
                airlines: Array(LAST_DAY),
            };
        }
        dataTmp[item.run_id].prices[item.day_number - 1] = item.price_low;
        dataTmp[item.run_id].airlines[item.day_number - 1] = item.flight_data;
    }

    dataDate.sort();
    dataDate = dataDate.slice(-1 * runs_qtd);

    const data = [];
    dataDate.forEach((date) => {
        const item = Object.values(dataTmp).filter(
            (item) => item.date === date
        )[0];
        data[date] = item;
    });

    return data;
};

const historicalPricesOfItinerary = async (itineraryId) => {
    const prices = await fetItineraryPrices(itineraryId);

    const dataTmp = {};
    for (let index in prices) {
        const item = prices[index];

        if (!dataTmp[item.date_flight_departure]) {
            dataTmp[item.date_flight_departure] = item;
            dataTmp[item.date_flight_departure]._median = [item.price_median];
            dataTmp[item.date_flight_departure]._stdev = [item.price_stdev];
            dataTmp[item.date_flight_departure]._average = [item.price_average];
        } else {
            if (
                item.price_low < dataTmp[item.date_flight_departure].price_low
            ) {
                dataTmp[item.date_flight_departure].price_low = item.price_low;
                dataTmp[item.date_flight_departure].source = item.source;
                dataTmp[item.date_flight_departure].fligh_data =
                    item.fligh_data;
            } else if (
                item.price_high > dataTmp[item.date_flight_departure].price_high
            ) {
                dataTmp[item.date_flight_departure].price_high =
                    item.price_high;
            }
        }
        dataTmp[item.date_flight_departure]._average.push(item.price_average);
        dataTmp[item.date_flight_departure]._median.push(item.price_median);
        dataTmp[item.date_flight_departure]._stdev.push(item.price_stdev);
    }

    for (const day in dataTmp) {
        const item = dataTmp[day];
        item.price_average =
            item._average.length === 1
                ? item._average
                : ss.average(item._average);
        item.price_stdev =
            item._stdev.length === 1
                ? item._stdev
                : Math.sqrt(
                      ss.sum(item._stdev.map((item) => item * item)) /
                          item._stdev.length
                  );
        //  average of median is not a real statistic for median
        item.price_median =
            item._median.length === 1 ? item._median : ss.average(item._median);
        delete item._average;
        delete item._stdev;
        delete item._median;
    }

    let history = {
        date: [],
        low: [],
        high: [],
        average: [],
        median: [],
        stdev: [],
        airline: [],
        currency: [],
        source: [],
        boxplot: [],
    };

    Object.values(dataTmp).forEach((item) => {
        if (item.flight_data) {
            const airline = item.flight_data.split('_');
            airline[0] = flight2airline(airline[0]);
            airline[1] = flight2airline(airline[1]);
            item.flight_data = airline.join('_');
        }

        if (item.price_low) {
            history.date.push(item.date_flight_departure);
            history.low.push(item.price_low);
            history.high.push(item.price_high);
            history.average.push(item.price_average);
            history.median.push(item.price_median);
            history.stdev.push(item.price_stdev);
            history.airline.push(item.flight_data);
            history.currency.push(item.currency);
            history.source.push(item.source);
            history.boxplot.push(genBoxplot(item));
        }
    });

    history = history.date.map((item, i) => {
        return {
            date: item,
            low: history.low[i],
            high: history.high[i],
            average: history.average[i],
            median: history.median[i],
            stdev: history.stdev[i],
            airline: history.airline[i],
            currency: history.currency[i],
            source: history.source[i],
            boxplot: history.boxplot[i],
        };
    });

    return history;
};

module.exports = {
    runLowestPricesFromRunId,
    historicalPricesOfItinerary,
};
