// COSROAD 서비스워커
// 목적: PWA '앱 설치' 조건 충족용. 캐시를 전혀 하지 않으므로
//       기존 version.json 자동 갱신 방식과 충돌하지 않습니다.
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(event){
  var req = event.request;
  // 비-GET 요청과 외부 도메인(파이어베이스·T맵·카카오 등)은 건드리지 않고 브라우저에 맡김
  if(req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch(e){ return; }
  if(url.origin !== self.location.origin) return;
  // 같은 출처 GET: 캐시 없이 항상 네트워크에서 최신본
  event.respondWith(
    fetch(req).catch(function(){
      return new Response('오프라인 상태입니다. 인터넷 연결을 확인해 주세요.', {
        status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}
      });
    })
  );
});
