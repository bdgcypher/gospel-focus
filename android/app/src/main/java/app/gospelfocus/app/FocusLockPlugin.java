package app.gospelfocus.app;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The bridge between the Focus page and the native lock.
 *
 * Three things the web half cannot do for itself:
 *
 * - **List the apps that can be held.** A browser has no idea what is installed;
 *   the picker has to be built from the launcher's own view of the device, with
 *   package ids that the accessibility service can actually match.
 * - **Say whether the accessibility service is on.** The service can only gate
 *   anything once the reader has switched it on in Android's settings, and the
 *   page has to be able to tell the difference between "on" and "armed but
 *   blind".
 * - **Write the lock where the service reads it.** The service may run when the
 *   app does not (a held app opened from the launcher after a reboot), so the
 *   state has to live in SharedPreferences rather than the WebView's storage.
 *   The same is true of how the gate is drawn: the reader's theme and skin are
 *   the page's to know and the gate's to wear (`setAppearance`).
 *
 * Everything is a plain read or a plain write: the plugin never decides whether
 * an app may be blocked. That rule is FocusLockState's, so the gate and the page
 * cannot drift apart.
 *
 * The JavaScript half is lib/native-focus.ts.
 */
@CapacitorPlugin(name = "FocusLock")
public class FocusLockPlugin extends Plugin {

    /** A ceiling on the synced list, matching the web store's own limit (lib/focus.ts). */
    private static final int MAX_PACKAGES = 200;

    /**
     * Whether the reader has turned the service on.
     *
     * Read from the accessibility manager rather than from the settings string:
     * the manager reports the services the system actually considers enabled,
     * which is the same list the gate depends on, while the settings value can
     * carry a service that failed to start.
     */
    private boolean isServiceEnabled() {
        AccessibilityManager manager =
            (AccessibilityManager) getContext().getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null) return false;

        List<AccessibilityServiceInfo> enabled =
            manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        String pkg = getContext().getPackageName();
        String service = FocusAccessibilityService.class.getName();

