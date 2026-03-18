// 건축물대장 API 401 디버깅
// 다양한 serviceKey 인코딩 방식을 테스트

const KEY_DECODED = 'VAJkxQFCr4ViM45g0TSpV16Z+AVQXz3k+wpQPc9/X+rUlcA/GMvjdf6U6Cd3d/WXH+7vmtuQ9CnteJcJXu5dCg==';

async function test(label, url) {
    console.log(`\n=== ${label} ===`);
    console.log('URL:', url.substring(0, 120) + '...');
    try {
        const res = await fetch(url);
        console.log('HTTP:', res.status);
        const text = await res.text();
        console.log('Body:', text.substring(0, 300));
    } catch(e) {
        console.log('Error:', e.message);
    }
}

(async () => {
    // Test 1: encodeURIComponent (standard)
    const url1 = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${encodeURIComponent(KEY_DECODED)}&sigunguCd=11680&bjdongCd=10100&_type=json&numOfRows=3&pageNo=1`;
    await test('encodeURIComponent', url1);

    // Test 2: no encoding (raw key)
    const url2 = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${KEY_DECODED}&sigunguCd=11680&bjdongCd=10100&_type=json&numOfRows=3&pageNo=1`;
    await test('No encoding (raw)', url2);

    // Test 3: manual encoding of + as %2B
    const keyManual = KEY_DECODED.replace(/\+/g, '%2B').replace(/\//g, '%2F').replace(/=/g, '%3D');
    const url3 = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${keyManual}&sigunguCd=11680&bjdongCd=10100&_type=json&numOfRows=3&pageNo=1`;
    await test('Manual encoding', url3);

    // Test 4: XML format instead of JSON
    const url4 = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${encodeURIComponent(KEY_DECODED)}&sigunguCd=11680&bjdongCd=10100&numOfRows=3&pageNo=1`;
    await test('XML format (no _type)', url4);

    console.log('\n=== Done ===');
})();
