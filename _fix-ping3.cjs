const fs = require("fs");
const p = "scripts/ascend-daemon.cjs";
let s = fs.readFileSync(p, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";

// Blocco ping senza auth (identità + stato finestra), poi auth, poi ping+db
const pingBlock6 =
  '      if (req.method === "GET" && url.pathname === "/api/ping") {' + NL +
  '        json(res, 200, { ok: true, service: "ascend-daemon", window: browserPid > 0 }, cors);' + NL +
  "        return;" + NL +
  "      }" + NL;
const pingBlock4 =
  '    if (req.method === "GET" && url.pathname === "/api/ping") {' + NL +
  '      json(res, 200, { ok: true, service: "ascend-daemon", window: browserPid > 0 }, cors);' + NL +
  "      return;" + NL +
  "    }" + NL;

// 1) primo server (indentazione 6): rimuovi il ping attuale (dopo auth) e lo metti prima di auth
const auth6 = "      if (!authOk(req, url)) {" + NL;
const oldPing6 =
  '      if (req.method === "GET" && url.pathname === "/api/ping") {' + NL +
  '        json(res, 200, { ok: true, service: "ascend-daemon" }, cors);' + NL +
  "        return;" + NL +
  "      }" + NL;
if (!s.includes(oldPing6)) { console.log("NO MATCH ping6"); process.exit(1); }
s = s.replace(oldPing6, "");
if (!s.includes(auth6)) { console.log("NO MATCH auth6"); process.exit(1); }
s = s.replace(auth6, pingBlock6 + auth6);

// 2) secondo server (indentazione 4)
const auth4 = "    if (!authOk(req, url)) { json(res, 401, { ok: false, error: \"token non valido\" }, cors); return; }" + NL;
const oldPing4 =
  '    if (req.method === "GET" && url.pathname === "/api/ping") {' + NL +
  '      json(res, 200, { ok: true, service: "ascend-daemon" }, cors);' + NL +
  "      return;" + NL +
  "    }" + NL;
if (!s.includes(oldPing4)) { console.log("NO MATCH ping4"); process.exit(1); }
s = s.replace(oldPing4, "");
if (!s.includes(auth4)) { console.log("NO MATCH auth4"); process.exit(1); }
s = s.replace(auth4, pingBlock4 + auth4);

// 3) il ping+db "con token" ora inutile (il ping è già uscito prima): rimuovi i blocchi duplicati
const dup6 =
  '      if (req.method === "GET" && url.pathname === "/api/ping") {' + NL +
  '        const up = syncCache?.version' ;
const dup4 =
  '    if (req.method === "GET" && url.pathname === "/api/ping") {' + NL +
  '      const up = syncCache?.version';
if (s.includes(dup6) || s.includes(dup4)) { console.log("DUPLICATI PRESENTI"); process.exit(1); }

fs.writeFileSync(p, s);
console.log("ping pubblico OK (2 server)");