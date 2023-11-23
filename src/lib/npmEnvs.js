'use strict';

/* eslint import/no-dynamic-require: [0] */
/* eslint global-require: [0] */

let npmPackage = null;
try {
    npmPackage = require(process.cwd() ? `${process.cwd()}/package.json` : '../package.json');
} catch (err) {
    // silent....
}

if (!process.env.npm_execpath && npmPackage) {
    Object.keys(npmPackage).forEach(key => {
        switch (key) {
            case 'dependencies':
            case 'repository':
            case 'scripts':
                Object.keys(npmPackage[key]).forEach(dep => {
                    if (npmPackage[key][dep]) {
                        process.env[
                            `npm_package_${key.replace(/-/g, '_')}_${dep.replace(/-/g, '_')}`
                        ] = npmPackage[key][dep];
                    }
                });
                break;
            case 'author':
                if (typeof npmPackage[key] === 'string') {
                    const author = npmPackage[key].split();
                    process.env.npm_package_author_name = author[0].trim();
                    if (author.length === 2) {
                        process.env.npm_package_author_email = author[1]
                            .trim()
                            .substring(0, -1)
                            .trim();
                    }
                }
                break;
            default:
                if (typeof npmPackage[key] !== 'object') {
                    process.env[`npm_package_${key.replace(/-/g, '_')}`] = npmPackage[key];
                }
        }
    });
}

if (typeof process.env.npm_package_author === 'string') {
    const author = process.env.npm_package_author.split();
    process.env.npm_package_author_name = author[0].trim();
    if (author.length === 2) {
        process.env.npm_package_author_email = author[1]
            .trim()
            .substring(0, -1)
            .trim();
    }
}
