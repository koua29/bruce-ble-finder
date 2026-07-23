// ============================================================
//  BLE Finder — SCOPE SONAR de proximite Bluetooth pour Bruce
//  - Liste complete OU recherche (filtre nom/MAC) -> tu choisis.
//  - S'il n'est pas la, option "attendre qu'il apparaisse".
//  Radar : anneau + blip rouge->vert quand tu approches,
//  + "PLUS CHAUD / PLUS FROID" a chaque pas.
//  (Audio/LED non pilotables en JS sur 1.15 -> retour ecran.)
//  API JS Bruce — Auteur: koua29
// ============================================================

var W = 320, H = 170;
var SCAN_SEC = 1;
var LO = -100, HI = -35;

function C(r, g, b) { return display.color(r, g, b); }
var BLACK=C(0,0,0), WHITE=C(235,240,238), GREY=C(120,130,128);
var BG=C(6,12,9), RING=C(24,70,44), RINGD=C(16,44,28);

function proxCol(p) {
  var r, g;
  if (p < 0.5) { r = 255; g = Math.round(40 + 200 * (p * 2)); }
  else { r = Math.round(255 - 215 * ((p - 0.5) * 2)); g = 240; }
  return C(r, g, 30);
}
function normMac(s) { return String(s || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase(); }
function quit() { return keyboard.getEscPress(); }   // bouton retour/ESC (pas SEL de validation)
function banner(m) { display.fill(BLACK); display.setTextSize(2); display.drawString("BLE Finder", 12, 10);
                     display.setTextSize(1); display.drawString(m, 12, 42); }
function devLabel(d) { return (d.name && d.name !== "<unknown>") ? d.name : d.address; }

// ---------- 1) Selection ----------
var targetMac = "", targetName = "", label = "", ready = false;
var mode = dialog.choice([["Liste complete","scan"], ["Chercher (nom/MAC)","find"]]);

banner("Scan en cours...");
var devs = ble.scan(5) || [];

if (mode === "find") {
  var q = keyboard.keyboard("", 40, "Nom ou MAC (partiel)");
  if (q) {
    var qlow = String(q).toLowerCase();
    var qmac = normMac(q);
    var hits = [];
    for (var i = 0; i < devs.length; i++) {
      var d = devs[i];
      var byName = String(d.name).toLowerCase().indexOf(qlow) >= 0;
      var byMac = qmac.length >= 4 && normMac(d.address).indexOf(qmac) >= 0;
      if (byName || byMac) hits.push([devLabel(d) + "  " + d.rssi + "dBm", d.address]);
    }
    if (hits.length) {                                  // filtre -> choisir
      var s = dialog.choice(hits);
      if (s) { targetMac = normMac(s); label = s; ready = true; }
    } else {                                            // pas la maintenant
      var w = dialog.choice([["Attendre qu'il apparaisse","yes"], ["Annuler","no"]]);
      if (w === "yes") {
        if (qmac.length >= 4) { targetMac = qmac; } else { targetName = qlow; }
        label = q; ready = true;
      }
    }
  }
} else {                                                // liste complete
  if (devs.length === 0) dialog.message("Aucun appareil trouve");
  else {
    var ch = [];
    for (var j = 0; j < devs.length; j++) ch.push([devLabel(devs[j]) + "  " + devs[j].rssi + "dBm", devs[j].address]);
    var sel = dialog.choice(ch);
    if (sel) { targetMac = normMac(sel); label = sel; ready = true; }
  }
}

// ---------- 2) Radar ----------
function findRssi(list) {
  var best = null;
  for (var i = 0; i < list.length; i++) {
    var d = list[i], ok = false;
    if (targetMac) ok = normMac(d.address).indexOf(targetMac) >= 0;
    else if (targetName) ok = String(d.name).toLowerCase().indexOf(targetName) >= 0;
    if (ok && (best === null || d.rssi > best)) best = d.rssi;
  }
  return best;
}
function zone(p) { return p>0.8?"TRES PROCHE":p>0.6?"PROCHE":p>0.4?"MOYEN":p>0.2?"LOIN":"TRES LOIN"; }

var CX = 84, CY = 96, R = 66;
function drawScope(sweepDeg) {
  display.drawCircle(CX, CY, R, RING);
  display.drawCircle(CX, CY, Math.round(R*0.66), RINGD);
  display.drawCircle(CX, CY, Math.round(R*0.33), RINGD);
  display.drawLine(CX-R, CY, CX+R, CY, RINGD);
  display.drawLine(CX, CY-R, CX, CY+R, RINGD);
  var a = sweepDeg * Math.PI / 180;
  display.drawWideLine(CX, CY, Math.round(CX+R*Math.cos(a)), Math.round(CY+R*Math.sin(a)), 2, RING);
}
function header() {
  display.setTextSize(1); display.setTextColor(WHITE);
  display.drawString(label.substring(0, 30), 8, 6);
  display.setTextColor(GREY); display.drawString("ESC/retour = quitter", 8, 158);
  display.setTextColor(WHITE);
}

if (ready) {
  var smooth = LO, prev = LO, sweep = 0;
  // purge des appuis en attente (validation du menu/clavier) avant de demarrer
  delay(500);
  for (var kk = 0; kk < 10; kk++) { keyboard.getEscPress(); keyboard.getSelPress(); keyboard.getAnyPress(); delay(40); }

  while (true) {
    var scan = ble.scan(SCAN_SEC);      // scan d'abord (l'appui residuel s'efface)
    if (quit()) break;
    var rssi = findRssi(scan);
    sweep = (sweep + 40) % 360;

    display.fill(BG);
    header();

    if (rssi === null) {                // pas encore vu -> on continue
      drawScope(sweep);
      display.setTextColor(C(120,150,255));
      display.setTextSize(2); display.drawString("PAS TROUVE", 172, 60);
      display.setTextSize(1); display.drawString("recherche...", 172, 88);
      display.setTextColor(WHITE);
      continue;
    }

    prev = smooth;
    smooth = Math.round(smooth * 0.5 + rssi * 0.5);
    var r = Math.max(LO, Math.min(HI, smooth));
    var p = (r - LO) / (HI - LO);
    var col = proxCol(p);

    drawScope(sweep);
    display.drawArc(CX, CY, R+4, R-2, 0, Math.round(360 * p), col, BG);
    var br = Math.round(6 + p * 36);
    display.drawFillCircle(CX, CY, br, col);
    display.drawCircle(CX, CY, br + 5, col);

    display.setTextColor(col);
    display.setTextSize(3); display.drawString(smooth + "", 176, 34);
    display.setTextSize(1); display.drawString("dBm", 176, 62);
    display.setTextSize(2); display.drawString(zone(p), 176, 82);
    display.setTextColor(WHITE);

    var dd = smooth - prev;
    if (dd > 2) { display.drawFillTriangle(180,120, 200,120, 190,106, C(40,230,90)); display.setTextColor(C(40,230,90)); display.drawString("PLUS CHAUD", 208, 110); }
    else if (dd < -2) { display.drawFillTriangle(180,106, 200,106, 190,120, C(255,70,60)); display.setTextColor(C(255,70,60)); display.drawString("plus froid", 208, 110); }
    else { display.drawString("=  stable", 208, 110); }
    display.setTextColor(WHITE);

    for (var i = 0; i < 5; i++) {
      var bx = 176 + i * 26, bh = 8 + i * 6, by = 150 - bh;
      display.drawFillRoundRect(bx, by, 20, bh, 3, (p * 5 > i) ? col : C(40,44,42));
    }
    delay(110);
  }
}

display.fill(BLACK);
display.setTextColor(WHITE); display.setTextSize(2); display.drawString("Fin.", 130, 74);
