import { expect } from 'chai';
import Stubon, { privates } from '../src/stubon';

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
            let actual = privates.getParams(dummyRequestObject);
            expect(actual).to.equal(data.expected);
        });
    });
});
