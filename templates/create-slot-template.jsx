// Photoshop ExtendScript. Creates templates/slot-template.psd with smart-object slots.
// ES3 only.

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

function addRevealMask(x, y, w, h) {
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
  var desc = new ActionDescriptor();
  desc.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  desc.putReference(charIDToTypeID("At  "), ref);
  desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
  executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
  doc.selection.deselect();
}

function makeSmartSlot(name, x, y, w, h, color, maskInset) {
  var doc = app.activeDocument;
  var layer = doc.artLayers.add();
  layer.name = name;
  doc.activeLayer = layer;
  fillRect(x, y, w, h, color);
  convertToSmartObject();
  doc.activeLayer.name = name;
  if (maskInset > 0) {
    try {
      addRevealMask(x + maskInset, y + maskInset, w - maskInset * 2, h - maskInset * 2);
      log("mask " + name);
    } catch (err) {
      log("mask skip " + name + " " + err);
    }
  }
  log("slot " + name);
}

function main() {
  var previousUnits = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;
  app.displayDialogs = DialogModes.NO;

  var doc = app.documents.add(2000, 1400, 72, "ajuan-slot-template", NewDocumentMode.RGB, DocumentFill.WHITE);
  try {
    doc.activeLayer.name = "background";
  } catch (err) {
    log("background rename skip " + err);
  }
  fillRect(0, 0, 2000, 1400, rgb(246, 243, 238));

  var header = doc.artLayers.add();
  header.name = "decor_header";
  doc.activeLayer = header;
  fillRect(0, 0, 2000, 140, rgb(31, 61, 54));

  try {
    var title = doc.artLayers.add();
    title.kind = LayerKind.TEXT;
    title.name = "title";
    title.textItem.contents = "ajuan template";
    title.textItem.size = 42;
    title.textItem.position = [72, 92];
    var titleColor = rgb(255, 255, 255);
    title.textItem.color = titleColor;
    log("title ok");
  } catch (err) {
    log("title skip " + err);
  }

  // 第一组按实际模板排版：左对齐、画布内完整显示，名字图与截图中的 557×195 区域一致。
  makeSmartSlot("slot_01_dog", 206, 220, 557, 557, rgb(224, 122, 61), 40);
  makeSmartSlot("slot_01_name", 206, 940, 557, 195, rgb(31, 61, 54), 0);
  makeSmartSlot("slot_02_dog", 1120, 220, 557, 557, rgb(212, 83, 62), 0);
  makeSmartSlot("slot_02_name", 1120, 940, 557, 195, rgb(47, 93, 80), 0);

  var folder = new Folder("/Users/clukay/Program/ajuan-erp/templates");
  if (!folder.exists) folder.create();
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
  app.preferences.rulerUnits = previousUnits;
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
