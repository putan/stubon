const Stubon = require('../index.js').default;
var stubon = new Stubon(`${__dirname}/stub`, {
    debug : true,
    ssl   : true,
});
stubon.server().listen(8443);
