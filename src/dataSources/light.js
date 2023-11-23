#!/usr/bin/env node

const fs = require('fs');
const engine = require('../lib/engine');
const { sleep, cnpjFromNumbers } = require('../lib/util');
const logger = require('../services/logger');
const axios = require('axios');

const NAME = 'jusbrasil';
const BROWSER_URL = process.env.REMOTE_BROWSER_URL || 'http://localhost:40001';
const BASE_URL = 'https://www.jusbrasil.com.br/processos/nome/616648/light-servicos-de-eletricidade-s-a';

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
    // const cnpj = cnpjFromNumbers(payload.cnpj);

    // const a = await graphql();

    // console.log(a);
    // process.exit(0);
        

    let queryId = null;
    let cursorId = null;
    let cookieJarStr = null;
    let lastQId = null;
    let _rawPayload = null;

    if (!fs.existsSync('last_graph_fetch.json'))  {
    



        const browser = await engine.getBrowser({
            browserUrl: BROWSER_URL,
            singleton: true,
        });
        const context = await browser.createIncognitoBrowserContext();
        const page = await context.newPage();

        startTime = Date.now();
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
        logger.debug(`Page opened`);


        // let loginOk = await loginIfNeeded(page);



        let graphqlData = null;
        page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.url().includes('graphql')) {
                if (!graphqlData) {
                    graphqlData = JSON.parse(request.postData());
                }
        }
        request.continue();
        });


        
        let process_urls = await page.evaluate(() => {
            window.scrollBy(0, 2000);
            setTimeout(()=>{window.scrollTo(0,0)},1000);
            var links = [];
            
            Array.from(document.querySelectorAll('.LawsuitCardPersonPage-title--link')).map((item) => {
                links.push(item.href);
            });
            return links;
            }
        );
        process_urls.forEach((url, index) => {
            const path = `light_source_urls/${index}.url`;
            fs.writeFileSync(path, url);

        });
        await sleep(4000)

        lastQId = graphqlData['id'].slice(1, 1000);
        queryId = graphqlData['variables']['id_0'];
        cursorId = graphqlData["query"].split('after:\"')[1].split('"')[0];
        cookieJarStr = await page.evaluate(() => document.cookie);

        _rawPayload = JSON.stringify(graphqlData);

    } else {
        [queryId, cursorId, cookieJarStr] = JSON.parse(fs.readFileSync('last_graph_fetch.json'));
    }

    let run = true;
    let count = 1;
    while (run) {
        lastQId = Number(lastQId) + 3
        try {
            const graphData = await graphql(String(lastQId), queryId, cursorId, cookieJarStr, _rawPayload);

            
            const keys = Object.keys(graphData);

            graphData[keys[0]].edges.forEach(item => {
                if (!item.node) {
                    console.log(Date(), 'empty');
                    return;
                }
                const jusbrasilid = item.node.url.split('/')[4];
                
                let innerPath = '';
                if (jusbrasilid == 'goto') {
                    innerPath = item.node.url.split('/')[5]

                } else {
                    innerPath = Number(jusbrasilid).toString(16);

                    innerPath = `${innerPath.slice(-1)}/${innerPath.slice(-2)}/${innerPath.slice(-3)}/${innerPath}`
    
                }
                
                const path = `light_source_urls/${innerPath}.url`;
                fs.writeFileSync(path, item.node.url);
                cursorId = item.cursor;
                console.log(count, Date(), item.node.title)
                count++;
            });
            if (graphData[keys[0]].pageInfo.hasNextPage == false) {
                run = false;
            }


            fs.writeFileSync('last_graph_fetch.json', JSON.stringify([queryId, cursorId, cookieJarStr], null, 2));
        } catch (error) {
            console.log(error);
            lastQId -= 3;
            await sleep(2000);
        }

        await sleep(500 + Math.random() * 500);
    }
    
    
}

