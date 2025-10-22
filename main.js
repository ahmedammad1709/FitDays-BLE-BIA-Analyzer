import * as BIA from './bia_algorithms.js';

/**
 * FitDays Web BLE Interface - Enhanced Version
 * 
 * This application connects to the FG2305ULB smart scale via Web Bluetooth and provides
 * real-time body composition analysis using BIA (Bioelectrical Impedance Analysis).
 * 
 * Key Features:
 * - Connects to both Weight Scale Service (0x181D) and Custom BIA Service (0xFFB0)
 * - Logs all raw BLE data in hex format for debugging
 * - Enhanced error handling with DOMException support
 * - Automatic timeout detection for user guidance
 * - Simulation mode for testing without physical device
 * 
 * Updated UUIDs extracted from BLE capture analysis of FitDays FG2305ULB scale:
 * - Weight Scale Service (0x181D): Standard GATT service for weight measurements
 * - Weight Measurement Characteristic (0x2A9D): Notify characteristic for weight data
 * - Custom BIA Service (0xFFB0): Vendor-specific service for body impedance analysis
 * - BIA Measurement Characteristic (0xFFB2): Notify characteristic for impedance data
 */
const UUIDS = {
  weightService: "0000181d-0000-1000-8000-00805f9b34fb",   // Weight Scale Service (0x181D)
  weightChar: "00002a9d-0000-1000-8000-00805f9b34fb",   // Weight Measurement Characteristic (0x2A9D)
  customService: "0000ffb0-0000-1000-8000-00805f9b34fb",   // Custom BIA Service (0xFFB0)
  biaChar: "0000ffb2-0000-1000-8000-00805f9b34fb"    // BIA Measurement Characteristic (0xFFB2)
};

// Log updated UUIDs for confirmation
console.log("✅ Updated UUIDs from BLE capture:", UUIDS);


// State
let device = null;
let server = null;
let weightChar = null;
let biaChar = null;
let isConnected = false;
let simulate = false;
let simInterval = null;
let dataTimeout = null;

// DOM helpers
const $ = (id) => document.getElementById(id);
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

// UI Elements
const btnConnect = $('btnConnect');
const btnDisconnect = $('btnDisconnect');
const btnRetry = $('btnRetry');
const btnFallback = $('btnFallback');
const toggleSim = $('toggleSim');
const statusHint = $('statusHint');

// User inputs
const ageEl = $('age');
const heightEl = $('heightCm');
const sexEl = $('sex');
const unitsEl = $('units');

// Status labels
function setStatus(text) { setText('connStatus', text); }
function setDeviceInfo(name, serviceUuid) {
  setText('deviceName', name || '—');
  setText('serviceUuid', serviceUuid || '—');
}

// Data timeout management
function startDataTimeout() {
  if (dataTimeout) clearTimeout(dataTimeout);
  dataTimeout = setTimeout(() => {
    if (isConnected && !simulate) {
      setStatus('Connected to MY_SCALE. Step on the scale to begin measurement.');
    }
  }, 10000); // 10 second timeout
}

function clearDataTimeout() {
  if (dataTimeout) {
    clearTimeout(dataTimeout);
    dataTimeout = null;
  }
}

// Metric updates (all values should be strings already formatted)
const Metrics = {
  weight: (v, unit) => { setText('weightValue', v); setText('weightUnit', unit); },
  bmi: (v) => setText('bmiValue', v),
  bodyFat: (v) => { setText('bodyFatValue', v); setText('bodyFatVisual', v + '%'); },
  muscleMass: (v) => setText('muscleMassValue', v),
  boneMass: (v) => setText('boneMassValue', v),
  tbw: (v) => setText('tbwValue', v),
  vfi: (v) => setText('vfiValue', v),
  bmr: (v) => setText('bmrValue', v),
  metaAge: (v) => setText('metaAgeValue', v)
};

function getUserProfile() {
  const age = Number(ageEl.value || 30);
  const heightCm = Number(heightEl.value || 170);
  const sex = Number(sexEl.value || 1);
  const units = unitsEl.value || 'metric';
  return { age, heightCm, sex, units };
}

function kgToLb(kg) { return kg * 2.20462262185; }
function cmToM(cm) { return cm / 100; }

function format1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
function format0(x) { return Math.round(x).toString(); }

