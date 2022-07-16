const moment = require('moment');

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

const DELIMITER = '§';

function compareDates(dateA, dateB) {
    // functions.logger.log("dateA", dateA);
    // functions.logger.log("dateB", dateB);
    return moment(dateA).isSameOrAfter(moment(dateB));
}

async function asyncPool(poolLimit, array, iteratorFn, ...theArgs) {
    const ret = [];
    const executing = [];
    for (const item of array) {
        const p = Promise.resolve().then(() =>
            iteratorFn(item, array, theArgs)
        );
        ret.push(p);

        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

module.exports = { asyncForEach, DELIMITER, compareDates, asyncPool };
