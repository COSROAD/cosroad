/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드 v246 스텁 환경 — index.html 의 큰 <script> 블록을 vm 에 올린다.
   DOM·localStorage·Firestore 를 가짜로 끼워 넣고, 실제 함수 결과를 읽는다. */
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');
process.chdir('' + COS_ROOT + '');

function bigBlock(src) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = '';
  while ((m = re.exec(src))) { if (m[1].length > best.length) best = m[1]; }
  return best;
}

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    style: { cssText: '', setProperty(){}, removeProperty(){} },
    children: [], childNodes: [], dataset: {},
    _html: '', value: '', textContent: '', disabled: false, checked: false,
    id: '', className: '', type: '', src: '', integrity: '', crossOrigin: '', async: false,
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = String(v); },
    appendChild(c){ this.children.push(c); this.childNodes.push(c); return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); return c; },
    /* v264: showReadOnlyBar·showTrialBanner 가 app.insertBefore(띠, app.firstChild) 를 쓴다.
       없으면 try/catch 안에서 조용히 지나가 「띠가 붙었나」를 볼 수 없었다. */
    get firstChild(){ return this.children[0] || null; },
    insertBefore(c, ref){
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      this.childNodes = this.children;
      return c;
    },
    insertAdjacentHTML(pos, h){ this._html += String(h); },
    remove(){ if (this._parentList) this._parentList(this); },
    setAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, select(){}, setSelectionRange(){},
    scrollTo(){}, showPicker(){}, click(){}, blur(){}
  };
  return el;
}

function build(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.localStorage || {});
  const byId = {};
  const bodyKids = [];

  /* 앱은 Storage.prototype 을 감싸 org 접미사를 붙인다(index.html:521~) —
     그래서 진짜처럼 Storage 생성자 + 프로토타입 메서드로 만들어야 그 래퍼가 걸린다. */
  function Storage(){}
  Storage.prototype.getItem = function (k) {
    return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
  };
  Storage.prototype.setItem = function (k, v) { store[k] = String(v); };
  Storage.prototype.removeItem = function (k) { delete store[k]; };
  Storage.prototype.key = function (i) { return Object.keys(store)[i]; };
  Object.defineProperty(Storage.prototype, 'length', { get(){ return Object.keys(store).length; } });
  const localStorage = new Storage();
  const sessionStorage = new Storage();

  const body = makeEl('body');
  body.appendChild = function (c) {
    bodyKids.push(c);
    if (c.id) byId[c.id] = c;
    c._parentList = function (x) {
      const i = bodyKids.indexOf(x); if (i >= 0) bodyKids.splice(i, 1);
      if (x.id && byId[x.id] === x) delete byId[x.id];
    };
    return c;
  };
  body.insertAdjacentHTML = function (pos, h) { bodyKids.push({ _html: String(h), _raw: true }); };

  const document = {
    body: body,
    head: makeEl('head'),
    readyState: 'complete',
    createElement(t){ return makeEl(t); },
    getElementById(id){ return byId[id] || null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){},
    execCommand(){ return false; },
    get title(){ return this._t || ''; }, set title(v){ this._t = String(v); }
  };
  document.registerId = (id, el) => { byId[id] = el; };

  /* Firestore 가짜 — setDoc 한 문서를 그대로 모은다 */
  /* saved = shares 컬렉션만 (saveToFirebase 등 다른 컬렉션 쓰기는 savedAll 에만 쌓는다) */
  const saved = [];
  const savedAll = [];
  const _firestore = {
    doc(db, col, token){ return { col, token }; },
    async setDoc(ref, data){
      const rec = { col: ref.col, token: ref.token, data };
      savedAll.push(rec);
      if (ref.col === 'shares') saved.push(rec);
    }
  };

  /* Storage 가짜 — 업로드 횟수를 센다 */
  const uploads = [];
  const uploadPlan = opts.uploadPlan || null;   // idx별 'ok'|'fail'
  const _storageFns = {
    storageRef(st, path){ return { path }; },
    uploadString(ref, dataUrl, fmt){
      uploads.push(ref.path);
      /* uploadPlan 은 1번째 호출 = 키 1 (사람이 읽기 쉽게 1부터) */
      const mode = uploadPlan ? (uploadPlan[uploads.length] || 'ok') : 'ok';
      if (mode === 'fail') return Promise.reject({ code: 'storage/unauthorized', message: '거부' });
      return Promise.resolve({ ref: ref });
    },
    getDownloadURL(ref){ return Promise.resolve('https://fb.example/' + encodeURIComponent(ref.path)); }
  };

  let rndSeq = 0;
  const toasts = [];
  const alerts = [];
  const shares = [];      // navigator.share 호출
  const kakaoCalls = [];  // Kakao.Share.sendDefault 호출

  const win = {
    _db: {}, _firestore, _auth: { currentUser: { uid: 'uid-test' } },
    /* 실제 _authFns 는 <script type="module"> 이 넣는다 — 그 블록은 돌리지 않으므로 여기서 흉내 낸다 */
    _authFns: {
      createUserWithEmailAndPassword: () => Promise.resolve({ user: { uid: 'newuid', isAnonymous: false } }),
      signInWithEmailAndPassword: () => Promise.resolve({ user: { uid: 'uid-test', isAnonymous: false } }),
      signOut: () => Promise.resolve(),
      onAuthStateChanged: (a, cb) => { try { cb(null); } catch (e) {} return () => {}; },
      sendPasswordResetEmail: () => Promise.resolve(),
      updatePassword: () => Promise.resolve(),
      reauthenticateWithCredential: () => Promise.resolve(),
      EmailAuthProvider: { credential: () => ({}) }
    },
    _fbReady: true,
    _storage: {}, _storageFns,
    /* 토큰이 겹치면 「새 링크인가」 검사가 거짓 실패한다 → 호출마다 값을 바꾼다 */
    crypto: { getRandomValues(b){ rndSeq++; for (let i = 0; i < b.length; i++) b[i] = ((opts.rndBase || 0) + rndSeq * 17 + i * 3) & 255; return b; } },
    Kakao: opts.kakao === false ? undefined : {
      init(){ this._i = true; }, isInitialized(){ return !!this._i; },
      Share: { sendDefault(p){ kakaoCalls.push(JSON.parse(JSON.stringify(p))); } }
    },
    DEFAULT_BIZ_TYPE: opts.biz || 'logistics',
    _userBizType: opts.biz || 'logistics',
    location: { hash: '', href: 'https://cosroad.com/', search: '', reload(){} },
    navigator: { share: opts.navShare === false ? undefined : (p => { shares.push(p); return Promise.resolve(); }),
                 clipboard: { writeText: () => Promise.resolve() }, userAgent: 'node' },
    open(){ return null; },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    alert: m => alerts.push(String(m)),
    prompt: () => null,
    confirm: () => true,
    setTimeout: (f) => { try { f(); } catch (e) {} return 0; },
    clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
    addEventListener(){}, removeEventListener(){},
    matchMedia: () => ({ matches: false, addListener(){}, addEventListener(){} }),
    requestAnimationFrame: f => { try { f(); } catch (e) {} return 0; },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ result_code: 1, success_cnt: 1 }) }),
    XLSX: {}, Image: function(){ return makeEl('img'); },
    FileReader: function(){ this.readAsDataURL = function(){}; },
    performance: { now: () => 0 },
    screen: { width: 400, height: 800 },
    innerWidth: 400, innerHeight: 800,
    devicePixelRatio: 1
  };

  const sandbox = {
    window: win, document, localStorage, sessionStorage, Storage,
    URLSearchParams,
    console: { log(){}, warn(){}, error(){}, info(){} },
    navigator: win.navigator, location: win.location,
    btoa: win.btoa, atob: win.atob,
    alert: win.alert, prompt: win.prompt, confirm: win.confirm,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    setInterval: win.setInterval, clearInterval: win.clearInterval,
    requestAnimationFrame: win.requestAnimationFrame,
    fetch: win.fetch, Image: win.Image, FileReader: win.FileReader,
    performance: win.performance, screen: win.screen,
    matchMedia: win.matchMedia,
    Promise, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    Uint8Array, Map, Set, Intl
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  /* window 를 전역과 같은 객체처럼 다루게: window.X 읽기/쓰기를 전역에 비춘다 */
  win.__proto__ = sandbox;

  const code = bigBlock(opts.src);
  // 토스트는 테스트에서 읽는다
  try {
    vm.runInContext(code, sandbox, { filename: 'cos.js', timeout: 60000 });
  } catch (e) {
    return { error: e, sandbox, saved, uploads, toasts, alerts, shares, kakaoCalls, store, byId, bodyKids, document };
  }
  sandbox.showToast = m => toasts.push(String(m));
  win.showToast = sandbox.showToast;
  /* let/const 로 선언된 최상위 변수(notices·members 등)는 sandbox 객체에 안 붙는다 →
     컨텍스트 안에서 식을 평가해 읽는다 */
  const ev = expr => vm.runInContext(expr, sandbox, { filename: 'eval.js' });
  return { sandbox, win, saved, savedAll, uploads, toasts, alerts, shares, kakaoCalls, store, byId, bodyKids, document, localStorage, ev };
}

