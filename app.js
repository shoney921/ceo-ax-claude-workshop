/* ============================================================
   app.js — 화면 동작 + Google Sheets 연결
   - 화면 3개: 입고 내역 / 거래처 / 자재  (왼쪽 사이드바로 전환)
   - 하는 일: 조회(읽기) · 추가 · 수정   (삭제 기능은 없습니다)
   - 설정값(시트 ID, 탭 이름, 클라이언트 ID)은 config.js에 있습니다
   ============================================================ */

/* ---------- 0. 기본 설정 ---------- */

var SCOPE = "https://www.googleapis.com/auth/spreadsheets";
var DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";

/* 화면 3개의 설계도입니다.
   시트의 탭 하나 = 화면 하나 = 아래 항목 하나.
   시트에 열을 추가하셨다면 여기 cols에도 같은 이름을 같은 순서로 넣으면 됩니다. */
var TABLES = [
  {
    key: "inbound",
    label: "입고 내역",
    icon: "📥",
    desc: "자재가 들어온 내역을 기록합니다",
    addTitle: "+ 입고 추가",
    sheet: SHEET_NAME,
    lastCol: "H",
    sortByDateDesc: true,
    cols: [
      { name: "날짜",   type: "date",     required: true },
      { name: "자재명", type: "select",   required: true, fromTable: "item",   fromCol: "자재명" },
      { name: "수량",   type: "number",   required: true, num: true, min: 1,
        unitOf: { table: "item", matchField: "자재명", keyCol: "자재명", valueCol: "단위" } },
      { name: "단가",   type: "number",   required: true, num: true, min: 0 },
      { name: "금액",   type: "computed", num: true, from: ["수량", "단가"] },
      { name: "거래처", type: "select",   required: true, fromTable: "vendor", fromCol: "거래처명" },
      { name: "담당자", type: "text",     suggest: true },
      { name: "비고",   type: "text" }
    ]
  },
  {
    key: "vendor",
    label: "거래처",
    icon: "🏢",
    desc: "자재를 사 오는 회사들을 관리합니다",
    addTitle: "+ 거래처 추가",
    sheet: VENDOR_SHEET_NAME,
    lastCol: "F",
    cols: [
      { name: "거래처명", type: "text", required: true },
      { name: "담당자",   type: "text" },
      { name: "연락처",   type: "text" },
      { name: "이메일",   type: "text" },
      { name: "결제조건", type: "text", suggest: true },
      { name: "비고",     type: "text" }
    ]
  },
  {
    key: "item",
    label: "자재",
    icon: "📦",
    desc: "취급하는 자재 목록을 관리합니다",
    addTitle: "+ 자재 추가",
    sheet: ITEM_SHEET_NAME,
    lastCol: "D",
    cols: [
      { name: "자재명",   type: "text",   required: true },
      { name: "분류",     type: "text",   suggest: true },
      { name: "단위",     type: "text",   suggest: true },
      { name: "안전재고", type: "number", num: true, min: 0 }
    ]
  }
];

/* 화면이 기억하고 있는 것들 */
var gapiReady = false;
var gisReady = false;
var tokenClient = null;
var connected = false;
var currentView = "inbound";        // 지금 보고 있는 화면
var data = {};                      // data["inbound"] = [{row: 2, v: {날짜: "...", ...}}, ...]
var editing = {};                   // editing["inbound"] = 수정 중인 시트 행 번호

/* ---------- 1. 자주 쓰는 도우미 함수들 ---------- */

function $(id) { return document.getElementById(id); }

// Google 라이브러리가 돌려주는 객체는 진짜 Promise가 아니라서 .catch(오류 잡기)를 못 씁니다.
// 표준 Promise로 한 번 감싸 주면 .then / .catch 를 정상적으로 쓸 수 있습니다.
function asPromise(req) { return Promise.resolve(req); }

function tableOf(key) {
  for (var i = 0; i < TABLES.length; i++) if (TABLES[i].key === key) return TABLES[i];
  return null;
}

// 숫자를 1,234 형태로
function won(n) { return Number(n || 0).toLocaleString("ko-KR"); }

// "1,234" 같은 글자도 숫자로 바꿔 줍니다
function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  var n = Number(String(v).replace(/[,\s₩원]/g, ""));
  return isNaN(n) ? 0 : n;
}

