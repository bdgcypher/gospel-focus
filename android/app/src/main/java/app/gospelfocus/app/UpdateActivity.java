package app.gospelfocus.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * What a tap on "Update available" turns into: download the release's APK, then
 * hand it to Android's installer.
 *
 * It has no screen of its own — the window is transparent and the only thing the
 * reader sees is the progress in the notification shade — because this is not a
 * place in the app, it is the last step of a notification. The app is a reading
 * app; an update screen with a spinner would be one more thing between the reader
 * and the verse.
 *
 * It is an Activity rather than a background service for one Android reason: from
 * Android 10 on, an app may not start an activity from the background, and the
 * installer is an activity. A foreground service that finishes a download two
 * minutes after the tap would be refused the start and left with no way to finish
 * the job. An activity that is on screen when the download lands is allowed to
 * open the installer, so the tap that began this ends in the install prompt,
 * which is what it promised.
 *
 * Two things are left to the reader, because Android insists: allowing this app
 * to install packages (once per device, on the settings screen this opens when it
 * is missing), and confirming the install in Android's own prompt. Neither is
 * something the app can or should do silently.
 *
 * The APK is kept under the app's own files (no storage permission, and nothing
 * to clean up in Downloads). If the install permission is refused, the file
 * waits and a "ready to install" notification reopens this activity later.
 */
public class UpdateActivity extends Activity {

    private static final String EXTRA_URL = "apk-url";
    private static final String EXTRA_CODE = "apk-code";
    private static final String EXTRA_BYTES = "apk-bytes";
    private static final String EXTRA_FILE = "apk-file";

    /** The unknown-sources screen's result code. */
    private static final int REQUEST_INSTALL = 7304;

    private final ExecutorService downloader = Executors.newSingleThreadExecutor();
    /** The downloaded APK, kept so a trip to the settings screen can resume. */
    private File apk;
    /**
     * Whether this activity is the one on screen.
     *
     * It decides how a finished download ends: on screen, the installer opens
     * from here at once; behind the lock screen or another app, Android 10+
     * would refuse a start from the background, so the download ends as a
     * notification instead (see the completion below).
     */
    private boolean resumed;

    /** The notification's own intent: download this release. */
    static Intent downloadIntent(Context context, UpdateClient.Release release) {
        return new Intent(context, UpdateActivity.class)
            .putExtra(EXTRA_URL, release.apkUrl)
            .putExtra(EXTRA_CODE, release.code)
            .putExtra(EXTRA_BYTES, release.apkBytes);
    }

    /** The retry after a refused install permission: install this file. */
    static Intent installIntent(Context context, File apk) {
        return new Intent(context, UpdateActivity.class).putExtra(EXTRA_FILE, apk.getAbsolutePath());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String path = getIntent().getStringExtra(EXTRA_FILE);
        if (path != null) {
            File waiting = new File(path);
            if (waiting.isFile()) {
                install(waiting);
                return;
            }
            // The file went away (the system cleaned the cache, or a newer
            // download replaced it): nothing to install, and nothing to say.
            finish();
            return;
        }

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) {
            finish();
            return;
        }

        startDownload(new UpdateClient.Release(
            "",
            getIntent().getIntExtra(EXTRA_CODE, 0),
            url,
            getIntent().getLongExtra(EXTRA_BYTES, 0L)
        ));
    }

    private void startDownload(final UpdateClient.Release release) {
        UpdateCheck.showProgress(this, 0);
        downloader.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final File file = UpdateClient.download(UpdateActivity.this, release, new UpdateClient.Progress() {
                        @Override
                        public void onProgress(int percent) {
                            UpdateCheck.showProgress(UpdateActivity.this, percent);
                        }
                    });
                    UpdateCheck.clearProgress(UpdateActivity.this);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (!resumed) {
                                // The reader left while it downloaded (or the
                                // screen went off). Starting the installer from
                                // here would be a background activity start,
                                // which Android refuses; the notification is the
                                // tap that still works.
                                UpdateCheck.readyToInstall(UpdateActivity.this, file);
                                finish();
                                return;
                            }
                            install(file);
                        }
                    });
                } catch (final Exception e) {
                    UpdateCheck.clearProgress(UpdateActivity.this);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            // Nothing was written that could be installed, so
                            // there is nothing to retry by hand. The offer is
                            // put back so the next check (a launch, or the
                            // eight-hourly job) can announce it again rather
                            // than the reader missing it until the next release.
                            UpdateCheck.forgetAnnouncement(UpdateActivity.this);
                            Toast.makeText(UpdateActivity.this, R.string.update_download_failed, Toast.LENGTH_LONG).show();
                            finish();
                        }
                    });
                }
            }
        });
    }

    /**
     * Hand the APK to Android's installer.
     *
     * The file is shared through the app's FileProvider (declared in the
     * manifest, with `updates/` in its paths) because a `file://` URI has been
     * refused by the installer since Android 7. The read grant rides on the
     * intent, so Android can read the one file it is installing and nothing else.
     */
    private void install(File file) {
        apk = file;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            askToInstall();
            return;
        }

        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
        Intent installer = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(installer);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.update_install_unavailable, Toast.LENGTH_LONG).show();
        }
        finish();
    }

    /**
     * Send the reader to Android's "install unknown apps" screen for this app.
     *
     * The screen is per-app on Android 8 and newer, and it is the only way to
     * grant what the installer needs. It comes back as a result, so the granted
     * case resumes the install without the reader having to tap anything twice.
     */
    @RequiresApi(Build.VERSION_CODES.O)
    private void askToInstall() {
        Intent settings = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getPackageName())
        );
        try {
            startActivityForResult(settings, REQUEST_INSTALL);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.update_install_unavailable, Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_INSTALL) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (apk == null) {
            finish();
            return;
        }
        // The result code is not the answer here: on some devices the settings
        // screen reports a cancel even after the toggle is switched on, so the
        // permission itself is what is asked.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getPackageManager().canRequestPackageInstalls()) {
            install(apk);
        } else {
            UpdateCheck.readyToInstall(this, apk);
            finish();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
    }

    @Override
    protected void onPause() {
        resumed = false;
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        downloader.shutdownNow();
        UpdateCheck.clearProgress(this);
        super.onDestroy();
    }
}
