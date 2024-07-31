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

class Identifier {
    static SOLAR_GEN_A_POWER_W = 0xB5317B78;
    static SOLAR_GEN_B_POWER_W = 0xAA9AA253;
    static BATTERY_POWER_W = 0x400f015b;
    static INVERTER_AC_POWER_W = 0xDB2D69AE;
    static REAL_POWER_W = 0x4E49AEC5;
    static TOTAL_GRID_POWER_W = 0x91617C58;
    static BATTERY_SOC = 0x959930BF;
    static S0_EXTERNAL_POWER_W = 0xE96F1844;
    static LOAD_HOUSEHOLD_POWER_W = 0x1AC87AA0;

    static SOLAR_GEN_A_VOLTAGE = 0xB298395D;
    static SOLAR_GEN_B_VOLTAGE = 0x5BB8075A;
    static BATTERY_VOLTAGE = 0xA7FA5C5D;

    static TOTAL_ENERGY_WH = 0xB1EF67CE;
    static TOTAL_ENERGY_SOLAR_GEN_A_WH = 0xFC724A9E;
    static TOTAL_ENERGY_SOLAR_GEN_B_WH = 0x68EEFD3D;
    static TOTAL_ENERGY_BATT_IN_WH = 0x5570401B;
    static TOTAL_ENERGY_BATT_OUT_WH = 0xA9033880;
    static TOTAL_ENERGY_HOUSEHOLD_WH = 0xEFF4B537;
    static TOTAL_ENERGY_GRID_WH = 0xA59C8428;
    static TOTAL_ENERGY_GRID_FEED_IN_WH = 0x44D4C533;
    static TOTAL_ENERGY_GRID_LOAD_WH = 0x62FBE7DC;

    static INVERTER_STATE = 0x5F33284E;
    static BATTERY_CAPACITY_AH = 0xB57B59BD;
    static BATTERY_TEMPERATURE_C = 0x902AFAFB;
    static BATTERY_SOC_TARGET = 0x8B9FF008;
    static BATTERY_SOC_TARGET_HIGH = 0xB84A38AB;
    static BATTERY_SOC_TARGET_MIN = 0xCE266F0F;
    static BATTERY_SOC_TARGET_MIN_ISLAND = 0x8EBF9574;
    static BATTERY_SOH = 0x381B8BF9;

    static INVERTER_SN = 0x7924ABD9;
    
    //Module voltages and serial numbers
    static BATTERY_MODULE_0_SERIAL = 0xFBF6D834;
    static BATTERY_MODULE_1_SERIAL = 0x99396810;
    static BATTERY_MODULE_2_SERIAL = 0x73489528;
    static BATTERY_MODULE_3_SERIAL = 0x257B7612;
    static BATTERY_MODULE_4_SERIAL = 0x4E699086;
    static BATTERY_MODULE_5_SERIAL = 0x162491E8;
    static BATTERY_MODULE_6_SERIAL = 0x5939EC5D;

    static BATTERY_MODULE_0_UMAX = 0x3D9C51F;
    static BATTERY_MODULE_1_UMAX = 0x3A7D5F53;
    static BATTERY_MODULE_2_UMAX = 0xE7177DEE;
    static BATTERY_MODULE_3_UMAX = 0xEF60C7E;
    static BATTERY_MODULE_4_UMAX = 0xF54BC06D;
    static BATTERY_MODULE_5_UMAX = 0x4D985F33;
    static BATTERY_MODULE_6_UMAX = 0x804A3266;

