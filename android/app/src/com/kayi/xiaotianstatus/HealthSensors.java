package com.kayi.xiaotianstatus;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.util.Log;

import java.util.Arrays;

public final class HealthSensors implements SensorEventListener {
    private static final String TAG = "XtHealthSensors";
    private static final int TYPE_PPG_SPO = 69633;
    private static HealthSensors instance;

    private final Context context;
    private final SensorManager sensorManager;
    private final Sensor heartRate;
    private final Sensor spo2;

    private HealthSensors(Context context) {
        this.context = context.getApplicationContext();
        sensorManager = (SensorManager) this.context.getSystemService(Context.SENSOR_SERVICE);
        heartRate = sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        spo2 = findSpo2(sensorManager);
    }

    public static synchronized void start(Context context) {
        if (instance != null) return;
        if (context.checkSelfPermission(Manifest.permission.BODY_SENSORS)
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "BODY_SENSORS not granted");
            return;
        }
        HealthSensors sensors = new HealthSensors(context);
        if (sensors.sensorManager == null) return;
        boolean registered = false;
        if (sensors.heartRate != null) {
            registered |= sensors.sensorManager.registerListener(
                    sensors, sensors.heartRate, SensorManager.SENSOR_DELAY_NORMAL);
        }
        if (sensors.spo2 != null) {
            registered |= sensors.sensorManager.registerListener(
                    sensors, sensors.spo2, SensorManager.SENSOR_DELAY_NORMAL);
        }
        if (registered) {
            instance = sensors;
            Log.i(TAG, "watch sensors started: hr="
                    + (sensors.heartRate != null) + " spo2=" + (sensors.spo2 != null));
        }
    }

    public static synchronized void stop() {
        if (instance == null) return;
        instance.sensorManager.unregisterListener(instance);
        instance = null;
    }

    private static Sensor findSpo2(SensorManager manager) {
        if (manager == null) return null;
        if (Build.VERSION.SDK_INT >= 21) {
            Sensor direct = manager.getDefaultSensor(TYPE_PPG_SPO);
            if (direct != null) return direct;
        }
        for (Sensor sensor : manager.getSensorList(Sensor.TYPE_ALL)) {
            String name = sensor.getName() == null ? "" : sensor.getName().toLowerCase();
            if (sensor.getType() == TYPE_PPG_SPO
                    || name.contains("ppg_spo")
                    || name.contains("spo2")
                    || name.contains("oxygen")) {
                return sensor;
            }
        }
        return null;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.values == null || event.values.length == 0) return;
        if (event.sensor.getType() == Sensor.TYPE_HEART_RATE) {
            int hr = Math.round(event.values[0]);
            if (hr > 20 && hr < 240) {
                HealthState.update(hr, -1, "OPPO Watch sensor");
            }
        } else if (event.sensor.getType() == TYPE_PPG_SPO
                || event.sensor.getName().toLowerCase().contains("ppg_spo")) {
            Log.i(TAG, "spo2 raw=" + Arrays.toString(event.values));
            int value = Math.round(event.values[0]);
            if (value >= 50 && value <= 100) {
                HealthState.update(-1, value, "OPPO Watch sensor");
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        Log.i(TAG, "accuracy " + accuracy + " for " + sensor.getName());
    }
}
