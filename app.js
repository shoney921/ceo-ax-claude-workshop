/* ============================================================
   app.js — 화면 동작 + Google Sheets 연결
   - 하는 일: 조회(읽기) · 추가 · 수정   (삭제 기능은 없습니다)
   - 설정값(시트 ID, 탭 이름, 클라이언트 ID)은 config.js에 있습니다
   ============================================================ */

/* ---------- 0. 기본 설정 ---------- */

// 시트를 읽고 쓰는 권한 하나만 요청합니다
var SCOPE = "https://www.googleapis.com/auth/spreadsheets";
var DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";

// 입고기록 탭의 열 순서 (A~H). 시트의 1행과 같아야 합니다.
var COLUMNS = ["날짜", "자재명", "수량", "단가", "금액", "거래처", "담당자", "비고"];
var LAST_COL = "H"; // 열이 8개라서 A~H

// 화면이 기억하고 있는 것들
var gapiReady = false;      // Google API 라이브러리 준비됨
var gisReady = false;       // Google 로그인 라이브러리 준비됨
var tokenClient = null;     // 로그인 창을 띄우는 객체
var connected = false;      // 로그인이 끝났는지
var records = [];           // 입고기록 (행 번호와 값을 함께 보관)
var itemList = [];          // 자재 탭에서 읽은 목록
var vendorList = [];        // 거래처 탭에서 읽은 목록
var editingRow = null;      // 지금 수정 중인 시트 행 번호 (없으면 null)

/* ---------- 1. 자주 쓰는 도우미 함수들 ---------- */

function $(id) { return document.getElementById(id); }

// Google 라이브러리가 돌려주는 객체는 진짜 Promise가 아니라서 .catch(오류 잡기)를 못 씁니다.
// 표준 Promise로 한 번 감싸 주면 .then / .catch 를 정상적으로 쓸 수 있습니다.
function asPromise(req) { return Promise.resolve(req); }

// 숫자를 1,234 형태로
function won(n) { return Number(n || 0).toLocaleString("ko-KR"); }

// "1,234" 같은 글자도 숫자로 바꿔 줍니다
function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  var n = Number(String(v).replace(/[,\s₩원]/g, ""));
  return isNaN(n) ? 0 : n;
}

// 날짜를 항상 YYYY-MM-DD 로 맞춥니다
// (시트가 "2025. 6. 2." 처럼 보여 주거나 숫자로 돌려주는 경우까지 대비)
function normalizeDate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {                       // 구글 시트의 날짜 일련번호
    var base = Date.UTC(1899, 11, 30);
    var d = new Date(base + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})\s*[-.\/]?\s*(\d{1,2})\s*[-.\/]?\s*(\d{1,2})\s*\.?$/);
  if (m) {
    return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  }
  return s;
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

// 화면 위쪽 안내줄에 상황을 알려 줍니다
function setStatus(html, kind) {
  var el = $("status");
  el.className = "status" + (kind ? " " + kind : "");
  el.innerHTML = html;
}

// 폼 옆에 짧은 결과 메시지
function setFormMsg(text, kind) {
  var el = $("form-msg");
  el.className = "form-msg" + (kind ? " " + kind : "");
  el.textContent = text;
}

// 시트 범위 문자열 (탭 이름에 한글·공백이 있어도 되도록 작은따옴표로 감쌉니다)
function range(sheetName, a1) {
  return "'" + String(sheetName).replace(/'/g, "''") + "'!" + a1;
}

// Google이 돌려준 오류를 사람 말로 바꿔 줍니다
function explainError(err) {
  var code = (err && (err.status || (err.result && err.result.error && err.result.error.code))) || 0;
  var msg = (err && (err.message || (err.result && err.result.error && err.result.error.message))) || String(err);

  if (code === 401) {
    connected = false;
    updateConnectButton();
    return "로그인이 만료됐습니다. (구글 로그인은 1시간쯤 지나면 풀립니다) <b>Google 계정으로 연결</b>을 다시 눌러 주세요.";
  }
  if (code === 403) {
    return "시트에 접근할 권한이 없습니다. 로그인할 때 동의 화면의 체크박스 <b>“모두 선택”</b>을 빠뜨렸을 가능성이 큽니다. 다시 연결해 보세요. (원래 메시지: " + msg + ")";
  }
  if (code === 404 || /not found|Requested entity/i.test(msg)) {
    return "시트를 찾지 못했습니다. <code>config.js</code>의 <b>SPREADSHEET_ID</b>가 맞는지 확인해 주세요. (원래 메시지: " + msg + ")";
  }
  if (/Unable to parse range/i.test(msg)) {
    return "탭 이름이 실제 시트와 다릅니다. <code>config.js</code>의 <b>SHEET_NAME</b>을 시트 아래쪽 탭 이름과 글자 하나까지 똑같이 맞춰 주세요. (원래 메시지: " + msg + ")";
  }
  return "문제가 생겼습니다: " + msg;
}

/* ---------- 2. Google 라이브러리 준비 ---------- */
/* index.html에서 라이브러리를 다 읽으면 아래 두 함수를 불러 줍니다 */

function gapiLoaded() {
  gapi.load("client", function () {
    asPromise(gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] })).then(function () {
      gapiReady = true;
      maybeReady();
    }, function (err) {
      setStatus(explainError(err), "error");
    });
  });
}