// 날짜를 항상 YYYY-MM-DD 로 맞춥니다
function normalizeDate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    var base = Date.UTC(1899, 11, 30);
    return new Date(base + v * 86400000).toISOString().slice(0, 10);
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})\s*[-.\/]?\s*(\d{1,2})\s*[-.\/]?\s*(\d{1,2})\s*\.?$/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  return s;
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function setStatus(html, kind) {
  var el = $("status");
  el.className = "status" + (kind ? " " + kind : "");
  el.innerHTML = html;
}

function setFormMsg(key, text, kind) {
  var el = $("msg-" + key);
  if (!el) return;
  el.className = "form-msg" + (kind ? " " + kind : "");
  el.textContent = text;
}

// 시트 범위 (탭 이름에 한글·공백이 있어도 되도록 작은따옴표로 감쌉니다)
function range(sheetName, a1) {
  return "'" + String(sheetName).replace(/'/g, "''") + "'!" + a1;
}

// 한국어 조사 고르기 — 받침이 있으면 "을", 없으면 "를" (예: 자재명을 / 거래처를)
function josa(word) {
  var last = String(word || "").slice(-1);
  var code = last.charCodeAt(0);
  if (isNaN(code) || code < 0xAC00 || code > 0xD7A3) return "을(를)";
  return (code - 0xAC00) % 28 !== 0 ? "을" : "를";
}

// 중복 없는 목록 만들기 (가나다순)
function uniq(arr) {
  var out = [];
  arr.forEach(function (v) { if (v !== "" && v !== undefined && v !== null && out.indexOf(v) === -1) out.push(v); });
  return out.sort(function (a, b) { return String(a).localeCompare(String(b), "ko"); });
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
    return "탭 이름이 실제 시트와 다릅니다. <code>config.js</code>의 탭 이름을 시트 아래쪽 탭과 글자 하나까지 똑같이 맞춰 주세요. (원래 메시지: " + msg + ")";
  }
  return "문제가 생겼습니다: " + msg;
}

/* ---------- 2. Google 라이브러리 준비 ---------- */

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

function maybeReady() {
  if (!gapiReady || !gisReady) return;

  if (!CLIENT_ID || CLIENT_ID.indexOf("apps.googleusercontent.com") === -1) {
    setStatus("아직 <code>config.js</code>에 <b>CLIENT_ID</b>가 들어 있지 않습니다.", "error");
    return;
  }
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf("여기에") === 0) {
    setStatus("아직 <code>config.js</code>에 <b>SPREADSHEET_ID</b>가 들어 있지 않습니다.", "error");
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
  TABLES.forEach(function (t) {
    var b = $("add-" + t.key);
    if (b) b.disabled = !connected;
  });
}

function onConnectClick() {
  if (connected) { loadAll(); return; }
  setStatus("Google 로그인 창을 띄우는 중입니다…", "busy");
  tokenClient.requestAccessToken({ prompt: "" });
}

/* ---------- 3. 조회 — 시트에서 읽어 오기 ---------- */

function loadAll() {
  setStatus("시트에서 데이터를 읽는 중입니다…", "busy");
  TABLES.forEach(function (t) { editing[t.key] = null; });

  var jobs = TABLES.map(function (t) {
    return asPromise(gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range(t.sheet, "A:" + t.lastCol)
    })).then(function (res) {
      return { table: t, rows: res.result.values || [] };
    });
  });

  Promise.all(jobs).then(function (results) {
    var warnings = [];
    results.forEach(function (r) {
      var w = absorbRows(r.table, r.rows);
      if (w) warnings.push(w);
    });
    renderAll();

    if (warnings.length) {
      setStatus("⚠️ " + warnings.join("<br>"), "error");
    } else {
      var counts = TABLES.map(function (t) { return t.label + " " + data[t.key].length + "건"; });
      setStatus("불러왔습니다 — " + counts.join(" · ") + ".", "ok");
    }
  }).catch(function (err) {
    setStatus(explainError(err), "error");
  });
}

