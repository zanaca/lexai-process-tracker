#!/usr/bin/env node

const engine = require('../lib/engine');
const ss = require('simple-statistics');
const { sleep, cnpjFromNumbers } = require('../lib/util');
const logger = require('../services/logger');

const NAME = 'jusbrasil';
const BROWSER_URL = process.env.REMOTE_BROWSER_URL || 'http://localhost:40001';
const BASE_URL = 'https://www.jusbrasil.com.br/consulta-processual/busca?q=${query}';

const { JUSBRASIL_LOGIN, JUSBRASIL_PASSWORD } = process.env;

const x=`
const setOrigin = async (page, value) => {
    await page.evaluate(async () => {
        Array.from(
            document.querySelectorAll('#mat-chip-list-0 .mat-chip-remove')
        ).map((i) => i.click());
    });
    await page.focus('#mat-chip-list-input-0');
    await page.keyboard.type(String(value));
    await page.waitForNetworkIdle();
    await page.evaluate(async () => {
        document.querySelector('.cdk-overlay-pane SPAN').click();
    });
};

const setDestination = async (page, value) => {
    await page.evaluate(async () => {
        Array.from(
            document.querySelectorAll('#mat-chip-list-1 .mat-chip-remove')
        ).map((i) => i.click());
    });
    await page.focus('#mat-chip-list-input-1');
    await page.keyboard.type(String(value));
    await page.waitForNetworkIdle();
    await page.evaluate(async () => {
        document.querySelector('.cdk-overlay-pane SPAN').click();
    });
};

const setAdults = async (page, value) => {
    await page.focus('#mat-input-0');
    await page.evaluate(async () => {
        document.querySelector('#mat-input-0').value = '';
    });
    await page.keyboard.type(String(value));
    await page.keyboard.press('Tab');
};

const setChildren = async (page, value) => {
    await page.focus('#mat-input-3');
    await page.evaluate(async () => {
        document.querySelector('#mat-input-3').value = '';
    });
    await page.keyboard.press('Tab');
};

const setInfants = async (page, value) => {
    await page.focus('#mat-input-4');
    await page.evaluate(async () => {
        document.querySelector('#mat-input-4').value = '';
    });
    await page.keyboard.press('Tab');
};

const getCalendarDates = async (page) =>
    await page.evaluate(() =>
        Array.from(document.querySelectorAll('.mat-calendar-content BUTTON'))
            .filter((item) => !item.className.includes('disabled'))
            .map((item) => item.getAttribute('aria-label'))
    );

const getCalendarDateClick = async (page, id) =>
    await page.evaluate(
        (id) =>
            Array.from(
                document.querySelectorAll('.mat-calendar-content BUTTON')
            )
                .filter((item) => !item.className.includes('disabled'))
                .filter((item) => {
                    return item.getAttribute('aria-label') == id;
                })[0]
                .click(),
        id
    );

const dateToWords = (date) => {
    date = date.split('-');
    const monthWord = MONTHS_WORDS[Number(date[1]) - 1];

    return String(monthWord + ' ' + date[0]).toUpperCase();
};

const setCalendarPosition = async (page, date) => {
    const desiredDate = dateToWords(date);
    let displayedMonth = await page.evaluate(
        () =>
            document.querySelectorAll(
                '.mat-calendar-period-button .mdc-button__label SPAN'
            )[0].innerText
    );

    if (displayedMonth.includes(desiredDate)) {
        return await getCalendarDates(page);
    }

    let ok = false;
    while (!ok) {
        logger.debug('loop calendar position');
        await page.evaluate(() => {
            document
                .getElementsByClassName('mat-calendar-next-button')[0]
                .click();
        });

        displayedMonth = await page.evaluate(
            () =>
                document.querySelectorAll(
                    '.mat-calendar-period-button .mdc-button__label SPAN'
                )[0].innerText
        );
        await sleep(200);

        if (displayedMonth.includes(desiredDate)) {
            ok = true;
        }
    }

    return await getCalendarDates(page);
};

const setDate = async (page, date, field, focus = true) => {
    const d2 = new Date(date);
    

    if (focus) {
        await page.$eval(field, (el) => el.click());
    }

    let datePlain = date.split('-');
    datePlain.reverse();
    datePlain = datePlain.join('');

    let dateSplit = date.split('-');
    let availableDates = await setCalendarPosition(page, date);


    await getCalendarDateClick(page, dateId);
};

const setDepartureDate = async (page, date) => {
    return await setDate(page, date, '.mat-start-date');
};
const setReturnDate = async (page, date) => {
    return await setDate(page, date, '.mat-end-date');
};

const format = async (data, startTime) => {
    if (data) {
        data.metadata = {
            duration_sec: Math.round(Date.now() - startTime) / 1000,
        };
    }

    return data;
};


`
const needLogin = async (page) => {
    const content = await page.content()
    
    return content.includes('class="btn btn--flat btn-login"');
}