function gisLoaded() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: function (resp) {
        if (resp.error) {
          setStatus("로그인이 취소되었거나 실패했습니다. (" + resp.error + ")", "error");
          return;
        }
        connected = true;
        updateConnectButton();
        loadAll();
      }
    });
    gisReady = true;
    maybeReady();
  } catch (e) {
    setStatus("Google 로그인 준비에 실패했습니다: " + e.message, "error");
  }
}

// 두 라이브러리가 모두 준비되면 연결 버튼을 켭니다
function maybeReady() {
  if (!gapiReady || !gisReady) return;

  if (!CLIENT_ID || CLIENT_ID.indexOf("apps.googleusercontent.com") === -1) {
    setStatus("아직 <code>config.js</code>에 <b>CLIENT_ID</b>가 들어 있지 않습니다. Google Cloud에서 만든 클라이언트 ID를 넣어 주세요.", "error");
    return;
  }
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf("여기에") === 0) {
    setStatus("아직 <code>config.js</code>에 <b>SPREADSHEET_ID</b>가 들어 있지 않습니다. 시트 주소의 <code>/d/</code>와 <code>/edit</code> 사이 값을 넣어 주세요.", "error");
    return;
  }
  updateConnectButton();
}

function updateConnectButton() {
  var btn = $("btn-connect");
  btn.disabled = !(gapiReady && gisReady);
  if (connected) {
    btn.textContent = "✓ 연결됨 · 새로고침";
    btn.className = "btn-connect connected";
  } else {
    btn.textContent = gapiReady && gisReady ? "Google 계정으로 연결" : "준비 중…";
    btn.className = "btn-connect";
  }
  $("btn-add").disabled = !connected;
}

/* ---------- 3. 연결 버튼 ---------- */

function onConnectClick() {
  if (connected) {            // 이미 연결돼 있으면 다시 읽어 오기만
    loadAll();
    return;
  }
  setStatus("Google 로그인 창을 띄우는 중입니다…", "busy");
  tokenClient.requestAccessToken({ prompt: "" });
}

/* ---------- 4. 조회 — 시트에서 읽어 오기 ---------- */

function loadAll() {
  setStatus("시트에서 데이터를 읽는 중입니다…", "busy");
  editingRow = null;

  asPromise(gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range(SHEET_NAME, "A:" + LAST_COL)
  })).then(function (res) {
    handleMainRows(res.result.values || []);
    return loadLookupLists();          // 자재·거래처 목록 (없어도 앱은 동작)
  }).then(function () {
    setStatus("불러왔습니다. 총 <b>" + records.length + "건</b>입니다. (시트: " + SHEET_NAME + ")", "ok");
  }).catch(function (err) {
    setStatus(explainError(err), "error");
  });
}

