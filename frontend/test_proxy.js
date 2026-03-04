const http = require('http');

const url = 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=PHOTO&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000';

http.get(url, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    let body = [];
    res.on('data', chunk => body.push(chunk));
    res.on('end', () => {
        const buffer = Buffer.concat(body);
        console.log('Total bytes received:', buffer.length);
        if (res.headers['content-type'].includes('application/json')) {
            console.log('JSON returned:', buffer.toString());
        }
    });
}).on('error', (e) => {
    console.error('Got error: ' + e.message);
});
