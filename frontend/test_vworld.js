const http = require('http');

const url = 'http://api.vworld.kr/req/image?service=image&request=getmap&key=process.env.VWORLD_API_KEY&basemap=PHOTO&center=127.0366,37.5007&zoom=17&size=1024,1024&crs=epsg:4326';

http.get(url, (r) => {
    console.log('Status Code:', r.statusCode);
    console.log('Content-Type:', r.headers['content-type']);
    if (r.statusCode !== 200) {
        let i = '';
        r.on('data', d => i += d).on('end', () => console.log('Error:', i));
    }
});
