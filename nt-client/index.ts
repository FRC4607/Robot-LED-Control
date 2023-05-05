import { NetworkTables } from 'ntcore-ts-client'
import { NetworkTablesTypeInfos } from 'ntcore-ts-client/src/lib/types/types';
import { init } from 'raspi';
import { Serial } from 'raspi-serial';

//* what is this?
/*
this is the network tables client for the Raspberry Pi
this acts as the middle man between the robot code and the Pi Pico to control the LEDs

the control flow looks like this:
1. Robot code sets a value in network tables for controlling the LEDs in some way (countdown timer, match state, literal commands, etc.)
2. This network tables client (on the Raspberry Pi) reads the value(s) and determines what command to send to this code on the Pico over serial
3. The Pico code receives the command and parses it, then sets the LEDs accordingly on the Pico's GPIO pins which are connected to the LED strips data lines
4. Profit.
*/


//***************************************************
//*             Setup and Definitions               *
//***************************************************

const networkTable = NetworkTables.getInstanceByTeam(4607, 5810)
const IsRedAllianceNTEntry = networkTable.createTopic<boolean>("/FMSInfo/IsRedAlliance", NetworkTablesTypeInfos.kBoolean);
const FMSControlDataEntry = networkTable.createTopic<number>("/FMSInfo/FMSControlData", NetworkTablesTypeInfos.kInteger, 0);
const GamePieceColor = networkTable.createTopic<string>("/Boat/Gas", NetworkTablesTypeInfos.kString, "");
const RemainingMatchTime = networkTable.createTopic<number>("/Boat/GasTime", NetworkTablesTypeInfos.kDouble, 300);

let controlDataUpdateTime = 0;

// Subscribe to the topics
GamePieceColor.subscribe(() => { });
RemainingMatchTime.subscribe(() => { });
IsRedAllianceNTEntry.subscribe(() => { });
FMSControlDataEntry.subscribe(() => { controlDataUpdateTime = Date.now() }, true);

const DSAttached = 0b100000
const FMSAttached = 0b010000
const eStop = 0b001000
const testMode = 0b000100
const autonomousMode = 0b000010
const enabled = 0b000001

let lastData;

// important!!!!!
// you MUST end your written strings with /r for the pico to know when to process the string

const serialOptions: { baudRate: number, portId: string, dataBits: 8 | 7 | 6 | undefined, stopBits: 1 } = {
  baudRate: 115200,
  portId: '/dev/ttyS0', // this is the serial interface on GPIO 14 and 15 (pins 8 and 10)
  dataBits: 8,
  stopBits: 1
};

var serial: any;


//***************************************************
//*               Utility Functions                 *
//***************************************************

function getData() {
  let controlData = FMSControlDataEntry.getValue() ?? 0;

  if(controlData != 0){
    lastData = controlData;
  }

  return {
    isRedAlliance: IsRedAllianceNTEntry.getValue() ?? false,
    isDSAttached: (controlData & DSAttached) != 0,
    isFMSAttached: (controlData & FMSAttached) != 0,
    isEStoped: (controlData & eStop) != 0,
    isTestMode: (controlData & testMode) != 0,
    isAutonomousMode: (controlData & autonomousMode) != 0,
    isEnabled: (controlData & enabled) != 0,
    gamePieceColor: GamePieceColor.getValue() ?? "",
    RemainingMatchTime: RemainingMatchTime.getValue() ?? 300,
  }
}

init(() => {
  serial = new Serial(serialOptions);
  serial.open(() => {
    serial.on('data', () => {
      return;
    });
    //serial.write('serial is open from pi/r');
  });
});

async function sendCommand(commandJSON: any) {
  init(() => {
    serial.open(() => {
      serial.write(JSON.stringify(commandJSON) + "/r");
    });
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


//***************************************************
//*                 Initial Startup                 *
//***************************************************

console.log("Starting");

let counter = 0;

setInterval(() => {
  let data = getData();

  const jsonCommand = {
    command: 'setWholeRobot',
    color: 'white',
  };

  let timeLeft = data.RemainingMatchTime;

  // if (data.isAutonomousMode && data.isEnabled) {
  //   timeLeft = 15 - (Date.now() - controlDataUpdateTime) / 1000
  // } else if (!data.isTestMode && !data.isAutonomousMode && data.isEnabled) {
  //   timeLeft = 135 - (Date.now() - controlDataUpdateTime) / 1000
  // }

  // console.log(timeLeft);

  // check remaining time in match and set endgame state
  let isEndgame = timeLeft < 30 && timeLeft > 0 && !data.isAutonomousMode && data.isEnabled;

  if (isEndgame) {
    counter++;
    counter %= 40;
  }

  if (data.isRedAlliance && data.gamePieceColor == "NONE") {
    jsonCommand.color = (counter > 20 && isEndgame) ? 'redLow' : 'red';
  } else if(!data.isRedAlliance && data.gamePieceColor == "NONE") {
    jsonCommand.color = (counter > 20 && isEndgame) ? 'blueLow' : 'blue';
  } else if(data.gamePieceColor == "CONE"){
    jsonCommand.color = (counter > 20 && isEndgame) ? 'yellowLow' : 'yellow';
  } else if (data.gamePieceColor == "CUBE") {
    jsonCommand.color = (counter > 20 && isEndgame) ? 'magentaLow' : 'magenta';
  }
  else{
    //default to white (NT not connected yet)
    jsonCommand.color = "white";
  }

  //console.log("update time:",controlDataUpdateTime)
  //console.log("the command",jsonCommand)

  sendCommand(jsonCommand);

}, 50);