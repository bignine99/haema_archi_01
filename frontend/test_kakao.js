const https = require('https');
const fs = require('fs');
https.get('https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent('서울 노원구 갈매로 370'), { headers: { 'Authorization': 'KakaoAK 72de5cd34b1d2979f85cdb428756c545' } }, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => fs.writeFileSync('kakao_output.txt', data));
});
