import os
import urllib.request as r
print(r.urlopen('https://api.vworld.kr/req/wfs?key=' + os.environ.get('VWORLD_API_KEY', '') + '&domain=http://localhost:3004&SERVICE=WFS&version=1.1.0&request=GetFeature&TYPENAME=lt_c_buldg&BBOX=127.0345,37.501,127.0355,37.502,EPSG:4326&SRSNAME=EPSG:4326&outputformat=application/json').read().decode('utf-8')[:500])
