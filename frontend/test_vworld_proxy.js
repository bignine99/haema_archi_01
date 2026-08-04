const http = require('http');

const url = 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=process.env.VWORLD_API_KEY&basemap=GRAPHIC&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000';

http.get(url, (r) => {
    console.log('Status Code:', r.statusCode);
    console.log('Content-Type:', r.headers['content-type']);
    if (r.statusCode !== 200 || r.headers['content-type'].includes('xml') || r.headers['content-type'].includes('json')) {
        let i = '';
        r.on('data', d => i += d).on('end', () => console.log('Error/Body:', i.substring(0, 500)));
    }
});
