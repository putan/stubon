import { expect } from 'chai';
import Stubon, { privates } from '../src/stubon';
import fetch from 'node-fetch';
import https from 'https';

describe('src/stubon.js privates.getParams', () => {
    const dummyRequestObject = {
        method : '',
        query  : 'query',
        body   : 'body',
    };
    const dataProvider = {
        'getの時はqueryから' : {
            method   : 'GET',
            expected : 'query',
        },
        'get以外の時はbodyから' : {
            method   : 'POST',
            expected : 'body',
        },
    };

    Object.keys(dataProvider).forEach(description => {
        const data = dataProvider[description];
        it(description, () => {
            dummyRequestObject.method = data.method;
            const actual = privates.getParams(dummyRequestObject);
            expect(actual).to.equal(data.expected);
        });
    });
});

describe('src/stubon.js privates.isSubsetObject', () => {
    const whole = {
        test1 : 1,
        test2 : 2,
    };
    const dataProvider = {
        'true  : whole = part' : {
            part     : whole,
            expected : true,
        },
        'true  : whole ⊇ part' : {
            part : {
                test1 : 1,
            },
            expected : true,
        },
        'false : whole ⊋ part' : {
            part : {
                test1 : 0,
            },
            expected : false,
        },
        'false : whole ⊆ part' : {
            part : {
                test1 : 1,
                test2 : 2,
                test3 : 3,
            },
            expected : false,
        },
        'false : whole ∩ part = ∅' : {
            part : {
                test3 : 3,
                test4 : 4,
            },
            expected : false,
        },
    };

    Object.keys(dataProvider).forEach(description => {
        const data = dataProvider[description];
        it(description, () => {
            const actual = privates.isSubsetObject(whole, data.part);
            expect(actual).to.equal(data.expected);
        });
    });
});

describe('src/stubon.js privates.isPlaceholder', () => {
    const dataProvider = {
        'true  : "{hoge}"' : {
            str      : '{hoge}',
            expected : true,
        },
        'false : "hoge"' : {
            str      : 'hoge',
            expected : false,
        },
    };

    Object.keys(dataProvider).forEach(description => {
        const data = dataProvider[description];
        it(description, () => {
            const actual = privates.isPlaceholder(data.str);
            expect(actual).to.equal(data.expected);
        });
    });
});

describe('src/stubon.js privates.isMatchingPathAndExtractParams', () => {
    const dataProvider = {
        '一致、パラメータなし' : {
            stubPath : '/hoge/fuga/get',
            reqPath  : '/hoge/fuga/get',
            expected : {
                isMatch   : true,
                reqParams : {},
            },
        },
        '一致、パラメータ1つ' : {
            stubPath : '/hoge/{id}/get',
            reqPath  : '/hoge/1000/get',
            expected : {
                isMatch   : true,
                reqParams : {
                    id : '1000',
                },
            },
        },
        '一致、パラメータたくさん' : {
            stubPath : '/{lang}/hoge/{hogeId}/fuga/{fugaId}/get',
            reqPath  : '/ja/hoge/1000/fuga/2000/get',
            expected : {
                isMatch   : true,
                reqParams : {
                    lang   : 'ja',
                    hogeId : '1000',
                    fugaId : '2000',
                },
            },
        },
        '一致しない、階層数が違う' : {
            stubPath : '/hoge/fuga/get',
            reqPath  : '/hoge/get',
            expected : {
                isMatch   : false,
                reqParams : {},
            },
        },
        '一致しない、階層数は同じ' : {
            stubPath : '/hoge/fuga/get',
            reqPath  : '/hoge/fuga/post',
            expected : {
                isMatch   : false,
                reqParams : {},
            },
        },
        '一致しない、パラメータ部分までは一致するが最後が違う' : {
            stubPath : '/hoge/{id}/get',
            reqPath  : '/hoge/1000/post',
            expected : {
                isMatch   : false,
                reqParams : {},
            },
        },
    };

    Object.keys(dataProvider).forEach(description => {
        const data = dataProvider[description];
        it(description, () => {
            const [isMatch, reqParams] =
                privates.isMatchingPathAndExtractParams(data.stubPath, data.reqPath);
            expect(isMatch).to.equal(data.expected.isMatch);
            expect(reqParams).to.eql(data.expected.reqParams);
        });
    });
});

describe('src/stubon.js privates.loadFiles', () => {
    const dataProvider = {
        'スタブファイルが意図通り読み込まれる' : {
            dir      : './test/stub/',
            expected : {
                "./test/stub/data.json": {
                    "/bbb/get/{id}": [
                        {
                            "request": {
                                "method": "GET"
                            },
                            "response": {
                                "body": {
                                    "result": "OK!"
                                },
                                "status": 200
                            }
                        }
                    ]
                },
                "./test/stub/data.yml": {
                    "/aaa/get/{id}": [
                        {
                            "request": {
                                "method": "GET",
                            },
                            "response": {
                                "body": {
                                    "result": "OK!",
                                },
                                "status": 200
                            }
                        }
                    ],
                },
            },
        },
    };

    Object.keys(dataProvider).forEach(description => {
        const data = dataProvider[description];
        it(description, () => {
            const actual = privates.loadFiles(data.dir);
            expect(actual).to.eql(data.expected);
        });
    });
});

describe('src/stubon.js Stubon', () => {
    const stubon = new Stubon('./test/sample');
    const app = stubon.server().listen(8081);
    const hostname = 'http://localhost:8081';

    it('can GET', (done) => {
        fetch(`${hostname}/test/get/1`)
            .then(res => res.json())
            .then(json => {
                expect(json.result).to.be.equal('OK!');
                done();
            });
    });

    it('can POST', (done) => {
        fetch(`${hostname}/test/post/1`, {
            method  : 'POST',
        })
            .then(res => res.json())
            .then(json => {
                expect(json.result).to.be.equal('OK! POST!');
                done();
            });
    });

    it('parameter match', (done) => {
        fetch(`${hostname}/test/get/999`)
            .then(res => res.json())
            .then(json => {
                expect(json.result).to.be.equal('OK! param!');
                done();
            });
    });

    it('query match', (done) => {
        fetch(`${hostname}/test/get/1?hoge=a`)
            .then(res => res.json())
            .then(json => {
                expect(json.result).to.be.equal('OK! query!');
                done();
            });
    });

    it('header match', (done) => {
        fetch(`${hostname}/test/post/1`, {
            method : 'POST',
            headers : { 'x-method' : 'PUT' },
        })
            .then(res => res.json())
            .then(json => {
                expect(json.result).to.be.equal('OK! header!');
                done();
            });
    });

    it('wait', (done) => {
        const start = new Date();
        fetch(`${hostname}/test/get/1?wait=wait`)
            .then(res => res.json())
            .then(json => {
                const end = new Date();
                expect(json.result).to.be.equal('OK! wait!');
                expect(end - start).to.be.above(1000);
                app.close();
                done();
            });
    });

});

describe('src/stubon.js Stubon ssl&debug', () => {
    it('ssl', (done) => {
        const stubon = new Stubon('./test/sample', {
            ssl   : true,
            debug : true,
        });
        const app = stubon.server().listen(8082);
        const hostname = 'https://localhost:8082';
        fetch(`${hostname}/test/get/1`, { agent : new https.Agent({ rejectUnauthorized : false })})
            .then(res => res.json())
            .then(json => {
                expect(json.result).to.be.equal('OK!');
                app.close();
                done();
            });
    });
});
