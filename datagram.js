const { RecoverableError, isRecoverableError } = require('./recoverable.js');

class Command {
    static READ = 1;
    static WRITE = 2;
    static LONG_WRITE = 3;
    static RESERVED1 = 4;
    static RESPONSE = 5;
    static LONG_RESPONSE = 6;
    static RESERVED2 = 7;
    static READ_PERIODICALLY = 8;
    static EXTENSION = 0x3c;

    static toString(cmd) {
        const commands = [
            undefined,   // um das Array bei Index 1 beginnen zu lassen
            "Read",
            "Write",
            "LongWrite",
            "Reserved1",
            "Response",
            "LongResponse",
            "Reserved2",
            "ReadPeriodically",
            "Extension" 
        ];
        if (cmd <= this.READ_PERIODICALLY) {
            return commands[cmd];
        }
        if (cmd === this.EXTENSION) {
            return "Extension";
        }
        return "#INVALID";
    }
}

// Add SOC Strategy Selection constants
class SOCStrategy {
    static SOC = 0x00;
    static CONSTANT = 0x01;
    static EXTERNAL = 0x02;
    static MIDDLE_VOLTAGE = 0x03;
    static INTERNAL = 0x04; // default
    static SCHEDULE = 0x05;

    static toString(value) {
        const strategy = {
            [SOCStrategy.SOC]: "SOC",
            [SOCStrategy.CONSTANT]: "Constant",
            [SOCStrategy.EXTERNAL]: "External",
            [SOCStrategy.MIDDLE_VOLTAGE]: "Middle Voltage",
            [SOCStrategy.INTERNAL]: "Internal",
            [SOCStrategy.SCHEDULE]: "Schedule"
        };
        return strategy[value] || "#INVALID";
    }
}

class InverterStates {
    static STANDBY = 0x00;
    static INITIALIZATION = 0x01;
    static STANDBY2 = 0x02;
    static EFFICIENCY = 0x03;
    static INSULATION_CHECK = 0x04;
    static ISLAND_CHECK = 0x05;
    static POWER_CHECK = 0x06;
    static SYMMETRY = 0x07;
    static RELAY_TEST = 0x08;
    static GRID_PASSIVE = 0x09;
    static PREPARE_BATT_PASSIVE = 0x0A;
    static BATT_PASSIVE = 0x0B;
    static HW_CHECK = 0x0C;
    static FEED_IN = 0x0D;

    static toString(value) {
        const states = {
            [InverterStates.STANDBY]: "Standby",
            [InverterStates.INITIALIZATION]: "Initialization",
            [InverterStates.STANDBY2]: "Standby2",
            [InverterStates.EFFICIENCY]: "Efficiency",
            [InverterStates.INSULATION_CHECK]: "Insulation check",
            [InverterStates.ISLAND_CHECK]: "Island check",
            [InverterStates.POWER_CHECK]: "Power check",
            [InverterStates.SYMMETRY]: "Symmetry",
            [InverterStates.RELAY_TEST]: "Relay test",
            [InverterStates.GRID_PASSIVE]: "Grid passive",
            [InverterStates.PREPARE_BATT_PASSIVE]: "Prepare battery passive",
            [InverterStates.BATT_PASSIVE]: "Battery passive",
            [InverterStates.HW_CHECK]: "Hardware check",
            [InverterStates.FEED_IN]: "Feed in"
        };
        return states[value] || "#INVALID";
    }
}

class Identifier {
    // Power values
    static SOLAR_GEN_A_POWER_W = { id: 0xB5317B78, type: 'float32', writable: false, description: "Solar generator A power [W]" };
    static SOLAR_GEN_B_POWER_W = { id: 0xAA9AA253, type: 'float32', writable: false, description: "Solar generator B power [W]" };
    static BATTERY_POWER_W = { id: 0x400f015b, type: 'float32', writable: false, description: "Battery power [W]" };
    static INVERTER_AC_POWER_W = { id: 0xDB2D69AE, type: 'float32', writable: false, description: "Inverter AC power [W]" };
    static REAL_POWER_W = { id: 0x4E49AEC5, type: 'float32', writable: false, description: "Real power [W]" };
    static TOTAL_GRID_POWER_W = { id: 0x91617C58, type: 'float32', writable: false, description: "Total grid power [W]" };
    static BATTERY_SOC = { id: 0x959930BF, type: 'float32', writable: false, description: "Battery state of charge" };
    static S0_EXTERNAL_POWER_W = { id: 0xE96F1844, type: 'float32', writable: false, description: "S0 External power [W]" };
    static LOAD_HOUSEHOLD_POWER_W = { id: 0x1AC87AA0, type: 'float32', writable: false, description: "Load household power [W]" };

    // Voltage values
    static SOLAR_GEN_A_VOLTAGE = { id: 0xB298395D, type: 'float32', writable: false, description: "Solar generator A voltage [V]" };
    static SOLAR_GEN_B_VOLTAGE = { id: 0x5BB8075A, type: 'float32', writable: false, description: "Solar generator B voltage [V]" };
    static BATTERY_VOLTAGE = { id: 0xA7FA5C5D, type: 'float32', writable: false, description: "Battery voltage [V]" };