// Compute metrics using available algorithms (note: several functions are placeholders)
function computeAndRenderMetrics({ weightKg, impedanceOhm }) {
  const { age, heightCm, sex, units } = getUserProfile();
  const heightM = cmToM(heightCm);

  // Weight + BMI
  const weightDisplay = units === 'imperial' ? format1(kgToLb(weightKg)) : format1(weightKg);
  const weightUnit = units === 'imperial' ? 'lb' : 'kg';
  Metrics.weight(weightDisplay, weightUnit);
  const bmi = weightKg / (heightM * heightM);
  Metrics.bmi(format1(bmi));

  // Enhanced body fat calculation based on impedance and BIA principles
  // Using Deurenberg formula as base with impedance correction
  const impedanceIndex = impedanceOhm / (heightM * heightM);

  // Age and sex specific coefficients for body fat calculation
  const ageSexFactor = sex === 1 ?
    (age < 30 ? 0.98 : age < 50 ? 1.0 : 1.02) :
    (age < 30 ? 0.95 : age < 50 ? 0.97 : 1.0);

  // Impedance-based body fat estimation
  let bfPercentPreRound;
  if (sex === 1) { // Male
    bfPercentPreRound = (1.20 * (impedanceIndex / 1000)) + (0.23 * age) - 16.2;
  } else { // Female
    bfPercentPreRound = (1.20 * (impedanceIndex / 1000)) + (0.23 * age) - 5.4;
  }

  // Apply age/sex correction and clamp to reasonable range
  bfPercentPreRound *= ageSexFactor;
  bfPercentPreRound = BIA.clamp(bfPercentPreRound, 5.0, 60.0);

  // FFM variants
  const ffm20 = BIA.getFFM_WLA20(weightKg, bfPercentPreRound, age, sex, 100.0);
  const ffm32 = BIA.getFFM_WLA32(weightKg, bfPercentPreRound, age, sex, 100.0);

  // Fat mass derived from FFM (choose one variant for display)
  const fatMassKg = Math.max(0, weightKg - ffm20);
  const bodyFatPercent = weightKg > 0 ? (fatMassKg / weightKg) * 100.0 : 0;
  Metrics.bodyFat(BIA.round1StrictHalfUp(bodyFatPercent).toFixed(1));

  // Muscle mass (placeholder percent => mass)
  const musclePercent = BIA.getMusclePercent_WLA09(weightKg, age, sex, 0.8, Math.max(1, ffm32), 0, 9);
  const muscleMassKg = (musclePercent / 100.0) * weightKg;
  Metrics.muscleMass(format1(muscleMassKg));

  // Enhanced bone mass calculation
  // Based on FFM, age, sex, and weight
  const baseBoneMass = ffm20 * 0.045; // 4.5% of FFM as base
  const ageFactor = Math.max(0.7, 1.0 - (age - 20) * 0.005); // Bone density decreases with age
  const sexFactor = sex === 1 ? 1.1 : 1.0; // Males typically have higher bone mass
  const weightFactor = Math.min(1.2, Math.max(0.8, weightKg / 70.0));

  const boneMass = baseBoneMass * ageFactor * sexFactor * weightFactor;
  Metrics.boneMass(format1(boneMass));

  // Enhanced total body water calculation
  // Based on FFM and impedance with age/sex corrections
  const baseTBW = ffm20 * 0.73; // 73% of FFM is water
  const impedanceFactor = Math.max(0.8, Math.min(1.2, 1000 / impedanceOhm));
  const tbwAgeFactor = Math.max(0.9, 1.0 - (age - 20) * 0.002);
  const tbwSexFactor = sex === 1 ? 1.0 : 0.95; // Males typically have slightly higher water content

  const tbwKg = baseTBW * impedanceFactor * tbwAgeFactor * tbwSexFactor;
  const tbwPercent = BIA.clamp((tbwKg / weightKg) * 100.0, 30, 75);
  Metrics.tbw(format1(tbwPercent));

  // Enhanced visceral fat index calculation
  // Based on BMI, age, sex, and impedance
  let vfi;
  if (sex === 1) { // Male
    vfi = (bmi * 0.4) + (age * 0.1) - (impedanceOhm / 1000) * 0.2;
  } else { // Female
    vfi = (bmi * 0.35) + (age * 0.08) - (impedanceOhm / 1000) * 0.15;
  }
  vfi = Math.max(1, Math.min(30, vfi));
  Metrics.vfi(format1(vfi));

  // BMR (use available placeholder variant)
  const bmr = BIA.getBMR_WLA38(sex, weightKg, age, heightCm, 0, 0.0);
  Metrics.bmr(format0(bmr));

  // Enhanced metabolic age calculation
  // Based on BMR, body composition, and fitness level
  const idealBMR = BIA.getBMR_WLA38(sex, 70, age, 170, 0, 0.0); // Reference BMR
  const actualBMR = BIA.getBMR_WLA38(sex, weightKg, age, heightCm, 0, 0.0);
  const bmrRatio = actualBMR / idealBMR;

  // Body composition factors
  const bodyFatFactor = (bfPercentPreRound - 15) * 0.1; // Higher body fat = older metabolic age
  const muscleFactor = (musclePercent - 40) * -0.05; // Higher muscle = younger metabolic age

  const metaAge = Math.max(18, Math.min(80, age + (bmrRatio - 1) * 5 + bodyFatFactor + muscleFactor));
  Metrics.metaAge(Math.round(metaAge).toString());
}

