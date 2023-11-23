const app = require('./app');
// const worker = require('./src/worker');

app.listen(process.env.PORT || 80, function listening() {
    if (process.send) process.send('online');
});


process.on('message', function msg(message) {
    if (message === 'shutdown') {
        process.exit(0);
    }
});
