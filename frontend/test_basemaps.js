const http = require('http');

const urls = {
    PHOTO: 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=PHOTO&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000',
    SATELLITE: 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=SATELLITE&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000',
    GRAPHIC: 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=GRAPHIC&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000'
};

function test(name, url) {
    http.get(url, (res) => {
        let size = 0;
        res.on('data', chunk => size += chunk.length);
        res.on('end', () => console.log(name, '-', res.statusCode, '-', size, 'bytes', '-', res.headers['content-type']));
    });
}

test('PHOTO', urls.PHOTO);
test('SATELLITE', urls.SATELLITE);
test('GRAPHIC', urls.GRAPHIC);
