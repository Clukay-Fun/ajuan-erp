// Photoshop ExtendScript. Creates templates/left-right-template.psd.
// ES3 only. Left slot is the name, right slot is the dog. Does not touch other documents.

var OUT_PATH = '/Users/clukay/Program/ajuan-erp/templates/left-right-template.psd'
var LOG_PATH = '/tmp/ajuan-left-right-create.log'

function log(message) {
  var file = new File(LOG_PATH)
  file.open('a')
  file.writeln(message)
  file.close()
}

function rgb(r, g, b) {
  var color = new SolidColor()
  color.rgb.red = r
  color.rgb.green = g
  color.rgb.blue = b
  return color
}

function fillRect(x, y, w, h, color) {
  var doc = app.activeDocument
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
  )
  doc.selection.fill(color)
  doc.selection.deselect()
}

function convertToSmartObject() {
  executeAction(stringIDToTypeID('newPlacedLayer'), new ActionDescriptor(), DialogModes.NO)
}

function makeSmartSlot(name, x, y, w, h, color) {
  var doc = app.activeDocument
  var layer = doc.artLayers.add()
  layer.name = name
  doc.activeLayer = layer
  fillRect(x, y, w, h, color)
  convertToSmartObject()
  doc.activeLayer.name = name
  log('slot ' + name)
}

function frame(name, x, y, w, h) {
  var doc = app.activeDocument
  var layer = doc.artLayers.add()
  layer.name = name
  doc.activeLayer = layer
  fillRect(x - 16, y - 16, w + 32, 16, rgb(31, 61, 54))
  fillRect(x - 16, y + h, w + 32, 16, rgb(31, 61, 54))
  fillRect(x - 16, y, 16, h, rgb(31, 61, 54))
  fillRect(x + w, y, 16, h, rgb(31, 61, 54))
}

function main() {
  var previousUnits = app.preferences.rulerUnits
  app.preferences.rulerUnits = Units.PIXELS
  app.displayDialogs = DialogModes.NO

  var doc = app.documents.add(2000, 1400, 72, 'ajuan-left-right', NewDocumentMode.RGB, DocumentFill.WHITE)
  try {
    doc.activeLayer.name = 'background'
  } catch (err) {
    log('background rename skip ' + err)
  }
  fillRect(0, 0, 2000, 1400, rgb(246, 243, 238))

  var header = doc.artLayers.add()
  header.name = 'decor_header'
  doc.activeLayer = header
  fillRect(0, 0, 2000, 140, rgb(31, 61, 54))

  try {
    var title = doc.artLayers.add()
    title.kind = LayerKind.TEXT
    title.name = 'title'
    title.textItem.contents = 'left name right dog'
    title.textItem.size = 42
    title.textItem.position = [72, 92]
    title.textItem.color = rgb(255, 255, 255)
    log('title ok')
  } catch (err) {
    log('title skip ' + err)
  }

  frame('frame_name', 140, 240, 820, 1000)
  frame('frame_dog', 1040, 240, 820, 1000)
  makeSmartSlot('slot_01_name', 140, 240, 820, 1000, rgb(31, 61, 54))
  makeSmartSlot('slot_01_dog', 1040, 240, 820, 1000, rgb(224, 122, 61))

  var file = new File(OUT_PATH)
  var options = new PhotoshopSaveOptions()
  options.layers = true
  options.embedColorProfile = true
  options.alphaChannels = true
  options.annotations = true
  options.spotColors = true
  options.maximizeCompatibility = true
  doc.saveAs(file, options, true, Extension.LOWERCASE)
  doc.close(SaveOptions.DONOTSAVECHANGES)
  app.preferences.rulerUnits = previousUnits
  log('OK ' + OUT_PATH)
}

var logFile = new File(LOG_PATH)
logFile.open('w')
logFile.writeln('start')
logFile.close()

try {
  main()
} catch (err) {
  log('ERR ' + err + ' line ' + (err.line || ''))
  throw err
}
