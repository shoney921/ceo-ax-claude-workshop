# 실전 개발 워크샵 템플릿

워크샵에서 사용하는 **출발점 저장소**입니다.

> 이 파일(README.md)이 바로 **"저장소의 안내판"** 입니다.
> 폴더를 열면 GitHub이 가장 먼저 보여주는 문서예요.

---

## 이 워크샵의 목표

**"내 URL에서 내 데이터를 활용하는" 웹 화면을 Claude 기반 바이브코딩을 통해 제작해봅니다.**

| 순서 | 무엇을 | 어디서 |
|---|---|---|
| STEP 01 | 흩어진 파일을 **MasterDB**로 정리 | Claude Desktop · Cowork |
| STEP 02 | MasterDB를 **Google Sheets**에 올림 | Google Drive |
| STEP 03 | 내 저장소 만들기 → **Hello, World!** 배포 → 내 주소가 생김 | GitHub · Claude Code |
| STEP 04 | 시트 구조 + 스케치로 **내 화면(UI)** 만들기 | Claude Code |
| STEP 05 | 내 **클라이언트 ID** 만들기 | Google Cloud |
| STEP 06 | 내 화면을 **시트와 연결** (생성·조회·수정) | Claude Code |
| STEP 07 | (선택) 내 화면을 **더 좋게** — 정렬·검색·요약·그래프 | Claude Code |

---

## 워크샵 실습 (STEP 순서대로)

위 목표 표의 STEP과 같은 순서입니다. 순서대로 진행하면 워크샵 전체를 혼자서도 완주할 수 있습니다.

| STEP | 실습 문서 | 하는 일 |
|---|---|---|
| STEP 01 | [cowork-masterdb.md](docs/cowork-masterdb.md) | 흩어진 파일을 MasterDB로 정리 |
| STEP 02 | [sheets-upload.md](docs/sheets-upload.md) | MasterDB를 Google Sheets에 올리기 |
| STEP 03 | [skeleton-prompt.md](docs/skeleton-prompt.md) | 내 저장소 만들기 → 폴더 구조 뼈대 잡기 → Hello, World! 배포 |
| STEP 04 | [build-ui.md](docs/build-ui.md) | 내 화면(UI) 만들기 |
| STEP 05 | [google-cloud-setup.md](docs/google-cloud-setup.md) | 내 클라이언트 ID 만들기 (시트 연결의 준비물) |
| STEP 06 | [connect-sheets.md](docs/connect-sheets.md) | **화면을 내 시트에 연결(생성·조회·수정)** |
| STEP 07 | [ideas.md](docs/ideas.md) | (선택) 더 좋게 만들기 |

## 참고 자료 (필요하거나 궁금할 때 보세요)

| 문서 | 내용 |
|---|---|
| [github-basics.md](docs/github-basics.md) | GitHub이 뭔지 궁금할 때 |
| [debugging.md](docs/debugging.md) | 뭔가 안 될 때 |
| [about-data.md](docs/about-data.md) | 정규화 이야기 |
| [about-delete.md](docs/about-delete.md) | 삭제 기능을 만들지 않은 이유 |
| [logout.md](docs/logout.md) | 공용 PC 계정 정리 |
| [next-steps.md](docs/next-steps.md) | 집에서 이어서 하기 |

---

## 이 저장소에 들어 있는 것

```
├── README.md                  ← 지금 보고 있는 안내판
├── CLAUDE.md                  ← Claude Code가 항상 먼저 읽는 업무 지침서
├── docs/                      ← 워크샵 교재 전부
│   └── reference/             ← 사전 과제로 만든 화면 스케치 HTML을 넣습니다
└── .claude/skills/            ← "배포해줘" / "저장해줘" 라고 말하면 실행되는 자동화
```

---

## 막혔을 때

1. 같은 프롬프트를 한 번 더 실행해 봅니다 (의외로 자주 해결됩니다)
2. 위 표에서 해당하는 내용의 문서를 읽어봅니다
3. [debugging.md](docs/debugging.md)의 **상황 설명 4줄**로 Claude Code에게 말합니다
4. 그래도 안 되면 도움을 요청합니다