// Parse notifications - Enhanced for FG2305ULB protocol
function parseWeightMeasurement(value) {
  if (value.byteLength < 2) return null;

  // Try multiple parsing methods for different protocols
  const bytes = new Uint8Array(value.buffer);
  console.log("Weight packet:", Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // Method 1: Standard GATT Weight Scale (0x2A9D)
  if (value.byteLength >= 4) {
    const flags = value.getUint16(0, true);
    const si = (flags & 0x01) === 0; // 0 => SI (kg)
    const wRaw = value.getUint16(2, true);
    const weightKg = si ? wRaw * 0.005 : (wRaw * 0.01) * 0.45359237;
    if (weightKg > 0 && weightKg < 500) return { weightKg };
  }

  // Method 2: Direct weight value (common in smart scales)
  if (value.byteLength >= 2) {
    const weightRaw = value.getUint16(0, true);
    // Try different scales
    const scales = [0.01, 0.1, 1.0, 0.005];
    for (const scale of scales) {
      const weightKg = weightRaw * scale;
      if (weightKg > 10 && weightKg < 300) {
        return { weightKg };
      }
    }
  }

  // Method 3: 4-byte weight
  if (value.byteLength >= 4) {
    const weightRaw = value.getUint32(0, true);
    const weightKg = weightRaw / 1000.0; // Common scale for 4-byte values
    if (weightKg > 10 && weightKg < 300) {
      return { weightKg };
    }
  }

  return null;
}

function parseBiaMeasurement(value) {
  if (value.byteLength < 2) return null;

  const bytes = new Uint8Array(value.buffer);
  console.log("BIA packet:", Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // Try multiple parsing methods for impedance data
  // Method 1: 2-byte impedance
  if (value.byteLength >= 2) {
    const impedance = value.getUint16(0, true);
    if (impedance >= 150 && impedance <= 3000) {
      return { impedanceOhm: impedance };
    }
  }

  // Method 2: 4-byte impedance
  if (value.byteLength >= 4) {
    const impedance = value.getUint32(0, true);
    if (impedance >= 150 && impedance <= 300000) {
      return { impedanceOhm: impedance };
    }
  }

  // Method 3: Signed 16-bit impedance
  if (value.byteLength >= 2) {
    const impedance = value.getInt16(0, true);
    if (impedance >= 150 && impedance <= 3000) {
      return { impedanceOhm: impedance };
    }
  }

  // Method 4: Multi-byte parsing (common in smart scales)
  for (let i = 0; i <= value.byteLength - 2; i++) {
    const impedance = value.getUint16(i, true);
    if (impedance >= 150 && impedance <= 3000) {
      return { impedanceOhm: impedance };
    }
  }

  return null;
}

async function handleWeightNotify(event) {
  try {
    const dv = event.target.value;

    // Log raw hex data before parsing
    const bytes = new Uint8Array(dv.buffer);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log("⚖️ Weight Raw Data (hex):", hex);
    console.log("📏 Weight Data Length:", bytes.length, "bytes");

    const parsed = parseWeightMeasurement(dv);
    if (!parsed) {
      console.warn("⚠️ Could not parse weight data");
      return;
    }

    console.log("✅ Weight Parsed:", parsed);
    const last = window.__last || { weightKg: 0, impedanceOhm: 500 };
    const next = { ...last, ...parsed };

    // If no BIA data available, use estimated impedance based on weight and height
    if (!next.impedanceOhm || next.impedanceOhm === 500) {
      const { heightCm, sex } = getUserProfile();
      const heightM = cmToM(heightCm);
      // Estimate impedance based on body composition
      const estimatedImpedance = sex === 1 ?
        (heightM * heightM * 1000) / (next.weightKg * 0.8) :
        (heightM * heightM * 1000) / (next.weightKg * 0.75);
      next.impedanceOhm = Math.round(estimatedImpedance);
      console.log("📊 Using estimated impedance:", next.impedanceOhm);
    }

    window.__last = next;
    logMeasurement(next);
    computeAndRenderMetrics(next);
    clearDataTimeout(); // Clear timeout when data is received
    setStatus('⏳ Waiting for data…');
  } catch (error) {
    console.error("❌ Error in weight notification handler:", error);
    if (error.name === 'DOMException') {
      setStatus('Step on the scale to activate');
    }
  }
}

async function handleBiaNotify(event) {
  try {
    const dv = event.target.value;

    // Log raw hex data before parsing
    const bytes = new Uint8Array(dv.buffer);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log("🔬 BIA Raw Data (hex):", hex);
    console.log("📏 BIA Data Length:", bytes.length, "bytes");

    const parsed = parseBiaMeasurement(dv);
    if (!parsed) {
      console.warn("⚠️ Could not parse BIA data");
      return;
    }

    console.log("✅ BIA Parsed:", parsed);
    const last = window.__last || { weightKg: 0, impedanceOhm: 500 };
    const next = { ...last, ...parsed };
    window.__last = next;
    logMeasurement(next);
    computeAndRenderMetrics(next);
    clearDataTimeout(); // Clear timeout when data is received
    setStatus('⏳ Waiting for data…');
  } catch (error) {
    console.error("❌ Error in BIA notification handler:", error);
    if (error.name === 'DOMException') {
      setStatus('Step on the scale to activate');
    }
  }
}

async function handleVendorNotify(event) {
  try {
    const dv = event.target.value;
    const bytes = new Uint8Array(dv.buffer);
    const candidates = parseFitdaysPacket(bytes);

    let weightKg = null;
    let impedanceOhm = null;

    for (const c of candidates) {
      if (weightKg == null && c.type.startsWith('weight')) {
        const v = c.value;
        if (v >= 10 && v <= 300) weightKg = Number(v.toFixed(2));
      }
      if (impedanceOhm == null && c.type.startsWith('impedance')) {
        const v = c.value;
        if (v >= 150 && v <= 3000) impedanceOhm = Math.round(v);
      }
    }

    // Fallback to existing parsers if heuristics didn't find anything
    if (weightKg == null) {
      const w = parseWeightMeasurement(dv);
      if (w && w.weightKg) weightKg = Number(w.weightKg.toFixed(2));
    }
    if (impedanceOhm == null) {
      const b = parseBiaMeasurement(dv);
      if (b && b.impedanceOhm) impedanceOhm = Math.round(b.impedanceOhm);
    }

    if (weightKg == null && impedanceOhm == null) {
      console.warn("⚠️ Vendor packet did not yield weight or impedance");
      return;
    }

    const last = window.__last || { weightKg: 0, impedanceOhm: 500 };
    const next = {
      ...last,
      ...(weightKg != null ? { weightKg } : {}),
      ...(impedanceOhm != null ? { impedanceOhm } : {})
    };
    window.__last = next;
    logMeasurement(next);
    computeAndRenderMetrics(next);
    clearDataTimeout();
    setStatus('⏳ Waiting for data…');
  } catch (error) {
    console.error('❌ Error in vendor notification handler:', error);
  }
}

async function connectBle() {
  if (!navigator.bluetooth) {
    setStatus('Web Bluetooth not supported');
    return;
  }

  // Show clear instructions and disable button
  setStatus('Turn on the scale and STEP on it. When the Bluetooth chooser appears, select MY_SCALE and wait for connection.');
  btnConnect.disabled = true;
  btnRetry.disabled = true;
  btnFallback.disabled = true;

  try {
    device = await navigator.bluetooth.requestDevice({
  filters: [{ name: "MY_SCALE" }],
  optionalServices: [UUIDS.customService, UUIDS.weightService]
});

    // device = await navigator.bluetooth.requestDevice({
    //   filters: [
    //     { name: "MY_SCALE" },
    //     { services: [UUIDS.weightService] }
    //   ],
    //   optionalServices: [UUIDS.weightService, UUIDS.customService]
    // });
    // device = await navigator.bluetooth.requestDevice({
    //   acceptAllDevices: true,
    //   optionalServices: [
    //     UUIDS.weightService,
    //     UUIDS.customService,
    //     'device_information',
    //     'battery_service'
    //   ]
    // });

    device.addEventListener('gattserverdisconnected', onDisconnected);
    console.log("✅ Found device:", device.name);
    setDeviceInfo(device.name || 'Unknown', UUIDS.weightService);
    setStatus('Connecting…');

    server = await device.gatt.connect();

    // Log discovered services and characteristics
    console.log("🔍 Discovering services and characteristics...");
const svcs = await server.getPrimaryServices();
const serviceUUIDs = svcs.map(s => s.uuid);
console.log("🔍 Discovered Services:", serviceUUIDs);

// Log each service and its characteristics
for (const s of svcs) {
  try {
    const chars = await s.getCharacteristics();
    console.log(`📡 Service ${s.uuid} → Characteristics:`, chars.map(c => c.uuid));
  } catch (err) {
    console.warn(`⚠️ Could not list characteristics for ${s.uuid}:`, err);
  }
}

// 🧠 Try to find the correct service and characteristic automatically
let svc = svcs.find(s => s.uuid.includes(UUIDS.weightService.slice(4, 8))) ||
           svcs.find(s => s.uuid.includes("ffb0")); // vendor service fallback

if (!svc) {
  console.warn("⚠️ No matching weight or BIA service found, using first discovered service as fallback");
  svc = svcs[0];
}

console.log("✅ Using service:", svc.uuid);

// Try to get weight and BIA characteristics safely
try {
  weightChar = await svc.getCharacteristic(UUIDS.weightChar);
  await weightChar.startNotifications();
  weightChar.addEventListener("characteristicvaluechanged", handleWeightNotify);
  console.log("📡 Subscribed to weight notifications");
} catch (err) {
  console.warn("⚠️ Could not start weight notifications:", err);
}

try {
  biaChar = await svc.getCharacteristic(UUIDS.biaChar);
  await biaChar.startNotifications();
  biaChar.addEventListener("characteristicvaluechanged", handleBiaNotify);
  console.log("📡 Subscribed to BIA notifications");
} catch (err) {
  console.warn("⚠️ Could not start BIA notifications:", err);
}

// Subscribe to additional vendor characteristics to capture weight in custom protocol
try {
  const vendorChars = await svc.getCharacteristics();
  for (const c of vendorChars) {
    if (c.uuid.includes('ffb1') || c.uuid.includes('ffb3') || c.uuid.includes('ffb4')) {
      try {
        await c.startNotifications();
        c.addEventListener('characteristicvaluechanged', handleVendorNotify);
        console.log(`📡 Subscribed to vendor notify ${c.uuid}`);
      } catch (subErr) {
        console.warn(`⚠️ Could not subscribe to ${c.uuid}:`, subErr);
      }
    }
  }
} catch (err) {
  console.warn("⚠️ Could not subscribe to vendor characteristics:", err);
}

setStatus("Connected");
console.log("✅ Connected to MY_SCALE, ready for measurements");

    // console.log("🔍 Discovering services and characteristics...");
    // const svcs = await server.getPrimaryServices();
    // console.log('🔍 Discovered Services:', svcs.map(s => s.uuid));
    // for (const s of svcs) {
    //   const chars = await s.getCharacteristics();
    //   console.log(`📡 Service ${s.uuid} → Characteristics:`, chars.map(c => c.uuid));
    // }

    // Connect to Weight Scale Service (0x181D)
    console.log("🔗 Connecting to Weight Scale Service...");
    const weightService = await server.getPrimaryService(UUIDS.weightService);
    weightChar = await weightService.getCharacteristic(UUIDS.weightChar);
    await weightChar.startNotifications();
    weightChar.addEventListener('characteristicvaluechanged', handleWeightNotify);
    console.log("✅ Weight Scale Service connected");

    // Connect to Custom BIA Service (0xFFB0)
    console.log("🔗 Connecting to Custom BIA Service...");
    try {
      const biaService = await server.getPrimaryService(UUIDS.customService);
      biaChar = await biaService.getCharacteristic(UUIDS.biaChar);
      await biaChar.startNotifications();
      biaChar.addEventListener('characteristicvaluechanged', handleBiaNotify);
      console.log("✅ Custom BIA Service connected");
    } catch (e) {
      console.warn("⚠️ Custom BIA Service not available:", e.message);
      console.log("📊 Will use weight-only mode with estimated impedance");
      biaChar = null;
    }

    isConnected = true;
    btnDisconnect.disabled = false;
    btnConnect.disabled = false;
    btnRetry.disabled = false;
    btnFallback.disabled = false;
    setStatus('✅ Connected to MY_SCALE');
    startDataTimeout(); // Start timeout to detect when no data arrives
  } catch (err) {
    // Re-enable buttons on error
    btnConnect.disabled = false;
    btnRetry.disabled = false;
    btnFallback.disabled = false;

    if (err.name === 'NotFoundError') {
      console.warn('User canceled the Bluetooth selection dialog.');
      setStatus('You cancelled the Bluetooth chooser or didn\'t select any device. Please click Connect Scale again.');
    } else if (err.name === 'SecurityError') {
      console.error('Security error - HTTPS required for Web Bluetooth');
      setStatus('Error: HTTPS required for Bluetooth');
    } else if (err.name === 'NotSupportedError') {
      console.error('Web Bluetooth not supported');
      setStatus('Error: Web Bluetooth not supported');
    } else {
      console.error('Connection failed:', err);
      setStatus(`Connection failed: ${err.message}`);
    }
  }

}

// Fallback connection function that shows all devices
async function connectBleFallback() {
  if (!navigator.bluetooth) {
    setStatus('Web Bluetooth not supported');
    return;
  }

  // Show warning and disable buttons
  setStatus('⚠️ Fallback mode – showing all nearby BLE devices (use only if MY_SCALE doesn\'t appear).');
  btnConnect.disabled = true;
  btnRetry.disabled = true;
  btnFallback.disabled = true;

  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [UUIDS.weightService, UUIDS.customService]
    });
    device.addEventListener('gattserverdisconnected', onDisconnected);
    console.log("✅ Found device (fallback):", device.name);
    setDeviceInfo(device.name || 'Unknown', UUIDS.weightService);
    setStatus('Connecting…');

    server = await device.gatt.connect();

    // Log discovered services and characteristics
    console.log("🔍 Discovering services and characteristics...");
    const svcs = await server.getPrimaryServices();
    console.log('🔍 Discovered Services:', svcs.map(s => s.uuid));
    for (const s of svcs) {
      const chars = await s.getCharacteristics();
      console.log(`📡 Service ${s.uuid} → Characteristics:`, chars.map(c => c.uuid));
    }

    // Connect to Weight Scale Service (0x181D)
    console.log("🔗 Connecting to Weight Scale Service...");
    const weightService = await server.getPrimaryService(UUIDS.weightService);
    weightChar = await weightService.getCharacteristic(UUIDS.weightChar);
    await weightChar.startNotifications();
    weightChar.addEventListener('characteristicvaluechanged', handleWeightNotify);
    console.log("✅ Weight Scale Service connected");

    // Connect to Custom BIA Service (0xFFB0)
    console.log("🔗 Connecting to Custom BIA Service...");
    try {
      const biaService = await server.getPrimaryService(UUIDS.customService);
      biaChar = await biaService.getCharacteristic(UUIDS.biaChar);
      await biaChar.startNotifications();
      biaChar.addEventListener('characteristicvaluechanged', handleBiaNotify);
      console.log("✅ Custom BIA Service connected");
    } catch (e) {
      console.warn("⚠️ Custom BIA Service not available:", e.message);
      console.log("📊 Will use weight-only mode with estimated impedance");
      biaChar = null;
    }

    isConnected = true;
    btnDisconnect.disabled = false;
    btnConnect.disabled = false;
    btnRetry.disabled = false;
    btnFallback.disabled = false;
    setStatus('✅ Connected to MY_SCALE');
    startDataTimeout(); // Start timeout to detect when no data arrives
  } catch (err) {
    // Re-enable buttons on error
    btnConnect.disabled = false;
    btnRetry.disabled = false;
    btnFallback.disabled = false;

    if (err.name === 'NotFoundError') {
      console.warn('User canceled the Bluetooth selection dialog.');
      setStatus('You cancelled the Bluetooth chooser or didn\'t select any device. Please click Connect Scale again.');
    } else if (err.name === 'SecurityError') {
      console.error('Security error - HTTPS required for Web Bluetooth');
      setStatus('Error: HTTPS required for Bluetooth');
    } else if (err.name === 'NotSupportedError') {
      console.error('Web Bluetooth not supported');
      setStatus('Error: Web Bluetooth not supported');
    } else {
      console.error('Connection failed:', err);
      setStatus(`Connection failed: ${err.message}`);
    }
  }
}

