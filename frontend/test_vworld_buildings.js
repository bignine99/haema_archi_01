const http = require('http');
const fs = require('fs');

const key = 'B8385331-2B58-3CEF-9209-33CB9AFD68A6';
// 500m 반경 정도의 BBOX 설정
const minX = 127.030;
const minY = 37.495;
const maxX = 127.042;
const maxY = 37.505;

const url = `http://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=LT_C_BULD_INFO&key=${key}&domain=http://localhost:3000&geomFilter=BBOX(${minX},${minY},${maxX},${maxY})&geometry=true&crs=EPSG:4326&format=json&size=10`;

http.get(url, (r) => {
    let body = '';
    r.on('data', d => body += d);
    r.on('end', () => {
        try {
            const data = JSON.parse(body);
            const features = data.response?.result?.featureCollection?.features || [];
            fs.writeFileSync('vworld_test_output.json', JSON.stringify({
                status: r.statusCode,
                count: features.length,
                sample: features.length > 0 ? features[0] : null
            }, null, 2));
        } catch (e) {
            fs.writeFileSync('vworld_test_output.json', JSON.stringify({ error: e.message, raw: body.slice(0, 500) }));
        }
    });
});
