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

// Blink the onboard LED to show that the program is running and responsive
const led = 25;
pinMode(led, OUTPUT);
setInterval(() => {
  digitalToggle(led);
}, 650);

// Pins (gpio) and strip lengths
const config = {
  pillarFL: { pin: 27, length: 25 },
  pillarFR: { pin: 22, length: 25 },
  pillarBL: { pin: 18, length: 13 },
  pillarBR: { pin: 13, length: 13 },
  cornerL: { pin: 9, length: 30 },
  cornerR: { pin: 5, length: 30 },
};

// Create strips
const strips = {};
for (const key in config) {
  strips[key] = new NeoPixel(config[key].pin, config[key].length);
}

// Color definitions
const colors = {
  red: strips.pillarFL.color(255, 0, 0),
  green: strips.pillarFL.color(0, 255, 0),
  blue: strips.pillarFL.color(0, 0, 255),
  yellow: strips.pillarFL.color(255, 255, 0),
  magenta: strips.pillarFL.color(255, 0, 255),
  cyan: strips.pillarFL.color(0, 255, 255),
  white: strips.pillarFL.color(255, 255, 255),
  orange: strips.pillarFL.color(255, 165, 0),
  pink: strips.pillarFL.color(255, 170, 203),
  redLow: strips.pillarFL.color(25, 0, 0),
  blueLow: strips.pillarFL.color(0, 0, 25),
  black: strips.pillarFL.color(0, 0, 0),
};

// Store the last color used
let lastColor = colors.pink;

// Set up the serial communication
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

// Translates a given strip string to the corresponding strip object
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
      // Handle unknown strip string
      break;
  }
}

// Translates a given color string to the corresponding color object and updates the last color used
function translateSelectedColor(colorString) {
  if (colors.hasOwnProperty(colorString)) {
    lastColor = colors[colorString];
    return colors[colorString];
  } else {
    return lastColor;
  }
}

// Checks if a given string is a valid JSON string
function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

// Converts a UTF-8 array to a string
function Utf8ArrayToStr(array) {
  let out = "";
  let len = array.length;
  let i = 0;
  while (i < len) {
    let c = array[i++];
    switch (c >> 4) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
        out += String.fromCharCode(c);
        break;
      case 12: case 13:
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
        break;
      case 14:
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

// Blinks the on-board LED of the Pico for a moment to indicate serial activity
function rapidBlinkActivityIndicator() {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      digitalToggle(led);
    }, 100 * i);
  }
}


//***************************************************
//*               Control Functions                 *
//***************************************************

// Clears the specified strip and displays the changes
function clearStrip(strip) {
  strip.clear();
  strip.show();
}

// Sets a single pixel on the specified strip to the given color and position, and displays the changes
function setStripPixel(strip, color, position) {
  strip.setPixel(position, color);
  strip.show();
}

// Sets all pixels on the specified strip to the given color and displays the changes
function setWholeStrip(strip, color) {
  for (let i = 0; i < strip.length; i++) {
    strip.setPixel(i, color);
  }
  strip.show();
}

// Sets all pixels on all strips to the given color and displays the changes
function setWholeRobot(color) {
  for (const key in strips) {
    setWholeStrip(strips[key], color);
  }
}

// Triggers a single light to travel along the specified strip with the given parameters
function singleLightTravel(strip, color, time, position, shiftColorIndex, random) {
  const intervalID = setInterval(() => {
    if (position === strip.length) {
      position = 0;
      if (random) {
        shiftColorIndex++;
        if (shiftColorIndex === colorsArr.length) shiftColorIndex = 0;
      }
    }
    clearStrip(strip);
    setStripPixel(strip, random ? colorsArr[shiftColorIndex] : color, position);
    position++;
  }, time);
  return intervalID;
}

// Sets a random shuffling rainbow effect on the specified strip
function setRandomShufflingRainbow(strip, segmentLength, speed) {
  // Shuffle the array helper function
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
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

// -------- Serial --------
const serial0 = new UART(0, serialOptions);
console.log("Serial opened");
let receivedBufferArr = [];

// On startup, clear the buffer after a second (just in case there is any data in the buffer)
setTimeout(() => {
  receivedBufferArr.length = 0;
}, 1000);


//***************************************************
//*                Serial Functions                 *
//***************************************************

function processReceivedData(data) {
  let stringData = Utf8ArrayToStr(data);
  // If the received string ends with "/r", we have a full command and can proceed
  // Otherwise we keep waiting for more data
  if (!stringData.endsWith('/r')) {
    return;
  }

  const stringDataFinal = stringData.slice(0, -2);

  // Indicate serial activity using the LED
  rapidBlinkActivityIndicator();

  let receivedDataJSON;
  if (isJsonString(stringDataFinal)) {
    receivedDataJSON = JSON.parse(stringDataFinal);
  } else {
    console.log("Error: invalid or non JSON");
    return;
  }

  console.log(receivedDataJSON);
  // figure out the command and then execute it
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
      const strip = translateSelectedStrip(receivedDataJSON.strip);
      const color = translateSelectedColor(receivedDataJSON.color);
      // TODO: This returns the interval ID of this sequence running, we need to save it and track it to be able to cancel it later!
      singleLightTravel(strip, color, receivedDataJSON.time, receivedDataJSON.position, receivedDataJSON.shiftColorIndex, receivedDataJSON.random);
      break;
    }
    default:
      break;
  }
}

// Build up data buffer on incoming data, will process and clear when end signal is received ("/r")
serial0.on('data', (data) => {
  data.forEach((value) => {
    receivedBufferArr.push(value);
  });
  processReceivedData(receivedBufferArr);
  receivedBufferArr.length = 0;
});

// serial0.close(); // never close it! but this is how..