    // Energy values
    static TOTAL_ENERGY_WH = { id: 0xB1EF67CE, type: 'float32', writable: false, description: "Total energy [Wh]" };
    static TOTAL_ENERGY_SOLAR_GEN_A_WH = { id: 0xFC724A9E, type: 'float32', writable: false, description: "Total energy solarGenA [Wh]" };
    static TOTAL_ENERGY_SOLAR_GEN_B_WH = { id: 0x68EEFD3D, type: 'float32', writable: false, description: "Total energy solarGenB [Wh]" };
    static TOTAL_ENERGY_BATT_IN_WH = { id: 0x5570401B, type: 'float32', writable: false, description: "Total energy batt in [Wh]" };
    static TOTAL_ENERGY_BATT_OUT_WH = { id: 0xA9033880, type: 'float32', writable: false, description: "Total energy batt out [Wh]" };
    static TOTAL_ENERGY_HOUSEHOLD_WH = { id: 0xEFF4B537, type: 'float32', writable: false, description: "Total energy household [Wh]" };
    static TOTAL_ENERGY_GRID_WH = { id: 0xA59C8428, type: 'float32', writable: false, description: "Total energy grid [Wh]" };
    static TOTAL_ENERGY_GRID_FEED_IN_WH = { id: 0x44D4C533, type: 'float32', writable: false, description: "Total energy grid feed in [Wh]" };
    static TOTAL_ENERGY_GRID_LOAD_WH = { id: 0x62FBE7DC, type: 'float32', writable: false, description: "Total energy grid load [Wh]" };

    // Power management values
    static POWER_MNG_SOC_STRATEGY = { id: 0xF168B748, type: 'enum', writable: true, description: "Power management SoC strategy", enumMapping: SOCStrategy.toString, validate: value => Object.values(SOCStrategy).includes(value) };
    static POWER_MNG_SOC_TARGET_SET = { id: 0xD1DFC969, type: 'float32', writable: true, description: "Power management SoC target set", validate: value => value >= 0 && value <= 1 };
    static POWER_MNG_BATTERY_POWER_EXTERN_W = { id: 0xBD008E29, type: 'float32', writable: true, description: "Power management battery power external [W]", validate: value => value >= -6000 && value <= 6000 };
    static POWER_MNG_SOC_MIN = { id: 0xCE266F0F, type: 'float32', writable: true, description: "Power management SoC min", validate: value => value >= 0 && value <= 1 };
    static POWER_MNG_SOC_MAX = { id: 0x97997C93, type: 'float32', writable: true, description: "Power management SoC max", validate: value => value >= 0 && value <= 1 };
    static POWER_MNG_SOC_CHARGE_POWER_W = { id: 0x1D2994EA, type: 'float32', writable: false, description: "Power management SoC charge power [W]" };
    static POWER_MNG_SOC_CHARGE = { id: 0xBD3A23C3, type: 'float32', writable: true, description: "Power management SoC charge", validate: value => value >= 0 && value <= 1 };
    static POWER_MNG_GRID_POWER_LIMIT_W = { id: 0x54829753, type: 'float32', writable: false, description: "Power management grid power limit [W]" };
    static POWER_MNG_USE_GRID_POWER_ENABLE = { id: 0x36A9E9A6, type: 'uint8', writable: true, description: "Power management use grid power enable", validate: value => value === 0 || value === 1 };

    // Battery values
    static INVERTER_STATE = { id: 0x5F33284E, type: 'enum', writable: false, description: "Inverter state", enumMapping: InverterStates.toString };
    static BATTERY_STATUS = { id: 0x70A2AF4F, type: 'uint32', writable: false, description: "Current Battery status" };
    static BATTERY_CAPACITY_AH = { id: 0xB57B59BD, type: 'float32', writable: false, description: "Battery capacity [Ah]" };
    static BATTERY_TEMPERATURE_C = { id: 0x902AFAFB, type: 'float32', writable: false, description: "Battery temperature [°C]" };
    static BATTERY_SOC_TARGET = { id: 0x8B9FF008, type: 'float32', writable: false, description: "Battery SoC target" };
    static BATTERY_SOC_TARGET_HIGH = { id: 0xB84A38AB, type: 'float32', writable: false, description: "Battery SoC target high" };
    static BATTERY_SOC_TARGET_MIN = { id: 0xCE266F0F, type: 'float32', writable: false, description: "Battery SoC target min" };
    static BATTERY_SOC_TARGET_MIN_ISLAND = { id: 0x8EBF9574, type: 'float32', writable: false, description: "Battery SoC target min island" };
    static BATTERY_SOH = { id: 0x381B8BF9, type: 'float32', writable: false, description: "Battery state of health" };

    // Inverter values
    static INVERTER_SN = { id: 0x7924ABD9, type: 'string', writable: false, description: "Inverter serial number" };