// 시트에서 읽은 줄들을 화면이 쓰는 형태로 바꿉니다. 문제가 있으면 경고 문구를 돌려줍니다.
function absorbRows(t, rows) {
  var header = rows.length ? rows[0] : [];
  var warning = null;

  var mismatch = t.cols.filter(function (c, i) {
    return String(header[i] || "").trim() !== c.name;
  });
  if (rows.length && mismatch.length) {
    warning = "<b>" + t.label + "</b> 탭(" + t.sheet + ")의 열 이름이 예상과 다릅니다. " +
      "시트 1행: <b>" + header.join(" / ") + "</b> · 앱이 기대하는 순서: <b>" +
      t.cols.map(function (c) { return c.name; }).join(" / ") + "</b>";
  }

  var list = [];
  for (var i = 1; i < rows.length; i++) {
    var raw = rows[i] || [];
    if (raw.join("").trim() === "") continue;
    var v = {};
    t.cols.forEach(function (c, ci) {
      var val = raw[ci];
      if (c.type === "date") v[c.name] = normalizeDate(val);
      else if (c.num) v[c.name] = toNumber(val);
      else v[c.name] = val === undefined || val === null ? "" : String(val);
    });
    // 금액처럼 계산으로 채우는 열이 비어 있으면 계산해서 채웁니다
    t.cols.forEach(function (c) {
      if (c.type === "computed" && !raw[t.cols.indexOf(c)]) v[c.name] = computeValue(c, v);
    });
    list.push({ row: i + 1, v: v });
  }
  data[t.key] = list;
  return warning;
}

function computeValue(col, v) {
  var n = 1;
  col.from.forEach(function (f) { n *= toNumber(v[f]); });
  return n;
}

/* ---------- 4. 사이드바 메뉴와 화면 틀 만들기 ---------- */

function buildNav() {
  var nav = $("nav");
  nav.innerHTML = "";
  TABLES.forEach(function (t) {
    var a = document.createElement("button");
    a.type = "button";
    a.className = "nav-item" + (t.key === currentView ? " active" : "");
    a.id = "nav-" + t.key;
    a.innerHTML = '<span class="nav-icon">' + t.icon + '</span><span class="nav-label">' + t.label + '</span>' +
                  '<span class="nav-count" id="navcount-' + t.key + '"></span>';
    a.addEventListener("click", function () { switchView(t.key); });
    nav.appendChild(a);
  });
}

function switchView(key) {
  currentView = key;
  TABLES.forEach(function (t) {
    var nav = $("nav-" + t.key);
    var view = $("view-" + t.key);
    if (nav) nav.className = "nav-item" + (t.key === key ? " active" : "");
    if (view) view.hidden = t.key !== key;
  });
}

function buildViews() {
  var host = $("views");
  host.innerHTML = "";

  TABLES.forEach(function (t) {
    var view = document.createElement("section");
    view.className = "view";
    view.id = "view-" + t.key;
    view.hidden = t.key !== currentView;

    var head = document.createElement("header");
    head.className = "view-head";
    head.innerHTML = "<h1>" + t.icon + " " + t.label + "</h1><p>" + t.desc + "</p>";
    view.appendChild(head);

    var summary = document.createElement("div");
    summary.className = "summary";
    summary.id = "sum-" + t.key;
    view.appendChild(summary);

    // 추가 폼
    var addCard = document.createElement("section");
    addCard.className = "card";
    addCard.innerHTML =
      "<h2>" + t.addTitle + "</h2>" +
      '<div class="form-grid" id="form-' + t.key + '"></div>' +
      '<div class="form-actions">' +
        '<span class="form-msg" id="msg-' + t.key + '"></span>' +
        '<button class="btn-add" type="button" id="add-' + t.key + '" disabled>추가</button>' +
      "</div>";
    view.appendChild(addCard);

    // 목록
    var listCard = document.createElement("section");
    listCard.className = "card";
    listCard.innerHTML =
      '<h2>목록 <span class="muted" id="count-' + t.key + '"></span></h2>' +
      '<div class="table-scroll"><table>' +
        '<thead id="head-' + t.key + '"></thead><tbody id="body-' + t.key + '"></tbody>' +
      "</table></div>";
    view.appendChild(listCard);

    host.appendChild(view);

    buildForm(t);
    buildTableHead(t);
    $("add-" + t.key).addEventListener("click", function () { onAdd(t); });
  });
}

