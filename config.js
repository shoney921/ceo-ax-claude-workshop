// ============================================================
//  config.js — 내 앱의 설정값을 모아 두는 곳
//  (여기 값만 바꾸면 됩니다. 다른 파일은 건드리지 않아도 돼요)
// ============================================================

// 1) 내 Google Sheets 문서의 ID
//    시트 주소가 https://docs.google.com/spreadsheets/d/【이 부분】/edit 라면
//    가운데 【이 부분】만 복사해서 넣으세요.
var SPREADSHEET_ID = "여기에_내_스프레드시트_ID를_넣으세요";

// 2) 입고 내역이 들어 있는 탭(시트) 이름 — 글자 하나까지 똑같이
var SHEET_NAME = "입고기록";

// 3) 자재 목록 탭 / 거래처 목록 탭 이름
//    (입력 폼의 드롭다운을 이 탭들에서 채웁니다)
var ITEM_SHEET_NAME = "자재";
var VENDOR_SHEET_NAME = "거래처";

// 4) Google Cloud에서 만든 OAuth 클라이언트 ID
//    ...apps.googleusercontent.com 으로 끝나는 값입니다.
//    ⚠️ 클라이언트 "시크릿"은 절대 여기 넣지 마세요. ID만 넣습니다.
var CLIENT_ID = "1010864947255-i24qnlcvio6c53lk5jedbfdos6ci4foq.apps.googleusercontent.com";
