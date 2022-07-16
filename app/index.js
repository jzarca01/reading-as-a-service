const path = require('path');
const express = require('express');

const cookieParser = require('cookie-parser');
const cors = require('cors');

const api = require('./api');

const app = express();

app.use(cors({ origin: true }));
app.use(cookieParser());
app.use('/api', api);

app.use(function errorHandler(err, req, res, next) {
    res.status(500);
    res.render('error', { error: err });
});

app.use(express.static('./static'));

app.get('/', function (req, res) {
    const indexFile = path.resolve(__dirname, './static/index.htm');
    res.sendFile(indexFile);
});

app.get('/complete', function (req, res) {
    const indexFile = path.resolve(__dirname, './static/complete.htm');
    res.sendFile(indexFile);
});

app.get('/done', function (req, res) {
    const indexFile = path.resolve(__dirname, './static/done.htm');
    res.sendFile(indexFile);
});

/*app.get('/preferences/:docId', async function (req, res) {
  res.status(418);
});*/

module.exports = app;
