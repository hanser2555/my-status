package com.kayi.xiaotianstatus;

import org.json.JSONObject;

public final class HealthState {
    public static volatile int heartRate = -1;
    public static volatile int spo2 = -1;
    public static volatile int watchBattery = -1;
    public static volatile long updatedAt = 0L;
    public static volatile String source = "BLE";

    private HealthState() {}

    public static synchronized void update(int hr, int oxygen, String src) {
        if (hr > 0) heartRate = hr;
        if (oxygen > 0) spo2 = oxygen;
        if (src != null) source = src;
        updatedAt = System.currentTimeMillis();
    }

    public static synchronized void updateBattery(int value) {
        if (value >= 0) watchBattery = value;
    }

    public static boolean isFresh() {
        return updatedAt > 0 && System.currentTimeMillis() - updatedAt < 15 * 60 * 1000L;
    }

    public static JSONObject toJson() {
        JSONObject health = new JSONObject();
        try {
            if (heartRate > 0) health.put("hr", heartRate);
            if (spo2 > 0) health.put("spo2", spo2);
            health.put("source", source);
            health.put("ts", updatedAt > 0 ? updatedAt : System.currentTimeMillis());
        } catch (Exception ignored) {}
        return health;
    }
}
