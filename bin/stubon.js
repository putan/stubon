#!/usr/bin/env node
var Stubon = require('../index').default;
var path = require('path');
var argv = require('argv');

argv.option([
    {
        name: 'source',
        short: 's',
        type : 'path',
        description :'required. a directory for api setting files.'
    },
    {
        name: 'port',
        short: 'p',
        type : 'int',
        description :'required. nubmer of port'
    },
    {
        name: 'ssl',
        type : 'boolean',
        description :'optional. when you wont to make a server in ssl.'
    },
    {
        name: 'debug',
        type : 'boolean',
        description :'optional. when you wont to output debug logs.'
    },
]);
var args = argv.run().options;
if (!args.source || !args.port) {
   console.log('-s and -p is required.');
   process.exit(1);
}

var options = {};
if (args.ssl) {
    options.ssl = true;
}
if (args.debug) {
    options.debug = true;
}
(new Stubon(args.source, options)).server().listen(args.port);
