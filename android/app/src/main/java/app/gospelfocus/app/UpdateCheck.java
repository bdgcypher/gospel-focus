package app.gospelfocus.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONException;

import java.io.File;
import java.io.IOException;

/**
 * The update checker: is there a newer release than the one installed, and if so
 * say so the way Android says things.
 *
 * It runs from two places, both of them cheap: an eight-hourly background job
 * while the app is closed (UpdateCheckWorker), and once each time the app is
 * opened. The two share this class so the decision — newer means a higher
 * version code than the APK's own — is made in one place.
 *
 * Nothing is downloaded here. The notification is an invitation, and the tap on
 * it is what turns into a download and an install (UpdateActivity), because both
 * of those need the reader in front of the screen: an APK cannot be installed
 * without their say-so, and the app has no business spending their data on an
 * update they never asked for.
 *
 * Each release is announced once. The code that was announced is remembered, so
 * a reader who leaves the notification sitting in the shade is not told about
 * the same update again every eight hours; a newer release is a new code, and
 * gets its own notification. Being reminded twice is how an update prompt turns
 * into something people swipe away without reading.
 *
 * Notifications are the one permission this feature needs on Android 13+, and the
 * app asks for it once, on the first launch, rather than every time a check comes
 * back with something to say (see `askForNotificationsOnce`). Until it is
 * granted a check still runs and still finds the release — it just has no way to
 * say so, so it does not mark the release as announced either.
 */
final class UpdateCheck {

    /**
     * Two channels, because they are two different noises.
     *
     * The announcement is high importance so it is a heads-up the reader sees
     * rather than a line they find in the shade later — an update nobody notices
     * until they open Settings is an update nobody installs. The download's
     * progress is low importance: the reader has just tapped the notification,
     * so it belongs in the shade rather than in front of them again.
     *
     * The ids are new rather than reused because Android fixes a channel's
     * importance when it is created and will not raise it afterwards, and
     * "updates" was made at default importance by the build before this one
     * (see ensureChannels, which removes it).
     */
    private static final String CHANNEL_ID = "updates-notices";
    private static final String CHANNEL_ID_PROGRESS = "updates-progress";
    /** The single channel older builds made, at default importance. */
    private static final String LEGACY_CHANNEL_ID = "updates";
    private static final int NOTIFICATION_UPDATE = 7300;
    private static final int NOTIFICATION_PROGRESS = 7301;
    private static final int NOTIFICATION_READY = 7302;

    /** The request code for the notification permission, distinct from the ids above. */
    private static final int REQUEST_NOTIFICATIONS = 7303;

    /**
     * The app's own mark in the status bar: the monochrome layer Android 13's
     * themed launcher icon already uses, drawn as a white book on transparent.
     * A notification icon is tinted and alpha-only, which is exactly what that
     * layer is — so the update arrives under the same sign as the app itself,
     * rather than under a second icon invented for it.
     */
    private static final int SMALL_ICON = R.drawable.ic_launcher_monochrome;

    private static final String PREFS = "gospel-focus:updates";
    private static final String KEY_NOTIFIED = "notified-code";
    private static final String KEY_ASKED = "notifications-asked";

    /**
     * The newest release each check has found, kept so Settings can show it
     * without going to the network every time the page is opened.
     */
    private static final String KEY_LATEST_TAG = "latest-tag";
    private static final String KEY_LATEST_CODE = "latest-code";
    private static final String KEY_LATEST_URL = "latest-url";
    private static final String KEY_LATEST_BYTES = "latest-bytes";
    private static final String KEY_CHECKED_AT = "checked-at";

    private UpdateCheck() {}