async function disconnectBle() {
  try {
    clearDataTimeout(); // Clear any pending timeouts
    if (weightChar) {
      try { await weightChar.stopNotifications(); } catch { }
      weightChar.removeEventListener('characteristicvaluechanged', handleWeightNotify);
    }
    if (biaChar) {
      try { await biaChar.stopNotifications(); } catch { }
      biaChar.removeEventListener('characteristicvaluechanged', handleBiaNotify);
    }
    if (device && device.gatt && device.gatt.connected) {
      device.gatt.disconnect();
    }
  } finally {
    isConnected = false;
    btnDisconnect.disabled = true;
    btnConnect.disabled = false;
    btnRetry.disabled = false;
    btnFallback.disabled = false;
    setStatus('❌ Disconnected');
  }
}

function onDisconnected() {
  clearDataTimeout(); // Clear any pending timeouts
  isConnected = false;
  btnDisconnect.disabled = true;
  btnConnect.disabled = false;
  btnRetry.disabled = false;
  btnFallback.disabled = false;
  setStatus('❌ Disconnected');
}

function startSimulation() {
  if (simInterval) return;
  clearDataTimeout(); // Clear any real device timeouts
  setStatus('Simulating…');
  let t = 0;
  simInterval = setInterval(() => {
    t += 1;
    const weightKg = 72.0 + Math.sin(t / 10) * 0.4; // small drift
    const impedanceOhm = 520 + Math.round(Math.sin(t / 7) * 15) + 10 * (Math.random() - 0.5);
    window.__last = { weightKg, impedanceOhm };
    computeAndRenderMetrics(window.__last);
  }, 750);
}

