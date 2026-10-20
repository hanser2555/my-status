package com.kayi.mystatus;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class StatusService extends Service {
    private static final String TAG = "XtStatusService";
    private static final String CHANNEL = "my_status";
    public static final String ACTION_REPORT = "com.kayi.mystatus.REPORT";
    public static volatile String lastMessage = "尚未上报";
    public static volatile long lastSuccessAt = 0L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean sending = new AtomicBoolean(false);

    private final Runnable reportRunnable = new Runnable() {
        @Override
        public void run() {
            sendNow();
            handler.postDelayed(this, 60_000L);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForegroundCompat(buildNotification("正在准备设备状态..."));
        StepTracker.start(this);
        if (Prefs.isWatch(this) || "watch".equals(Prefs.kind(this))) {
            HealthSensors.start(this);
        } else if ("phone".equals(Prefs.kind(this)) && Prefs.bleEnabled(this)) {
            HealthBle.start(this);
        }
        handler.post(reportRunnable);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_REPORT.equals(intent.getAction())) {
            sendNow();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        StepTracker.stop();
        HealthBle.stop();
        HealthSensors.stop();
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void sendNow() {
        if (!sending.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try {
                JSONObject payload = DeviceStatus.collect(this);
                if (!Prefs.isWatch(this) && !"watch".equals(Prefs.kind(this))) {
                    JSONObject watch = watchPayload();
                    if (watch != null) payload.put("watch", watch);
                }
                ApiClient.Result result = ApiClient.postJson(
                        Prefs.server(this), Prefs.token(this), "/api/report", payload);
                if (result.ok()) {
                    lastSuccessAt = System.currentTimeMillis();
                    String label = "已同步";
                    try {
                        JSONObject response = new JSONObject(result.body);
                        JSONObject inference = response.optJSONObject("inference");
                        if (inference != null) label = inference.optString("label", label);
                    } catch (Exception ignored) {}
                    lastMessage = "已同步 · " + label;
                    updateNotification(lastMessage);
                } else {
                    lastMessage = result.error != null ? "上报失败 · " + result.error : "上报失败 · HTTP " + result.code;
                    updateNotification(lastMessage);
                    Log.w(TAG, lastMessage);
                }
            } catch (Exception error) {
                lastMessage = "上报异常 · " + error.getMessage();
                updateNotification(lastMessage);
                Log.w(TAG, lastMessage, error);
            } finally {
                sending.set(false);
            }
        });
    }

    private JSONObject watchPayload() {
        if (!HealthState.isFresh() && HealthState.watchBattery < 0) return null;
        JSONObject watch = new JSONObject();
        try {
            watch.put("id", "watch");
            watch.put("kind", "watch");
            watch.put("name", "手表");
            watch.put("model", "OPPO Watch");
            watch.put("source", "OPPO Watch via phone");
            watch.put("connected", HealthState.isFresh());
            if (HealthState.watchBattery >= 0) {
                JSONObject battery = new JSONObject();
                battery.put("percent", HealthState.watchBattery);
                battery.put("charging", false);
                watch.put("battery", battery);
            }
            if (HealthState.isFresh()) watch.put("health", HealthState.toJson());
        } catch (Exception ignored) {}
        return watch;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL, "我的状态上报", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("持续上报手机、平板和手表状态到你的电脑");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("我的状态 · " + Prefs.deviceName(this))
                .setContentText(text)
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(1, notification);
        }
    }

    private void updateNotification(String text) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(1, buildNotification(text));
        } catch (Exception ignored) {}
    }
}
