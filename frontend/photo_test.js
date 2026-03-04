const http = require('http');
const fs = require('fs');

const path = "test_photo.jpg";
const url = "http://api.vworld.kr/req/image?service=image&request=getmap&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&basemap=PHOTO&center=127.0366,37.5007&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000";

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
