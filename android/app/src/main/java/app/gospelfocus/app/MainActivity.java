package app.gospelfocus.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Recommended by the Capacitor SystemBars docs: makes the app
        // edge-to-edge so env(safe-area-inset-*) reports the real status bar
        // and gesture bar insets the web content pads against.
        EdgeToEdge.enable(this);
        registerPlugin(OpenUrlPlugin.class);
        registerPlugin(ImageClipboardPlugin.class);
        registerPlugin(FileDownloadPlugin.class);
        registerPlugin(FocusLockPlugin.class);
        registerPlugin(GospelStudyPlugin.class);
        registerPlugin(UpdateCheckPlugin.class);
        super.onCreate(savedInstanceState);

        // The update checker, woken from the launch path because this is the one
        // moment the app is certainly running: ask for the notification
        // permission (Android 13+, once), make sure the eight-hourly check is
        // scheduled, and run one now. None of it blocks the launch — the check
        // is WorkManager's, not this thread's — and none of it touches the
        // WebView, so the reader sees the hub as usual while it happens. See
        // UpdateCheck and UpdateCheckWorker.
        UpdateCheck.askForNotificationsOnce(this);
        UpdateCheckWorker.schedule(this);
        UpdateCheckWorker.checkNow(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Opening Gospel Focus is one of the ways out of the Focus Lock's gate.
        // This app is the screen that ends the lock, so a gate still up while it
        // is what the reader is looking at is a gate over the one place that can
        // open it — and, on the phones where an accessibility overlay outlives
        // the service that drew it, the only thing left in the process that can
        // take the window down. Every resume clears anything left over; there is
        // nothing to clear in the ordinary case, and the call is cheap.
        FocusAccessibilityService.dismissAnyGate();
    }
}
