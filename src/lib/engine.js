const puppeteer = require('puppeteer');
const dns = require('dns').promises;



const REMOTE_BROWSER_URL = process.env.REMOTE_BROWSER_URL;


const IP_REGEX = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/gi;

const domain2ip = async (URL) => {
    const browserURL = URL.split('/');
    browserURL[2] = browserURL[2].split(':');

    if (!IP_REGEX.test(browserURL[2][0])) {
        const { address } = await dns.lookup(browserURL[2][0], {
            family: 4,
            hints: dns.ADDRCONFIG,
          });
    
        browserURL[2][0] = address;    
    }

    browserURL[2] = browserURL[2].join(':');
    return browserURL.join('/');
}


let browserSingleton = null;
const getBrowser = async ({ browserUrl = REMOTE_BROWSER_URL, headless = false, singleton = false } = {}) => {
    // const viewPort = {
    //            width: 1380,
    //          height: 750,
    //    };
    const viewPort = null;
    const options = {
        ignoreHTTPSErrors: true,
        defaultViewport: viewPort,
    };

    let fn = 'connect';
    if (true) {
        fn = 'launch';
    }
    let browser = singleton ? browserSingleton : null;
    if (browser) {
        return browser;
    }

    if (headless) {
        browser = await puppeteer.launch({
            ...{ headless: true },
            ...options,
        });

    } else {
        browserURL = await domain2ip(browserUrl);
        browser = await puppeteer.connect({
            ...{ browserURL },
            ...options,
        });
    }

    if (singleton) {
        browserSingleton = browser;
    }

    return browser;
};



module.exports = {
    getBrowser,
    
};