/* ---------- 5. 입력 폼 ---------- */

// 이 열의 선택지 목록을 구합니다 (다른 탭에서 가져오거나, 이미 입력된 값들에서 모으거나)
function optionsFor(t, col) {
  if (col.fromTable) {
    var src = data[col.fromTable] || [];
    return uniq(src.map(function (r) { return r.v[col.fromCol]; }));
  }
  return uniq((data[t.key] || []).map(function (r) { return r.v[col.name]; }));
}

function buildForm(t) {
  var grid = $("form-" + t.key);
  grid.innerHTML = "";

  t.cols.forEach(function (col) {
    var field = document.createElement("div");
    field.className = "field" + (col.type === "computed" ? " readonly" : "");

    var label = document.createElement("label");
    var inputId = "f-" + t.key + "-" + col.name;
    label.setAttribute("for", inputId);
    label.innerHTML = col.name +
      (col.required ? ' <span class="req">*</span>' : "") +
      (col.type === "computed" ? " <span class='muted'>(" + col.from.join(" × ") + ", 자동)</span>" : "") +
      (col.unitOf ? ' <span class="unit" id="unit-' + t.key + '"></span>' : "");
    field.appendChild(label);

    var input;
    if (col.type === "select") {
      input = document.createElement("select");
    } else if (col.type === "computed") {
      input = document.createElement("input");
      input.type = "text";
      input.readOnly = true;
      input.tabIndex = -1;
      input.value = "0";
    } else {
      input = document.createElement("input");
      input.type = col.type === "date" ? "date" : (col.type === "number" ? "number" : "text");
      if (col.type === "number") { input.min = col.min === undefined ? 0 : col.min; input.step = 1; input.placeholder = "0"; }
      if (col.suggest) {
        var dlId = "dl-" + t.key + "-" + col.name;
        input.setAttribute("list", dlId);
        var dl = document.createElement("datalist");
        dl.id = dlId;
        field.appendChild(dl);
      }
      if (!col.required && col.type === "text") input.placeholder = "(선택)";
    }
    input.id = inputId;
    field.insertBefore(input, field.children[1] || null);
    grid.appendChild(field);
  });

  // 계산 열(금액)이 있으면, 재료가 되는 칸을 입력할 때마다 다시 계산합니다
  t.cols.forEach(function (col) {
    if (col.type !== "computed") return;
    col.from.forEach(function (f) {
      var el = $("f-" + t.key + "-" + f);
      if (el) el.addEventListener("input", function () { recalcForm(t); });
    });
  });

  // 단위 표시(수량 옆 "(개)")를 위해 연결된 칸의 변경을 지켜봅니다
  t.cols.forEach(function (col) {
    if (!col.unitOf) return;
    var el = $("f-" + t.key + "-" + col.unitOf.matchField);
    if (el) el.addEventListener("change", function () { updateUnitLabel(t); });
  });

  if (t.key === "inbound") {
    var d = $("f-inbound-날짜");
    if (d) d.value = todayStr();
  }
  recalcForm(t);
}

function recalcForm(t) {
  t.cols.forEach(function (col) {
    if (col.type !== "computed") return;
    var v = {};
    col.from.forEach(function (f) {
      var el = $("f-" + t.key + "-" + f);
      v[f] = el ? el.value : 0;
    });
    var out = $("f-" + t.key + "-" + col.name);
    if (out) out.value = won(computeValue(col, v));
  });
}

function updateUnitLabel(t) {
  t.cols.forEach(function (col) {
    if (!col.unitOf) return;
    var span = $("unit-" + t.key);
    if (!span) return;
    var picked = $("f-" + t.key + "-" + col.unitOf.matchField);
    var name = picked ? picked.value : "";
    var unit = "";
    (data[col.unitOf.table] || []).forEach(function (r) {
      if (r.v[col.unitOf.keyCol] === name) unit = r.v[col.unitOf.valueCol];
    });
    span.textContent = unit ? "(" + unit + ")" : "";
  });
}

