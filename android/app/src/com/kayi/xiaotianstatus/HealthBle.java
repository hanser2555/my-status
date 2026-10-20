package com.kayi.xiaotianstatus;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

public final class HealthBle {
    private static final String TAG = "XtHealthBle";
    private static final UUID HR_SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    private static final UUID HR_MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    private static final UUID PLX_SERVICE = UUID.fromString("00001822-0000-1000-8000-00805f9b34fb");
    private static final UUID PLX_MEASUREMENT = UUID.fromString("00002a5e-0000-1000-8000-00805f9b34fb");
    private static final UUID BATTERY_SERVICE = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb");
    private static final UUID BATTERY_LEVEL = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static HealthBle instance;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private boolean scanning;
    private boolean connecting;

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (connecting || gatt != null) return;
            BluetoothDevice device = result.getDevice();
            if (device == null) return;
            String name = safeName(device);
            boolean named = name != null && name.toLowerCase().contains(
                    Prefs.watchName(context).toLowerCase());
            boolean hasHr = hasService(result.getScanRecord(), HR_SERVICE);
            if (!named && !hasHr) return;
            stopScan();
            connect(device);
        }

        @Override
        public void onScanFailed(int errorCode) {
            scanning = false;
            Log.w(TAG, "scan failed: " + errorCode);
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt bluetoothGatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connecting = false;
                gatt = bluetoothGatt;
                bluetoothGatt.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connecting = false;
                closeGatt();
                scheduleScan(60_000L);
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt bluetoothGatt, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) return;
            boolean enabled = false;
            BluetoothGattService hrService = bluetoothGatt.getService(HR_SERVICE);
            if (hrService != null) {
                BluetoothGattCharacteristic characteristic = hrService.getCharacteristic(HR_MEASUREMENT);
                if (characteristic != null) enabled |= enable(bluetoothGatt, characteristic);
            }
            BluetoothGattService plxService = bluetoothGatt.getService(PLX_SERVICE);
            if (plxService != null) {
                BluetoothGattCharacteristic characteristic = plxService.getCharacteristic(PLX_MEASUREMENT);
                if (characteristic != null) enabled |= enable(bluetoothGatt, characteristic);
            }
            BluetoothGattService batteryService = bluetoothGatt.getService(BATTERY_SERVICE);
            if (batteryService != null) {
                BluetoothGattCharacteristic characteristic = batteryService.getCharacteristic(BATTERY_LEVEL);
                if (characteristic != null) bluetoothGatt.readCharacteristic(characteristic);
            }
            Log.i(TAG, enabled ? "watch health notifications enabled" : "no standard health service");
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt bluetoothGatt, BluetoothGattCharacteristic characteristic) {
            parse(characteristic);
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt bluetoothGatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS && BATTERY_LEVEL.equals(characteristic.getUuid())) {
                byte[] value = characteristic.getValue();
                if (value != null && value.length > 0) HealthState.updateBattery(value[0] & 0xFF);
            }
        }
    };

    private HealthBle(Context context) {
        this.context = context.getApplicationContext();
        BluetoothManager manager = (BluetoothManager) this.context.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
        scanner = adapter == null ? null : adapter.getBluetoothLeScanner();
    }

    public static synchronized void start(Context context) {
        if (instance != null) return;
        instance = new HealthBle(context);
        instance.scan();
    }

    public static synchronized void stop() {
        if (instance == null) return;
        instance.handler.removeCallbacksAndMessages(null);
        instance.stopScan();
        instance.closeGatt();
        instance = null;
    }

    public static synchronized void rescan() {
        if (instance == null) return;
        instance.closeGatt();
        instance.scan();
    }

    private void scan() {
        if (scanner == null || adapter == null || !adapter.isEnabled()) return;
        if (!hasScanPermission()) {
            Log.w(TAG, "no bluetooth scan permission");
            return;
        }
        if (scanning) return;
        try {
            ScanSettings settings = new ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .build();
            List<ScanFilter> filters = Collections.emptyList();
            scanner.startScan(filters, settings, scanCallback);
            scanning = true;
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (scanning) stopScan();
                    if (gatt == null && !connecting) scheduleScan(5 * 60_000L);
                }
            }, 15_000L);
            Log.i(TAG, "scanning for watch");
        } catch (Exception error) {
            Log.w(TAG, "scan start failed: " + error.getMessage());
        }
    }

    private void stopScan() {
        if (!scanning || scanner == null) return;
        try {
            scanner.stopScan(scanCallback);
        } catch (Exception ignored) {}
        scanning = false;
    }

    private void connect(BluetoothDevice device) {
        if (!hasConnectPermission()) return;
        connecting = true;
        try {
            gatt = device.connectGatt(context, true, gattCallback);
            Log.i(TAG, "connecting to " + safeName(device));
        } catch (Exception error) {
            connecting = false;
            Log.w(TAG, "connect failed: " + error.getMessage());
            scheduleScan(30_000L);
        }
    }

    private void scheduleScan(long delay) {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                scan();
            }
        }, delay);
    }

    private boolean enable(BluetoothGatt bluetoothGatt, BluetoothGattCharacteristic characteristic) {
        try {
            bluetoothGatt.setCharacteristicNotification(characteristic, true);
            BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CCCD);
            if (descriptor != null) {
                descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                bluetoothGatt.writeDescriptor(descriptor);
            }
            return true;
        } catch (Exception error) {
            Log.w(TAG, "enable notification failed: " + error.getMessage());
            return false;
        }
    }

    private void parse(BluetoothGattCharacteristic characteristic) {
        byte[] data = characteristic.getValue();
        if (data == null || data.length < 2) return;
        try {
            if (HR_MEASUREMENT.equals(characteristic.getUuid())) {
                int flags = data[0] & 0xFF;
                int hr = (flags & 0x01) == 0
                        ? data[1] & 0xFF
                        : (data[1] & 0xFF) | ((data[2] & 0xFF) << 8);
                if (hr > 20 && hr < 240) HealthState.update(hr, -1, "OPPO Watch BLE");
            } else if (PLX_MEASUREMENT.equals(characteristic.getUuid())) {
                int spo2 = sfloat(data, 1);
                if (spo2 > 50 && spo2 <= 100) HealthState.update(-1, spo2, "OPPO Watch BLE");
            }
        } catch (Exception error) {
            Log.w(TAG, "parse failed: " + error.getMessage());
        }
    }

    private int sfloat(byte[] data, int offset) {
        if (data.length < offset + 2) return -1;
        int mantissa = (data[offset] & 0xFF) | ((data[offset + 1] & 0x0F) << 8);
        int exponent = (data[offset + 1] >> 4) & 0x0F;
        if (exponent >= 8) exponent -= 16;
        if (mantissa == 0x07FF || mantissa == 0x0FFF) return -1;
        return (int) Math.round(mantissa * Math.pow(10, exponent));
    }

    private boolean hasService(ScanRecord record, UUID uuid) {
        if (record == null) return false;
        List<ParcelUuid> uuids = record.getServiceUuids();
        if (uuids == null) return false;
        for (ParcelUuid parcel : uuids) {
            if (uuid.equals(parcel.getUuid())) return true;
        }
        return false;
    }

    private String safeName(BluetoothDevice device) {
        try {
            return device.getName();
        } catch (SecurityException ignored) {
            return null;
        }
    }

    private boolean hasScanPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            return context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
        }
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasConnectPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            return context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void closeGatt() {
        if (gatt == null) return;
        try { gatt.close(); } catch (Exception ignored) {}
        gatt = null;
    }
}