function handleMainRows(rows) {
  var header = rows.length ? rows[0] : [];

  // 시트의 1행이 우리가 아는 열 이름과 다르면 알려 줍니다 (원본 시트가 항상 기준)
  var mismatch = COLUMNS.filter(function (c, i) {
    return String(header[i] || "").trim() !== c;
  });
  if (rows.length && mismatch.length) {
    setStatus("⚠️ 시트의 열 이름이 예상과 다릅니다. 시트 1행: <b>" +
      header.join(" / ") + "</b> · 앱이 기대하는 순서: <b>" + COLUMNS.join(" / ") +
      "</b>. 열 순서를 맞추거나 알려 주세요.", "error");
  }

  records = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i] || [];
    if (r.join("").trim() === "") continue;      // 완전히 빈 행은 건너뜀
    records.push({
      row: i + 1,                                 // 시트에서의 실제 행 번호
      date: normalizeDate(r[0]),
      item: r[1] || "",
      qty: toNumber(r[2]),
      price: toNumber(r[3]),
      amount: r[4] === undefined || r[4] === "" ? toNumber(r[2]) * toNumber(r[3]) : toNumber(r[4]),
      vendor: r[5] || "",
      manager: r[6] || "",
      note: r[7] || ""
    });
  }
  renderTable();
  renderSummary();
  fillManagerList();
}

// 자재 탭 / 거래처 탭에서 드롭다운 목록을 채웁니다
function loadLookupLists() {
  return Promise.all([
    asPromise(gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: range(ITEM_SHEET_NAME, "A:D")
    })).catch(function () { return null; }),
    asPromise(gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: range(VENDOR_SHEET_NAME, "A:A")
    })).catch(function () { return null; })
  ]).then(function (res) {
    // 자재: 자재명 + 단위 (수량 옆에 단위를 보여 주려고 함께 읽습니다)
    itemList = [];
    if (res[0] && res[0].result.values) {
      res[0].result.values.slice(1).forEach(function (r) {
        if (r && r[0]) itemList.push({ name: r[0], unit: r[2] || "" });
      });
    }
    vendorList = [];
    if (res[1] && res[1].result.values) {
      res[1].result.values.slice(1).forEach(function (r) {
        if (r && r[0]) vendorList.push(r[0]);
      });
    }
    // 목록 탭을 못 읽었으면 지금까지 입력된 값에서 만들어 씁니다
    if (!itemList.length) {
      uniq(records.map(function (r) { return r.item; })).forEach(function (n) {
        itemList.push({ name: n, unit: "" });
      });
    }
    if (!vendorList.length) {
      vendorList = uniq(records.map(function (r) { return r.vendor; }));
    }
    fillSelect($("f-item"), itemList.map(function (o) { return o.name; }), "자재를 고르세요");
    fillSelect($("f-vendor"), vendorList, "거래처를 고르세요");
    updateUnitLabel();
  });
}

function uniq(arr) {
  var out = [];
  arr.forEach(function (v) { if (v && out.indexOf(v) === -1) out.push(v); });
  return out.sort(function (a, b) { return a.localeCompare(b, "ko"); });
}

