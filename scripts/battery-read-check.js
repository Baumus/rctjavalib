const Connection = require('../connection.js');
const { Identifier, BatteryStatus } = require('../datagram.js');

const HOST = '192.168.0.211'; // Replace with your inverter IP address
const PORT = 8899;

async function safeFetchData(conn, label, id) {
    try {
        const value = await conn.query(id);
        console.log(`${label}: ${value}`);
        return value;
    } catch (err) {
        console.error(`${label}: <error> ${err.message}`);
        return null;
    }
}

async function ReadBatterySystem(conn) {
    console.log('\n=== Battery System ===');
    const towerCount = await safeFetchData(conn, 'system.tower_count', Identifier.BATTERY_SYSTEM_TOWER_COUNT);
    const status = await safeFetchData(conn, 'system.status', Identifier.BATTERY_SYSTEM_STATUS);

    if (typeof status === 'number') {
        console.log(`system.status.decode: ${BatteryStatus.decode(status)}`);
    }

    await safeFetchData(conn, 'system.soc_target', Identifier.BATTERY_SYSTEM_SOC_TARGET);
    await safeFetchData(conn, 'system.soc_target_high', Identifier.BATTERY_SYSTEM_SOC_TARGET_HIGH);
    await safeFetchData(conn, 'system.soc_target_min', Identifier.BATTERY_SYSTEM_SOC_TARGET_MIN);
    await safeFetchData(conn, 'system.soc_target_min_island', Identifier.BATTERY_SOC_TARGET_MIN_ISLAND);

    return towerCount;
}

async function ReadBatteryTower1(conn) {
    console.log('\n=== Battery Tower 1 ===');
    await safeFetchData(conn, 'tower1.soc', Identifier.BATTERY_TOWER_1_SOC);
    await safeFetchData(conn, 'tower1.voltage', Identifier.BATTERY_TOWER_1_VOLTAGE);
    await safeFetchData(conn, 'tower1.current', Identifier.BATTERY_TOWER_1_CURRENT);
    await safeFetchData(conn, 'tower1.temperature_c', Identifier.BATTERY_TOWER_1_TEMPERATURE_C);
    await safeFetchData(conn, 'tower1.soh', Identifier.BATTERY_TOWER_1_SOH);
    await safeFetchData(conn, 'tower1.capacity_ah', Identifier.BATTERY_TOWER_1_CAPACITY_AH);
    await safeFetchData(conn, 'tower1.bms_sn', Identifier.BATTERY_TOWER_1_BMS_SN);
}

async function ReadBatteryTower2(conn) {
    console.log('\n=== Battery Tower 2 ===');
    await safeFetchData(conn, 'tower2.soc', Identifier.BATTERY_TOWER_2_SOC);
    await safeFetchData(conn, 'tower2.voltage', Identifier.BATTERY_TOWER_2_VOLTAGE);
    await safeFetchData(conn, 'tower2.current', Identifier.BATTERY_TOWER_2_CURRENT);
    await safeFetchData(conn, 'tower2.temperature_c', Identifier.BATTERY_TOWER_2_TEMPERATURE_C);
    await safeFetchData(conn, 'tower2.soh', Identifier.BATTERY_TOWER_2_SOH);
    await safeFetchData(conn, 'tower2.capacity_ah', Identifier.BATTERY_TOWER_2_CAPACITY_AH);
    await safeFetchData(conn, 'tower2.bms_sn', Identifier.BATTERY_TOWER_2_BMS_SN);
}

async function RunBatteryReadCheck() {
    const conn = Connection.getPooledConnection(HOST, PORT); // Read-only query test
    await conn.connect();

    try {
        const towerCount = await ReadBatterySystem(conn);
        await ReadBatteryTower1(conn);

        if (typeof towerCount === 'number' && towerCount >= 2) {
            await ReadBatteryTower2(conn);
        } else {
            console.log('\n=== Battery Tower 2 ===');
            console.log('Skipped (tower_count < 2 or not available).');
        }
    } catch (err) {
        console.error('Error while reading battery values:', err.message);
    }

    conn.close();
}

RunBatteryReadCheck();