const graphql = async (lastQId, queryId, cursorId, cookieJarStr, _rawPayload) =>  {
    
    if (!cursorId) {
        cursorId = "MDcwODNhMDItYXV0b21hdGljOjAtMDg2MDE3NDE3MjAyMzgxOTAwMzgtbGF3c3VpdA==";
    }

    if (!cookieJarStr) {
        cookieJarStr = "__cf_bm=pLgykaZVfEcf6FHOXrIM3m5nLH5ZzlhGvGKXd3Tj2Dg-1699241443-0-AfK+RolgThOYzJUNP4TfYXWqjB7GDITKxEvW2Zgl3/3nNAw9KYtXdHJmkmV/2xC0ZpcnYMSi0VFXScRzYWRDMDI=; _cfuvid=0z8VvIUTuD0wTyTpmsKyfAYbgwvZEyU.rzjYJ0TupzE-1699241443213-0-604800000; jdid=CgT0JmVIXeMjXgA2CS2hAg==; _csrf-jusid=LDFbGUTR7SvGNj8WfKaVLJUi; cf_clearance=tv.pbaALNLsckMHMwjSSNcjAlYU.I6k5NXOLRg7z79g-1699241444-0-1-4bf13c35.47478757.1cf063d5-0.2.1699241444; br-lgpd-cookie-notice-agreement-v1=2023-11-06T03:30:44.540Z; user=\"eyJ1aWQiOjE1MzY1NDQ5LCJwaWQiOjE1MDgwODE1fQ==|1699241445|13cdf55a25857081ed831aa455a3677357882372\"; forceReload=1; user_intentions=RELATIVE; user_is_verified_lawyer=true";
    }

    const payload = `{"id":"q${lastQId}","query":"query UnknownFile_ContactRelayQL($id_0:ID!,$first_1:Int!) {node(id:$id_0) {...F1}} fragment F0 on CRMLawsuit {title,number,url,id} fragment F1 on Contact {_lawsuits:lawsuits(after:\\"${cursorId}\\",first:$first_1) {pageInfo {hasNextPage,hasPreviousPage},edges {node {id,distributionDate,cnjNumber {data {year}},...F0},cursor}},id}","variables":{"id_0":"${queryId}","first_1":10}}`;



    const req = await fetch("https://www.jusbrasil.com.br/polaris-processos/graphql", {
    "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        "sec-ch-ua": "\"Google Chrome\";v=\"119\", \"Chromium\";v=\"119\", \"Not?A_Brand\";v=\"24\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "cookie": "jdid=CgRABmUYsHyfVgAvA4FhAg==; br-lgpd-cookie-notice-agreement-v1=2023-09-30T23:34:29.587Z; _gcl_au=1.1.514945257.1698696603; _fbp=fb.2.1698696602896.1774533194; _hjSessionUser_2471547=eyJpZCI6ImE0YmFhMDZlLWEyNTktNWUxYy1iMWI0LTczYWRiYWIzOTU1YyIsImNyZWF0ZWQiOjE2OTg2OTY2MDcxMDQsImV4aXN0aW5nIjp0cnVlfQ==; sixpack_client_id=399e32b1-4ea6-4add-86ec-aeb8034927f7; session=\"exvRH+PDHLNTQyeJIUq9U9nipy4=?csrf=Uyc2MDU3ZTEyZjAwNTUxMmZlYzZjNDVhMzlmMjQ0NzRmYzRlNGVmYjM2JwpwMQou&events=KGRwMQou\"; _hjHasCachedUserAttributes=true; g_state={\"i_l\":0}; _cfuvid=ZLRBhvzSpVKlt86vu0AhD0hniAuUNKWu6PfKu9jqLgQ-1699065277280-0-604800000; _gid=GA1.3.2086540062.1699139310; _clck=1ra72e3|2|fgg|0|1398; _uetsid=11e5e4207b6711eeaeab19910f8f6b5c; _uetvid=4f7c3880776011ee9939713bcd9ce426; _clsk=7m8qag|1699215475892|2|0|t.clarity.ms/collect; _ga=GA1.3.73788401.1698696603; _ga_QCSXBQ8XPZ=GS1.1.1699215475.9.0.1699215523.12.0.0; topbar_artifact_path=consulta-processual; cf_clearance=VXySNQ4jsEKvx.cTCIECg7_g34D62X8UfsbsffGkCpw-1699272419-0-1-4bf13c35.f87fc1a7.1cf063d5-0.2.1699272419; __cf_bm=92psbx6gssZdbjyqS24G9.RYTwsx8vylnY1LoiiqN.g-1699273787-0-ATvwrCTzJrOqn1ngHPXNkFH1X8fbtL5dcaAcVHujosXHkJ//I0se0TT0qJrzYjeVP95yjyFwY7X17TDENN9LTwY=; _csrf-jusid=ke9NxSm6pawqAO4Dlz_YuRv_",
        "Referer": "https://www.jusbrasil.com.br/processos/nome/41157470/light-servicos-de-eletricidade-sa-assistente-de-acusacao",
        "Referrer-Policy": "no-referrer-when-downgrade"
    },
    "body": payload,
    "method": "POST"
    });

    const r = await req.json();

    return r.data.node;
}



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