function fillSelect(sel, list, placeholder) {
  var current = sel.value;
  sel.innerHTML = "";
  var opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "— " + placeholder + " —";
  sel.appendChild(opt0);
  list.forEach(function (v) {
    var o = document.createElement("option");
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
  if (list.indexOf(current) !== -1) sel.value = current;
}

function fillManagerList() {
  var dl = $("mgr-list");
  dl.innerHTML = "";
  uniq(records.map(function (r) { return r.manager; })).forEach(function (v) {
    var o = document.createElement("option");
    o.value = v;
    dl.appendChild(o);
  });
}

/* ---------- 5. 화면 그리기 ---------- */

function sortedRecords() {
  return records.slice().sort(function (a, b) {
    if (a.date === b.date) return b.row - a.row;   // 같은 날이면 나중에 넣은 것이 위로
    return a.date < b.date ? 1 : -1;               // 최근 날짜가 위로
  });
}

function renderTable() {
  var tbody = $("tbody");
  tbody.innerHTML = "";
  var list = sortedRecords();

  $("row-count").textContent = list.length ? "· " + list.length + "건" : "";

  if (!list.length) {
    var tr = document.createElement("tr");
    tr.className = "empty-row";
    var td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = connected ? "시트에 아직 입고 기록이 없습니다. 위에서 첫 건을 추가해 보세요." : "아직 연결 전입니다. 위의 “Google 계정으로 연결” 버튼을 눌러 주세요.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  list.forEach(function (rec) {
    tbody.appendChild(rec.row === editingRow ? buildEditRow(rec) : buildViewRow(rec));
  });
}

function buildViewRow(rec) {
  var tr = document.createElement("tr");
  var cells = [
    { text: rec.date },
    { text: rec.item },
    { text: won(rec.qty), num: true },
    { text: won(rec.price), num: true },
    { text: won(rec.amount), num: true },
    { text: rec.vendor },
    { text: rec.manager },
    { text: rec.note }
  ];
  cells.forEach(function (c) {
    var td = document.createElement("td");
    if (c.num) td.className = "num";
    td.textContent = c.text;
    tr.appendChild(td);
  });

  var tdBtn = document.createElement("td");
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-edit";
  btn.textContent = "수정";
  btn.disabled = editingRow !== null;
  btn.addEventListener("click", function () {
    editingRow = rec.row;
    renderTable();
  });
  tdBtn.appendChild(btn);
  tr.appendChild(tdBtn);
  return tr;
}

function buildEditRow(rec) {
  var tr = document.createElement("tr");
  tr.className = "editing";

  function cell(node, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    td.appendChild(node);
    return td;
  }
  function input(type, value, cls) {
    var el = document.createElement("input");
    el.type = type; el.value = value;
    if (cls) el.className = cls;
    return el;
  }
  function select(list, value) {
    var el = document.createElement("select");
    var vals = list.slice();
    if (value && vals.indexOf(value) === -1) vals.unshift(value);  // 목록에 없는 기존 값도 유지
    vals.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
    el.value = value;
    return el;
  }

  var eDate = input("date", rec.date);
  var eItem = select(itemList.map(function (o) { return o.name; }), rec.item);
  var eQty = input("number", rec.qty, "num");
  var ePrice = input("number", rec.price, "num");
  var eVendor = select(vendorList, rec.vendor);
  var eMgr = input("text", rec.manager);
  eMgr.setAttribute("list", "mgr-list");
  var eNote = input("text", rec.note);

  var tdAmount = document.createElement("td");
  tdAmount.className = "amount-cell";
  function recalc() { tdAmount.textContent = won(toNumber(eQty.value) * toNumber(ePrice.value)); }
  eQty.addEventListener("input", recalc);
  ePrice.addEventListener("input", recalc);
  recalc();

  tr.appendChild(cell(eDate));
  tr.appendChild(cell(eItem));
  tr.appendChild(cell(eQty, "num"));
  tr.appendChild(cell(ePrice, "num"));
  tr.appendChild(tdAmount);
  tr.appendChild(cell(eVendor));
  tr.appendChild(cell(eMgr));
  tr.appendChild(cell(eNote));

  var tdBtns = document.createElement("td");
  var save = document.createElement("button");
  save.type = "button"; save.className = "btn-save"; save.textContent = "저장";
  var cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "btn-cancel"; cancel.textContent = "취소";

  cancel.addEventListener("click", function () {
    editingRow = null;
    renderTable();
  });

  save.addEventListener("click", function () {
    var updated = {
      row: rec.row,
      date: normalizeDate(eDate.value),
      item: eItem.value,
      qty: toNumber(eQty.value),
      price: toNumber(ePrice.value),
      vendor: eVendor.value,
      manager: eMgr.value.trim(),
      note: eNote.value.trim()
    };
    updated.amount = updated.qty * updated.price;

    if (!updated.date || !updated.item) {
      setStatus("날짜와 자재명은 비워 둘 수 없습니다.", "error");
      return;
    }
    save.disabled = true; cancel.disabled = true;
    setStatus("시트의 " + rec.row + "행을 수정하는 중입니다…", "busy");

    asPromise(gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range(SHEET_NAME, "A" + rec.row + ":" + LAST_COL + rec.row),
      valueInputOption: "RAW",
      resource: { values: [rowFromRecord(updated)] }
    })).then(function () {
      for (var i = 0; i < records.length; i++) {
        if (records[i].row === rec.row) { records[i] = updated; break; }
      }
      editingRow = null;
      renderTable();
      renderSummary();
      fillManagerList();
      setStatus("시트의 <b>" + rec.row + "행</b>을 수정했습니다.", "ok");
    }).catch(function (err) {
      save.disabled = false; cancel.disabled = false;
      setStatus(explainError(err), "error");
    });
  });

  tdBtns.appendChild(save);
  tdBtns.appendChild(cancel);
  tr.appendChild(tdBtns);
  return tr;
}

// 기록 하나를 시트의 한 줄(A~H)로 바꿉니다
function rowFromRecord(r) {
  return [r.date, r.item, r.qty, r.price, r.amount, r.vendor, r.manager, r.note];
}

