package com.kayi.xiaotianstatus;

import android.Manifest;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int REQ_PERMISSIONS = 42;
    private static final int BG = 0xFF0D0817;
    private static final int CARD = 0xFF171026;
    private static final int CARD_2 = 0xFF1D1430;
    private static final int TEXT = 0xFFF5F1FF;
    private static final int MUTED = 0xFF9B91B7;
    private static final int ACCENT = 0xFFB9A2FF;
    private static final int PINK = 0xFFFF77A8;
    private static final int GREEN = 0xFF73E0B1;

    private EditText serverInput;
    private EditText tokenInput;
    private EditText idInput;
    private EditText nameInput;
    private EditText watchInput;
    private Spinner kindSpinner;
    private Switch bleSwitch;
    private TextView permissionStatus;
    private TextView lastStatus;
    private TextView testStatus;
    private TextView watchStatus;

    private final String[] kinds = {"phone", "tablet", "watch"};
    private final String[] kindLabels = {"手机", "平板", "手表"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        if (Prefs.isWatch(this)) {
            buildWatchUi();
            startStatusService();
            return;
        }
        buildUi();
        fillValues();
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(24) + statusBarHeight(), dp(22), dp(30));
        scroll.addView(root);
        setContentView(scroll);

        TextView brand = text("✦  XIAOTIAN STATUS  /  DEVICE AGENT", 9, ACCENT, true);
        brand.setLetterSpacing(0.22f);
        root.addView(brand);

        TextView title = text("把设备接入状态卡", 27, TEXT, true);
        title.setPadding(0, dp(10), 0, dp(3));
        root.addView(title);

        TextView subtitle = text("同一 Wi-Fi 下，把手机、平板和手表的实时状态汇总到电脑。安装后点一次“保存并启动”，之后会自动上报。", 12, MUTED, false);
        subtitle.setLineSpacing(dp(3), 1f);
        root.addView(subtitle);

        LinearLayout connectCard = card();
        connectCard.addView(section("连接电脑"));
        connectCard.addView(label("电脑地址（含端口）"));
        serverInput = input("http://192.168.1.100:17890", InputType.TYPE_TEXT_VARIATION_URI);
        connectCard.addView(serverInput);
        connectCard.addView(label("访问令牌"));
        tokenInput = input(Prefs.DEFAULT_TOKEN, InputType.TYPE_CLASS_TEXT);
        connectCard.addView(tokenInput);
        Button test = button("测试连接", false);
        test.setOnClickListener(v -> testConnection());
        connectCard.addView(test);
        testStatus = text("", 11, MUTED, false);
        testStatus.setPadding(0, dp(6), 0, 0);
        connectCard.addView(testStatus);
        root.addView(connectCard);

        LinearLayout identityCard = card();
        identityCard.addView(section("设备身份"));
        identityCard.addView(label("设备 ID（手机 phone / 平板 tablet 不要重复）"));
        idInput = input("phone", InputType.TYPE_CLASS_TEXT);
        identityCard.addView(idInput);
        identityCard.addView(label("显示名称"));
        nameInput = input("手机", InputType.TYPE_CLASS_TEXT);
        identityCard.addView(nameInput);
        identityCard.addView(label("设备类型"));
        kindSpinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, kindLabels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        kindSpinner.setAdapter(adapter);
        kindSpinner.setPadding(0, dp(2), 0, dp(2));
        identityCard.addView(kindSpinner);
        TextView idHint = text("平板安装同一个 APK 后，把 ID 改成 tablet、名称改成“平板”，类型选“平板”。", 10, MUTED, false);
        idHint.setPadding(0, dp(7), 0, 0);
        identityCard.addView(idHint);
        root.addView(identityCard);

        LinearLayout permissionCard = card();
        permissionCard.addView(section("权限"));
        permissionStatus = text("", 11, MUTED, false);
        permissionStatus.setLineSpacing(dp(3), 1f);
        permissionCard.addView(permissionStatus);
        Button usage = button("使用情况访问（读取前台 App）", false);
        usage.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)));
        permissionCard.addView(usage);
        Button basic = button("授予通知 / 活动 / 蓝牙权限", false);
        basic.setOnClickListener(v -> requestBasicPermissions());
        permissionCard.addView(basic);
        root.addView(permissionCard);

        LinearLayout watchCard = card();
        watchCard.addView(section("手表数据"));
        bleSwitch = new Switch(this);
        bleSwitch.setText("尝试直连手表标准心率服务");
        bleSwitch.setTextColor(TEXT);
        bleSwitch.setTextSize(12);
        bleSwitch.setPadding(0, dp(4), 0, dp(4));
        watchCard.addView(bleSwitch);
        watchCard.addView(label("手表蓝牙名称包含（默认 OPPO）"));
        watchInput = input("OPPO", InputType.TYPE_CLASS_TEXT);
        watchCard.addView(watchInput);
        TextView watchHint = text("OPPO Watch 若没有开放标准 GATT 心率服务，可让 OPPO 健康 / 自动化 App 通过广播把心率、血氧推给本应用：\n"
                + "adb shell am broadcast -a com.kayi.xiaotianstatus.HEALTH --es token <令牌> --ei hr 72 --ei spo2 98", 9, MUTED, false);
        watchHint.setLineSpacing(dp(3), 1f);
        watchHint.setPadding(0, dp(7), 0, 0);
        watchCard.addView(watchHint);
        root.addView(watchCard);

        Button save = button("保存并启动自动上报", true);
        save.setOnClickListener(v -> saveAndStart());
        root.addView(save);

        Button report = button("立即上报一次", false);
        report.setOnClickListener(v -> {
            startStatusService();
            Toast.makeText(this, "已请求立即上报", Toast.LENGTH_SHORT).show();
        });
        root.addView(report);

        LinearLayout statusCard = card();
        statusCard.addView(section("运行状态"));
        lastStatus = text("尚未启动", 11, TEXT, false);
        lastStatus.setLineSpacing(dp(3), 1f);
        statusCard.addView(lastStatus);
        root.addView(statusCard);

        TextView footer = text("数据只发送到你自己的电脑 · 不经过第三方服务器\npowerd by hanser", 9, 0xFF6F6588, false);
        footer.setGravity(android.view.Gravity.CENTER);
        footer.setPadding(0, dp(18), 0, 0);
        footer.setLineSpacing(dp(3), 1f);
        root.addView(footer);
    }

    private void buildWatchUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(18), dp(14), dp(18));
        scroll.addView(root);
        setContentView(scroll);

        TextView brand = text("✦  HANSER WATCH", 7, ACCENT, true);
        brand.setLetterSpacing(0.15f);
        root.addView(brand);

        TextView title = text("状态上报", 19, TEXT, true);
        title.setPadding(0, dp(6), 0, dp(4));
        root.addView(title);

        TextView subtitle = text("心率 / 血氧 / 电量\n自动发送到电脑", 10, MUTED, false);
        subtitle.setLineSpacing(dp(2), 1f);
        root.addView(subtitle);

        watchStatus = text("正在启动...", 9, TEXT, false);
        watchStatus.setPadding(0, dp(12), 0, dp(8));
        watchStatus.setLineSpacing(dp(2), 1f);
        root.addView(watchStatus);

        Button start = button("启动 / 重启上报", true);
        start.setOnClickListener(v -> {
            stopService(new Intent(this, StatusService.class));
            startStatusService();
            Toast.makeText(this, "已开始", Toast.LENGTH_SHORT).show();
        });
        root.addView(start);

        Button sensor = button("授权身体传感器", false);
        sensor.setOnClickListener(v -> requestBasicPermissions());
        root.addView(sensor);

        Button report = button("立即上报", false);
        report.setOnClickListener(v -> {
            startStatusService();
            Toast.makeText(this, "已请求上报", Toast.LENGTH_SHORT).show();
        });
        root.addView(report);
    }

    private void fillValues() {
        serverInput.setText(Prefs.server(this));
        tokenInput.setText(Prefs.token(this));
        idInput.setText(Prefs.deviceId(this));
        nameInput.setText(Prefs.deviceName(this));
        watchInput.setText(Prefs.watchName(this));
        bleSwitch.setChecked(Prefs.bleEnabled(this));
        int index = Arrays.asList(kinds).indexOf(Prefs.kind(this));
        kindSpinner.setSelection(index < 0 ? 0 : index);
    }

    private void saveAndStart() {
        String server = serverInput.getText().toString().trim();
        String token = tokenInput.getText().toString().trim();
        String id = idInput.getText().toString().trim().toLowerCase(Locale.US);
        String name = nameInput.getText().toString().trim();
        if (!server.startsWith("http://") && !server.startsWith("https://")) {
            toast("电脑地址需要以 http:// 开头");
            return;
        }
        if (token.length() < 6) {
            toast("访问令牌不正确");
            return;
        }
        if (id.length() == 0 || !id.matches("[a-z0-9_-]{2,24}")) {
            toast("设备 ID 只能使用小写字母、数字、- 和 _");
            return;
        }
        int position = kindSpinner.getSelectedItemPosition();
        String kind = kinds[position < 0 ? 0 : position];
        Prefs.save(this, server, token, id, name.length() == 0 ? kindLabels[position] : name,
                kind, bleSwitch.isChecked(), watchInput.getText().toString().trim());
        stopService(new Intent(this, StatusService.class));
        startStatusService();
        Toast.makeText(this, "已保存，开始自动上报", Toast.LENGTH_SHORT).show();
        refreshStatus();
    }

    private void startStatusService() {
        Intent intent = new Intent(this, StatusService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
        else startService(intent);
    }

    private void testConnection() {
        final String server = serverInput.getText().toString().trim();
        final String token = tokenInput.getText().toString().trim();
        testStatus.setTextColor(MUTED);
        testStatus.setText("正在连接...");
        new Thread(() -> {
            ApiClient.Result result = ApiClient.get(server, token, "/healthz");
            runOnUiThread(() -> {
                if (result.ok()) {
                    testStatus.setTextColor(GREEN);
                    testStatus.setText("连接成功 ✓  " + result.body.replace("\n", " "));
                } else {
                    testStatus.setTextColor(PINK);
                    testStatus.setText("连接失败：" + (result.error != null ? result.error : "HTTP " + result.code));
                }
            });
        }).start();
    }

    private void requestBasicPermissions() {
        List<String> permissions = new ArrayList<>();
        if (Prefs.isWatch(this)) {
            permissions.add(Manifest.permission.BODY_SENSORS);
        } else {
            if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            if (Build.VERSION.SDK_INT >= 29) permissions.add(Manifest.permission.ACTIVITY_RECOGNITION);
            if (Build.VERSION.SDK_INT >= 31) {
                permissions.add(Manifest.permission.BLUETOOTH_SCAN);
                permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            } else {
                permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }
        requestPermissions(permissions.toArray(new String[0]), REQ_PERMISSIONS);
    }

    private void refreshStatus() {
        if (Prefs.isWatch(this)) {
            if (watchStatus != null) {
                boolean body = checkSelfPermission(Manifest.permission.BODY_SENSORS)
                        == PackageManager.PERMISSION_GRANTED;
                String last = StatusService.lastSuccessAt > 0
                        ? "上次成功 " + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date(StatusService.lastSuccessAt))
                        : "尚未成功";
                watchStatus.setText(StatusService.lastMessage
                        + "\n" + last
                        + "\n身体传感器：" + (body ? "已授权" : "未授权")
                        + "\n服务器：" + Prefs.server(this));
            }
            return;
        }
        boolean usage = hasUsageAccess();
        boolean notify = Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean activity = Build.VERSION.SDK_INT < 29
                || checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
        boolean ble = Build.VERSION.SDK_INT < 31
                || (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED);
        permissionStatus.setText(
                (usage ? "✓" : "✗") + " 使用情况访问   "
                        + (notify ? "✓" : "✗") + " 通知   "
                        + (activity ? "✓" : "✗") + " 活动识别   "
                        + (ble ? "✓" : "✗") + " 蓝牙");
        String suffix = StatusService.lastSuccessAt > 0
                ? " · 上次成功 " + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date(StatusService.lastSuccessAt))
                : "";
        lastStatus.setText(StatusService.lastMessage + suffix
                + "\n服务地址：" + Prefs.server(this)
                + "\n设备：" + Prefs.deviceName(this) + " (" + Prefs.deviceId(this) + " / " + Prefs.kind(this) + ")");
    }

    private boolean hasUsageAccess() {
        try {
            AppOpsManager ops = (AppOpsManager) getSystemService(APP_OPS_SERVICE);
            if (ops == null) return false;
            int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception ignored) {
            return false;
        }
    }

    private LinearLayout card() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable background = new GradientDrawable();
        background.setColor(CARD);
        background.setCornerRadius(dp(18));
        background.setStroke(dp(1), 0x22FFFFFF);
        layout.setBackground(background);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(16);
        layout.setLayoutParams(params);
        return layout;
    }

    private TextView section(String value) {
        TextView view = text(value, 13, ACCENT, true);
        view.setPadding(0, 0, 0, dp(6));
        return view;
    }

    private TextView label(String value) {
        TextView view = text(value, 10, MUTED, false);
        view.setPadding(0, dp(8), 0, dp(4));
        return view;
    }

    private EditText input(String value, int inputType) {
        EditText input = new EditText(this);
        input.setText(value);
        input.setTextSize(12);
        input.setTextColor(TEXT);
        input.setHintTextColor(0xFF6F6588);
        input.setSingleLine(true);
        input.setInputType(inputType);
        input.setPadding(dp(11), dp(9), dp(11), dp(9));
        GradientDrawable background = new GradientDrawable();
        background.setColor(0xFF110C1D);
        background.setCornerRadius(dp(11));
        background.setStroke(dp(1), 0x22FFFFFF);
        input.setBackground(background);
        return input;
    }

    private Button button(String value, boolean primary) {
        Button button = new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setTextColor(primary ? 0xFF140D22 : TEXT);
        button.setTypeface(Typeface.DEFAULT, primary ? Typeface.BOLD : Typeface.NORMAL);
        button.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable background = new GradientDrawable();
        background.setColor(primary ? ACCENT : CARD_2);
        background.setCornerRadius(dp(12));
        background.setStroke(dp(1), primary ? ACCENT : 0x22FFFFFF);
        button.setBackground(background);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(9);
        button.setLayoutParams(params);
        return button;
    }

    private TextView text(String value, int sizeSp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics()));
    }

    private int statusBarHeight() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : dp(24);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001) {
            android.util.Log.i("XtHealthKit", "permission result=" + resultCode);
            new Thread(() -> HealthKitProbe.probe(this)).start();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (Prefs.isWatch(this)) {
            stopService(new Intent(this, StatusService.class));
            startStatusService();
        }
        refreshStatus();
    }
}
