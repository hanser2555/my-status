package com.kayi.mystatus;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public final class HealthKitProbe {
    private static final String TAG = "XtHealthKit";
    private static final Uri URI = Uri.parse("content://com.heytap.wearable.healthkit.provider");
    private static final int REQUEST_HEALTH = 1001;

    private HealthKitProbe() {}

    public static void probe(Context context) {
        ContentResolver resolver = context.getContentResolver();
        try {
            Bundle available = resolver.call(URI, "CHECK_AVAILABLE", null, null);
            Log.i(TAG, "CHECK_AVAILABLE=" + bundle(available));
        } catch (Exception error) {
            Log.w(TAG, "CHECK_AVAILABLE failed", error);
        }
        try {
            Bundle version = resolver.call(URI, "CHECK_VERSION", null, null);
            Log.i(TAG, "CHECK_VERSION=" + bundle(version));
        } catch (Exception error) {
            Log.w(TAG, "CHECK_VERSION failed", error);
        }
        try {
            Bundle extras = new Bundle();
            extras.putString("packageName", context.getPackageName());
            Bundle permission = resolver.call(URI, "queryPermission", null, extras);
            Log.i(TAG, "queryPermission=" + bundle(permission));
        } catch (Exception error) {
            Log.w(TAG, "queryPermission failed", error);
        }
        try {
            Bundle check = new Bundle();
            check.putByteArray("EXTRA_DATA", permissionPayload());
            Bundle result = resolver.call(URI, "CHECK_PERMISSIONS", null, check);
            Log.i(TAG, "CHECK_PERMISSIONS=" + bundle(result));
        } catch (Exception error) {
            Log.w(TAG, "CHECK_PERMISSIONS failed", error);
        }
        readHeartRate(context, 24 * 60 * 60);
    }

    public static void requestPermissions(Activity activity) {
        try {
            Intent intent = new Intent("heytap.wearable.intent.action.health.ACTION_REQUEST_PERMISSIONS");
            intent.setClassName("com.heytap.wearable.health",
                    "com.heytap.wearable.health.healthkit.permission.PermissionActivity");
            intent.putExtra("EXTRA_DATA", permissionPayload());
            activity.startActivityForResult(intent, REQUEST_HEALTH);
            Log.i(TAG, "permission request started");
        } catch (Exception error) {
            Log.w(TAG, "permission request failed", error);
        }
    }

    public static void readHeartRate(Context context, int secondsBack) {
        try {
            int end = (int) (System.currentTimeMillis() / 1000L);
            int start = end - Math.max(60, secondsBack);
            byte[] request = readRequest("HeartRateRecord", start, end);
            Bundle extras = new Bundle();
            extras.putString("EXTRA_TYPE", "HeartRateRecord");
            extras.putByteArray("EXTRA_DATA", request);
            Bundle result = context.getContentResolver().call(URI, "READ_RECORDS", null, extras);
            Log.i(TAG, "READ_RECORDS hr=" + bundle(result));
        } catch (Exception error) {
            Log.w(TAG, "READ_RECORDS hr failed", error);
        }
    }

    private static byte[] permissionPayload() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writePermission(out, "HeartRateRecord", 1);
        writePermission(out, "Spo2Record", 1);
        return out.toByteArray();
    }

    private static void writePermission(ByteArrayOutputStream out, String type, int access) {
        ByteArrayOutputStream p = new ByteArrayOutputStream();
        byte[] name = type.getBytes(StandardCharsets.UTF_8);
        p.write(0x0A);
        writeVarint(p, name.length);
        p.write(name, 0, name.length);
        p.write(0x10);
        writeVarint(p, access);
        byte[] bytes = p.toByteArray();
        out.write(0x0A);
        writeVarint(out, bytes.length);
        out.write(bytes, 0, bytes.length);
    }

    private static byte[] readRequest(String type, int start, int end) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] name = type.getBytes(StandardCharsets.UTF_8);
        out.write(0x0A);
        writeVarint(out, name.length);
        out.write(name, 0, name.length);
        out.write(0x10);
        writeVarint(out, start);
        out.write(0x18);
        writeVarint(out, end);
        out.write(0x20);
        writeVarint(out, 10);
        out.write(0x28);
        writeVarint(out, 1);
        return out.toByteArray();
    }

    private static void writeVarint(ByteArrayOutputStream out, int value) {
        long v = value & 0xFFFFFFFFL;
        while ((v & ~0x7FL) != 0) {
            out.write((int) ((v & 0x7F) | 0x80));
            v >>>= 7;
        }
        out.write((int) v);
    }

    private static String bundle(Bundle value) {
        if (value == null) return "null";
        StringBuilder builder = new StringBuilder("{");
        for (String key : value.keySet()) {
            Object item = value.get(key);
            builder.append(key).append('=');
            if (item instanceof byte[]) builder.append("byte[").append(((byte[]) item).length).append(']');
            else builder.append(item);
            builder.append(", ");
        }
        return builder.append('}').toString();
    }
}
