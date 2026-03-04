const http = require('http');
const fs = require('fs');

const url = "http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=GRAPHIC&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000";

http.get(url, function (res) {
    let size = 0;
    res.on('data', chunk => size += chunk.length);
    res.on('end', () => {
        const out = `CODE: ${res.statusCode} | TYPE: ${res.headers['content-type']} | LENGTH: ${res.headers['content-length']} | ACTUAL SIZE: ${size}`;
        fs.writeFileSync('size_result.txt', out);
    });
});
