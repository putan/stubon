import { expect } from 'chai';
import Stubon, { privates } from '../src/stubon';
import fetch from 'node-fetch';
import https from 'https';
import sinon from 'sinon';

describe('src/stubon.js Stubon', () => {
    let stubon;
    afterEach(() => stubon.close());

    describe('request', () => {
        let app;
        let hostname;
        beforeEach(() => {
            stubon = new Stubon('./test/stub');
            app = stubon.server().listen(8081);
            hostname = 'http://localhost:8081';
        });
    
        it('can GET', (done) => {
            fetch(`${hostname}/test/get/1`)
                .then(res => res.json())
                .then(json => {
                    expect(json.result).to.be.equal('OK!');
                    app.close();
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
                    app.close();
                    done();
                });
        });
    
        it('parameter match', (done) => {
            fetch(`${hostname}/test/get/999`)
                .then(res => res.json())
                .then(json => {
                    expect(json.result).to.be.equal('OK! param!');
                    app.close();
                    done();
                });
        });
    
        it('query match', (done) => {
            fetch(`${hostname}/test/get/1?hoge=a`)
                .then(res => res.json())
                .then(json => {
                    expect(json.result).to.be.equal('OK! query!');
                    app.close();
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
                    app.close();
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
    
        it('not found', (done) => {
            fetch(`${hostname}/test/gets`)
                .then(res => {
                    expect(res.status).to.be.equal(404)
                    return res.text();
                })
                .then(text => {
                    expect(text).to.be.equal('Not Found');
                    app.close();
                    done();
                });
        });
    });

    it('error', (done) => {
        const stub = sinon.stub(privates, 'getParams').callsFake(
            () => { throw new Error('dummy error'); }
        );
        stubon = new Stubon('./test/stub');
        const app = stubon.server().listen(8083);
        const hostname = 'http://localhost:8083';
        fetch(`${hostname}/test/get/1`)
            .then(res => {
                expect(res.status).to.be.equal(500)
                return res.text();
            })
            .then(text => {
                expect(text).to.be.equal('Server Error!');
                app.close();
                stub.restore();
                done();
            });
    });

    it('ssl', (done) => {
        stubon = new Stubon('./test/stub', {
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
