const http = require('http');

const url = 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=PHOTO&center=127.051283842348,37.6182948234&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000';

http.get(url, (res) => {
    let buf = [];
    res.on('data', c => buf.push(c));
    res.on('end', () => {
        const data = Buffer.concat(buf);
        console.log("Size:", data.length);
    });
});
