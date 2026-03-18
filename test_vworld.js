const url = "http://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_BULD_INFO&key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&domain=http://localhost:3000&geomFilter=BBOX(127.03,37.49,127.04,37.50)&geometry=true&crs=EPSG:4326&format=json&size=10";
fetch(url).then(r => r.json()).then(console.log);
