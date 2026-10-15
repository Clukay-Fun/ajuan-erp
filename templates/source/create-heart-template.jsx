// Photoshop ExtendScript. Creates the second ERP template from the supplied
// heart-layout PSD. The top six example pairs are hidden; six hidden
// smart-object pairs below them become replaceable slots.
// ES3 only.

var BASE_PATH = "/Users/clukay/Program/ajuan-erp/templates/source/heart-base.psd";
var OUT_PATH = "/Users/clukay/Program/ajuan-erp/templates/slot-template-2.psd";
var LOG_PATH = "/tmp/ajuan-heart-template.log";
var XS = [0, 1097, 2193, 3290, 4386, 5483];
var CELL_W = 886;
var ROW_HEIGHT = 1073;
var IMAGE_MAX_WIDTH = 600;

function log(message) {
  var file = new File(LOG_PATH);
  file.open("a");
  file.writeln(message);
  file.close();
}

function px(value) {
  return value.as("px");
}

function layerBounds(layer) {
  var b = layer.bounds;
  return {
    left: px(b[0]),
    top: px(b[1]),
    right: px(b[2]),
    bottom: px(b[3])
  };
}

function slotIndexFor(layer) {
  var b = layerBounds(layer);
  var centerX = (b.left + b.right) / 2;
  for (var col = 0; col < XS.length; col += 1) {
    if (centerX >= XS[col] && centerX < XS[col] + CELL_W) return col;
  }
  return -1;
}

function isSampleArtwork(layer) {
  if (layer.typename === "LayerSet") return false;
  var b = layerBounds(layer);
  var width = b.right - b.left;
  var height = b.bottom - b.top;
  return b.top < 768 && width > 0 && width < IMAGE_MAX_WIDTH && height > 0 && height < 700;
}

function convertToSmartObject(layer) {
  var doc = app.activeDocument;
  doc.activeLayer = layer;
  executeAction(stringIDToTypeID("newPlacedLayer"), new ActionDescriptor(), DialogModes.NO);
  return doc.activeLayer;
}

function createBottomSlot(topLayer, key) {
  var doc = app.activeDocument;
  doc.activeLayer = topLayer;
  // An ordinary duplicate shares the same embedded Smart Object. Replacing
  // its contents would also change the visible example above it.
  executeAction(stringIDToTypeID("placedLayerMakeCopy"), undefined, DialogModes.NO);
  var slot = doc.activeLayer;
  slot.name = key;
  slot.translate(UnitValue(0, "px"), UnitValue(ROW_HEIGHT, "px"));
  slot.visible = false;
  log("slot " + key + " bounds " + layerBounds(slot).left + "," + layerBounds(slot).top + "," + layerBounds(slot).right + "," + layerBounds(slot).bottom);
  return slot;
}

function main() {
  var oldUnits = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;
  app.displayDialogs = DialogModes.NO;
  var source = new File(BASE_PATH);
  if (!source.exists) throw new Error("找不到心形基础模板: " + BASE_PATH);
  var doc = app.open(source);
  try {
    var dogs = [];
    var names = [];
    for (var i = 0; i < doc.layers.length; i += 1) {
      var layer = doc.layers[i];
      if (!isSampleArtwork(layer)) continue;
      var col = slotIndexFor(layer);
      if (col < 0) continue;
      if (layer.kind === LayerKind.SMARTOBJECT) names[col] = layer;
      else dogs[col] = layer;
    }

    for (var index = 0; index < XS.length; index += 1) {
      if (!dogs[index] || !names[index]) throw new Error("第 " + (index + 1) + " 列没有完整的示例图层");
      var key = index + 1 < 10 ? "0" + (index + 1) : String(index + 1);
      var exampleDog = convertToSmartObject(dogs[index]);
      exampleDog.name = "example_" + key + "_dog";
      names[index].name = "example_" + key + "_name";
      createBottomSlot(exampleDog, "slot_" + key + "_dog");
      createBottomSlot(names[index], "slot_" + key + "_name");
      exampleDog.visible = false;
      names[index].visible = false;
      log("example " + key + " dog=" + layerBounds(exampleDog).left + "," + layerBounds(exampleDog).top + " name=" + layerBounds(names[index]).left + "," + layerBounds(names[index]).top);
    }

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
    app.preferences.rulerUnits = oldUnits;
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