// 드롭다운·자동완성 목록을 최신 데이터로 채웁니다
function refreshFormChoices(t) {
  t.cols.forEach(function (col) {
    if (col.type === "select") {
      var sel = $("f-" + t.key + "-" + col.name);
      if (!sel) return;
      var current = sel.value;
      var list = optionsFor(t, col);
      sel.innerHTML = "";
      var o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = "— " + col.name + josa(col.name) + " 고르세요 —";
      sel.appendChild(o0);
      list.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
      if (list.indexOf(current) !== -1) sel.value = current;
    } else if (col.suggest) {
      var dl = $("dl-" + t.key + "-" + col.name);
      if (!dl) return;
      dl.innerHTML = "";
      optionsFor(t, col).forEach(function (v) {
        var o = document.createElement("option");
        o.value = v;
        dl.appendChild(o);
      });
    }
  });
  updateUnitLabel(t);
}

/* ---------- 6. 표 그리기 ---------- */

function buildTableHead(t) {
  var thead = $("head-" + t.key);
  var tr = document.createElement("tr");
  t.cols.forEach(function (col) {
    var th = document.createElement("th");
    if (col.num) th.className = "num";
    th.textContent = col.name;
    tr.appendChild(th);
  });
  tr.appendChild(document.createElement("th"));
  thead.innerHTML = "";
  thead.appendChild(tr);
}

function sortedRows(t) {
  var list = (data[t.key] || []).slice();
  if (t.sortByDateDesc) {
    var dateCol = t.cols[0].name;
    list.sort(function (a, b) {
      if (a.v[dateCol] === b.v[dateCol]) return b.row - a.row;
      return a.v[dateCol] < b.v[dateCol] ? 1 : -1;
    });
  }
  return list;
}

function renderAll() {
  TABLES.forEach(function (t) {
    refreshFormChoices(t);
    renderTable(t);
    renderSummary(t);
    var nc = $("navcount-" + t.key);
    if (nc) nc.textContent = (data[t.key] || []).length || "";
  });
}

function renderTable(t) {
  var tbody = $("body-" + t.key);
  tbody.innerHTML = "";
  var list = sortedRows(t);
  $("count-" + t.key).textContent = list.length ? "· " + list.length + "건" : "";

  if (!list.length) {
    var tr = document.createElement("tr");
    tr.className = "empty-row";
    var td = document.createElement("td");
    td.colSpan = t.cols.length + 1;
    td.textContent = connected
      ? "시트의 " + t.sheet + " 탭에 아직 내용이 없습니다. 위에서 첫 건을 추가해 보세요."
      : "아직 연결 전입니다. 왼쪽 아래 “Google 계정으로 연결” 버튼을 눌러 주세요.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  list.forEach(function (rec) {
    tbody.appendChild(rec.row === editing[t.key] ? buildEditRow(t, rec) : buildViewRow(t, rec));
  });
}

function buildViewRow(t, rec) {
  var tr = document.createElement("tr");
  t.cols.forEach(function (col) {
    var td = document.createElement("td");
    if (col.num) td.className = "num";
    td.textContent = col.num ? won(rec.v[col.name]) : rec.v[col.name];
    tr.appendChild(td);
  });

  var tdBtn = document.createElement("td");
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-edit";
  btn.textContent = "수정";
  btn.disabled = editing[t.key] !== null && editing[t.key] !== undefined;
  btn.addEventListener("click", function () {
    editing[t.key] = rec.row;
    renderTable(t);
  });
  tdBtn.appendChild(btn);
  tr.appendChild(tdBtn);
  return tr;
}

