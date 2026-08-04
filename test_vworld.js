const url = "http://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_BULD_INFO&key=process.env.VWORLD_API_KEY&domain=http://localhost:3000&geomFilter=BBOX(127.03,37.49,127.04,37.50)&geometry=true&crs=EPSG:4326&format=json&size=10";
fetch(url).then(r => r.json()).then(console.log);