function stopSimulation() {
  if (simInterval) clearInterval(simInterval);
  simInterval = null;
  if (!isConnected) setStatus('Idle');
}

// Events
// btnConnect.addEventListener('click', () => { if (!simulate) connectBle(); });
// btnDisconnect.addEventListener('click', () => disconnectBle());
// btnRetry.addEventListener('click', () => { if (!simulate) connectBle(); });
// btnFallback.addEventListener('click', () => { if (!simulate) connectBleFallback(); });
// toggleSim.addEventListener('change', (e) => {
//   simulate = e.target.checked;
//   if (simulate) {
//     startSimulation();
//   } else {
//     stopSimulation();
//   }
// });

document.addEventListener("DOMContentLoaded", () => {
  const btnConnectEl = document.getElementById('btnConnect');
  const btnDisconnectEl = document.getElementById('btnDisconnect');
  const toggleSimEl = document.getElementById('toggleSim');
  const btnRetryEl = document.getElementById('btnRetry');
  const btnFallbackEl = document.getElementById('btnFallback');

  if (btnConnectEl) btnConnectEl.addEventListener('click', () => { if (!simulate) connectBle(); });
  if (btnDisconnectEl) btnDisconnectEl.addEventListener('click', () => disconnectBle());
  if (btnRetryEl) btnRetryEl.addEventListener('click', () => { if (!simulate) connectBle(); });
  if (btnFallbackEl) btnFallbackEl.addEventListener('click', () => { if (!simulate) connectBleFallback(); });
  if (toggleSimEl) toggleSimEl.addEventListener('change', (e) => {
    simulate = e.target.checked;
    if (simulate) {
      startSimulation();
    } else {
      stopSimulation();
    }
  });
});

