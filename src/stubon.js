import deep from 'deep-diff';
import fs   from 'fs';
import glob from 'glob';
import url  from 'url';
import yml  from 'yamljs';

import express    from 'express';
import https      from 'https';
import bodyParser from 'body-parser';

// ログ用
const red   = '\u001b[31m';
const green = '\u001b[32m';
const cyab  = '\u001b[36m';
const reset = '\u001b[0m';

/**
 * Stubon
 *
 * @prop {object}  app   expressオブジェクト
 * @prop {object}  stubs スタブ設定のオブジェクト
 * @prop {boolean} debug デバッグモードフラグ
 * @prop {boolean} ssl   SSLモードフラグ
 */
export default class Stubon {

    /**
     * コンストラクタ
     *
     * @param {string}  directory スタブ設定ファイルの置き場所
     * @param {object}  options
     * @param {boolean} [options.debug=false] ログを多めに出すモード
     * @param {boolean} [options.ssl=false]   sslにするモード
     */
    constructor(directory, options) {
        this.debug = options.debug || false;
        this.ssl   = options.ssl || false;
        this.stubs = loadFiles(directory);
        this.app   = express();
    }

    /**
     * サーバー起動
     */
    server() {
        // postのデータを受け取れるようにする設定
        this.app.use(bodyParser.urlencoded({ extended : true }));
        this.app.use(bodyParser.json());

        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            next();
        });

        // HTTPリクエストを受けて、レスポンスを返すところ
        this.app.all('*', (req, res) => {
            this.log('\n----- recieve request -----');
            this.router(req, res);
        });

        if (this.ssl) {
            this.app = https.createServer({
                key  : fs.readFileSync('ssl/server.key'),
                cert : fs.readFileSync('ssl/server.crt'),
            }, this.app);
        }

        return this.app;
    }

    /**
     * ルーター
     *
     * @param {object} req リクエストオブジェクト
     * @param {object} res レスポンスオブジェクト
     */
    router(req, res) {
        try {
            const reqPath    = decodeURI(url.parse(req.url).pathname);
            const reqQueries = getParams(req);

            this.log([
                {path   : reqPath},
                {method : req.method},
                {query  : reqQueries},
                {header : JSON.stringify(req.headers)},
            ], true);
    
            for (const stubPath of Object.keys(this.stubs)) {
                // パスを比較
                this.log(`compare to "${stubPath}"`, true);
                const [isMatch, reqParams] = isMatchingPathAndExtractParams(stubPath, reqPath);
                if (isMatch) {
                    this.log('path is matched.', true);
                    for (const i of this.stubs[stubPath].keys()) {
                        this.log(`compare to [${i}]`, true);
                        const exp = this.stubs[stubPath][i].request;

                        // パラメーターを比較
                        if ((!exp.method || exp.method === req.method)
                            && (!exp.params || isSubsetObject(reqParams, exp.params))
                            && (!exp.queries || isSubsetObject(reqQueries, exp.queries))
                            && (!exp.headers || isSubsetObject(req.headers, exp.headers))
                        ) {
                            this.log(`>> ${green}match!${reset} ${stubPath}[${i}]`);
                            const response = this.stubs[stubPath][i].response;
                            const options  = this.stubs[stubPath][i].options || {};
                            const lagSec   = parseInt(options.lagSec, 10) || 0;
                            setTimeout(() => outputJson(res, response), lagSec * 1000);
                            return;
                        }
                    }
                }
            }
            this.log(`>> ${cyab}not found${reset}`);
            outputNotFound(res);
        } catch (e) {
            this.log(`>> ${red}error${reset}`);
            this.log(e);
            outputError(res);
        }
    }

    /**
     * ロガー
     *
     * @param {string}  msg        ログメッセージ
     * @param {boolean} isDebugLog デバッグログか。trueならdebugモード時のみ出力
     */
    log(msg, isDebugLog = false) {
        if (isDebugLog && this.debug || !isDebugLog) {
            console.log(msg);
        }
    }
}

//------------------------------------------------------------------------------
// サポート関数
//------------------------------------------------------------------------------
/**
 * リクエストパラメータの取得
 *
 * @param {object} req リクエストオブジェクト
 * @return {object} リクエストパラメーターのオブジェクト
 */
function getParams(req) {
    if (req.method === 'GET') {
        return req.query;
    }
    return req.body;
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
    const changes = deep.diff(whole, part) || [];
    for (const change of changes) {
        if (change.kind !== 'D') {
            return false;
        }
    }
    return true;
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
 * pathを比較する
 *
 * @param {string} stubPath スタブ設定のパス
 * @param {string} reqPath  リクエストパス
 * @return {array}
 *   0 : {boolean} マッチしたか
 *   1 : {object}  抜き出したルーティングパラメータのオブジェクト
 */
function isMatchingPathAndExtractParams(stubPath, reqPath) {
    const stubDirs  = stubPath.split('/');
    const reqDirs   = reqPath.split('/');
    const reqParams = {};
    let isMatch     = true;
    if (stubDirs.length === reqDirs.length) {
        for (const j of stubDirs.keys()) {
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
 * 指定ディレクトリから設定を読み込む
 */
function loadFiles(directory) {
    const data = {};
    let files;

    files = glob.sync(`${directory}/*.yml`);
    files.forEach((file) => {
        const ymlData = yml.load(file);
        Object.keys(ymlData).forEach(key => (
            data[key] = !data[key]
                ? ymlData[key]
                : data[key].concat(ymlData[key])
        ));
    });

    files = glob.sync(`${directory}/*.json`);
    files.forEach((file) => {
        const jsonData = JSON.parse(fs.readFileSync(file, 'utf-8'));
        Object.keys(jsonData).forEach(key => (
            data[key] = !data[key]
                ? jsonData[key]
                : data[key].concat(jsonData[key])
        ));
    });

    return data;
}

// 出力系
function outputJson(response, data) {
    response.writeHead(data.status, { 'Content-Type' : 'application/json; charset=utf-8' });
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
