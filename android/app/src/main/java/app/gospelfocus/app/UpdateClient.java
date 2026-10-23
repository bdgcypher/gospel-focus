package app.gospelfocus.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * The two network calls the update checker makes: ask GitHub for the newest
 * release, and fetch the APK that release points at.
 *
 * GitHub is the store this app ships from — the APK is attached to the releases
 * page by CI (see .github/workflows/android-apk.yml), so the releases API is
 * the one place that knows both "what is the latest version" and "where is its
 * APK". No second manifest on a server to keep in step.
 *
 * Both calls fail quietly by throwing IOException, and every caller treats that
 * as an ordinary "not now": a phone with no signal, or a GitHub outage, means
 * the reader hears nothing rather than something wrong.
 *
 * The APK URL is checked against the release-download prefix for this
 * repository before it is fetched. The JSON comes from GitHub over HTTPS, but
 * the download is the one place the app will follow a URL out of a document and
 * then hand the result to Android's installer, so it is pinned to this repo's
 * own release path rather than trusted to be https.
 */
final class UpdateClient {

    static final String REPO = "bdgcypher/gospel-focus";

    private static final String LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
    private static final String ASSET_PREFIX = "https://github.com/" + REPO + "/releases/download/";
    private static final String USER_AGENT = "GospelFocus-Android";

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int BUFFER = 64 * 1024;

    private UpdateClient() {}

    /** One release, as much of it as the checker needs. */
    static final class Release {
        final String tag;
        final int code;
        final String apkUrl;
        final long apkBytes;

        Release(String tag, int code, String apkUrl, long apkBytes) {
            this.tag = tag;
            this.code = code;
            this.apkUrl = apkUrl;
            this.apkBytes = apkBytes;
        }
    }

    /** Where a downloaded APK waits between the download and the installer. */
    static File directory(Context context) {
        return new File(context.getFilesDir(), "updates");
    }

    /**
     * The newest published release, or null when there isn't a usable one.
     *
     * Null covers every ordinary answer that is not an update: no release yet,
     * a draft or prerelease, a tag that is not vX.Y.Z, and a release with no APK
     * attached. The caller then has nothing to say, which is the right thing.
     */
    static Release latest() throws IOException, JSONException {
        HttpURLConnection connection = open(LATEST);
        try {
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_NOT_FOUND) return null;
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IOException("GitHub answered " + status);
            }

            JSONObject json = new JSONObject(read(connection.getInputStream()));
            if (json.optBoolean("draft") || json.optBoolean("prerelease")) return null;

            String tag = json.optString("tag_name", "");
            int code = UpdateVersion.code(tag);
            if (code == 0) return null;

            String url = null;
            long bytes = 0;
            JSONArray assets = json.optJSONArray("assets");
            for (int i = 0; assets != null && i < assets.length(); i++) {
                JSONObject asset = assets.optJSONObject(i);
                if (asset == null) continue;
                String name = asset.optString("name", "");
                String candidate = asset.optString("browser_download_url", "");
                if (!name.toLowerCase(Locale.US).endsWith(".apk")) continue;
                if (!candidate.startsWith(ASSET_PREFIX)) continue;
                url = candidate;
                bytes = asset.optLong("size", 0L);
                // CI uploads exactly one, named for the build; take it and stop.
                if ("app-release.apk".equals(name)) break;
            }
            if (url == null) return null;

            return new Release(tag, code, url, bytes);
        } finally {
            connection.disconnect();
        }
    }

    /** Told how far along the download is, as a percentage. */
    interface Progress {
        void onProgress(int percent);
    }

    /**
     * Fetch a release's APK into the app's own files, and return it.
     *
     * Written to a `.part` file and renamed only once it is whole, so a download
     * that dies halfway can never be handed to the installer as an update. Any
     * earlier APK in the directory goes first: the app keeps one update at a
     * time, and a stale one would only take space.
     */
    static File download(Context context, Release release, Progress progress) throws IOException {
        File directory = directory(context);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("There is no room to keep the update");
        }
        File[] previous = directory.listFiles();
        if (previous != null) {
            for (File file : previous) {
                // Failure is fine: a file that cannot be removed is overwritten
                // or ignored below, and is not worth aborting an update over.
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }

        File target = new File(directory, "gospel-focus-" + release.code + ".apk");
        File part = new File(directory, target.getName() + ".part");

        HttpURLConnection connection = open(release.apkUrl);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IOException("The download was refused (" + status + ")");
            }

            long total = release.apkBytes > 0 ? release.apkBytes : connection.getContentLengthLong();
            try (
                InputStream in = new BufferedInputStream(connection.getInputStream());
                OutputStream out = new BufferedOutputStream(new FileOutputStream(part))
            ) {
                byte[] buffer = new byte[BUFFER];
                long done = 0;
                int lastPercent = -1;
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    done += read;
                    if (total > 0) {
                        int percent = (int) Math.min(100, done * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            progress.onProgress(percent);
                        }
                    }
                }
            } catch (IOException e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                throw e;
            }
        } finally {
            connection.disconnect();
        }

        if (!part.renameTo(target)) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            throw new IOException("The update couldn't be saved");
        }
        return target;
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        // GitHub refuses API calls without one; the binary download follows the
        // same rule.
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        // The APK is already compressed, and asking for it whole keeps the
        // content length — which is what the progress bar counts against.
        connection.setRequestProperty("Accept-Encoding", "identity");
        return connection;
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString("UTF-8");
        }
    }
}