const loginIfNeeded = async (page) => {
    const doLogin = await needLogin(page);

    if (doLogin)  {
        await page.evaluate(async () => {
            document.querySelector('.btn.btn--flat.btn-login').click()
        });
    
        await page.waitForSelector('.PasswordInputField');

        await page.focus('#FormFieldset-email');
        await page.keyboard.type(String(JUSBRASIL_LOGIN));
    
        await page.focus('#FormFieldset-password');
        await page.keyboard.type(String(JUSBRASIL_PASSWORD));
    
        await page.evaluate(async () => {
            document.querySelector("BUTTON[type=submit]").click();
        });
        await page.waitForNetworkIdle();
    }

    return true;
}


const searchByCNPJ = async (payload) => {
    const cnpj = cnpjFromNumbers(payload.cnpj);
        

    const browser = await engine.getBrowser({
        browserUrl: BROWSER_URL,
        singleton: true,
    });
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    startTime = Date.now();
    logger.debug(`Opening JusBrasil page for CNPJ ${cnpj}`);
    const url = BASE_URL.replace('${query}', cnpj);
    await page.goto(url, { waitUntil: 'networkidle0' });
    logger.debug(`Page opened`);


    let loginOk = await loginIfNeeded(page);

    await page.evaluate(() =>
        document.querySelector('.EntitySnippet-anchor').click()
    );
    logger.debug(`First link clicked`);
    await page.waitForNetworkIdle();


    await page.evaluate(() =>
        document.querySelector('.TagList-url.chip.chip--white.chip--sm').click()
    );
    logger.debug(`First "part" name clicked`);
    await page.waitForNetworkIdle();

    
}