function buildEditRow(t, rec) {
  var tr = document.createElement("tr");
  tr.className = "editing";
  var inputs = {};

  t.cols.forEach(function (col) {
    var td = document.createElement("td");
    if (col.num) td.className = "num";

    if (col.type === "computed") {
      td.className = "amount-cell";
      td.textContent = won(rec.v[col.name]);
      inputs[col.name] = { cell: td };
    } else if (col.type === "select") {
      var sel = document.createElement("select");
      var list = optionsFor(t, col).slice();
      var cur = rec.v[col.name];
      if (cur && list.indexOf(cur) === -1) list.unshift(cur);   // 목록에 없는 기존 값도 유지
      list.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
      sel.value = cur;
      td.appendChild(sel);
      inputs[col.name] = { el: sel };
    } else {
      var el = document.createElement("input");
      el.type = col.type === "date" ? "date" : (col.type === "number" ? "number" : "text");
      if (col.num) el.className = "num";
      if (col.suggest) el.setAttribute("list", "dl-" + t.key + "-" + col.name);
      el.value = rec.v[col.name];
      td.appendChild(el);
      inputs[col.name] = { el: el };
    }
    tr.appendChild(td);
  });

  // 수정 중에도 금액이 실시간으로 계산되게 합니다
  t.cols.forEach(function (col) {
    if (col.type !== "computed") return;
    function recalc() {
      var v = {};
      col.from.forEach(function (f) { v[f] = inputs[f].el.value; });
      inputs[col.name].cell.textContent = won(computeValue(col, v));
    }
    col.from.forEach(function (f) { inputs[f].el.addEventListener("input", recalc); });
    recalc();
  });

  var tdBtns = document.createElement("td");
  var save = document.createElement("button");
  save.type = "button"; save.className = "btn-save"; save.textContent = "저장";
  var cancel = document.createElement("button");
  cancel.type = "button"; cancel.className = "btn-cancel"; cancel.textContent = "취소";

  cancel.addEventListener("click", function () {
    editing[t.key] = null;
    renderTable(t);
  });

  save.addEventListener("click", function () {
    var v = collectValues(t, function (col) {
      return col.type === "computed" ? null : inputs[col.name].el.value;
    });
    var problem = validate(t, v);
    if (problem) { setStatus(problem, "error"); return; }

    save.disabled = true; cancel.disabled = true;
    setStatus(t.label + " " + rec.row + "행을 수정하는 중입니다…", "busy");

    asPromise(gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range(t.sheet, "A" + rec.row + ":" + t.lastCol + rec.row),
      valueInputOption: "RAW",
      resource: { values: [rowFromValues(t, v)] }
    })).then(function () {
      for (var i = 0; i < data[t.key].length; i++) {
        if (data[t.key][i].row === rec.row) { data[t.key][i] = { row: rec.row, v: v }; break; }
      }
      editing[t.key] = null;
      renderAll();
      setStatus("<b>" + t.label + "</b> 시트의 " + rec.row + "행을 수정했습니다.", "ok");
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

/* ---------- 7. 값 모으기 · 확인 · 저장 ---------- */

// 각 열의 값을 읽어 하나의 묶음으로 만듭니다 (계산 열은 마지막에 채웁니다)
function collectValues(t, readOne) {
  var v = {};
  t.cols.forEach(function (col) {
    if (col.type === "computed") return;
    var raw = readOne(col);
    if (col.type === "date") v[col.name] = normalizeDate(raw);
    else if (col.num) v[col.name] = toNumber(raw);
    else v[col.name] = String(raw === null || raw === undefined ? "" : raw).trim();
  });
  t.cols.forEach(function (col) {
    if (col.type === "computed") v[col.name] = computeValue(col, v);
  });
  return v;
}

function validate(t, v) {
  for (var i = 0; i < t.cols.length; i++) {
    var col = t.cols[i];
    if (col.type === "computed") continue;
    if (col.required && (v[col.name] === "" || v[col.name] === null)) {
      return "<b>" + col.name + "</b>은(는) 반드시 입력해야 합니다.";
    }
    if (col.num && col.min !== undefined && v[col.name] < col.min) {
      return "<b>" + col.name + "</b>은(는) " + col.min + " 이상이어야 합니다.";
    }
  }
  return null;
}

// 값 묶음을 시트의 한 줄로 바꿉니다
function rowFromValues(t, v) {
  return t.cols.map(function (col) { return v[col.name]; });
}

function onAdd(t) {
  if (!connected) {
    setStatus("먼저 <b>Google 계정으로 연결</b> 버튼을 눌러 주세요.", "error");
    return;
  }
  var v = collectValues(t, function (col) {
    var el = $("f-" + t.key + "-" + col.name);
    return el ? el.value : "";
  });

  var problem = validate(t, v);
  if (problem) { setFormMsg(t.key, problem.replace(/<[^>]+>/g, ""), "error"); return; }

  setFormMsg(t.key, "");
  $("add-" + t.key).disabled = true;
  setStatus(t.label + "에 새 행을 추가하는 중입니다…", "busy");

  asPromise(gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: range(t.sheet, "A:" + t.lastCol),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [rowFromValues(t, v)] }
  })).then(function (res) {
    // 시트가 알려 준 "실제로 들어간 위치"에서 행 번호를 꺼냅니다
    var updatedRange = (res.result.updates && res.result.updates.updatedRange) || "";
    var m = updatedRange.match(/!\$?[A-Z]+\$?(\d+)/);
    var rowNo = m ? Number(m[1]) : (data[t.key].length + 2);
    data[t.key].push({ row: rowNo, v: v });

    renderAll();
    clearFormAfterAdd(t);
    $("add-" + t.key).disabled = false;
    setFormMsg(t.key, "추가되었습니다 (" + rowNo + "행)", "ok");
    setStatus("<b>" + t.label + "</b>에 1건을 추가했습니다. 총 " + data[t.key].length + "건입니다.", "ok");
  }).catch(function (err) {
    $("add-" + t.key).disabled = false;
    setFormMsg(t.key, "추가하지 못했습니다.", "error");
    setStatus(explainError(err), "error");
  });
}

