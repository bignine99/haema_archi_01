const http = require('http');

const url = 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=PHOTO&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000';

http.get(url, (res) => {
    let buf = [];
    res.on('data', c => buf.push(c));
    res.on('end', () => {
        const data = Buffer.concat(buf);
        const fs = require('fs');
        fs.writeFileSync('test_photo.png', data);
        console.log("Size:", data.length);
    });
});
