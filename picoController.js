const { NeoPixel } = require('neopixel');
const { UART } = require('uart');

//* what is this?
/* 
this is the WS2812B LED control code that runs on a Raspberry Pi Pico
and controls the LED strips on the pillars and corners of the robot.

this receives commands from a network tables client (running on a Raspberry Pi) over serial,
and then parses the commands and sets the LEDs accordingly.

the control flow looks like this:
1. Robot code sets a value in network tables for controlling the LEDs in some way (countdown timer, match state, literal commands, etc.)
2. Network tables client (on the Raspberry Pi) reads the value(s) and determines what command to send to this code on the Pico over serial
3. This code receives the command and parses it, then sets the LEDs accordingly on the Pico's GPIO pins which are connected to the LED strips data lines
4. Profit.
*/


//***************************************************
//*             Setup and Definitions               *
//***************************************************

// blink the on board LED to show that the program is running
const led = 25;
pinMode(led, OUTPUT);
setInterval(() => {
  digitalToggle(led);
}, 650);

// pins (gpio)
const PILLAR_FL_PIN = 27;
const PILLAR_FR_PIN = 22;
const PILLAR_BL_PIN = 18;
const PILLAR_BR_PIN = 13;
const CORNER_L_PIN = 9;
const CORNER_R_PIN = 5;

// strip lengths
const PILLAR_FL_LENGTH = 25;
const PILLAR_FR_LENGTH = 25;
const PILLAR_BL_LENGTH = 13;
const PILLAR_BR_LENGTH = 13;
const CORNER_L_LENGTH = 30;
const CORNER_R_LENGTH = 30;

// create strips
const pillarFL = new NeoPixel(PILLAR_FL_PIN, PILLAR_FL_LENGTH);
const pillarFR = new NeoPixel(PILLAR_FR_PIN, PILLAR_FR_LENGTH);
const pillarBL = new NeoPixel(PILLAR_BL_PIN, PILLAR_BL_LENGTH);
const pillarBR = new NeoPixel(PILLAR_BR_PIN, PILLAR_BR_LENGTH);
const cornerL = new NeoPixel(CORNER_L_PIN, CORNER_L_LENGTH);
const cornerR = new NeoPixel(CORNER_R_PIN, CORNER_R_LENGTH);

// color definitions (these work for all strips, not just the one they are created from below)
const colors = {
  red: pillarFL.color(255, 0, 0),
  green: pillarFL.color(0, 255, 0),
  blue: pillarFL.color(0, 0, 255),
  yellow: pillarFL.color(255, 255, 0),
  magenta: pillarFL.color(255, 0, 255),
  cyan: pillarFL.color(0, 255, 255),
  white: pillarFL.color(255, 255, 255),
  orange: pillarFL.color(255, 165, 0),
  pink: pillarFL.color(255, 170, 203),
  redLow: pillarFL.color(25, 0, 0),
  blueLow: pillarFL.color(0, 0, 25),
  black: pillarFL.color(0, 0, 0),
};
// convert colors object to array for use with some looping stuff
const colorsArr = Object.values(colors);

// for storing the last color used (in case a color is not specified correctly or command is messed up)
let lastColor = colors.pink;

// set up the serial communication
const serialOptions = {
  baudrate: 115200,
  bits: 8,
  stop: 1,
  flow: UART.FLOW_NONE,
  bufferSize: 4096,
};


//***************************************************
//*               Utility Functions                 *
//***************************************************

function translateSelectedStrip(stripString) {
  switch (stripString) {
    case 'pillarFL':
      return pillarFL;
    case 'pillarFR':
      return pillarFR;
    case 'pillarBL':
      return pillarBL;
    case 'pillarBR':
      return pillarBR;
    case 'cornerL':
      return cornerL;
    case 'cornerR':
      return cornerR;
    default:
      //serial0.write("1");
      break;
  }
}

function translateSelectedColor(colorString) {
  switch (colorString) {
    case 'red':
      lastColor = colors.red;
      return colors.red;
    case 'green':
      lastColor = colors.green;
      return colors.green;
    case 'blue':
      lastColor = colors.blue;
      return colors.blue;
    case 'yellow':
      lastColor = colors.yellow;
      return colors.yellow;
    case 'magenta':
      lastColor = colors.magenta;
      return colors.magenta;
    case 'cyan':
      lastColor = colors.cyan;
      return colors.cyan;
    case 'white':
      lastColor = colors.white;
      return colors.white;
    case 'orange':
      lastColor = colors.orange;
      return colors.orange;
    case 'pink':
      lastColor = colors.pink;
      return colors.pink;
    case 'redLow':
      lastColor = colors.redLow;
      return colors.redLow;
    case 'blueLow':
      lastColor = colors.blueLow;
      return colors.blueLow;
    case 'black':
      lastColor = colors.black;
      return colors.black;
    default:
      return lastColor;
      //serial0.write("1");
      break;
  }
}

function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function Utf8ArrayToStr(array) {
  var out, i, len, c;
  var char2, char3;

  out = "";
  len = array.length;
  i = 0;
  while (i < len) {
    c = array[i++];
    switch (c >> 4) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        // 110x xxxx   10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(((c & 0x0F) << 12) |
          ((char2 & 0x3F) << 6) |
          ((char3 & 0x3F) << 0));
        break;
    }
  }

  return out;
}


//***************************************************
//*               Control Functions                 *
//***************************************************

//np.clear(); // clear the strip (set all pixels to black
//np.show(); // show the changes

