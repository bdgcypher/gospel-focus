package app.gospelfocus.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The gate behind the Focus Lock: an accessibility service that notices which app
 * has come to the front and, for the apps the reader chose, draws a full-screen
 * lock over them until the day's study is done.
 *
 * Why accessibility rather than UsageStatsManager plus an overlay (the two the
 * project notes weigh up): this is the only approach that needs one permission
 * instead of two. An accessibility service can be told about every window change
 * as it happens, and — unlike an ordinary app — may draw a
 * `TYPE_ACCESSIBILITY_OVERLAY` window without asking for *display over other
 * apps*. So the reader grants one thing, in one settings screen, and the gate
 * arrives with the app rather than up to a polling interval later. The trade is a
 * heavier-looking permission: the service says on its own settings screen that
 * it reads nothing on the screen, and `canRetrieveWindowContent` is false in
 * `res/xml/focus_lock_service.xml`, so the platform does not give it the window
 * even if it asked.
 *
 * Why not a foreground service: none is needed. The system starts an enabled
 * accessibility service itself, keeps it alive, and starts it again after a
 * reboot or process death. The lock's state lives in SharedPreferences
 * (FocusLockState), so the gate is holding again without the app ever running —
 * which is exactly what "survives reboot" asks for, without a notification the
 * reader has to keep. That state includes the day the study was earned, so the
 * gate also re-arms itself at midnight rather than waiting for the app.
 *
 * What the gate is not: an unbreakable wall. Android's own settings can turn the
 * service off, and that is the escape hatch a lock app must leave. Everything
 * else — the switch, the app list, the bypass, the day's study — is still the web
 * app's to decide (lib/focus.ts), and this service only ever reads it.
 */
public class FocusAccessibilityService extends AccessibilityService {

    /** The running service, so a state change can be applied without an event. */
    private static FocusAccessibilityService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private WindowManager windowManager;
    private View gate;
    private String gatePackage;
    private String lastPackage;

    /** When the gate last went up, on the clock that ignores wall-clock changes. */
    private long gateShownAt;

