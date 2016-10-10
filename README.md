[![Build Status](https://travis-ci.org/putan/stubon.svg?branch=master)](https://travis-ci.org/putan/stubon) [![Coverage Status](https://coveralls.io/repos/github/putan/stubon/badge.svg?branch=master)](https://coveralls.io/github/putan/stubon?branch=master)

# Stubon

stubon is simple dummy api server.

## 0. install
```shell
$ npm i stubon
```

## 1. Make source file by JSON or YAML or both.
When "http request" includes all condition that written under "request", value returned that under correspond "response.body".

```js
// ./dev/src/dummy.yml

'/aaa/get':
    -
        request:
            method: 'GET'
        response:
            status: 200
            body:
                result: 'OK!'
```

## 2. Create server.
#### 2.1 The way to make with a file.
```js
var Stubon = require('stubon').default; // = import Stubon from 'stubon';

var srcPath = './dev/src';
var stubon = new Stubon(srcPath, {
    debug : true,
    ssl   : true,
});

stubon.server().listen(8080);
```

#### 2.2 The way to make with a command line.
```shell
$ $(npm bin)/stubon -p 8080 -s ./dev/src --debug --ssl
```

## 3. Call a dummy API.
```shell
$ open https://localhost:8080/aaa/get
```

If you call API from node script, you need setting option 'agent'.<br>
When you call fron browser, you can do permission setting on the browser side.

```js
// call_api.js

fetch('https://localhost:8080/aaa/get', {
    agent : new https.Agent({ rejectUnauthorized : false }),
})
    .then(function(res) {
        return res.json();
    })
    .then(function(json) {
        console.log(json.result); // OK!
    });
```

```shell
$ node call_api.js
```
