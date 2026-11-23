const DEFAULT_WORKING_DAYS = '1,2,3,4,5';

function parseWorkingDays(value) {
  return String(value ?? DEFAULT_WORKING_DAYS)
    .split(',')
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function isWorkingDay(date, workingDays) {
  return parseWorkingDays(workingDays).includes(date.getDay());
}

module.exports = { DEFAULT_WORKING_DAYS, parseWorkingDays, isWorkingDay };
