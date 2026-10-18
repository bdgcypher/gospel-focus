package app.gospelfocus.app;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Puts an image file on the system clipboard.
 *
 * The WebView has no way to copy an image: navigator.clipboard.write() with an
 * image/png ClipboardItem is unimplemented there, so "Copy image" silently did
 * nothing on device. This does what Chrome's own "Copy image" does — it hands
 * the pasting app a content:// URI with an image/* clip description, so the card
 * can be pasted into messages, notes, and anything else that takes an image.
 *
 * The URI comes from the FileProvider declared in the app manifest, whose paths
 * already cover the app cache the JavaScript writes the PNG into.
 */
@CapacitorPlugin(name = "ImageClipboard")
public class ImageClipboardPlugin extends Plugin {

    @PluginMethod
    public void copyImage(PluginCall call) {
        String uri = call.getString("uri");
        String mime = call.getString("mime", "image/png");

        if (uri == null || uri.isEmpty()) {
            call.reject("A file uri is required");
            return;
        }

        Context context = getContext();
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            call.reject("The clipboard is not available on this device");
            return;
        }

        try {
            File file = new File(Uri.parse(uri).getPath());
            if (!file.exists()) {
                call.reject("The image is no longer on disk: " + uri, "MISSING_FILE");
                return;
            }

            Uri contentUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                file
            );

            // The description (not the provider's guess) is what the pasting
            // app filters on, so set the type explicitly.
            ClipDescription description = new ClipDescription("Gospel Focus", new String[] { mime });
            ClipData clip = new ClipData(description, new ClipData.Item(contentUri));
            clipboard.setPrimaryClip(clip);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getLocalizedMessage());
        }
    }
}
