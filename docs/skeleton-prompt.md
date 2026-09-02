# STEP 03 · 내 저장소 만들기 & 폴더 구조 뼈대 잡기

> STEP 02에서 시트를 올린 다음에 · Claude Code

## 왜 골격을 직접 만드나요

미리 다 만들어 드릴 수도 있었습니다. 그런데 그러면 **다음 주에 새 프로젝트를 혼자 시작할 수 없습니다.**
"빈 폴더에서 무엇을 어떻게 시작하는가"가 이 워크샵에서 배울 것 중 하나입니다.

---

## 1단계 · 내 저장소 만들기

1. 브라우저에서 안내 저장소 페이지 위쪽의 초록색 **`Use this template`** 버튼 클릭
2. **`Create a new repository`** 선택
3. 저장소 이름(Repository name)을 짓습니다 — **영어 소문자와 하이픈만** 사용하세요
   - 좋은 예: `my-inventory`, `customer-log`, `week3-app`
   - 나쁜 예: `내 프로젝트`, `My App!` (한글·공백·특수문자는 주소에 문제를 일으킵니다)
4. **`Public`** 을 선택합니다 (무료 계정은 Public이어야 웹사이트로 띄울 수 있습니다)
5. **`Create repository`** 클릭

> 여러분의 웹 주소는 이렇게 됩니다:
> `https://<내GitHub아이디>.github.io/<저장소이름>/`

## 2단계 · Pages 켜기

1. 새로 만든 내 저장소에서 위쪽 **`Settings`** 탭
2. 왼쪽 메뉴 아래쪽 **`Pages`**
3. **`Source`** 를 **`Deploy from a branch`**
4. **`Branch`** 를 **`main`** / **`/ (root)`** 로 두고 **`Save`**

## 3단계 · Claude Code에서 폴더 열기

1. Claude Code에서 작업할 **빈 폴더**를 하나 지정합니다.
2. 아래를 붙여넣습니다. `<내GitHub아이디>`와 `<저장소이름>`은 2단계에서 만든 값으로 바꾸세요.

```
아래 GitHub 저장소를 지금 폴더로 가져와줘.
https://github.com/<내GitHub아이디>/<저장소이름>

새 하위 폴더를 만들지 말고, 지금 폴더 바로 안에 저장소 파일들이 오게 해줘.
끝나면 이 폴더 최상위에 README.md와 CLAUDE.md가 바로 보여야 해.

가져온 다음, 어떤 파일들이 들어왔는지 목록으로 보여주고
CLAUDE.md가 무슨 파일인지 한 문단으로 설명해줘.
```

## 4단계 · 뼈대 만들기 (전원 동일 프롬프트)

**아래 프롬프트를 그대로** 붙여넣습니다. 모두 같은 것을 써야 다음 단계 안내가 맞아떨어집니다.

```
CLAUDE.md와 docs/skeleton-prompt.md를 읽고, 이 프로젝트의 기본 골격을 만들어줘.

만들 파일은 정확히 이 4개야. 다른 파일은 만들지 마.
- index.html : 화면 하나짜리 페이지. 지금은 제목과 "준비 중" 문구만.
- style.css  : 비어 있어도 되고 기본 여백 정도만.
- app.js     : 비어 있어도 되고 주석만 있어도 돼.
- config.js  : 내 Google 시트 정보를 담을 자리.
               SPREADSHEET_ID, SHEET_NAME, CLIENT_ID 세 개를 빈 문자열로 만들어 두고,
               각각이 무엇인지 한글 주석을 달아줘.

조건:
- 순수 HTML/CSS/JavaScript만. 프레임워크·빌드 도구·npm 금지.
- index.html에서 style.css, config.js, app.js를 순서대로 불러오게 해줘.
- 다 만든 뒤에 무엇을 왜 만들었는지 비개발자가 알아듣게 설명해줘.
```

## 5단계 · 시트 정보 채우기

`config.js`에 [STEP 02 문서](sheets-upload.md)에서 적어 둔 값을 넣습니다.

```
config.js에 내 시트 정보를 넣어줘.
SPREADSHEET_ID는 (여기에 시트 ID 붙여넣기)
SHEET_NAME은 (여기에 탭 이름)
CLIENT_ID는 아직 비워둬. 나중에 STEP 05 문서를 따라 채울 거야.
```

## 6단계 · Hello, World! — 첫 배포

만든 골격을 실제 인터넷 주소에 올려 봅니다.

```
index.html의 "준비 중" 문구를 "Hello, World!"로 바꾸고 배포해줘.
```

처음 배포할 때는 GitHub 로그인 창이 한 번 뜹니다 — 브라우저에서 승인하면 됩니다.
1~2분 뒤 아래 주소를 브라우저에서 열어 보세요:

```
https://<내GitHub아이디>.github.io/<저장소이름>/
```

화면에 **Hello, World!** 가 보이면 성공입니다.
모든 개발자의 첫 프로그램이 Hello, World!입니다 — 방금 여러분은
전 세계 누구나 열 수 있는 웹페이지를 배포했습니다. **이 주소는 계속 여러분 것입니다.**

> 💡 주소에서 404가 나오면: 2단계의 Pages 설정(`main` / `root`)을 다시 확인하고
> 1~2분 더 기다렸다가 새로고침하세요.

---

## ✅ 체크포인트

- [ ] `https://github.com/<내아이디>/<저장소이름>` 에 내 저장소가 있다
- [ ] Settings → Pages 가 `main / (root)` 로 설정돼 있다
- [ ] 작업 폴더를 열면 `README.md`가 **바로** 보인다 (폴더 속 폴더가 아니라)
- [ ] 내 PC 폴더에 `index.html`, `style.css`, `app.js`, `config.js`가 있다
- [ ] `config.js`에 내 시트 ID와 탭 이름이 들어 있다
- [ ] **내 주소에서 Hello, World!가 보인다**