        for (AccessibilityServiceInfo info : enabled) {
            ResolveInfo resolve = info.getResolveInfo();
            if (resolve == null) continue;
            ServiceInfo details = resolve.serviceInfo;
            if (details != null && pkg.equals(details.packageName) && service.equals(details.name)) {
                return true;
            }
        }
        return false;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("enabled", isServiceEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            call.reject("This device has no accessibility settings screen");
            return;
        }
        call.resolve();
    }

    /**
     * Every app with a launcher icon, by label.
     *
     * Launcher apps only: an app the reader cannot open from the home screen is
     * not one they can be distracted by, and it keeps the list to the few hundred
     * rows a person recognises instead of every service package on the device.
     *
     * Querying the launcher intent needs the `<queries>` entry in the manifest on
     * Android 11 and newer; without it the list comes back empty rather than
     * failing, which is why it is declared there.
     */
    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager manager = getContext().getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN);
        launcher.addCategory(Intent.CATEGORY_LAUNCHER);

        List<ResolveInfo> resolved;
        try {
            resolved = manager.queryIntentActivities(launcher, 0);
        } catch (Exception e) {
            call.reject("The app list could not be read");
            return;
        }

        Map<String, String> byPackage = new HashMap<>();
        String self = getContext().getPackageName();
        for (ResolveInfo info : resolved) {
            ActivityInfo activity = info.activityInfo;
            if (activity == null) continue;
            String pkg = activity.packageName;
            if (pkg == null || pkg.equals(self) || byPackage.containsKey(pkg)) continue;
            // Settings is where the service is turned off, so it is never offered
            // as something to hold (see FocusLockState.SETTINGS_PACKAGE).
            if (pkg.equals(FocusLockState.SETTINGS_PACKAGE)) continue;
            CharSequence label = info.loadLabel(manager);
            String name = label == null ? "" : label.toString().trim();
            byPackage.put(pkg, name.isEmpty() ? pkg : name);
        }

        List<Map.Entry<String, String>> apps = new ArrayList<>(byPackage.entrySet());
        Collections.sort(apps, new Comparator<Map.Entry<String, String>>() {
            @Override
            public int compare(Map.Entry<String, String> a, Map.Entry<String, String> b) {
                int byLabel = String.CASE_INSENSITIVE_ORDER.compare(a.getValue(), b.getValue());
                return byLabel != 0 ? byLabel : a.getKey().compareTo(b.getKey());
            }
        });

        JSArray list = new JSArray();
        for (Map.Entry<String, String> app : apps) {
            JSObject entry = new JSObject();
            entry.put("package", app.getKey());
            entry.put("label", app.getValue());
            list.put(entry);
        }

        JSObject result = new JSObject();
        result.put("apps", list);
        call.resolve(result);
    }

    /**
     * Write the lock for the service to read, then apply it to the screen in front
     * of the reader.
     *
     * The web store stays authoritative: it sends the lock's state as it stands
     * (set up, the day the goal was met, the day it was re-armed, the held
     * packages, the bypass deadline), and the service applies the same rules to
     * it that the page does. Nothing here decides whether an app may be blocked —
     * that is FocusLockState's job, so the gate and the page cannot drift.
     *
     * The day keys are what let the gate re-arm itself at midnight while the app
     * is closed; a single `armed` flag could not.
     */
    @PluginMethod
    public void sync(PluginCall call) {
        JSArray packages = call.getArray("packages");
        Set<String> set = new HashSet<>();
        if (packages != null) {
            for (int i = 0; i < packages.length() && set.size() < MAX_PACKAGES; i++) {
                String pkg;
                try {
                    pkg = packages.getString(i);
                } catch (JSONException e) {
                    continue;
                }
                if (pkg == null) continue;
                pkg = pkg.trim();
                if (!pkg.isEmpty()) set.add(pkg);
            }
        }

        boolean lockOn = Boolean.TRUE.equals(call.getBoolean("lockOn", false));
        String earnedDay = dayKey(call.getString("earnedDay"));
        String relockedDay = dayKey(call.getString("relockedDay"));
        Long until = call.getLong("bypassUntil", 0L);
        long bypassUntil = until == null ? 0L : Math.max(0L, until);

        FocusLockState.write(getContext(), set, lockOn, earnedDay, relockedDay, bypassUntil);
        FocusAccessibilityService.refreshIfRunning();
        call.resolve();
    }

    /**
     * How the gate should be drawn, so it looks like the app the reader is in.
     *
     * The two choices are the page's, not the gate's: light or dark is
     * next-themes', and focused or playful is a preference of the app's own. The
     * service cannot read either — it draws while the app is not in front — so
     * they are written to GateAppearance here, and a gate already on the screen
     * is redrawn at once rather than only from the next window change.
     *
     * Nothing here decides the colours: missing or unknown values fall back to the
     * device's night mode in the focused skin (FocusAccessibilityService.palette).
     */
    @PluginMethod
    public void setAppearance(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        boolean playful = Boolean.TRUE.equals(call.getBoolean("playful", false));
        boolean follow = Boolean.TRUE.equals(call.getBoolean("follow", false));

        GateAppearance.write(getContext(), dark, playful, follow);
        FocusAccessibilityService.restyleIfRunning();
        call.resolve();
    }

    /**
     * A day key from the web store, or "" for anything that is not one.
     *
     * The format is checked rather than trusted: the value is compared against
     * the device's own date, and a malformed string would simply never match —
     * harmless, but it would leave a lock holding for no stated reason. An empty
     * string is the honest answer to "no day", which is also what an older build
     * sends.
     */
    private static String dayKey(String value) {
        return value != null && value.matches("\\d{4}-\\d{2}-\\d{2}") ? value : "";
    }
}
