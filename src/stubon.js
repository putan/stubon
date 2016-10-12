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

//------------------------------------------------------------------------------
// サポート関数
//------------------------------------------------------------------------------
const privates = {
    /**
     * リクエストパラメータの取得
     *
     * @param {object} req リクエストオブジェクト
     * @return {object} リクエストパラメーターのオブジェクト
     */
    getParams : (req) => {
        if (req.method === 'GET') {
            return req.query;
        }
        return req.body;
    },

    /**
     * 部分集合かチェック
     * スタブ設定がリクエストの部分集合ならマッチとして使う
     * （part ⊆ whole ならOK）
     *
     * @param {object} whole  含む方
     * @param {object} part   含まれる方
     * @return {boolean} 部分集合が成り立てばtrue
     */
    isSubsetObject : (whole, part) => {
        const changes = deep.diff(whole, part) || [];
        for (const change of changes) {
            if (change.kind !== 'D') {
                return false;
            }
        }
        return true;
    },

    /**
     * 渡された文字列がプレースホルダー部分かどうか
     *
     * @param {string} str
     * @return {boolean}
     */
    isPlaceholder : str => (str.indexOf('{') === 0),

    /**
     * pathを比較する
     *
     * @param {string} stubPath スタブ設定のパス
     * @param {string} reqPath  リクエストパス
     * @return {array}
     *   0 : {boolean} マッチしたか
     *   1 : {object}  抜き出したルーティングパラメータのオブジェクト
     */
    isMatchingPathAndExtractParams : (stubPath, reqPath) => {
        const stubDirs  = stubPath.split('/');
        const reqDirs   = reqPath.split('/');
        let reqParams   = {};
        let isMatch     = true;
        if (stubDirs.length === reqDirs.length) {
            for (const j of stubDirs.keys()) {
                if (privates.isPlaceholder(stubDirs[j])) {
                    reqParams[stubDirs[j].slice(1, -1)] = reqDirs[j];
                } else if (stubDirs[j] !== reqDirs[j]) {
                    isMatch   = false;
                    reqParams = {};
                    break;
                }
            }
        } else {
            isMatch = false;
        }

        return [isMatch, reqParams];
    },

    /**
     * 指定ディレクトリから設定を読み込む
     */
    loadFiles : (directory) => {
        const data = {};

        [
            // YAML
            {
                extension : 'yml',
                parse     : file => yml.load(file),
            },
            // JSON
            {
                extension : 'json',
                parse     : file => JSON.parse(fs.readFileSync(file, 'utf-8')),
            },
        ].forEach((typeInfo) => {
            const files = glob.sync(`${directory}/*.${typeInfo.extension}`);
            files.forEach((file) => {
                data[file] = {};
                const parsed = typeInfo.parse(file);
                Object.keys(parsed).forEach((key) => {
                    data[file][key] = parsed[key];
                });
            });
        });

        return data;
    },

    // 出力系
    outputJson : (res, data) => {
        res.writeHead(data.status, { 'Content-Type' : 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data.body));
    },

    outputNotFound : (res) => {
        res.writeHead(404);
        res.end('Not Found');
    },

    outputError : (res) => {
        res.writeHead(500);
        res.end('Server Error!');
    },
};

//------------------------------------------------------------------------------
// メイン
//------------------------------------------------------------------------------
/**
 * Stubon
 *
 * @prop {object}  app   expressオブジェクト
 * @prop {object}  stubs スタブ設定のオブジェクト
 * @prop {boolean} debug デバッグモードフラグ
 * @prop {boolean} ssl   SSLモードフラグ
 */
class Stubon {

    /**
     * コンストラクタ
     *
     * @param {string}  directory スタブ設定ファイルの置き場所
     * @param {object}  options
     * @param {boolean} [options.debug=false] ログを多めに出すモード
     * @param {boolean} [options.ssl=false]   sslにするモード
     */
    constructor(directory, options = {}) {
        this.debug = options.debug || false;
        this.ssl   = options.ssl || false;
        this.stubs = privates.loadFiles(directory);
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
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        // HTTPリクエストを受けて、レスポンスを返すところ
        this.app.all('*', (req, res) => {
            this.log('\n----- recieve request -----');
            this.router(req, res);
        });

        if (this.ssl) {
            this.app = https.createServer({
                key  : fs.readFileSync(`${__dirname}/../ssl/server.key`),
                cert : fs.readFileSync(`${__dirname}/../ssl/server.crt`),
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
        const {
            getParams,
            isMatchingPathAndExtractParams,
            isSubsetObject,
            outputJson,
            outputNotFound,
            outputError,
        } = privates;
        try {
            const reqPath    = decodeURI(url.parse(req.url).pathname);
            const reqQueries = getParams(req);

            this.log([
                { path : reqPath },
                { method : req.method },
                { query : reqQueries },
                { header : JSON.stringify(req.headers) },
            ], true);

            for (const file of Object.keys(this.stubs)) {
                this.log(`file: ${file}`, true);
                for (const stubPath of Object.keys(this.stubs[file])) {
                    // パスを比較
                    this.log(`  path: ${stubPath}`, true);
                    const [isMatch, reqParams] =
                        isMatchingPathAndExtractParams(stubPath, reqPath);
                    if (isMatch) {
                        this.log('  matched.', true);
                        for (const i of this.stubs[file][stubPath].keys()) {
                            this.log(`    index: ${i}`, true);
                            const exp = this.stubs[file][stubPath][i].request;

                            // パラメーターを比較
                            if ((!exp.method || exp.method === req.method)
                                && (!exp.params || isSubsetObject(reqParams, exp.params))
                                && (!exp.queries || isSubsetObject(reqQueries, exp.queries))
                                && (!exp.headers || isSubsetObject(req.headers, exp.headers))
                            ) {
                                this.log(`>> ${green}match!${reset} ${file} ${stubPath} [${i}]`);
                                const response = this.stubs[file][stubPath][i].response;
                                const options  = this.stubs[file][stubPath][i].options || {};
                                const lagSec   = parseInt(options.lagSec, 10) || 0;
                                setTimeout(() => outputJson(res, response), lagSec * 1000);
                                return;
                            }
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
     * @param {string}  msg                ログメッセージ
     * @param {boolean} [isDebugLog=false] デバッグログか。trueならdebugモード時のみ出力
     */
    log(msg, isDebugLog = false) {
        if ((isDebugLog && this.debug) || !isDebugLog) {
            console.log(msg);
        }
    }
}

export { privates };
export default Stubon;
