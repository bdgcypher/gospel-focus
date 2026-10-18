package app.gospelfocus.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Saves a file straight into the device's Downloads folder.
 *
 * The WebView has no download manager, so on Android the only way to reach the
 * user's own storage without a chooser is to go through the platform: on Android
 * 10 and newer a MediaStore Downloads row (no permission needed, the file shows
 * up in the Files app), and on Android 9 and older a file written into the
 * public Downloads directory, which needs the user's one-time storage
 * permission. Either way the file is written where the user asked to keep it,
 * with no share sheet in between.
 *
 * The JavaScript half is in lib/native-files.ts.
 */
@CapacitorPlugin(
    name = "FileDownload",
    permissions = {
        // Android 9 and older only — MediaStore owns Downloads from API 29 on.
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class FileDownloadPlugin extends Plugin {

    static final String STORAGE_ALIAS = "storage";

    /** Where the saved file landed, relative to shared storage. */
    private static final String DOWNLOADS = "Downloads";

    private static final String DEFAULT_MIME = "application/octet-stream";

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.trim().isEmpty()) {
            call.reject("A file name is required");
            return;
        }
        if (call.getString("base64") == null) {
            call.reject("The file's contents are required");
            return;
        }

        if (needsStoragePermission() && getPermissionState(STORAGE_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(STORAGE_ALIAS, call, "storagePermissionCallback");
            return;
        }

        write(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState(STORAGE_ALIAS) != PermissionState.GRANTED) {
            call.reject("Storage permission is needed to save files to Downloads", "PERMISSION_DENIED");
            return;
        }
        write(call);
    }

    private void write(PluginCall call) {
        String name = DownloadNames.sanitize(call.getString("name"));
        String mime = call.getString("mime", DEFAULT_MIME);
        byte[] bytes;
        try {
            bytes = Base64.decode(call.getString("base64"), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("The file's contents couldn't be decoded");
            return;
        }

        try {
            String savedAs = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? DownloadsCollection.save(getContext(), name, mime, bytes)
                : saveToPublicFolder(name, mime, bytes);

            JSObject result = new JSObject();
            result.put("name", savedAs);
            result.put("location", DOWNLOADS);
            call.resolve(result);
        } catch (Exception e) {
            String message = e.getLocalizedMessage();
            call.reject(message == null || message.isEmpty() ? "The file couldn't be saved" : message);
        }
    }

    /**
     * Android 9 and older: Downloads is ordinary shared storage, so the file is
     * written there directly and the media scanner is asked to index it (which
     * is what makes it appear in the Files app and in Downloads listings).
     */
    private String saveToPublicFolder(String name, String mime, byte[] bytes) throws IOException {
        File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) {
            throw new IOException("This device has no Downloads folder");
        }
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Couldn't create the Downloads folder");
        }

        String savedAs = DownloadNames.unique(name, (candidate) -> new File(directory, candidate).exists());
        File file = new File(directory, savedAs);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }

        MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
        return savedAs;
    }

    private static boolean needsStoragePermission() {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.P;
    }

    /**
     * Android 10+ hands Downloads to MediaStore, which needs no permission: the
     * row is inserted pending, the bytes are written, and the row is published.
     * Everything API-29-only lives in here so the rest of the plugin still loads
     * on Android 7-9.
     */
    private static final class DownloadsCollection {

        private DownloadsCollection() {}

        static String save(Context context, String name, String mime, byte[] bytes) throws IOException {
            ContentResolver resolver = context.getContentResolver();
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            String savedAs = DownloadNames.unique(name, (candidate) -> exists(resolver, collection, candidate));

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, savedAs);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            // Pending until the bytes are all there, so nothing ever sees a
            // half-written backup.
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri uri = resolver.insert(collection, values);
            if (uri == null) {
                throw new IOException("Android wouldn't create a file in Downloads");
            }

            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    throw new IOException("Android wouldn't open the new file for writing");
                }
                out.write(bytes);
            } catch (IOException e) {
                resolver.delete(uri, null, null);
                throw e;
            }

            ContentValues published = new ContentValues();
            published.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, published, null, null);
            return savedAs;
        }

        private static boolean exists(ContentResolver resolver, Uri collection, String displayName) {
            String[] projection = { MediaStore.MediaColumns._ID };
            String selection = MediaStore.MediaColumns.DISPLAY_NAME + " = ?";
            try (Cursor cursor = resolver.query(collection, projection, selection, new String[] { displayName }, null)) {
                return cursor != null && cursor.getCount() > 0;
            } catch (Exception e) {
                // If the query itself fails, let MediaStore's own de-duplication
                // have the last word rather than refusing to save.
                return false;
            }
        }
    }
}
