const axios = require('axios');
let npmPackage = {};
try {
    npmPackage = require(`${process.cwd()}/package.json`); // to be used for packages wich install this module
} catch (err) {
    // Silent
}


const toUpper = item => item.toUpperCase();
const nameCapitalize = (process.env.npm_package_name || npmPackage.name || process.env._.split('/').slice(-1)[0]).replace(
    /\b[a-z]/g,
    toUpper,
);
const versionSuffix = process.env.NODE_ENV !== 'production' ? ` ${process.env.NODE_ENV || 'development'}` : '';



const instance = axios.create({
        timeout: parseInt(process.env.SERVICE_HTTP_CLIENT_TIMEOUT || 1e4, 10),
        headers: {'User-Agent': `SQ_${nameCapitalize}/${process.env.npm_package_version || npmPackage.version || 'local'}${versionSuffix}`}
      });



module.exports = instance;
