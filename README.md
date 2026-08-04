# 간호사 근무 생성기 — 브라우저 전용 버전 (서버 없음)

원본 개발 저장소([socialm2/schedule02](https://github.com/socialm2/schedule02), 비공개)의
Flask 웹앱과 완전히 같은 기능을, 서버 없이 **브라우저 안에서 Python을 직접 돌려서**
(Pyodide, WebAssembly) 제공하는 정적 사이트다. Python 설치도, 서버도 필요 없다 —
GitHub Pages(또는 아무 정적 웹서버)로 열기만 하면 PC든 안드로이드 폰/태블릿이든
브라우저만 있으면 동일하게 작동한다.

이 저장소는 **호스팅 전용**이다 — 설계문서·검증보고서·개발 히스토리는 전부 원본
저장소(비공개)에 남아있고, 여기엔 실제로 브라우저가 실행해야 하는 코드만 있다.

## 왜 이렇게 만들었나

- **exe(PyInstaller)로는 안드로이드에서 못 돌린다** — exe는 윈도우 전용 형식이라 폰/태블릿에서
  실행이 안 된다. 반면 이 방식은 브라우저만 있으면 OS를 가리지 않는다.
- **엔진 코드는 한 글자도 안 고쳤다** — `py/nurse_scheduler/`는 원본 저장소의 `nurse_scheduler/`
  (70개 테스트로 검증된 엔진)를 그대로 복사한 것이다. `bridge.py`만 새로 짰는데, 이건
  원본의 `webapp/app.py`(Flask) 라우트 로직을 그대로 옮기되 HTTP 대신 JS에서 직접 부르는
  평범한 함수로 노출한 것뿐이다.

## 구조

```
./
├── index.html / app.js / style.css   — 화면
├── vendor/pyodide/                   — Pyodide 코어 런타임(자체 호스팅, ~14MB, CDN 의존 없음)
├── vendor/wheels/                    — openpyxl·et_xmlfile 휠 (자체 호스팅, PyPI 의존 없음)
├── py/nurse_scheduler/                — 원본 엔진 그대로 복사
├── py/bridge.py                      — Flask 라우트 → 직접 호출 함수로 변환한 "백엔드"
├── py_app.zip                        — py/ 전체를 압축한 것(브라우저가 이걸 받아서 그 자리에서 압축 해제)
└── sample_input.xlsx                 — 샘플 병동 데이터
```

## 왜 CDN이 아니라 자체 호스팅인가

Pyodide는 보통 `cdn.jsdelivr.net`에서 불러오는 게 표준적인 방법이지만, 이 앱은
**Pyodide 코어와 openpyxl 관련 패키지를 전부 이 저장소 안에 직접 넣어서(vendor/)**
CDN이나 PyPI에 전혀 의존하지 않게 만들었다. 병원처럼 방화벽이 빡빡한 네트워크에서도
안정적으로 열리도록 하기 위한 선택이다 — 페이지 자체(GitHub Pages)만 열 수 있으면 된다.

## 로컬에서 미리 확인하기

`file://`로 그냥 열면 브라우저 보안정책 때문에 대부분 안 된다. 아주 간단한 정적
서버 하나면 충분하다:

```bash
python3 -m http.server 8000
# 브라우저에서 http://127.0.0.1:8000 접속
```

## 엔진 코드를 고친 뒤 반영하는 방법 (py_app.zip 재생성)

원본 저장소(`nurse_scheduler/`)나 `py/bridge.py`를 고쳤으면, 브라우저가 실제로 읽는 건
`py_app.zip`이므로 다시 압축해야 반영된다:

```bash
cp -r /path/to/schedule02/nurse_scheduler py/    # 원본 엔진 최신화
cd py
zip -r ../py_app.zip nurse_scheduler bridge.py -x "*.pyc"
```

## 로컬 스토리지 사용

Flask 버전은 확정한 달의 근무표를 `webapp/history/*.json` 파일에 저장하지만, 브라우저에는
로컬 파일 시스템이 없으므로 그 자리에 브라우저 **localStorage**(`ns_history_YYYY-MM` 키)를
쓴다. 즉 "연간 근무표" 기록은 **그 브라우저·그 기기에만** 남는다 — 다른 기기나 시크릿
모드에서 열면 처음부터 다시 시작한다. 여러 기기에서 같은 기록을 보고 싶으면 매달 근무표
엑셀을 다운받아 보관해두고, 필요할 때 "지난달 엑셀로 자동 채우기"로 이월값만 다시 넣는
방식을 쓰면 된다.

## 알아둘 점

- **엔진 코드가 공개된다** — 브라우저가 실제로 내려받아 실행해야 하므로, 이 저장소를 보는
  사람은 누구나 개발자도구에서 Python 소스를 볼 수 있다. 반대로 설계문서·검증보고서·
  이전 작업 히스토리는 원래 저장소(비공개)에 그대로 남아있고 여기엔 포함되지 않는다.
- Pyodide 초기 로딩(첫 방문 시 몇 초~수십 초)이 있다 — 이후엔 브라우저 캐시로 빨라진다.
- 대형 병동(100명 이상)은 WASM 오버헤드로 네이티브 Python보다 느릴 수 있다(실측 미확인).
