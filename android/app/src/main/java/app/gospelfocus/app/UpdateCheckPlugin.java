package app.gospelfocus.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The update checker, for the settings page.
 *
 * Three calls, one for each thing the row does: read what was last found, ask
 * again, and take the update it found. Everything the row shows comes from
 * `status`, which is answered from the notes the last check left behind — the
 * page must open instantly, and a reader in a tunnel should see the version
 * they are on rather than a spinner. `check` is the only one that goes to the
 * network, and it runs off the bridge's thread so a slow answer never holds up
 * the page.
 *
 * `install` launches the same transparent activity the notification's tap does
 * (UpdateActivity), so downloading and handing the APK to Android's installer is
 * one implementation no matter where the update is taken from.
 *
 * The JavaScript half is lib/native-updates.ts.
 */
@CapacitorPlugin(name = "UpdateCheck")
public class UpdateCheckPlugin extends Plugin {

    /** One check at a time; a second tap waits for the first rather than racing it. */
    private static final ExecutorService CHECKS = Executors.newSingleThreadExecutor();

    /** What was found last, without asking GitHub anything. */
    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(report(UpdateCheck.status(getContext())));
    }

    /** Ask GitHub now, note the answer, and give it back to the page. */
    @PluginMethod
    public void check(PluginCall call) {
        CHECKS.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    UpdateCheck.refresh(getContext());
                    call.resolve(report(UpdateCheck.status(getContext())));
                } catch (Exception e) {
                    // No network, GitHub down, or a release that could not be
                    // read: the page says it could not check, and keeps showing
                    // what the last check found.
                    call.reject("Couldn't reach GitHub", e);
                }
            }
        });
    }

    /**
     * Take the update that was found.
     *
     * The release is rebuilt from the notes rather than fetched again: the reader
     * has just been shown this version, and asking the network a second time
     * would either repeat it or (if a newer one landed in between) start a
     * download they were not told about.
     */
    @PluginMethod
    public void install(PluginCall call) {
        UpdateCheck.Status status = UpdateCheck.status(getContext());
        if (!status.updateAvailable() || status.latestUrl.isEmpty()) {
            call.reject("There is no update to install");
            return;
        }

        UpdateClient.Release release = new UpdateClient.Release(
            "",
            (int) status.latestCode,
            status.latestUrl,
            status.latestBytes
        );
        if (getActivity() != null) {
            getActivity().startActivity(UpdateActivity.downloadIntent(getContext(), release));
        } else {
            call.reject("There is nothing on screen to open the installer from");
            return;
        }
        call.resolve();
    }

    /** The shape lib/native-updates.ts declares. */
    private static JSObject report(UpdateCheck.Status status) {
        JSObject result = new JSObject();
        result.put("installedVersion", status.installedVersion);
        result.put("installedCode", status.installedCode);
        result.put("latestVersion", status.latestVersion);
        result.put("latestCode", status.latestCode);
        result.put("updateAvailable", status.updateAvailable());
        result.put("checkedAt", status.checkedAt);
        return result;
    }
}
