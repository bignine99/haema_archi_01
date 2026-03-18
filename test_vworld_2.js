async function testWFS() {
    const minX = 127.03 - 0.005;
    const minY = 37.49 - 0.005;
    const maxX = 127.03 + 0.005;
    const maxY = 37.49 + 0.005;

    const layer = 'LT_C_BULD_INFO';
    const key = 'B8385331-2B58-3CEF-9209-33CB9AFD68A6';
    const url = `http://api.vworld.kr/req/data?service=data&request=GetFeature&data=${layer}&key=${key}&domain=http://localhost:3000&geomFilter=BBOX(${minX},${minY},${maxX},${maxY})&geometry=true&crs=EPSG:4326&format=json&size=10`;

    try {
        const res = await fetch(url, { headers: { Origin: 'http://localhost:3000', Referer: 'http://localhost:3000/' } });
        const text = await res.text();
        console.log(text.substring(0, 1000));
    } catch (e) {
        console.error(e);
    }
}
testWFS();
