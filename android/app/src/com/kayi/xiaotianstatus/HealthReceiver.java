package com.kayi.xiaotianstatus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class HealthReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String token = intent.getStringExtra("token");
        if (token == null || !token.equals(Prefs.token(context))) return;
        int hr = intent.getIntExtra("hr", -1);
        int spo2 = intent.getIntExtra("spo2", -1);
        int battery = intent.getIntExtra("battery", -1);
        String source = intent.getStringExtra("source");
        if (hr <= 0 && spo2 <= 0 && battery < 0) return;
        HealthState.update(hr, spo2, source == null ? "Automation broadcast" : source);
        if (battery >= 0) HealthState.updateBattery(battery);
        Intent service = new Intent(context, StatusService.class);
        service.setAction(StatusService.ACTION_REPORT);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
        else context.startService(service);
    }
}
