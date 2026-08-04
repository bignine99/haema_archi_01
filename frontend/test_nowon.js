const http = require('http');

const url = 'http://localhost:3000/vworld-api/req/image?service=image&request=getmap&key=process.env.VWORLD_API_KEY&basemap=PHOTO&center=127.0792,37.6267&zoom=16&size=1024,1024&crs=epsg:4326&domain=http://localhost:3000';

http.get(url, (res) => {
    let buf = [];
    res.on('data', c => buf.push(c));
    res.on('end', () => {
        const data = Buffer.concat(buf);
        require('fs').writeFileSync('public/test_nowon.png', data);
        console.log("Size:", data.length);
    });
});
