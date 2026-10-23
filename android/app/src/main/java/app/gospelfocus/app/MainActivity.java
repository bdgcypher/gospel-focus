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
}