    /**
     * Re-check the foreground package when a bypass runs out.
     *
     * The reader can take a bypass, go into the held app, and stay there. No
     * window change will happen at the deadline, so nothing would bring the gate
     * in — this is the one timer the service keeps.
     */
    private final Runnable bypassCheck = new Runnable() {
        @Override
        public void run() {
            evaluate(lastPackage);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence name = event.getPackageName();
        if (name == null) return;
        String pkg = name.toString();

        // The gate is a window this app owns, so the system reports it going up
        // and coming down as a window change for this package. This package is
        // never held, so the plain answer would be to take the gate straight
        // back down — which puts the held app in front again, which brings the
        // gate back, which is another window change for this package. The two
        // take turns as fast as the system can report them: the gate strobes,
        // caught a frame at a time, instead of holding. Nothing there is an app
        // arriving, so it is ignored (see isGateEcho).
        if (pkg.equals(getPackageName()) && isGateEcho(event)) return;

        lastPackage = pkg;
        evaluate(pkg);
    }

    /**
     * Whether a window change from this app is the gate itself, not the app.
     *
     * The gate's windows are built by the service (buildGate), so their class is
     * one of its own views; the app's screen is MainActivity. A change with no
     * class at all is treated as the gate's, because the gate is the only one of
     * the two that would loop.
     *
     * The app's own screen is the exception, and it is let through unless it
     * arrives in the moment the gate is going up — which is the echo, a frame or
     * two old, not a reader who has found their way into the app. The gate's
     * button closes the gate before it starts the activity (openApp), so the
     * ordinary way in never depends on this at all; the exception is for the
     * unordinary ones, like the app being opened from a notification while the
     * gate is up, where leaving the gate over the screen that unlocks it would
     * trap the reader behind their own lock.
     */
    private boolean isGateEcho(AccessibilityEvent event) {
        if (gate == null) return false;

        CharSequence className = event.getClassName();
        if (className != null && className.toString().contains("MainActivity")) {
            return SystemClock.uptimeMillis() - gateShownAt < 700L;
        }
        return true;
    }

    @Override
    public void onInterrupt() {
        // The system can interrupt the service (it is about to be turned off, or
        // the device is going somewhere the overlay must not follow). The gate
        // must not be left behind on a screen nobody is watching.
        handler.removeCallbacksAndMessages(null);
        hideGate();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        hideGate();
        windowManager = null;
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /**
     * Apply the stored state to whatever is in front now.
     *
     * Called by FocusLockPlugin after the reader changes the lock, so switching
     * it off in the app takes the gate down at once rather than waiting for the
     * next window change — which, with the gate over everything, may never come.
     */
    static void refreshIfRunning() {
        FocusAccessibilityService service = instance;
        if (service == null) return;
        service.handler.post(new Runnable() {
            @Override
            public void run() {
                service.evaluate(service.lastPackage);
            }
        });
    }

    private void evaluate(String pkg) {
        if (windowManager == null) return;
        long now = System.currentTimeMillis();

        if (pkg == null || pkg.isEmpty()) {
            hideGate();
            return;
        }

        if (FocusLockState.shouldBlock(this, pkg, now)) {
            handler.removeCallbacks(bypassCheck);
            showGate(pkg);
            return;
        }

        hideGate();

        // A bypass is still running over a held app: the gate has to arrive when
        // the minutes are up even if the reader never leaves the app.
        handler.removeCallbacks(bypassCheck);
        long until = FocusLockState.bypassUntil(this);
        if (until > now && FocusLockState.packages(this).contains(pkg)) {
            handler.postDelayed(bypassCheck, until - now + 250L);
        }
    }

    private void showGate(String pkg) {
        if (gate != null) {
            if (pkg.equals(gatePackage)) return;
            hideGate();
        }

        View view = buildGate(pkg);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Fill the screen rather than the safe area: the whole point is that
            // the app underneath is not visible at all.
            params.setFitInsetsTypes(0);
        }

        try {
            windowManager.addView(view, params);
            // Asked again once the window is attached: a view that requested focus
            // before it had a window can miss it, and the Back key is handled by
            // this view (GateRoot).
            view.requestFocus();
            gate = view;
            gatePackage = pkg;
            gateShownAt = SystemClock.uptimeMillis();
        } catch (Exception e) {
            // Some devices refuse the overlay while another one is being drawn.
            // The next window change tries again; nothing else breaks.
            gate = null;
            gatePackage = null;
        }
    }

    private void hideGate() {
        if (gate == null) return;
        try {
            windowManager.removeView(gate);
        } catch (Exception ignored) {
            // Already detached (the service is going away, or the window was
            // removed with the process). Nothing left to do.
        }
        gate = null;
        gatePackage = null;
    }

    // ---------------------------------------------------------------------
    // The gate itself
    // ---------------------------------------------------------------------

    /**
     * The gate: the reader's own app name, what the lock is waiting on, the way
     * into the app, and the way out of the held app.
     *
     * Built in code rather than inflated from a layout so all of it lives in one
     * readable place and the two entrances (the gate and the pages) can share the
     * same palette without a second set of resource names. The colours are the
     * focused skin's paper and ink, with the playful skin's charcoal for night —
     * the same two backgrounds the app itself uses, so the gate does not look
     * like a piece of a different product.
     *
     * The primary action is deliberately "Open Gospel Focus" rather than
     * "Dismiss": a gate that only closes would be a bump in the road, and the
     * one thing that opens it for good is the day's study. The bypass is
     * mentioned in small type, because it exists and hiding it would make the
     * lock dishonest; it is taken in the app, not here, because that is where
     * the reader can see what they are trading.
     */
    private View buildGate(String pkg) {
        Palette palette = palette();
        int width = Math.min(getResources().getDisplayMetrics().widthPixels - dp(48), dp(420));

        GateRoot root = new GateRoot(this);
        root.setBackgroundColor(palette.background);
        root.setFocusable(true);
        root.setFocusableInTouchMode(true);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(24));
        card.setBackground(rounded(palette.surface, 28, palette.border, 1));
        card.setElevation(dp(2));

        TextView tile = new TextView(this);
        tile.setText("🔒");
        tile.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        tile.setGravity(Gravity.CENTER);
        tile.setBackground(rounded(palette.surface2, 18, 0, 0));
        card.addView(tile, new LinearLayout.LayoutParams(dp(56), dp(56)));

        TextView eyebrow = label("FOCUS LOCK", 11, palette.accent,
            Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        eyebrow.setLetterSpacing(0.14f);
        add(card, eyebrow, 20);

        TextView heading = label(labelFor(pkg) + " is held", 24, palette.foreground,
            Typeface.create("serif", Typeface.BOLD));
        add(card, heading, 8);

        TextView body = label(
            "Today's study isn't done yet. Open Gospel Focus and read or study until your goal is met — "
                + "the app opens again when it is.",
            15, palette.muted, null);
        body.setLineSpacing(dp(3), 1f);
        add(card, body, 12);

        Button open = gateButton("Open Gospel Focus", palette.accent, palette.accentContrast, 0);
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openApp();
            }
        });
        add(card, open, 22);

        Button home = gateButton("Back to home", palette.surface2, palette.foreground, palette.border);
        home.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                goHome();
            }
        });
        add(card, home, 10);

        TextView bypass = label(
            "Need it just this once? Open Gospel Focus and switch the lock off — you can choose how long for.",
            12, palette.muted, null);
        bypass.setLineSpacing(dp(2), 1f);
        add(card, bypass, 18);

        TextView privacy = label(
            "Focus Lock sees which app is in front; it does not read your screen.",
            11, palette.muted, null);
        add(card, privacy, 10);

        root.addView(card, new FrameLayout.LayoutParams(
            width, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        root.requestFocus();
        return root;
    }

    private void add(LinearLayout parent, View child, int topMarginDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topMarginDp);
        parent.addView(child, params);
    }

    /** A line of the gate; a null typeface leaves the platform's own body face. */
    private TextView label(String text, int sp, int color, Typeface typeface) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        if (typeface != null) view.setTypeface(typeface);
        return view;
    }

    /**
     * One of the gate's buttons.
     *
     * Sized from its content with a 48dp floor rather than a fixed height: the
     * gate is exactly the screen a reader with large text needs to be able to
     * read, and a height pinned in dp would clip the label at a big font scale.
     */
    private Button gateButton(String text, int fill, int ink, int stroke) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setTextColor(ink);
        button.setBackground(rounded(fill, 999, stroke, stroke == 0 ? 0 : 1));
        button.setPadding(dp(16), dp(12), dp(16), dp(12));
        button.setMinHeight(dp(48));
        button.setMinimumHeight(dp(48));
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setStateListAnimator(null);
        button.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return button;
    }

    private GradientDrawable rounded(int fill, int radiusDp, int strokeColor, int strokeWidthDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.RECTANGLE);
        shape.setColor(fill);
        shape.setCornerRadius(dp(radiusDp));
        if (strokeWidthDp > 0) shape.setStroke(dp(strokeWidthDp), strokeColor);
        return shape;
    }

    private static final class Palette {
        final int background;
        final int surface;
        final int surface2;
        final int foreground;
        final int muted;
        final int border;
        final int accent;
        final int accentContrast;

        Palette(int background, int surface, int surface2, int foreground, int muted, int border,
                int accent, int accentContrast) {
            this.background = background;
            this.surface = surface;
            this.surface2 = surface2;
            this.foreground = foreground;
            this.muted = muted;
            this.border = border;
            this.accent = accent;
            this.accentContrast = accentContrast;
        }
    }

    /** app/globals.css's focused palette; the playful skin's night ink for dark. */
    private Palette palette() {
        boolean night = (getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        if (night) {
            return new Palette(
                Color.parseColor("#111111"), Color.parseColor("#1B1B1B"), Color.parseColor("#333333"),
                Color.parseColor("#F2F2F2"), Color.parseColor("#B0B0B0"), Color.parseColor("#424242"),
                Color.parseColor("#E0B45C"), Color.parseColor("#1A1A1A"));
        }
        return new Palette(
            Color.parseColor("#F7F2E7"), Color.parseColor("#FFFDF7"), Color.parseColor("#F1E9D7"),
            Color.parseColor("#2A2118"), Color.parseColor("#7A6B53"), Color.parseColor("#E2D6BD"),
            Color.parseColor("#9A6B1F"), Color.parseColor("#FFFDF7"));
    }

    /** What the reader calls the held app, or a neutral name if it has gone. */
    private String labelFor(String pkg) {
        PackageManager manager = getPackageManager();
        try {
            return manager.getApplicationLabel(manager.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return "This app";
        }
    }

    private void openApp() {
        // Taken down here rather than left to the app's own window change: the
        // service ignores this package's window changes while the gate is up
        // (isGateEcho), so nothing else would close it.
        lastPackage = getPackageName();
        hideGate();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            // If the activity cannot be started there is nowhere better to send
            // the reader than the gate they are already looking at.
        }
    }

    private void goHome() {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_HOME);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            // Same as above: the gate stays, which is the safe half of failing.
        }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /**
     * The overlay's root, which claims Back.
     *
     * A focusable window normally hands Back to nobody, so without this the key
     * would do nothing over the gate. Sending the reader home is the honest
     * answer: it leaves the held app rather than dismissing the lock.
     */
    private final class GateRoot extends FrameLayout {
        GateRoot(Context context) {
            super(context);
        }

        @Override
        public boolean dispatchKeyEvent(KeyEvent event) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                if (event.getAction() == KeyEvent.ACTION_UP) goHome();
                return true;
            }
            return super.dispatchKeyEvent(event);
        }
    }
}
