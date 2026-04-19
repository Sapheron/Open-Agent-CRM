"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.daysBetween = daysBetween;
exports.randomBetween = randomBetween;
exports.sleep = sleep;
/** Returns the number of full days between two dates. */
function daysBetween(a, b = new Date()) {
    return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
/** Random integer between min and max (inclusive). */
function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** Sleep for a given number of milliseconds. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=date.js.map