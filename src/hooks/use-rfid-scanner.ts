import { useState, useCallback, useRef } from "react";

/**
 * RFID Scanner Hook for UHF Even Reader V1.1
 */
function calculateCrc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0x8408;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc & 0xffff;
}

/**
 * Build a command packet with Header, Address, Command, Length, Payload, and CRC16
 */
function buildCmd(cmd: number, payload: number[] = [], addr: number = 0xff): Uint8Array {
  const body = [0xcf, addr, (cmd >> 8) & 0xff, cmd & 0xff, payload.length, ...payload];
  const bodyArray = new Uint8Array(body);
  const crc = calculateCrc16(bodyArray);
  // Big Endian CRC (MSB then LSB)
  const fullPacket = new Uint8Array([...body, (crc >> 8) & 0xff, crc & 0xff]);
  return fullPacket;
}

type HIDDevice = any;

export function useRfidScanner() {
  const [device, setDevice] = useState<HIDDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastTag, setLastTag] = useState<string | null>(null);
  const scanningRef = useRef(false);

  // Helper for sending 64-byte padded HID reports
  const sendCmd = useCallback(async (targetDevice: any, cmdPack: Uint8Array) => {
    const report = new Uint8Array(64);
    report.set(cmdPack);
    await targetDevice.sendReport(0x00, report);
  }, []);

  /**
   * Parse the incoming HID data packet according to the manual specs
   */
  const parsePacket = useCallback((data: Uint8Array): string | null => {
    const startIdx = data.indexOf(0xcf);
    if (startIdx === -1) return null;

    const packet = data.slice(startIdx);
    if (packet.length < 7) return null;

    const cmd = (packet[2] << 8) | packet[3];
    const length = packet[4];

    // Manual Table A-3: HEAD(1), ADDR(1), CMD(2), LEN(1), STATUS(1), Data[], CHECK(2)
    if (packet.length < 5 + length + 2) return null;
    const status = packet[5];
    const body = packet.slice(6, 5 + length);

    // Protocol 0x0001 (Inventory Response)
    // Table 2.3.1: STATUS, RSSI(2), Antenna(1), Channel(1), EPC LEN(1), EPC NUM(N)
    if (cmd === 0x0001 && status === 0x00) {
      const epcLen = body[4];
      if (body.length >= 5 + epcLen) {
        const epc = Array.from(body.slice(5, 5 + epcLen))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
        return epc;
      }
    }
    return null;
  }, []);

  /**
   * Reader initialization sequence (Initialize -> Set Power)
   */
  const setupReader = useCallback(async (targetDevice: any) => {
    // 0x0050: RFM_MODULE_INT (Initialize)
    await sendCmd(targetDevice, buildCmd(0x0050, [], 0xff));
    await new Promise(r => setTimeout(r, 400));

    // 0x0053: RFM_SET_PWR (26dBm)
    await sendCmd(targetDevice, buildCmd(0x0053, [0x1A, 0x00], 0xff));
    await new Promise(r => setTimeout(r, 400));
  }, [sendCmd]);

  const startScanning = useCallback(
    async (targetDevice: HIDDevice) => {
      if (scanningRef.current) return;
      scanningRef.current = true;
      setIsScanning(true);

      // Continuous Inventory command
      const invCmd = buildCmd(0x0001, [0x00, 0x00, 0x00, 0x00, 0x00], 0xff);

      try {
        while (scanningRef.current && targetDevice.opened) {
          await sendCmd(targetDevice, invCmd);
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err: any) {
        scanningRef.current = false;
        setIsScanning(false);
      }
    },
    [sendCmd]
  );

  const connect = useCallback(async () => {
    try {
      const selectedDevices = await (navigator as any).hid.requestDevice({
        filters: [{ vendorId: 0x0483, productId: 0x5750 }],
      });

      if (selectedDevices.length > 0) {
        let targetDevice: any = selectedDevices.find((d: any) => d.productName.includes("YLW28")) || selectedDevices[0];

        await targetDevice.open();

        targetDevice.addEventListener("inputreport", (event: any) => {
          const tag = parsePacket(new Uint8Array(event.data.buffer));
          if (tag) {
            setLastTag(tag);
            // Stop scanning once a tag is found to prevent spamming
            scanningRef.current = false;
            setIsScanning(false);
          }
        });

        await setupReader(targetDevice);
        setDevice(targetDevice);
        startScanning(targetDevice);
        return true;
      }
    } catch (err: any) {
      alert("RFID Connection Failed: " + err.message);
    }
    return false;
  }, [parsePacket, startScanning, setupReader]);

  const disconnect = useCallback(async () => {
    scanningRef.current = false;
    setIsScanning(false);
    if (device) {
      await device.close();
      setDevice(null);
    }
  }, [device]);

  return { connect, disconnect, isScanning, lastTag, setLastTag };
}
