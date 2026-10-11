package app.opentoinspiration.app;

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
        super.onCreate(savedInstanceState);
    }
}
