package app.gospelfocus.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * The lock as the native side keeps it: which apps are held, whether the lock is
 * set up, which day the study was done, and when a hand bypass runs out.
 *
 * The web app owns all of this — it is the only place the lock can be switched,
 * the day's study counted, and a bypass chosen (lib/focus.ts) — and writes it
 * here through FocusLockPlugin whenever any of it changes. The accessibility
 * service reads the same file, so the gate and the page can never disagree.
 *
 * SharedPreferences rather than the WebView's storage for two reasons: the
 * service may be alive when the app is not (a held app opened from the launcher
 * with Gospel Focus closed), and the service is started by the system after a
 * reboot, long before any page exists. It is the same process as the app, so no
 * multi-process handling is needed.
 *
 * Days rather than an "armed" boolean, because the gate has to keep working
 * while the app is asleep. If the reader earned yesterday and never opened the
 * app this morning, a stored `armed = false` would leave the gate down until
 * they did. With `earnedDay` stored, yesterday's key stops matching at local
 * midnight and the lock is on again by itself. A bypass is stored as the instant
 * it ends (epoch milliseconds, 0 for none) for the same reason: the gate has to
 * close at the deadline without the app running.
 */
final class FocusLockState {

    /** The preferences file both halves read. */
    static final String PREFS = "focus_lock";

    private static final String LOCK_ON = "lockOn";
    private static final String EARNED_DAY = "earnedDay";
    private static final String RELOCKED_DAY = "relockedDay";
    private static final String BYPASS_UNTIL = "bypassUntil";
    private static final String PACKAGES = "packages";

    /**
     * The settings app is never held, whatever the list says.
     *
     * Not paternalism: it is where the reader turns this service off. A gate over
     * it would leave the lock with no way out but uninstalling the app, which is
     * not a lock a person should be able to build by tapping a row.
     */
    static final String SETTINGS_PACKAGE = "com.android.settings";

    private FocusLockState() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isLockOn(Context context) {
        return prefs(context).getBoolean(LOCK_ON, false);
    }

    static String earnedDay(Context context) {
        return prefs(context).getString(EARNED_DAY, "");
    }

    static String relockedDay(Context context) {
        return prefs(context).getString(RELOCKED_DAY, "");
    }

    /** When the hand bypass runs out, or 0 for none. */
    static long bypassUntil(Context context) {
        return prefs(context).getLong(BYPASS_UNTIL, 0L);
    }

    /**
     * The held apps, by package.
     *
     * Copied out of the preferences: `getStringSet` hands back the live set, and
     * modifying it is undefined (and throws on some versions).
     */
    static Set<String> packages(Context context) {
        return new HashSet<>(prefs(context).getStringSet(PACKAGES, Collections.emptySet()));
    }

    static void write(Context context, Set<String> packages, boolean lockOn, String earnedDay,
            String relockedDay, long bypassUntil) {
        prefs(context)
            .edit()
            .putStringSet(PACKAGES, new HashSet<>(packages))
            .putBoolean(LOCK_ON, lockOn)
            .putString(EARNED_DAY, earnedDay)
            .putString(RELOCKED_DAY, relockedDay)
            .putLong(BYPASS_UNTIL, bypassUntil)
            .apply();
    }

    /**
     * Whether the lock is holding right now, before the app list is considered.
     *
     * The same three rules lib/focus.ts applies, in the same order: an earned day
     * opens it unless the reader re-armed it since, a bypass opens it until its
     * deadline, and otherwise a lock that is set up is holding.
     *
     * The day is the device's own, matching the app's local day keys (lib/daily.ts).
     */
    static boolean isHeld(Context context, long now) {
        if (!isLockOn(context)) return false;
        String today = dayKey();
        if (earnedDay(context).equals(today) && !relockedDay(context).equals(today)) return false;
        return now >= bypassUntil(context);
    }

    /**
     * Whether the gate should be drawn over `pkg` right now.
     *
     * The lock has to be holding, the app has to be one the reader chose, and it
     * must not be an app the gate would trap them in. An armed lock with no apps
     * chosen holds nothing, which is why the list is a condition rather than a
     * detail.
     *
     * The app's own package is never blocked, and neither is Settings: a gate over
     * either would lock the reader out of the two places this can be switched off.
     */
    static boolean shouldBlock(Context context, String pkg, long now) {
        if (pkg == null || pkg.isEmpty()) return false;
        if (pkg.equals(context.getPackageName())) return false;
        if (pkg.equals(SETTINGS_PACKAGE)) return false;
        if (!isHeld(context, now)) return false;
        return packages(context).contains(pkg);
    }

    /**
     * Today's local day as "yyyy-MM-dd", the shape the web store writes.
     *
     * Package-private because the Gospel Library's minutes are kept per day too
     * (GospelStudy), and two spellings of the same day key would be one place for
     * them to disagree at midnight.
     */
    static String dayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }
}