/* COS_SRC_NEW 를 주면 그 파일을 '새 버전'으로 쓴다 — 배포본을 그대로 돌릴 때 사용 */
/* ★ 줄끝(CRLF/LF)에 흔들리지 않게 **LF 로 맞춰** 읽는다.
   이 저장소는 core.autocrlf=true 라 작업트리가 CRLF 가 되는 때가 있다(예: git stash 왕복).
   커밋되는 blob 과 **실제 배포본은 LF** 이므로 LF 가 기준이다.
   맞추지 않으면 `/함수\(\)\{\n  …/` 같은 원문 검사가 코드와 무관하게 깨진다(실제로 겪어서 넣음). */
const SRC_NEW = fs.readFileSync(process.env.COS_SRC_NEW || 'index.html', 'utf8').replace(/\r\n/g, '\n');
/* ★ '옛 버전' 기준은 **못 박을 수 있어야 한다.**
   전에는 'HEAD' 로 두었는데, 커밋을 하고 나면 HEAD 가 새 판이 되어
   「전/후」 두 칸이 **같은 코드**를 돌렸다(실제로 겪어서 고침).
   COS_SRC_OLD_REF 로 기준 커밋을 지정한다. 안 주면 HEAD~1 (바로 앞 커밋). */
const OLD_REF = process.env.COS_SRC_OLD_REF || 'HEAD~1';
const SRC_OLD = cp.execSync('git show ' + OLD_REF + ':index.html', { maxBuffer: 1 << 28 }).toString();

module.exports = { build, SRC_NEW, SRC_OLD, makeEl, bigBlock };
