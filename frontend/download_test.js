const http = require('http');
const fs = require('fs');

const path = "c:\\Users\\cho\\.gemini\\antigravity\\brain\\0f82ccf3-b277-4846-8c03-88bffb71e3cb\\vworld_download.png";
const url = "http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=process.env.VWORLD_API_KEY&basemap=GRAPHIC&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000";

const file = fs.createWriteStream(path);

http.get(url, function (res) {
    if (res.statusCode !== 200) {
        console.error('Failed with status: ' + res.statusCode);
        res.resume();
        return;
    }
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Download saved to ' + path, res.headers['content-type']);
    });
});