function singleLightTravel(strip, _color, _time, _position, _shiftColorIndex, _random) {
  const intervalID = setInterval(() => {
    if (_position === strip.length) {
      _position = 0;
      if (_random) {
        _shiftColorIndex++;
        if (_shiftColorIndex === colorsArr.length) _shiftColorIndex = 0;
      }
    }
    strip.clear(); // clear the strip (set all pixels to black) if this is off, the pixels will stay on and it will look like a trail till the end
    (_random) ? strip.setPixel(_position, colorsArr[_shiftColorIndex]) : strip.setPixel(_position, _color);
    strip.show();
    _position++;
  }, _time);
  return intervalID;
}

// set all pixels to a color
function setWholeStrip(strip, color) {
  for (let i = 0; i < strip.length; i++) {
    strip.setPixel(i, color);
  }
  strip.show();
}

// set whole robot (all strips) to a color
function setWholeRobot(color) {
  setWholeStrip(pillarFL, color);
  setWholeStrip(pillarFR, color);
  setWholeStrip(pillarBL, color);
  setWholeStrip(pillarBR, color);
  setWholeStrip(cornerL, color);
  setWholeStrip(cornerR, color);
}

function setRandomShufflingRainbow(strip, segmentLength, speed) {
  let offset = 0;
  let totalLength = strip.length;
  const intervalID = setInterval(() => {
    let colorOrder = Object.keys(colors);
    shuffleArray(colorOrder);
    let currentIndex = 0;
    for (let i = 0; i < totalLength; i++) {
      if (i % segmentLength === 0) {
        currentIndex = (currentIndex + 1) % colorOrder.length;
      }
      let colorName = colorOrder[(currentIndex + offset) % colorOrder.length];
      let colorValue = colors[colorName];
      strip.setPixel(i, colorValue);
      strip.show();
    }
    offset = (offset + 1) % colorOrder.length;
  }, speed);
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  return intervalID;
}

//*            Testing Control Functions            *

// tested - works
// setWholeStrip(pillarFL, colorsCollection.yellow);

// tested - works
// pick a random color from the colors object and set the whole robot to that color

// tested - works
//(setting the one light heading down the strip)
//singleLightTravel(pillarFR, null, 70, 0, 0, true);
// static color
// = singleLightTravel(pillarFR, colors.red, 70, 0, 0, false);

// tested - works
// (it's kinda random, but it's a cool effect)
//const superIntervalID = setRandomShufflingRainbow(pillarFR, 1, 250);


//***************************************************
//*                 Initial Startup                 *
//***************************************************

// first set the whole robot
setWholeRobot(colors.red);
// then green after 3 seconds
setTimeout(() => {
  setWholeRobot(colors.green);
}, 3000)
// then blue after 6 seconds
setTimeout(() => {
  setWholeRobot(colors.blue);
}, 6000)
// then black after 9 seconds
setTimeout(() => {
  setWholeRobot(colors.black);
}, 9000)
// and finally, set to blue after 11 seconds
// this will be the state the robot is in when it's ready to receive commands from the serial port (NT client Pi)
setTimeout(() => {
  setWholeRobot(colors.blue);
}, 11000);
//! Note: the Pi NT client will try to change this to white, meaning it's running and talking but not yet connected to the robot code
//! If it's not white, it means this is not receiving that command, is the Pi and serial connection good?
//? Also, if it goes to white and just stays like that, it means the Pi is not receiving the commands from the robot code and just continues to send the white command as default


const serial0 = new UART(0, serialOptions);
// read or write data...
console.log("Serial opened")
let receivedBufferArr = [];

// on startup, clear the buffer after a seconds (just in case there is any data in the buffer)
setTimeout(() => {
  receivedBufferArr.length = 0;
}, 1000);


//***************************************************
//*                Serial Functions                 *
//***************************************************

serial0.on('data', (data) => {

  data.forEach((value) => {
    receivedBufferArr.push(value);
  })
  let stringData = Utf8ArrayToStr(receivedBufferArr);
  // check if the string ends with /r
  // if it does, then we have a full string
  // if it doesn't, then we need to wait for more data
  if (!stringData.endsWith('/r')) {
    return;
  }

  // if we get here, we have a full string
  // so we can clear the buffer
  receivedBufferArr.length = 0;
  // remove the /r from the string
  const stringDataFinal = stringData.slice(0, -2);
  // rapidly blink the board led 3 times as activity indication light
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      digitalToggle(led);
    }, 100 * i);
  }
  let receivedDataJSON;
  if (isJsonString(stringDataFinal)) {
    receivedDataJSON = JSON.parse(stringDataFinal);
  } else {
    console.log("Error: invalid or non JSON");
    return;
  }
  console.log(receivedDataJSON);
  switch (receivedDataJSON.command) {
    case 'setWholeStrip': {
      const strip = translateSelectedStrip(receivedDataJSON.strip);
      const color = translateSelectedColor(receivedDataJSON.color);
      setWholeStrip(strip, color);
      break;
    }
    case 'setWholeRobot': {
      const color = translateSelectedColor(receivedDataJSON.color);
      setWholeRobot(color);
      break;
    }
    case 'singleLightTravel': {
      // figure out which strip to set
      const strip = translateSelectedStrip(receivedDataJSON.strip);
      const color = translateSelectedColor(receivedDataJSON.color);
      // set the interval ID to a variable so we can clear it later
      singleLightTravel(strip, color, receivedDataJSON.time, receivedDataJSON.position, receivedDataJSON.shiftColorIndex, receivedDataJSON.random);
      break;
    }
    default:
      //serial0.write("1");
      break;
  }
});

// serial0.close(); // never close it!