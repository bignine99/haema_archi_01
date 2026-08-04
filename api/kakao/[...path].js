// Kakao REST 프록시. REST 키는 서버에서만 읽는다.
// 예전에는 브라우저가 `Authorization: KakaoAK <키>` 를 직접 보냈고,
// 그 키는 webpack DefinePlugin 을 통해 번들에 박혀 있었다.
// Kakao REST 키는 도메인 제한이 걸리지 않으므로 노출되면 그대로 남이 쓴다.

const ALLOWED = /^v2\/local\/search\/(address|keyword|category)\.json$/;

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) {
    res.status(500).json({ error: 'KAKAO_REST_KEY 가 설정되지 않았습니다.' });
    return;
  }

  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path || '');
  if (!ALLOWED.test(path)) {
    res.status(400).json({ error: '허용되지 않은 경로입니다.' });
    return;
  }

  // path 를 뺀 나머지 질의만 그대로 넘긴다.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue;
    params.append(k, Array.isArray(v) ? v[0] : String(v));
  }

  try {
    const upstream = await fetch(`https://dapi.kakao.com/${path}?${params}`, {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    const body = await upstream.text();
    res.status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
      .send(body);
  } catch (error) {
    // 원본 예외를 그대로 올리지 않는다 — 상류 메시지에 키가 실릴 수 있다.
    console.error('[kakao-proxy] upstream error');
    res.status(502).json({ error: 'Kakao API 호출에 실패했습니다.' });
  }
}
