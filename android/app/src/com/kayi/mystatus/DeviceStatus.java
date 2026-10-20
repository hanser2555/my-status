package com.kayi.mystatus;

import android.app.KeyguardManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.StatFs;

import org.json.JSONObject;

import java.io.File;
import java.time.Instant;
import java.time.LocalDate;

public final class DeviceStatus {
    private DeviceStatus() {}

    public static JSONObject collect(Context context) {
        JSONObject root = new JSONObject();
        try {
            String id = Prefs.deviceId(context);
            String kind = Prefs.kind(context);
            root.put("id", id);
            root.put("kind", kind);
            root.put("name", Prefs.deviceName(context));
            root.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            root.put("os", "Android " + Build.VERSION.RELEASE);
            root.put("source", "Android");
            root.put("updatedAt", Instant.now().toString());

            JSONObject battery = battery(context);
            root.put("battery", battery);
            root.put("charging", battery.optBoolean("charging", false));

            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            boolean screenOn = power != null && power.isInteractive();
            root.put("screenOn", screenOn);
            root.put("unlocked", keyguard == null || !keyguard.isKeyguardLocked());

            JSONObject foreground = foreground(context);
            root.put("foreground", foreground);

            JSONObject network = network(context);
            root.put("network", network);

            int steps = StepTracker.stepsToday();
            if (steps >= 0) {
                root.put("stepsToday", steps);
                root.put("stepsDate", LocalDate.now().toString());
            }

            root.put("storageFreePercent", storageFreePercent());
            root.put("watchBattery", HealthState.watchBattery >= 0 ? HealthState.watchBattery : JSONObject.NULL);
            if (HealthState.isFresh()) {
                root.put("health", HealthState.toJson());
            }
        } catch (Exception error) {
            try {
                root.put("collectError", error.getClass().getSimpleName() + ": " + error.getMessage());
            } catch (Exception ignored) {}
        }
        return root;
    }

    private static JSONObject battery(Context context) {
        JSONObject battery = new JSONObject();
        try {
            Intent intent = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent == null) return battery;
            int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int temperature = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0);
            int percent = scale > 0 ? Math.round(level * 100f / scale) : -1;
            boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                    || status == BatteryManager.BATTERY_STATUS_FULL;
            battery.put("percent", percent);
            battery.put("charging", charging);
            if (temperature > 0) battery.put("temperatureC", temperature / 10.0);
        } catch (Exception ignored) {}
        return battery;
    }

    private static JSONObject foreground(Context context) {
        JSONObject result = new JSONObject();
        try {
            UsageStatsManager manager = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (manager == null) return result;
            long now = System.currentTimeMillis();
            // Keep a wider window so a stale "Settings" resume is cleared by its pause/stop event.
            UsageEvents events = manager.queryEvents(now - 60 * 60 * 1000L, now);
            if (events == null) return result;
            UsageEvents.Event event = new UsageEvents.Event();
            String packageName = null;
            long last = 0L;
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                int type = event.getEventType();
                String pkg = event.getPackageName();
                long timestamp = event.getTimeStamp();
                if (timestamp < last) continue;

                if (type == UsageEvents.Event.SCREEN_NON_INTERACTIVE
                        || type == UsageEvents.Event.KEYGUARD_SHOWN) {
                    packageName = null;
                    last = timestamp;
                    continue;
                }

                boolean resumed = type == UsageEvents.Event.ACTIVITY_RESUMED
                        || type == UsageEvents.Event.MOVE_TO_FOREGROUND;
                if (resumed) {
                    if (pkg != null && !context.getPackageName().equals(pkg)) {
                        packageName = pkg;
                        last = timestamp;
                    }
                    continue;
                }

                boolean paused = type == UsageEvents.Event.ACTIVITY_PAUSED
                        || type == UsageEvents.Event.ACTIVITY_STOPPED
                        || type == UsageEvents.Event.MOVE_TO_BACKGROUND;
                if (paused && packageName != null && packageName.equals(pkg)) {
                    packageName = null;
                    last = timestamp;
                }
            }
            if (packageName != null) {
                PackageManager pm = context.getPackageManager();
                ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
                String label = pm.getApplicationLabel(info).toString();
                result.put("app", label);
                result.put("package", packageName);
            }
        } catch (Exception ignored) {}
        return result;
    }

    private static JSONObject network(Context context) {
        JSONObject result = new JSONObject();
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return result;
            Network network = manager.getActiveNetwork();
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            if (capabilities == null) {
                result.put("type", "offline");
                return result;
            }
            if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) result.put("type", "wifi");
            else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) result.put("type", "cellular");
            else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) result.put("type", "ethernet");
            else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) result.put("type", "bluetooth");
            else result.put("type", "other");
        } catch (Exception ignored) {}
        return result;
    }

    private static int storageFreePercent() {
        try {
            StatFs stat = new StatFs(new File("/data").getAbsolutePath());
            long free = stat.getAvailableBytes();
            long total = stat.getTotalBytes();
            return total > 0 ? (int) (free * 100L / total) : -1;
        } catch (Exception ignored) {
            return -1;
        }
    }

    private static String label(Context context, String packageName) {
        try {
            PackageManager pm = context.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }
}