// Data logging for debugging
function logMeasurement(data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    weight: data.weightKg,
    impedance: data.impedanceOhm,
    userProfile: getUserProfile()
  };
  console.log('📊 Measurement logged:', logEntry);

  // Store in localStorage for debugging
  const logs = JSON.parse(localStorage.getItem('fitdays_logs') || '[]');
  logs.push(logEntry);
  if (logs.length > 100) logs.shift(); // Keep only last 100 entries
  localStorage.setItem('fitdays_logs', JSON.stringify(logs));
}

// Initial UI state
setStatus('Idle');
setDeviceInfo('—', '—');
if (btnRetry) btnRetry.disabled = true;
if (btnFallback) btnFallback.disabled = true;
Metrics.weight('—', 'kg');
Metrics.bmi('—');
Metrics.bodyFat('—');
Metrics.muscleMass('—');
Metrics.boneMass('—');
Metrics.tbw('—');
Metrics.vfi('—');
Metrics.bmr('—');
Metrics.metaAge('—');


// buffer: Uint8Array or ArrayBuffer
function parseFitdaysPacket(buffer) {
  const bytes = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log("Packet hex:", hex);

  const candidates = [];

  // helper to read little-endian unsigned integers
  function readUInt16LE(off) {
    if (off + 1 >= bytes.length) return null;
    return bytes[off] | (bytes[off + 1] << 8);
  }
  function readUInt32LE(off) {
    if (off + 3 >= bytes.length) return null;
    return (bytes[off]) | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24);
  }

  // try plausible offsets for weight (uint16) and scales (/10, /100)
  for (let off = 0; off < Math.min(12, bytes.length - 1); off++) {
    const raw16 = readUInt16LE(off);
    if (raw16 === null) continue;
    // plausible weight ranges to consider (kg)
    const w10 = raw16 / 10.0;
    const w100 = raw16 / 100.0;
    if (w10 >= 10 && w10 <= 300) candidates.push({ type: 'weight', off, raw16, value: w10, scale: 10 });
    if (w100 >= 10 && w100 <= 300) candidates.push({ type: 'weight', off, raw16, value: w100, scale: 100 });
  }

  // try plausible offsets for impedance (uint16/uint32)
  for (let off = 0; off < Math.min(12, bytes.length - 1); off++) {
    const raw16 = readUInt16LE(off);
    if (raw16 === null) continue;
    // plausible impedance ranges (ohms)
    if (raw16 >= 150 && raw16 <= 3000) candidates.push({ type: 'impedance16', off, raw16, value: raw16 });
  }
  for (let off = 0; off < Math.min(12, bytes.length - 3); off++) {
    const raw32 = readUInt32LE(off);
    if (raw32 === null) continue;
    if (raw32 >= 150 && raw32 <= 300000) candidates.push({ type: 'impedance32', off, raw32, value: raw32 });
  }

  // Heuristic: also check 2-byte signed values (sometimes impedance uses signed)
  function readInt16LE(off) {
    if (off + 1 >= bytes.length) return null;
    const v = readUInt16LE(off);
    return v >= 0x8000 ? v - 0x10000 : v;
  }
  for (let off = 0; off < Math.min(12, bytes.length - 1); off++) {
    const i16 = readInt16LE(off);
    if (i16 === null) continue;
    if (i16 >= 150 && i16 <= 3000) candidates.push({ type: 'impedance_s16', off, raw: i16, value: i16 });
  }

  // Unique candidate dedup by type+off+value
  const uniq = {};
  const filtered = [];
  for (const c of candidates) {
    const k = `${c.type}_${c.off}_${c.value}`;
    if (!uniq[k]) { uniq[k] = 1; filtered.push(c); }
  }

  console.log("Candidates (" + filtered.length + "):");
  filtered.forEach(c => {
    if (c.type.startsWith('weight')) {
      console.log(` Weight candidate: offset=${c.off}, raw=${c.raw16}, scale=/${c.scale}, kg=${c.value.toFixed(2)}`);
    } else {
      console.log(` Imp candidate: type=${c.type}, offset=${c.off}, raw=${c.raw16 || c.raw}, value=${c.value}`);
    }
  });
  return filtered;
}

// const bytes = new Uint8Array(ev.target.value.buffer);
// console.log("raw hex:", Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join(' '));
// parseFitdaysPacket(bytes);

// Log updated UUIDs for verification
console.log(" Updated UUIDs from BLE capture:");

