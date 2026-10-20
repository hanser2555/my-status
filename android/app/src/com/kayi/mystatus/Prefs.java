package com.kayi.mystatus;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

public final class Prefs {
    private static final String FILE = "my_status";
    public static final String DEFAULT_SERVER = "http://YOUR_SERVER_IP";
    public static final String DEFAULT_TOKEN = "CHANGE_ME_TOKEN";

    private Prefs() {}

    public static SharedPreferences get(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static String server(Context context) {
        return get(context).getString("server", DEFAULT_SERVER);
    }

    public static String token(Context context) {
        return get(context).getString("token", DEFAULT_TOKEN);
    }

    public static boolean isWatch(Context context) {
        return context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_WATCH);
    }

    public static String deviceId(Context context) {
        return get(context).getString("deviceId", isWatch(context) ? "watch" : "phone");
    }

    public static String deviceName(Context context) {
        return get(context).getString("deviceName", isWatch(context) ? "手表" : "手机");
    }

    public static String kind(Context context) {
        return get(context).getString("kind", isWatch(context) ? "watch" : "phone");
    }

    public static boolean bleEnabled(Context context) {
        return get(context).getBoolean("bleEnabled", true);
    }

    public static String watchName(Context context) {
        return get(context).getString("watchName", "OPPO");
    }

    public static void save(Context context, String server, String token, String deviceId,
                            String deviceName, String kind, boolean bleEnabled, String watchName) {
        get(context).edit()
                .putString("server", server.trim())
                .putString("token", token.trim())
                .putString("deviceId", deviceId.trim())
                .putString("deviceName", deviceName.trim())
                .putString("kind", kind)
                .putBoolean("bleEnabled", bleEnabled)
                .putString("watchName", watchName.trim())
                .apply();
    }
}
