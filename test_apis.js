// Test VWorld and Building Register APIs through Vite proxy

async function testVWorld() {
    console.log('=== Test 1: VWorld LT_C_SPBD ===');
    try {
        const key = '34F345CA-9827-3F0D-9742-DA1B5B1CD364';
        const domain = encodeURIComponent('http://localhost');
        const url = `http://localhost:3004/vworld-api/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${key}&domain=${domain}&geomFilter=BOX(127.028,37.495,127.038,37.504)&geometry=true&crs=EPSG:4326&format=json&size=5`;
        const res = await fetch(url);
        const data = await res.json();
        console.log('Status:', data?.response?.status);
        if (data?.response?.status === 'OK') {
            const features = data?.response?.result?.featureCollection?.features;
            console.log('Features:', features?.length || 0);
        } else {
            console.log('Error:', JSON.stringify(data?.response?.error || data?.response).substring(0, 300));
        }
    } catch (e) {
        console.log('Exception:', e.message);
    }
}

async function testVWorldDirect() {
    console.log('\n=== Test 1b: VWorld Direct (no proxy) ===');
    try {
        const key = '34F345CA-9827-3F0D-9742-DA1B5B1CD364';
        const domain = encodeURIComponent('http://localhost');
        const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${key}&domain=${domain}&geomFilter=BOX(127.028,37.495,127.038,37.504)&geometry=true&crs=EPSG:4326&format=json&size=5`;
        const res = await fetch(url);
        const data = await res.json();
        console.log('Status:', data?.response?.status);
        if (data?.response?.status === 'OK') {
            const features = data?.response?.result?.featureCollection?.features;
            console.log('Features:', features?.length || 0);
        } else {
            console.log('Error:', JSON.stringify(data?.response?.error || data?.response).substring(0, 300));
        }
    } catch (e) {
        console.log('Exception:', e.message);
    }
}

async function testBuildingRegister() {
    console.log('\n=== Test 2: Building Register API ===');
    try {
        const key = encodeURIComponent('VAJkxQFCr4ViM45g0TSpV16Z+AVQXz3k+wpQPc9/X+rUlcA/GMvjdf6U6Cd3d/WXH+7vmtuQ9CnteJcJXu5dCg==');
        const url = `http://localhost:3004/building-api/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${key}&sigunguCd=11680&bjdongCd=10100&_type=json&numOfRows=3&pageNo=1`;
        const res = await fetch(url);
        console.log('HTTP Status:', res.status);
        const text = await res.text();
        console.log('Response (first 500 chars):', text.substring(0, 500));
    } catch (e) {
        console.log('Exception:', e.message);
    }
}

async function testBuildingRegisterDirect() {
    console.log('\n=== Test 2b: Building Register Direct (no proxy) ===');
    try {
        const key = encodeURIComponent('VAJkxQFCr4ViM45g0TSpV16Z+AVQXz3k+wpQPc9/X+rUlcA/GMvjdf6U6Cd3d/WXH+7vmtuQ9CnteJcJXu5dCg==');
        const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${key}&sigunguCd=11680&bjdongCd=10100&_type=json&numOfRows=3&pageNo=1`;
        const res = await fetch(url);
        console.log('HTTP Status:', res.status);
        const text = await res.text();
        console.log('Response (first 500 chars):', text.substring(0, 500));
    } catch (e) {
        console.log('Exception:', e.message);
    }
}

(async () => {
    await testVWorld();
    await testVWorldDirect();
    await testBuildingRegister();
    await testBuildingRegisterDirect();
    console.log('\n=== All tests complete ===');
})();
