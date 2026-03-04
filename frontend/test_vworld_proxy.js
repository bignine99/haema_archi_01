const http = require('http');

const url = 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=GRAPHIC&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000';

http.get(url, (r) => {
    console.log('Status Code:', r.statusCode);
    console.log('Content-Type:', r.headers['content-type']);
    if (r.statusCode !== 200 || r.headers['content-type'].includes('xml') || r.headers['content-type'].includes('json')) {
        let i = '';
        r.on('data', d => i += d).on('end', () => console.log('Error/Body:', i.substring(0, 500)));
    }
});