    static BATTERY_MODULE_0_UMIN = 0x889DC27F;
    static BATTERY_MODULE_1_UMIN = 0xB4E053D4;
    static BATTERY_MODULE_2_UMIN = 0xEECDFEFC;
    static BATTERY_MODULE_3_UMIN = 0x18F98B6D;
    static BATTERY_MODULE_4_UMIN = 0x6DB1FDDC;
    static BATTERY_MODULE_5_UMIN = 0x428CCF46;
    static BATTERY_MODULE_6_UMIN = 0x6213589B;

    
    static toString(id) {
        const identifiers = {
            [Identifier.SOLAR_GEN_A_POWER_W]: "Solar generator A power [W]",
            [Identifier.SOLAR_GEN_B_POWER_W]: "Solar generator B power [W]",
            [Identifier.BATTERY_POWER_W]: "Battery power [W]",
            [Identifier.INVERTER_AC_POWER_W]: "Inverter AC power [W]",
            [Identifier.REAL_POWER_W]: "Real power [W]",
            [Identifier.TOTAL_GRID_POWER_W]: "Total grid power [W]",
            [Identifier.BATTERY_SOC]: "Battery state of charge",
            [Identifier.S0_EXTERNAL_POWER_W]: "S0 External power [W]",
            [Identifier.LOAD_HOUSEHOLD_POWER_W]: "Load household power [W]",
            [Identifier.SOLAR_GEN_A_VOLTAGE]: "Solar generator A voltage [V]",
            [Identifier.SOLAR_GEN_B_VOLTAGE]: "Solar generator B voltage [V]",
            [Identifier.BATTERY_VOLTAGE]: "Battery voltage [V]",
            [Identifier.TOTAL_ENERGY_WH]: "Total energy [Wh]",
            [Identifier.TOTAL_ENERGY_SOLAR_GEN_A_WH]: "Total energy solarGenA [Wh]",
            [Identifier.TOTAL_ENERGY_SOLAR_GEN_B_WH]: "Total energy solarGenB [Wh]",
            [Identifier.TOTAL_ENERGY_BATT_IN_WH]: "Total energy batt in [Wh]",
            [Identifier.TOTAL_ENERGY_BATT_OUT_WH]: "Total energy batt out [Wh]",
            [Identifier.TOTAL_ENERGY_HOUSEHOLD_WH]: "Total energy household [Wh]",
            [Identifier.TOTAL_ENERGY_GRID_WH]: "Total energy grid [Wh]",
            [Identifier.TOTAL_ENERGY_GRID_FEED_IN_WH]: "Total energy grid feed in [Wh]",
            [Identifier.TOTAL_ENERGY_GRID_LOAD_WH]: "Total energy grid load [Wh]",
            [Identifier.INVERTER_STATE]: "Inverter state",
            [Identifier.BATTERY_CAPACITY_AH]: "Battery capacity [Ah]",
            [Identifier.BATTERY_TEMPERATURE_C]: "Battery temperature [°C]",
            [Identifier.BATTERY_SOC_TARGET]: "Battery SoC target",
            [Identifier.BATTERY_SOC_TARGET_HIGH]: "Battery SoC target high",
            [Identifier.BATTERY_SOC_TARGET_MIN]: "Battery SoC target min",
            [Identifier.BATTERY_SOC_TARGET_MIN_ISLAND]: "Battery SoC target min island",
            [Identifier.INVERTER_SN]: "Inverter serial number",
            [Identifier.BATTERY_SOH]: "Battery state of health",
            [Identifier.BATTERY_MODULE_0_UMAX]: "Battery cell 0 Umax",
            [Identifier.BATTERY_MODULE_0_UMIN]: "Battery cell 0 Umin",
            [Identifier.BATTERY_MODULE_0_SERIAL]: "Battery cell 0 serial number",
            [Identifier.BATTERY_MODULE_1_UMAX]: "Battery cell 1 Umax",
            [Identifier.BATTERY_MODULE_1_UMIN]: "Battery cell 1 Umin",
            [Identifier.BATTERY_MODULE_1_SERIAL]: "Battery cell 1 serial number",
            [Identifier.BATTERY_MODULE_2_UMAX]: "Battery cell 2 Umax",
            [Identifier.BATTERY_MODULE_2_UMIN]: "Battery cell 2 Umin",
            [Identifier.BATTERY_MODULE_2_SERIAL]: "Battery cell 2 serial number",
            [Identifier.BATTERY_MODULE_3_UMAX]: "Battery cell 3 Umax",
            [Identifier.BATTERY_MODULE_3_UMIN]: "Battery cell 3 Umin",
            [Identifier.BATTERY_MODULE_3_SERIAL]: "Battery cell 3 serial number",
            [Identifier.BATTERY_MODULE_4_UMAX]: "Battery cell 4 Umax",
            [Identifier.BATTERY_MODULE_4_UMIN]: "Battery cell 4 Umin",
            [Identifier.BATTERY_MODULE_4_SERIAL]: "Battery cell 4 serial number",
            [Identifier.BATTERY_MODULE_5_UMAX]: "Battery cell 5 Umax",
            [Identifier.BATTERY_MODULE_5_UMIN]: "Battery cell 5 Umin",
            [Identifier.BATTERY_MODULE_5_SERIAL]: "Battery cell 5 serial number",
            [Identifier.BATTERY_MODULE_6_UMAX]: "Battery cell 6 Umax",
            [Identifier.BATTERY_MODULE_6_UMIN]: "Battery cell 6 Umin",
            [Identifier.BATTERY_MODULE_6_SERIAL]: "Battery cell 6 serial number"
        };

        return identifiers[id] || "#INVALID";
    }
}


class InverterStates {
    static STATE_STANDBY = 0;
    static STATE_INITIALIZATION = 1;quit
    static STATE_STANDBY2 = 2;
    static STATE_EFFICIENCY = 3;
    static STATE_INSULATION_CHECK = 4;
    static STATE_ISLAND_CHECK = 5;
    static STATE_POWER_CHECK = 6;
    static STATE_SYMMETRY = 7;
    static STATE_RELAY_TEST = 8;
    static STATE_GRID_PASSIVE = 9;
    static STATE_PREPARE_BATT_PASSIVE = 10;
    static STATE_BATT_PASSIVE = 11;
    static STATE_HW_CHECK = 12;
    static STATE_FEED_IN = 13;

    static STATES = [
        "Standby",
        "Initialization",
        "Standby2",
        "Efficiency",
        "Insulation check",
        "Island check",
        "Power check",
        "Symmetry",
        "Relay test",
        "Grid passive",
        "Prepare battery passive",
        "Battery passive",
        "Hardware check",
        "Feed in"
    ];

    static toString(state) {
        if (state < 0 || state >= InverterStates.STATES.length) {
            return "#INVALID";
        }
        return InverterStates.STATES[state];
    }
}


class Datagram {
    constructor(cmd, id, data) {
        this.cmd = cmd;
        this.id = id;
        this.data = data;
    }

    toString() {
        let cmdStr = this.cmd.toString(16).toUpperCase();
        let idStr = this.id.toString(16).toUpperCase();
        let dataStr = this.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        return `[${cmdStr} ${idStr} ${dataStr}]`;
    }
     
    float32() {
        if (this.data.length !== 4) {
            throw new RecoverableError(`invalid data length ${this.data.length}`);
        }
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        this.data.forEach((b, i) => view.setUint8(i, b));
        return view.getFloat32(0, false); // BigEndian
    }

    uint16() {
        if (this.data.length !== 2) {
            throw new RecoverableError(`invalid data length ${this.data.length}`);
        }
        return (this.data[0] << 8) | this.data[1];
    }

    uint8() {
        if (this.data.length !== 1) {
            throw new RecoverableError(`invalid data length ${this.data.length}`);
        }
        return this.data[0];
    }
}

module.exports = { Datagram, Command, Identifier };