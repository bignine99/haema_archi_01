import urllib.request as r
domains = ['http://localhost', 'http://localhost:3004', 'http://localhost:5173', 'http://127.0.0.1', 'http://127.0.0.1:3004', 'http://192.168.0.239:3004', 'http://localhost:3000', 'https://localhost']
for d in domains:
    try:
        url = f"https://api.vworld.kr/req/data?key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&domain={d}&service=data&request=GetFeature&data=LT_C_BULD_INFO&geomFilter=BBOX(127.0345,37.501,127.0355,37.502)&geometry=true&crs=EPSG:4326&format=json&size=10"
        res = r.urlopen(url).read().decode('utf-8')
        if "INCORRECT_KEY" not in res:
            print(f"SUCCESS: {d} works!")
            print(res[:100])
        else:
            print(f"FAILED: {d}")
    except Exception as e:
        print(f"ERROR: {d} - {e}")
