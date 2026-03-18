import urllib.request as r
try:
    url = f"https://api.vworld.kr/req/data?key=B8385331-2B58-3CEF-9209-33CB9AFD68A6&domain=http://localhost&service=data&request=GetFeature&data=LT_C_SPBD&geomFilter=BBOX(127.0325,37.499,127.0365,37.503)&geometry=true&crs=EPSG:4326&format=json&size=1000"
    res = r.urlopen(url).read().decode('utf-8')
    print("RAW RESPONSE START:")
    print(res[:1000])
    print("RAW RESPONSE END")
    import json
    data = json.loads(res)
    features = data.get("response", {}).get("result", {}).get("featureCollection", {}).get("features", [])
    print(f"Features: {len(features)}")
    if not features:
        print(f"Full response: {data}")
    else:
        print(features[0]['properties'])
except Exception as e:
    print(f"ERROR: - {e}")
