/**
 * sample server
 *
 * start-up
 *   $ node example/server.js
 * access
 *   $ curl http://localhost:8080/aaa/get // {"result":"OK! aaa!"}
 */

// this is the example including.
// if you installed by npm, and write with ES5,
//
//   var Stubon = required('stubon').default;
//
// if write with over ES2015,
//
//   import Stubon from 'stubon';
//
const Stubon = require('../index.js').default;

// start server
var stubon = new Stubon(`${__dirname}/stub`, {
    debug : true,
});
stubon.server().listen(8080);
