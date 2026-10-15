// Photoshop ExtendScript. Builds the ERP template from the supplied circular
// frame PSD. Each 868x868 slot keeps its circular frame; an inset rectangle
// limits the image area, with name on the left and dog on the right.
// ES3 only.

var BASE_PATH = "/Users/clukay/Program/ajuan-erp/templates/source/circle-base.psd";
var OUT_PATH = "/Users/clukay/Program/ajuan-erp/templates/slot-template.psd";
var LOG_PATH = "/tmp/ajuan-psd-create.log";

function log(message) {
  var file = new File(LOG_PATH);
  file.open("a");
  file.writeln(message);
  file.close();
}

function rgb(r, g, b) {
  var color = new SolidColor();
  color.rgb.red = r;
  color.rgb.green = g;
  color.rgb.blue = b;
  return color;
}

function fillRect(x, y, w, h, color) {
  var doc = app.activeDocument;
  doc.selection.select(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ],
    SelectionType.REPLACE,
    0,
    false
  );
  doc.selection.fill(color);
  doc.selection.deselect();
}

function convertToSmartObject() {
  executeAction(stringIDToTypeID("newPlacedLayer"), new ActionDescriptor(), DialogModes.NO);
}

function selectEllipse(x, y, w, h) {
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
  desc.putReference(charIDToTypeID("null"), ref);
  var ellipse = new ActionDescriptor();
  ellipse.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), y);
  ellipse.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), x);
  ellipse.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), y + h);
  ellipse.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), x + w);
  desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Elps"), ellipse);
  executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

function selectRectangle(x, y, w, h) {
  var doc = app.activeDocument;
  doc.selection.select(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ],
    SelectionType.REPLACE,
    0,
    false
  );
}

function addRevealMask() {
  var doc = app.activeDocument;
  var desc = new ActionDescriptor();
  desc.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  desc.putReference(charIDToTypeID("At  "), ref);
  desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
  executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
  doc.selection.deselect();
}

function makeSmartSlot(parent, name, x, y, w, h, color) {
  var doc = app.activeDocument;
  var layer = parent.artLayers.add();
  layer.name = name;
  doc.activeLayer = layer;
  fillRect(x, y, w, h, color);
  convertToSmartObject();
  doc.activeLayer.name = name;
  log("slot " + name);
}

function makeCircleSlot(parent, key, x, y, cellW, cellH, inset) {
  var doc = app.activeDocument;
  var group = parent.layerSets.add();
  group.name = "slot_" + key + "_circle";

  // The inner rectangle is the real placement boundary. Keeping it in a
  // nested group gives the plugin a fixed rectangle to fit each image into,
  // while the outer group continues to provide the circular crop.
  var rectX = x + inset;
  var rectY = y + inset;
  var rectW = cellW - inset * 2;
  var rectH = cellH - inset * 2;
  var rectGroup = group.layerSets.add();
  rectGroup.name = "slot_" + key + "_rect";
  var halfW = rectW / 2;
  var placeholder = rgb(246, 246, 246);
  makeSmartSlot(rectGroup, "slot_" + key + "_name", rectX, rectY, halfW, rectH, placeholder);
  makeSmartSlot(rectGroup, "slot_" + key + "_dog", rectX + halfW, rectY, halfW, rectH, placeholder);

  // Keep a fixed rectangular mask around the two smart objects. It is
  // deliberately separate from the circle mask so replacement images never
  // turn into two colored half-circles or grow outside the inner frame.
  doc.activeLayer = rectGroup;
  selectRectangle(rectX, rectY, rectW, rectH);
  addRevealMask();

  // Keep one fixed circle mask on the outer group. Child smart objects can
  // scale independently without scaling or moving either boundary.
  doc.activeLayer = group;
  selectEllipse(x, y, cellW, cellH);
  addRevealMask();
  log("circle " + key + " rect " + rectX + "," + rectY + "," + rectW + "," + rectH);
}

function drawCircleOverlay(parent, xs, ys, cellW, cellH) {
  var doc = app.activeDocument;
  var layer = parent.artLayers.add();
  layer.name = "circle_frames_overlay";
  doc.activeLayer = layer;
  var line = rgb(202, 65, 132);
  for (var row = 0; row < ys.length; row += 1) {
    for (var col = 0; col < xs.length; col += 1) {
      selectEllipse(xs[col], ys[row], cellW, cellH);
      doc.selection.stroke(line, 4, StrokeLocation.INSIDE);
      doc.selection.deselect();
    }
  }
}

function drawInnerRectOverlay(parent, xs, ys, cellW, cellH, inset) {
  var doc = app.activeDocument;
  var layer = parent.artLayers.add();
  layer.name = "inner_rect_frames_overlay";
  doc.activeLayer = layer;
  var line = rgb(42, 125, 190);
  var divider = rgb(42, 125, 190);
  for (var row = 0; row < ys.length; row += 1) {
    for (var col = 0; col < xs.length; col += 1) {
      var rectX = xs[col] + inset;
      var rectY = ys[row] + inset;
      var rectW = cellW - inset * 2;
      var rectH = cellH - inset * 2;
      selectRectangle(rectX, rectY, rectW, rectH);
      doc.selection.stroke(line, 4, StrokeLocation.INSIDE);
      doc.selection.deselect();
      // Make the split between name and dog explicit without filling either
      // side. The two smart objects remain separate rectangular areas.
      fillRect(rectX + rectW / 2 - 2, rectY, 4, rectH, divider);
    }
  }
}

function main() {
  var previousUnits = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;
  app.displayDialogs = DialogModes.NO;

  var base = new File(BASE_PATH);
  if (!base.exists) throw new Error("找不到圆形基础模板: " + BASE_PATH);
  var doc = app.open(base);
  try {
    var parent = doc.layerSets[0];
    var xs = [0, 1099, 2197, 3296, 4394, 5493];
    var ys = [0, 1253, 2505];
    var cellW = 868;
    var cellH = 868;
    // 128 px makes the 612x612 inner square fit completely inside the
    // 868 px circle (its corners stay within the circle boundary).
    var inset = 128;
    var slot = 1;
    for (var row = 0; row < ys.length; row += 1) {
      for (var col = 0; col < xs.length; col += 1) {
        var key = slot < 10 ? "0" + slot : String(slot);
        makeCircleSlot(parent, key, xs[col], ys[row], cellW, cellH, inset);
        slot += 1;
      }
    }
    drawCircleOverlay(parent, xs, ys, cellW, cellH);
    drawInnerRectOverlay(parent, xs, ys, cellW, cellH, inset);

    var file = new File(OUT_PATH);
    var options = new PhotoshopSaveOptions();
    options.layers = true;
    options.embedColorProfile = true;
    options.alphaChannels = true;
    options.annotations = true;
    options.spotColors = true;
    options.maximizeCompatibility = true;
    doc.saveAs(file, options, true, Extension.LOWERCASE);
    doc.close(SaveOptions.DONOTSAVECHANGES);
  } finally {
    app.preferences.rulerUnits = previousUnits;
  }
  log("OK " + OUT_PATH);
}

var logFile = new File(LOG_PATH);
logFile.open("w");
logFile.writeln("start");
logFile.close();

try {
  main();
} catch (err) {
  log("ERR " + err + " line " + (err.line || ""));
  throw err;
}
