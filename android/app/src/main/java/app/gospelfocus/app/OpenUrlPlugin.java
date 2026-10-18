package app.gospelfocus.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens a URL with an external Android app via ACTION_VIEW.
 *
 * Used to hand Gospel Library links to the Gospel Library app through its
 * official custom scheme (gospellibrary://content/...). Rejects when no
 * installed app can handle the URL so JavaScript can fall back to the
 * in-app browser (e.g. when Gospel Library is not installed).
 */
@CapacitorPlugin(name = "OpenUrl")
public class OpenUrlPlugin extends Plugin {

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A url is required");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }

        try {
            // System-side resolution, so no <queries> entry is needed; an
            // unresolvable scheme surfaces as ActivityNotFoundException.
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No installed app can open " + url, "NO_APP");
        }
    }
}