function renderSummary() {
  var total = 0;
  var thisMonth = todayStr().slice(0, 7);
  var monthCount = 0;
  records.forEach(function (r) {
    total += r.amount;
    if (String(r.date).slice(0, 7) === thisMonth) monthCount++;
  });
  $("stat-count").textContent = won(records.length) + "건";
  $("stat-amount").textContent = won(total) + "원";
  $("stat-month").textContent = won(monthCount) + "건";
}

/* ---------- 6. 추가 — 시트 맨 아래에 새 행 넣기 ---------- */

function updateUnitLabel() {
  var name = $("f-item").value;
  var found = null;
  itemList.forEach(function (o) { if (o.name === name) found = o; });
  $("f-unit").textContent = found && found.unit ? "(" + found.unit + ")" : "";
}

function calcFormAmount() {
  $("f-amount").value = won(toNumber($("f-qty").value) * toNumber($("f-price").value));
}

function onAddClick() {
  if (!connected) {
    setStatus("먼저 <b>Google 계정으로 연결</b> 버튼을 눌러 주세요.", "error");
    return;
  }
  var rec = {
    date: normalizeDate($("f-date").value),
    item: $("f-item").value,
    qty: toNumber($("f-qty").value),
    price: toNumber($("f-price").value),
    vendor: $("f-vendor").value,
    manager: $("f-mgr").value.trim(),
    note: $("f-note").value.trim()
  };
  rec.amount = rec.qty * rec.price;

  // 꼭 필요한 값 확인
  if (!rec.date) { setFormMsg("날짜를 골라 주세요.", "error"); return; }
  if (!rec.item) { setFormMsg("자재명을 골라 주세요.", "error"); return; }
  if (rec.qty <= 0) { setFormMsg("수량은 0보다 커야 합니다.", "error"); return; }
  if (rec.price < 0) { setFormMsg("단가는 0 이상이어야 합니다.", "error"); return; }
  if (!rec.vendor) { setFormMsg("거래처를 골라 주세요.", "error"); return; }

  setFormMsg("");
  $("btn-add").disabled = true;
  setStatus("시트에 새 행을 추가하는 중입니다…", "busy");

  asPromise(gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: range(SHEET_NAME, "A:" + LAST_COL),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [rowFromRecord(rec)] }
  })).then(function (res) {
    // 시트가 알려 준 "실제로 들어간 위치"에서 행 번호를 꺼냅니다
    var updatedRange = (res.result.updates && res.result.updates.updatedRange) || "";
    var m = updatedRange.match(/!\$?[A-Z]+\$?(\d+)/);
    rec.row = m ? Number(m[1]) : (records.length + 2);
    records.push(rec);

    renderTable();
    renderSummary();
    fillManagerList();
    $("btn-add").disabled = false;
    $("f-note").value = "";
    setFormMsg("추가되었습니다 (" + rec.row + "행)", "ok");
    setStatus("시트에 <b>1건</b>을 추가했습니다. 총 " + records.length + "건입니다.", "ok");
  }).catch(function (err) {
    $("btn-add").disabled = false;
    setFormMsg("추가하지 못했습니다.", "error");
    setStatus(explainError(err), "error");
  });
}

/* ---------- 7. 화면이 열릴 때 한 번 실행 ---------- */

document.addEventListener("DOMContentLoaded", function () {
  $("f-date").value = todayStr();
  calcFormAmount();

  $("btn-connect").addEventListener("click", onConnectClick);

  // 8초가 지나도 버튼이 "준비 중"이면 왜 그런지 알려 줍니다
  setTimeout(function () {
    if (gapiReady && gisReady) return;
    var missing = [];
    if (!gapiReady) missing.push("Google Sheets 라이브러리");
    if (!gisReady) missing.push("Google 로그인 라이브러리");
    setStatus("⚠️ " + missing.join("와 ") + "를 아직 불러오지 못했습니다. " +
      "인터넷 연결을 확인하시고, 이 페이지를 <b>배포된 https 주소</b>에서 열었는지 확인해 주세요. " +
      "(내 PC 파일을 직접 여는 <code>file:///</code> 방식에서는 동작하지 않습니다)", "error");
  }, 8000);

  $("btn-add").addEventListener("click", onAddClick);
  $("f-qty").addEventListener("input", calcFormAmount);
  $("f-price").addEventListener("input", calcFormAmount);
  $("f-item").addEventListener("change", updateUnitLabel);
});
