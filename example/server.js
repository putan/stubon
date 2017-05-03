/**
 * sample server
 *
 * start-up
 *   $ node example/server.js
 * access
 *   $ curl http://localhost:8080/aaa/get/1 # {"result":"OK! aaa!"}
 */
const Stubon = require('../index.js').default;
var stubon = new Stubon(`${__dirname}/stub`, {
    debug : true,
});
stubon.server().listen(8080);
