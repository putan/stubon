"use strinct";

var diff = require('deep-diff').diff;
var fs   = require('fs');
var glob = require("glob");
var url  = require('url');
var yml  = require('yamljs');

var express    = require('express');
var https      = require('https');
var bodyParser = require('body-parser');

// ログ用
var red     = '\u001b[31m';
var green   = '\u001b[32m';
var reset   = '\u001b[0m';

module.exports = Stubon;

function Stubon(directory, options) {
    this.debug = options.debug;
    this.ssl   = options.ssl;
    this.stubs = loadFiles(directory);
    this.app   = express();
}

Stubon.prototype.server = function () {

    // postのデータを受け取れるようにする設定
    this.app.use(bodyParser.urlencoded({ extended : true }));
    this.app.use(bodyParser.json());

    this.app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        next();
    });

    // HTTPリクエストを受けて、レスポンスを返すところ
    var _this = this;
    this.app.all('*', function (req, res) {
        console.log('----- recieve request -----');
        router(req, res, _this);
    });

    if (this.ssl) {
        this.app = https.createServer({
            key  : fs.readFileSync('ssl/server.key'),
            cert : fs.readFileSync('ssl/server.crt')
        }, this.app);
    }

    return this.app;
}


//------------------------------------------------------------------------------
// サポート関数
//------------------------------------------------------------------------------
function router(req, res, stubon) {
    var reqPath    = decodeURI(url.parse(req.url).pathname);
    var reqQueries = getParams(req);

    // スタブがマッチし無いときはdebugフラグを立ててください
    if (stubon.debug) {
        console.log(['path', reqPath]);
        console.log(['method', req.method]);
        console.log(['query', reqQueries]);
        console.log(['header', req.headers]);
    }

    for (var stubPath in stubon.stubs) {
        if (stubon.debug) {
            console.log(`compare to "${stubPath}"`);
        }
        var match     = isMatchingPathAndExtractParams(stubPath, reqPath);
        var isMatch   = match[0];
        var reqParams = match[1];
        if (!isMatch) {
            continue;
        }
        if (stubon.debug) {
            console.log('path is matched.');
        }
        for (var i in stubon.stubs[stubPath]) {
            var exp = stubon.stubs[stubPath][i].request;
            if ((!exp.method || exp.method === req.method)
                && (!exp.params || isSubsetObject(reqParams, exp.params))
                && (!exp.queries || isSubsetObject(reqQueries, exp.queries))
                && (!exp.headers || isSubsetObject(req.headers, exp.headers))
            ) {
                console.log(`>> ${green}match!${reset} ${stubPath}[${i}]`);

                var options = stubon.stubs[stubPath][i].options || {};
                var lagSec  = parseInt(options.lagSec) || 0;
                setTimeout(() => {
                    outputJson(res, stubon.stubs[stubPath][i].response);
                }, lagSec * 1000);
                return;
            }
        }
    }
    console.log(`>> ${red}not found...${reset}`);
    outputNotFound(res);
}

/**
 * 部分集合かチェック
 * スタブ設定がリクエストの部分集合ならマッチとして使う
 * （part ⊆ whole ならOK）
 *
 * @param {object} whole  含む方
 * @param {object} part   含まれる方
 * @return {boolean} 部分集合が成り立てばtrue
 */
function isSubsetObject(whole, part) {
    var changes = diff(whole, part);
    for (var idx in changes) {
        if (changes[idx].kind !== 'D') {
            return false;
        }
    }
    return true;
}

/**
 * pathを比較する
 *
 * @param {string} stubPath スタブ設定のパス
 * @param {string} reqPath  リクエストパス
 * @return {array}
 *   0 : {boolean} マッチしたか
 *   1 : {object}  抜き出したルーティングパラメータのオブジェクト
 */
function isMatchingPathAndExtractParams(stubPath, reqPath) {
    var stubDirs  = stubPath.split('/');
    var reqDirs   = reqPath.split('/');
    var isMatch   = true;
    var reqParams = {};
    if (stubDirs.length === reqDirs.length) {
        for (var j in stubDirs) {
            if (isPlaceholder(stubDirs[j])) {
                reqParams[stubDirs[j].slice(1, -1)] = reqDirs[j];
            } else if (stubDirs[j] !== reqDirs[j]) {
                isMatch = false;
                break;
            }
        }
    } else {
        isMatch = false;
    }

    return [isMatch, reqParams];
}
/**
 * 渡された文字列がプレースホルダー部分かどうか
 *
 * @param {string} str
 * @return {boolean}
 */
function isPlaceholder(str) {
    return str.indexOf('{') === 0;
}

/**
 * 指定ディレクトリから設定を読み込む
 */
function loadFiles(directory) {
    var data = {};

    var files = glob.sync(directory + '/*.yml');
    for (var i in files) {
        var ymlData = yml.load(files[i]);
        for (var key in ymlData) {
            data[key] = !data[key]
                ? ymlData[key]
                : data[key].concat(ymlData[key]);
        }
    }

    var files = glob.sync(directory + '/*.json');
    for (var i in files) {
        var jsonData = JSON.parse(fs.readFileSync(files[i], 'utf-8'));
        for (var key in jsonData) {
            data[key] = !data[key]
                ? jsonData[key]
                : data[key].concat(jsonData[key]);
        }
    }

    return data;
}

/**
 * リクエストパラメータの取得
 *
 * @param {object} req リクエストオブジェクト
 * @return {object} リクエストパラメーターのオブジェクト
 */
function getParams(req) {
    if (req.method === 'GET') {
        return req.query;
    } else {
        return req.body;
    }
}

// 出力系
function outputJson(response, data) {
    response.writeHead(data.status, {'Content-Type': 'application/json; charset=utf-8'});
    response.end(JSON.stringify(data.body));
}
function outputNotFound(response) {
    response.writeHead(404);
    response.end('Not Found');
}
function outputError(response) {
    response.writeHead(500);
    response.end('Server Error!');
}