    /**
     * The installed build's own version code — the number a release has to beat.
     *
     * Read from the package manager rather than BuildConfig so it is the code of
     * the APK that is actually running: a sideloaded build, a CI build and a
     * debug build all answer honestly, and CI's tag rule is never repeated here.
     */
    @SuppressWarnings("deprecation") // versionCode is the only spelling below API 28.
    static long installedCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            // getLongVersionCode arrived with API 28; below it the int is all
            // there is, and it is the same number.
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            // Cannot happen for our own package; treating it as very old means
            // an update is offered rather than silently withheld.
            return 0;
        }
    }

    /** The installed build's version name, e.g. "3.0.6" — what Settings shows. */
    static String installedVersion(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    /**
     * What Settings shows: this build, the newest release found, and whether
     * one is above the other.
     *
     * Read from the package manager and the last check's notes rather than from
     * the network, so opening Settings never waits on GitHub and works in a
     * tunnel — the row says what was last found, and "Check for updates" is what asks
     * again.
     */
    static final class Status {
        final String installedVersion;
        final long installedCode;
        /** The newest release's number, without its tag's "v"; "" when none found. */
        final String latestVersion;
        final long latestCode;
        final String latestUrl;
        final long latestBytes;
        /** When a check last found a release (epoch ms), or 0. */
        final long checkedAt;

        Status(
            String installedVersion,
            long installedCode,
            String latestVersion,
            long latestCode,
            String latestUrl,
            long latestBytes,
            long checkedAt
        ) {
            this.installedVersion = installedVersion;
            this.installedCode = installedCode;
            this.latestVersion = latestVersion;
            this.latestCode = latestCode;
            this.latestUrl = latestUrl;
            this.latestBytes = latestBytes;
            this.checkedAt = checkedAt;
        }

        /** Whether the newest release is above this build. */
        boolean updateAvailable() {
            return latestCode > installedCode;
        }
    }

    static Status status(Context context) {
        SharedPreferences prefs = prefs(context);
        String tag = prefs.getString(KEY_LATEST_TAG, "");
        return new Status(
            installedVersion(context),
            installedCode(context),
            // Releases are tagged vX.Y.Z; the reader compares it with the
            // version the app shows for itself, which has no "v".
            tag.startsWith("v") ? tag.substring(1) : tag,
            prefs.getLong(KEY_LATEST_CODE, 0L),
            prefs.getString(KEY_LATEST_URL, ""),
            prefs.getLong(KEY_LATEST_BYTES, 0L),
            prefs.getLong(KEY_CHECKED_AT, 0L)
        );
    }

    /**
     * A check the reader asked for, from Settings.
     *
     * Same lookup as the background one, minus the notification: the reader is
     * looking at the answer, and a notification about something already on the
     * screen is noise. The notes are written either way, so the row is current
     * for the next time Settings is opened.
     */
    static void refresh(Context context) throws IOException, JSONException {
        UpdateClient.Release release = UpdateClient.latest();
        if (release != null) record(context, release);
    }

    private static void record(Context context, UpdateClient.Release release) {
        prefs(context)
            .edit()
            .putString(KEY_LATEST_TAG, release.tag)
            .putLong(KEY_LATEST_CODE, release.code)
            .putString(KEY_LATEST_URL, release.apkUrl)
            .putLong(KEY_LATEST_BYTES, release.apkBytes)
            .putLong(KEY_CHECKED_AT, System.currentTimeMillis())
            .apply();
    }

    /**
     * Look for a newer release, and announce it. Returns what was announced, or
     * null when there was nothing to say.
     *
     * Throws IOException when the answer never arrived. The worker swallows it,
     * because a phone without a signal should not report an error about an
     * update — the next window asks again.
     */
    static UpdateClient.Release check(Context context) throws IOException, JSONException {
        UpdateClient.Release release = UpdateClient.latest();
        if (release == null) return null;
        // Noted before anything is announced: the release exists whether or not
        // this build needs it, and Settings reports what was found.
        record(context, release);
        if (release.code <= installedCode(context)) return null;

        SharedPreferences prefs = prefs(context);
        if (prefs.getLong(KEY_NOTIFIED, 0) >= release.code) return null;

        // A reader who has turned notifications off hears nothing from here. The
        // release is deliberately not recorded as announced: if they allow
        // notifications later, the next check is the first one that could reach
        // them.
        if (!notificationsAllowed(context)) return null;

        announce(context, release);
        prefs.edit().putLong(KEY_NOTIFIED, release.code).apply();
        return release;
    }

    /**
     * Forget that the release was announced, so the next check can offer it
     * again. Called when a download fails: a reader whose tap landed in a tunnel
     * has not been told about anything usable yet, and the alternative is that
     * they hear nothing until the next release.
     */
    static void forgetAnnouncement(Context context) {
        prefs(context).edit().remove(KEY_NOTIFIED).apply();
    }

    /** "Gospel Focus / Update available", opening the download. */
    private static void announce(Context context, UpdateClient.Release release) {
        NotificationManager manager = ensureChannels(context);
        if (manager == null) return;

        PendingIntent tap = PendingIntent.getActivity(
            context,
            NOTIFICATION_UPDATE,
            UpdateActivity.downloadIntent(context, release),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(SMALL_ICON)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(context.getString(R.string.update_available))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();

        manager.notify(NOTIFICATION_UPDATE, notification);
    }

    /** The download in progress, so a backgrounded app still shows what it is doing. */
    static void showProgress(Context context, int percent) {
        if (!notificationsAllowed(context)) return;
        NotificationManager manager = ensureChannels(context);
        if (manager == null) return;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID_PROGRESS)
            .setSmallIcon(SMALL_ICON)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(percent > 0
                ? context.getString(R.string.update_downloading_percent, percent)
                : context.getString(R.string.update_downloading))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setProgress(100, Math.max(0, percent), percent <= 0);

        manager.notify(NOTIFICATION_PROGRESS, builder.build());
    }

    static void clearProgress(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_PROGRESS);
    }

    /**
     * "Update ready" — for the one step Android will not let the app take on its
     * own: the reader has to allow installs from this app first, and if they
     * back out of that screen, the file is still waiting and this is how they
     * find it again.
     */
    static void readyToInstall(Context context, File apk) {
        if (!notificationsAllowed(context)) return;
        NotificationManager manager = ensureChannels(context);
        if (manager == null) return;

        PendingIntent tap = PendingIntent.getActivity(
            context,
            NOTIFICATION_READY,
            UpdateActivity.installIntent(context, apk),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(SMALL_ICON)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(context.getString(R.string.update_ready))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();

        manager.notify(NOTIFICATION_READY, notification);
    }

    /**
     * Ask for the notification permission once, on the first launch.
     *
     * The app's other notifications ask only when the reader switches on the
     * reminder; this one has no such switch, because an update notice is not a
     * choice they make — so it is asked for once, up front, and never again from
     * here. Android remembers the answer, and a reader who says no has said it
     * for good unless they change it in the system settings.
     */
    static void askForNotificationsOnce(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        SharedPreferences prefs = prefs(activity);
        if (prefs.getBoolean(KEY_ASKED, false)) return;
        prefs.edit().putBoolean(KEY_ASKED, true).apply();
        activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQUEST_NOTIFICATIONS);
    }

    /** Whether the system will actually show what this class posts. */
    private static boolean notificationsAllowed(Context context) {
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * The two channels, made once.
     *
     * High importance for the announcement is the whole of the heads-up: the
     * channel's importance, not the notification's priority, is what decides
     * whether Android shows it in front of the reader. Progress rides a low
     * channel so a download announces itself once, not once per percent.
     *
     * The channel the first builds made is removed: it exists on the reader's
     * phone at default importance, which is why an update only ever appeared in
     * the shade, and Android would not let it be raised.
     */
    private static NotificationManager ensureChannels(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel notices = new NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.update_channel),
                NotificationManager.IMPORTANCE_HIGH
            );
            notices.setDescription(context.getString(R.string.update_channel_description));
            manager.createNotificationChannel(notices);

            NotificationChannel progress = new NotificationChannel(
                CHANNEL_ID_PROGRESS,
                context.getString(R.string.update_progress_channel),
                NotificationManager.IMPORTANCE_LOW
            );
            progress.setDescription(context.getString(R.string.update_progress_channel_description));
            manager.createNotificationChannel(progress);

            manager.deleteNotificationChannel(LEGACY_CHANNEL_ID);
        }
        return manager;
    }
}