const getPrices = async (payload) => {
    let startTime = -1;
    let get500 = payload.fast || false;
    let prices = [];

    const origin = payload.origin;
    const destination = payload.destination;
    const departureDate = payload.dateDeparture;
    const returnDate = payload.dateReturn;
    const adults = payload.adults || 1;
    const children = payload.children || 0;
    const infants = payload.infants || 0;

    const PAX_COUNT = adults + children + infants;

    const data = {
        source: NAME,
        query: {
            departurePlace: origin,
            arrivalPlace: destination,
            departureDate,
            returnDate,
            adults,
            children,
            infants,
        },
    };

    const browser = await engine.getBrowser({
        browserUrl: BROWSER_URL,
        singleton: true,
    });
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    startTime = Date.now();
    logger.debug(`Opening itaMatrix page for ${origin} -> ${destination}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    logger.debug(`Page opened`);

    // set locations {
    await setOrigin(page, origin);
    await setDestination(page, destination);
    // }
    logger.debug(`Origin and destination airports set`);

    // set people {
    await setAdults(page, adults);
    await setChildren(page, children);
    await setInfants(page, infants);
    logger.debug(`PAX set`);

    // }

    // set dates {
    const error1 = await setDepartureDate(page, departureDate);
    const error2 = await setReturnDate(page, returnDate);
    // if (error1 || error2) {
    //     data.error = error1 || error2;
    //     return format(data, context);
    // }
    logger.debug(`Dates set`);

    await page.evaluate(() =>
        document.querySelector('.search-button-container BUTTON').click()
    );
    logger.debug(`Search button clicked`);

    // wait load
    try {
        await page.waitForSelector('.mat-paginator-page-size-select');
    } catch (err) {
        logger.error('Search result page not loaded', { error: err });

        await context.close();
        return format(null, startTime);
    }

    logger.debug(`Waiting...`);

    // wait for 500 items per page
    if (get500) {
        await page.evaluate(() => {
            document
                .querySelector('.mat-paginator-page-size-select DIV DIV')
                .click();
            document.querySelectorAll('.mat-select-panel SPAN')[4].click();
        });
        await sleep(2000);
        await page.waitForSelector('.mat-paginator-page-size-select');
        logger.debug(`Waiting for 500 items...`);
    }

    const departureContent = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('TBODY TR')).map((item) => {
            const data = Array.from(item.querySelectorAll('.mat-cell')).map(
                (item2) => item2.textContent.trim()
            );
            if (data.length > 1) {
                data.push(item.querySelectorAll('.mat-cell A')[0].href);
            }
            return data;
        });
    });
    logger.debug(`Page content fetched`);

    const departure = [];
    const return_ = [];

    let line1 = {};
    let line2 = {};
    let smallest0 = Infinity;
    let smallestHash0 = '';
    let pax = adults + children + infants;
    departureContent.map((item) => {
        if (item.length == 1) {
            return;
        }

        const duration = item[4].split('  ');
        const steps = item[6].split('  ');
        const airports = item[5].split('  ');
        const time1 = item[2]
            .replace(/\([^:]*\)/g, '')
            .split('M')
            .map((item) => item + 'M')
            .slice(0, 2);
        const time2 = item[3]
            .replace(/\([^:]*\)/g, '')
            .split('M')
            .map((item) => item + 'M')
            .slice(0, 2);
        const airlines = item[1];

        line1.price =
            Number(
                item[0].replace('R$', '').replace(',', '').replace('.', ',')
            ) * pax;
        line2.price = 0;
        prices.push(line1.price);
        line1.extra_data_url = item[8];
        line2.extra_data_url = null;
        line1.flightId = airlines;
        line2.flightId = airlines;

        line1.timeStart = `${airports[0].slice(0, 3)} ${time1[0]}`;
        line1.timeEnd = `${airports[0].slice(-3)} ${time1[1]}`;
        line2.timeStart = `${airports[1].slice(0, 3)} ${time2[0]}`;
        line2.timeEnd = `${airports[1].slice(-3)} ${time2[1]}`;
        line1.duration = duration[0];
        line2.duration = duration[1];
        line1.steps = steps[0].split(',').length;
        if (steps.length > 1) {
            line2.steps = steps[1].split(',').length;
        } else {
            line2.steps = steps[0].split(',').length;
        }
        if (line1.steps > 1) {
            line1.steps += ' paradas';
        } else {
            line1.steps += ' parada';
        }
        if (line2.steps > 1) {
            line2.steps += ' paradas';
        } else {
            line2.steps += ' parada';
        }

        departure.push(line1);
        return_.push(line2);

        if (line1.price < smallest0) {
            smallest0 = line1.price;
            smallestHash0 =
                line1.flightId.replace(/\ /g, '') +
                '_' +
                line2.flightId.replace(/\ /g, '');
        }
    });

    // data.searchCookies = cookies;

    if (prices.length === 0) {
        logger.warning('No prices found for desired itinerary', { payload });
    }

    data.departureFlight = departure;
    data.returnFlight = return_;
    data.low = prices.length === 0 ? 0 : ss.min(prices) / PAX_COUNT;
    data.lowHash = smallestHash0;
    data.high = prices.length === 0 ? 0 : ss.max(prices) / PAX_COUNT;
    data.avg = prices.length === 0 ? 0 : ss.mean(prices) / PAX_COUNT;
    data.median = prices.length === 0 ? 0 : ss.median(prices) / PAX_COUNT;
    data.std =
        prices.length === 0 ? 0 : ss.standardDeviation(prices) / PAX_COUNT;

    logger.debug(`${NAME} OK`);
    await context.close();

    return format(data, startTime);
};

if (require.main === module) {
    (async () => {
        const data = await searchByCNPJ(JSON.parse(process.argv[2]));
        console.log(data);
        process.exit(0);
    })();
} else {
    module.exports = {
        searchByCNPJ,
    };
}