// 추가한 뒤 폼 정리 — 입고는 이어서 넣기 좋게 비고만, 나머지는 전부 비웁니다
function clearFormAfterAdd(t) {
  if (t.key === "inbound") {
    var note = $("f-inbound-비고");
    if (note) note.value = "";
    return;
  }
  t.cols.forEach(function (col) {
    var el = $("f-" + t.key + "-" + col.name);
    if (!el || col.type === "computed") return;
    el.value = "";
  });
}

/* ---------- 8. 요약 카드 ---------- */

function renderSummary(t) {
  var box = $("sum-" + t.key);
  var list = data[t.key] || [];
  var stats = [];

  if (t.key === "inbound") {
    var total = 0, monthCount = 0, thisMonth = todayStr().slice(0, 7);
    list.forEach(function (r) {
      total += toNumber(r.v["금액"]);
      if (String(r.v["날짜"]).slice(0, 7) === thisMonth) monthCount++;
    });
    stats = [
      { label: "총 입고 건수", value: won(list.length) + "건" },
      { label: "총 입고 금액", value: won(total) + "원" },
      { label: "이번 달 건수", value: won(monthCount) + "건" }
    ];
  } else if (t.key === "vendor") {
    stats = [
      { label: "등록된 거래처", value: won(list.length) + "곳" },
      { label: "결제조건 종류", value: uniq(list.map(function (r) { return r.v["결제조건"]; })).length + "가지" },
      { label: "입고 실적이 있는 곳",
        value: uniq((data["inbound"] || []).map(function (r) { return r.v["거래처"]; })).length + "곳" }
    ];
  } else if (t.key === "item") {
    stats = [
      { label: "등록된 자재", value: won(list.length) + "종" },
      { label: "분류", value: uniq(list.map(function (r) { return r.v["분류"]; })).length + "가지" },
      { label: "입고 이력이 있는 자재",
        value: uniq((data["inbound"] || []).map(function (r) { return r.v["자재명"]; })).length + "종" }
    ];
  }

  box.innerHTML = "";
  stats.forEach(function (s) {
    var d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = '<div class="label">' + s.label + '</div><div class="value">' + s.value + "</div>";
    box.appendChild(d);
  });
}

/* ---------- 9. 화면이 열릴 때 한 번 실행 ---------- */

document.addEventListener("DOMContentLoaded", function () {
  TABLES.forEach(function (t) { data[t.key] = []; editing[t.key] = null; });

  buildNav();
  buildViews();
  renderAll();

  $("btn-connect").addEventListener("click", onConnectClick);

  // 8초가 지나도 버튼이 "준비 중"이면 왜 그런지 알려 줍니다
  setTimeout(function () {
    if (gapiReady && gisReady) return;
    var missing = [];
    if (!gapiReady) missing.push("Google Sheets 라이브러리");
    if (!gisReady) missing.push("Google 로그인 라이브러리");
    setStatus("⚠️ " + missing.join("와 ") + "를 아직 불러오지 못했습니다. " +
      "인터넷 연결을 확인하시고, 이 페이지를 <b>배포된 https 주소</b>에서 열었는지 확인해 주세요.", "error");
  }, 8000);
});
