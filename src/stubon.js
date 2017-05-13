import fs   from 'fs';
import glob from 'glob';
import url  from 'url';
import yml  from 'yamljs';
import chokidar from 'chokidar';

import express    from 'express';
import https      from 'https';
import bodyParser from 'body-parser';
import cors       from 'cors';

// for log
const red   = '\u001b[31m';
const green = '\u001b[32m';
const cyab  = '\u001b[36m';
const reset = '\u001b[0m';

//------------------------------------------------------------------------------
// utilities
//------------------------------------------------------------------------------
const privates = {
    //------------------------
    // related to express
    //------------------------

    /**
     * get request parameters
     *
     * @param {Request} req request object from express
     * @return {object}
     */
    getParams : (req) => {
        if (req.method === 'GET') {
            return req.query;
        }
        return req.body;
    },

    /**
     * normal output (200)
     *
     * @param {Response} res  response object from express
     * @param {object}   data output data object
     */
    outputJson : (res, data) => {
        res.writeHead(data.status, { 'Content-Type' : 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data.body));
    },

    /**
     * not found output (404)
     *
     * @param {Response} res  response object from express
     */
    outputNotFound : (res) => {
        res.writeHead(404);
        res.end('Not Found');
    },

    /**
     * error output (500)
     *
     * @param {Response} res  response object from express
     */
    outputError : (res) => {
        res.writeHead(500);
        res.end('Server Error!');
    },

    //------------------------
    // for searching
    //------------------------

    /**
     * Check whether the setting matches the request
     *
     * @param {object} exp expected request object that configured in files
     * @param {string} reqMethod  requested method
     * @param {object} reqParams  requested routing parameters
     * @param {object} reqQueries requested queries
     * @param {object} reqHeaders requested headers
     * @return {boolean}
     */
    isMatchedRequest : (exp, reqMethod, reqParams, reqQueries, reqHeaders) => (
        (!exp.method || exp.method === reqMethod)
        && (!exp.params || privates.isSubsetObject(reqParams, exp.params))
        && (!exp.queries || privates.isSubsetObject(reqQueries, exp.queries))
        && (!exp.headers || privates.isSubsetObject(reqHeaders, exp.headers))
    ),

    /**
     * is subset
     * these values assumed to be string, since object is http request params.
     *
     * @param {object} whole expect whole set object
     * @param {object} part  expect subset object
     * @return {boolean}
     */
    isSubsetObject : (whole, part) => {
        // wild card
        if (part === '*' && typeof whole !== 'undefined') {
            return true;
        }
        if (typeof whole !== typeof part) {
            return false;
        }
        if (Array.isArray(part)) {
            return part.sort().every(
                (val, index) => privates.isSubsetObject(whole[index], val),
            );
        } else if (part instanceof Object) {
            return Object.keys(part).every(
                key => privates.isSubsetObject(whole[key], part[key]),
            );
        }
        // enum string
        if (privates.isPlaceholder(String(part))) {
            const enums = part.slice(1, -1).split('|');
            return enums.findIndex(v => (v === whole)) !== -1;
        }
        // another string
        return whole === part;
    },

    /**
     * is placeholder string
     *
     * @param {string} str
     * @return {boolean}
     */
    isPlaceholder : str => (str.substr(0, 1) === '{' && str.substr(-1) === '}'),

    /**
     * compare path and get requested routing params
     *
     * @param {string} stubPath path that was set to files
     * @param {string} reqPath  path that was requested
     * @return {array}
     *   0 : {boolean} is matched
     *   1 : {object}  requested routing params
     */
    isMatchingPathAndExtractParams : (stubPath, reqPath) => {
        const stubDirs  = stubPath.split('/');
        const reqDirs   = reqPath.split('/');
        let reqParams   = {};
        let isMatch;
        if (stubDirs.length === reqDirs.length) {
            isMatch = stubDirs.every((stubDir, j) => {
                const reqDir = reqDirs[j];
                if (privates.isPlaceholder(stubDir)) {
                    reqParams[stubDir.slice(1, -1)] = reqDir;
                    return true;
                } else if (stubDir === reqDir) {
                    return true;
                }
                // no match
                reqParams = {};
                return false;
            });
        } else {
            isMatch = false;
        }

        return [isMatch, reqParams];
    },

    //------------------------
    // others
    //------------------------

    parsers : [
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
    ],

    /**
     * Read files under a specified directory
     *
     * @param {string} directory string indicating the directory
     * @return {object}
     */
    loadFiles : (directory) => {
        const data = {};

        privates.parsers.forEach((typeInfo) => {
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
};

//------------------------------------------------------------------------------
// main
//------------------------------------------------------------------------------
/**
 * Stubon
 *
 * @prop {object}  app   express object
 * @prop {object}  stubs stub setting object
 * @prop {boolean} debug detailed log flag
 * @prop {boolean} ssl   ssl flag
 */
class Stubon {

    /**
     * constructor
     *
     * @param {string}  directory             setting file directory
     * @param {object}  options
     * @param {boolean} [options.debug=false] detailed log flag
     * @param {boolean} [options.ssl=false]   https mode
     */
    constructor(directory, options = {}) {
        this.debug = options.debug || false;
        this.ssl   = options.ssl || false;
        this.stubs = privates.loadFiles(directory);
        this.app   = express();

        // watch files
        chokidar.watch(directory, { persistent : true })
            .on('change', () => {
                this.log('\n----- stub files changed -----');
                this.stubs = privates.loadFiles(directory);
            });
    }

    /**
     * start server
     */
    server() {
        // to be able to receive request params on POST method.
        this.app.use(bodyParser.urlencoded({ extended : true }));
        this.app.use(bodyParser.json());

        // allow cors
        this.app.use(cors());

        // set routing
        this.app.all('*', (req, res) => {
            this.log('\n----- recieve request -----');
            this.router(req, res);
        });

        // set ssl (optional)
        if (this.ssl) {
            this.app = https.createServer({
                key  : fs.readFileSync(`${__dirname}/../ssl/server.key`),
                cert : fs.readFileSync(`${__dirname}/../ssl/server.crt`),
            }, this.app);
        }

        return this.app;
    }

    /**
     * router
     *
     * @param {object} req request object
     * @param {object} res respons object
     */
    router(req, res) {
        const {
            getParams,
            isMatchedRequest,
            isMatchingPathAndExtractParams,
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

            const isFound = Object.keys(this.stubs).some((file) => {
                this.log(`file: ${file}`, true);
                return Object.keys(this.stubs[file]).some((stubPath) => {
                    // check path
                    this.log(`  path: ${stubPath}`, true);
                    const [isMatch, reqParams] = isMatchingPathAndExtractParams(stubPath, reqPath);
                    if (!isMatch) {
                        return false;
                    }

                    this.log('  matched.', true);
                    return this.stubs[file][stubPath].some((setting, i) => {
                        this.log(`    index: ${i}`, true);
                        const exp = setting.request;
                        const valsToCheck = [req.method, reqParams, reqQueries, req.headers];

                        // check requests
                        if (isMatchedRequest(exp, ...valsToCheck)) {
                            this.log(`>> ${green}match!${reset} ${file} ${stubPath} [${i}]`);
                            const response = this.stubs[file][stubPath][i].response;
                            const options  = this.stubs[file][stubPath][i].options || {};
                            const lagSec   = parseInt(options.lagSec, 10) || 0;
                            setTimeout(() => outputJson(res, response), lagSec * 1000);
                            return true;
                        }

                        return false;
                    });
                });
            });
            if (!isFound) {
                this.log(`>> ${cyab}not found${reset}`);
                outputNotFound(res);
            }
        } catch (e) {
            this.log(`>> ${red}error${reset}`);
            this.log(e);
            outputError(res);
        }
    }

    /**
     * logger
     *
     * @param {string}  msg                message
     * @param {boolean} [isDebugLog=false] detailed log flag
     */
    log(msg, isDebugLog = false) {
        if ((isDebugLog && this.debug) || !isDebugLog) {
            console.log(msg);
        }
    }
}

export { privates }; // export for test
export default Stubon;