    // Module voltages and serial numbers
    static BATTERY_MODULE_0_SERIAL = { id: 0xFBF6D834, type: 'string', writable: false, description: "Battery cell 0 serial number" };
    static BATTERY_MODULE_1_SERIAL = { id: 0x99396810, type: 'string', writable: false, description: "Battery cell 1 serial number" };
    static BATTERY_MODULE_2_SERIAL = { id: 0x73489528, type: 'string', writable: false, description: "Battery cell 2 serial number" };
    static BATTERY_MODULE_3_SERIAL = { id: 0x257B7612, type: 'string', writable: false, description: "Battery cell 3 serial number" };
    static BATTERY_MODULE_4_SERIAL = { id: 0x4E699086, type: 'string', writable: false, description: "Battery cell 4 serial number" };
    static BATTERY_MODULE_5_SERIAL = { id: 0x162491E8, type: 'string', writable: false, description: "Battery cell 5 serial number" };
    static BATTERY_MODULE_6_SERIAL = { id: 0x5939EC5D, type: 'string', writable: false, description: "Battery cell 6 serial number" };

    static BATTERY_MODULE_0_UMAX = { id: 0x03D9C51F, type: 'float32', writable: false, description: "Battery cell 0 Umax" };
    static BATTERY_MODULE_1_UMAX = { id: 0x3A7D5F53, type: 'float32', writable: false, description: "Battery cell 1 Umax" };
    static BATTERY_MODULE_2_UMAX = { id: 0xE7177DEE, type: 'float32', writable: false, description: "Battery cell 2 Umax" };
    static BATTERY_MODULE_3_UMAX = { id: 0x0EF60C7E, type: 'float32', writable: false, description: "Battery cell 3 Umax" };
    static BATTERY_MODULE_4_UMAX = { id: 0xF54BC06D, type: 'float32', writable: false, description: "Battery cell 4 Umax" };
    static BATTERY_MODULE_5_UMAX = { id: 0x4D985F33, type: 'float32', writable: false, description: "Battery cell 5 Umax" };
    static BATTERY_MODULE_6_UMAX = { id: 0x804A3266, type: 'float32', writable: false, description: "Battery cell 6 Umax" };

    static BATTERY_MODULE_0_UMIN = { id: 0x889DC27F, type: 'float32', writable: false, description: "Battery cell 0 Umin" };
    static BATTERY_MODULE_1_UMIN = { id: 0xB4E053D4, type: 'float32', writable: false, description: "Battery cell 1 Umin" };
    static BATTERY_MODULE_2_UMIN = { id: 0xEECDFEFC, type: 'float32', writable: false, description: "Battery cell 2 Umin" };
    static BATTERY_MODULE_3_UMIN = { id: 0x18F98B6D, type: 'float32', writable: false, description: "Battery cell 3 Umin" };
    static BATTERY_MODULE_4_UMIN = { id: 0x6DB1FDDC, type: 'float32', writable: false, description: "Battery cell 4 Umin" };
    static BATTERY_MODULE_5_UMIN = { id: 0x428CCF46, type: 'float32', writable: false, description: "Battery cell 5 Umin" };
    static BATTERY_MODULE_6_UMIN = { id: 0x6213589B, type: 'float32', writable: false, description: "Battery cell 6 Umin" };

    // Helper functions
    static getById(id) {
        return Object.values(this).find(entry => entry?.id === id) || null;
    }

    static getType(id) {
        return id.type;
    }

    static getDescription(id) {
        return id.description;
    }

    static toString(id) {
        return id.description
    }
}


class Datagram {
    constructor(cmd, id, data) {
        this.cmd = cmd;
        this.id = id;
        this.data = data;
    }

    toString() {
        const cmdStr = this.cmd.toString(16).toUpperCase();
        const idStr = this.id.toString(16).toUpperCase();
        const dataStr = this.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        return `[${cmdStr} ${idStr} ${dataStr}]`;
    }
     
    float32() {
        if (this.data.length !== 4) {
            throw new RecoverableError(`Invalid data length ${this.data.length}`);
        }
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        this.data.forEach((b, i) => view.setUint8(i, b));
        return view.getFloat32(0, false); // BigEndian
    }

    uint32() {
        if (this.data.length !== 4) {
            throw new RecoverableError(`Invalid data length ${this.data.length} for uint32`);
        }
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        this.data.forEach((b, i) => view.setUint8(i, b));
        return view.getUint32(0, false); // BigEndian
    }
    
    uint16() {
        if (this.data.length !== 2) {
            throw new RecoverableError(`Invalid data length ${this.data.length}`);
        }
        return (this.data[0] << 8) | this.data[1];
    }

    uint8() {
        if (this.data.length !== 1) {
            throw new RecoverableError(`Invalid data length ${this.data.length}`);
        }
        return this.data[0];
    }
}

module.exports = { Datagram, Command, Identifier, SOCStrategy, InverterStates };