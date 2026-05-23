const testRun = require('./test.run');
const inboundProcess = require('./inbound.process').default;

const processors = {
    'test-run': testRun,
    'inbound-process': inboundProcess,
};

module.exports = processors;
