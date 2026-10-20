package com.kayi.mystatus;

import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import java.time.LocalDate;

public final class StepTracker implements SensorEventListener {
    private static StepTracker instance;
    private final SensorManager sensorManager;
    private final Sensor sensor;
    private final SharedPreferences prefs;
    private int today = -1;

    private StepTracker(Context context) {
        sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        sensor = sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        prefs = Prefs.get(context);
    }

    public static synchronized void start(Context context) {
        if (instance != null) return;
        StepTracker tracker = new StepTracker(context);
        if (tracker.sensor == null || tracker.sensorManager == null) return;
        tracker.sensorManager.registerListener(tracker, tracker.sensor, SensorManager.SENSOR_DELAY_NORMAL);
        instance = tracker;
    }

    public static synchronized void stop() {
        if (instance == null) return;
        instance.sensorManager.unregisterListener(instance);
        instance = null;
    }

    public static synchronized int stepsToday() {
        return instance == null ? -1 : instance.today;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER || event.values.length == 0) return;
        float total = event.values[0];
        String todayKey = LocalDate.now().toString();
        String storedDate = prefs.getString("stepDate", "");
        float baseline = prefs.getFloat("stepBaseline", -1f);
        if (!todayKey.equals(storedDate) || baseline < 0f || total < baseline) {
            baseline = total;
            prefs.edit().putString("stepDate", todayKey).putFloat("stepBaseline", baseline).apply();
        }
        today = Math.max(0, Math.round(total - baseline));
        prefs.edit().putInt("stepsToday", today).apply();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
