async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const DELIMITER = "§";

function compareDates(dateA, dateB) {
  const date1Updated = new Date(dateA.replace(/-/g, "/"));
  const date2Updated = new Date(dateB.replace(/-/g, "/"));
  return date1Updated > date2Updated;
}

module.exports = { asyncForEach, DELIMITER, compareDates };
