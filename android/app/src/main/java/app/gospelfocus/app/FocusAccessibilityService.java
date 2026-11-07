package app.gospelfocus.app;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.WindowMetrics;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

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
 *
 * The other escape hatch, and the one that has to hold whatever state the service
 * is in: Home. The gate's frame is measured to end above the navigation bar and
 * below the status bar (betweenBars), and it is not touch-modal, so the home
 * button and the home gesture always reach the system; the screen they open is
 * never gated, and a gate left over it is taken down at once (systemUiReceiver)
 * and stays down, whichever of the two the reader used (leftPackage). Home is the
 * one exit the framework does not report as a window change — the launcher comes
 * up behind the gate — which is why it is listened for by name.
 * A phone whose only way out is a hard reboot is worse than an app that is not
 * blocked at all, so every path here is written to fail towards the home screen.
 *
 * That is also true of the window itself, and not only of the decision to draw
 * it. A gate that is on the screen but not tracked is worse than a gate that was
 * never drawn: there is nothing left to take it down, and on the phones where an
 * accessibility overlay outlives the service that added it, the reader is left
 * with a full-screen sheet no tap can get past until the phone is restarted.
 * So every window added is recorded (drawnGates) and nothing is forgotten until
 * its removal is confirmed; nothing is removed without first being made harmless
 * (takeDown); the Close button in the gate's corner, Back, Home, and opening
 * Gospel Focus are all independent ways out; and the app itself clears anything
 * left when it comes to the front, even if the service is no longer running.
 */
public class FocusAccessibilityService extends AccessibilityService {

    private static final String TAG = "FocusLock";

    /** The running service, so a state change can be applied without an event. */
    private static FocusAccessibilityService instance;

    /**
     * Every gate window this process has put on the screen and not yet seen come
     * off it.
     *
     * A window is not something the service can afford to lose the reference to:
     * a sheet that is still on the display with nobody holding it is one no tap
     * can get past, and on some devices an accessibility overlay outlives the
     * service that added it — which is exactly how a lock popup ends up surviving
     * everything but a reboot. So every view that is added is recorded here, and
     * a view is only forgotten once the platform has confirmed the window is gone
     * or has been made incapable of covering anything (takeDown).
     *
     * Process-wide rather than the service's own, because the app is the other
     * half of the escape: opening Gospel Focus clears whatever is left, even if
     * the service that drew it has since been stopped (dismissAnyGate).
     */
    private static final Set<View> drawnGates = new LinkedHashSet<>();

    /** The main thread, and the one place windows are taken down from. */
    private static final Handler cleanup = new Handler(Looper.getMainLooper());

    private final Handler handler = new Handler(Looper.getMainLooper());

    private WindowManager windowManager;
    private View gate;
    private String gatePackage;
    private String lastPackage;

    /**
     * Whether the gate has ever been the focused window, and for how long it has
     * been without focus since.
     *
     * A window nobody can focus is a window that takes no taps and no Back key —
     * the shape of a gate that has to be waited out or rebooted. The gate is
     * focusable and asks for focus when it is drawn, so a gate that has had it and
     * then loses it for seconds on end is not the window in front of the reader
     * any more, whatever the last reported package says (gateGuard).
     */
    private boolean gateFocused;
    private int gateUnfocused;

    /**
     * The app whose gate the reader has just taken down, and when.
     *
     * Leaving is a moment, not a state, and the tail of it is reported as the
     * held app arriving: the gate coming down hands the app its window back and
     * the home screen (or Gospel Focus) takes its place, so the app's own window
     * goes away behind it — which the framework reports as a window change of
     * the app. Read plainly, that event says the reader has opened the app, so
     * the gate goes straight back up, over whatever they asked for, with nothing
     * left in front to take it down again.
     *
     * That is why *every* way out of the gate records the app it left, and not
     * only the gate's own buttons: the Close button, the Back key, Open Gospel
     * Focus, and the system's exits — the home button, the home gesture,
     * Recents, another app taking the screen, the guard finding the reader
     * elsewhere — all put the held app back behind something else in the same
     * way. Miss one and the home gesture becomes a gate that drops and then
     * reappears over the home screen: the reader is home, the echo arrives, and
     * the gate is drawn again with nothing in front to take it down (see
     * recordLeave). It is only ever the half that matters: the gate is already
     * gone by the time this is read.
     */
    private String leftPackage;
    private long leftAt;
    /** When the reader last left a gate, kept past the settle for the log line. */
    private long lastLeaveAt;

    /**
     * How long a leave takes to settle.
     *
     * Long enough to cover the screen the reader asked for arriving and the left
     * app's window being put away behind it, which is the last of the three
     * events and comes after the other screen's. It is not a fixed animation
     * time: measured on a device, the echo arrives anywhere from a tenth of a
     * second to around two and a half seconds after the gate comes down, the slow
     * end when the display is busy — which the old 2.5s window sat exactly on, and
     * a leave that took a moment longer drew the gate straight back up over the
     * home screen. The window is therefore four times the worst delay seen, and
     * the trade is deliberate: for ten seconds after the reader closes a gate, the
     * app they left is not gated again. A nudge that can be got past for ten
     * seconds is worth far more than a gate that comes back over a screen the
     * reader cannot leave (see the class comment). Past it, opening the app is
     * opening the app, and is gated as usual.
     */
    private static final long LEAVE_SETTLE_MS = 10000L;

    /**
     * How many times a refused overlay is tried again before it is left alone.
     *
     * A window can be refused while the display is changing under it — which is
     * what unfolding a foldable is — and giving up on the first refusal meant no
     * gate at all until the next window change, which for the app already in
     * front may never come.
     */
    private static final int GATE_ATTEMPTS = 4;

    private int gateAttempts;

    /** The cached home package; null until asked for, "" when there is none. */
    private String homePackage;

    private final Runnable gateRetry = new Runnable() {
        @Override
        public void run() {
            evaluate(lastPackage);
        }
    };

    /**
     * A gate that has outlived the app it was drawn for.
     *
     * Every ordinary way out of the gate takes it down as it goes, so this is
     * only ever the backstop for the ways that are not ordinary: a launcher that
     * never reports the home screen, a fold that rebuilds the gate from the app
     * it was left over, a service restarted onto a screen that has moved on.
     * Whatever the cause, a gate standing over the home screen is the one state
     * the reader cannot get out of, so it is checked for rather than hoped
     * against — within a second of the home screen being in front, the gate is
     * down.
     *
     * The gate screen itself is not the home screen, so nothing here can take a
     * gate down that belongs where it is: lastPackage is only ever the last
     * window that was reported, and a held app keeps it on itself.
     *
     * Two more states are the same kind of backstop, and are checked here for the
     * same reason. A window that is no longer attached is not a gate that is up,
     * whatever the field says, and a done-with window must not be left tracked as
     * one. And a gate that has lost the window focus it had is one no tap or Back
     * key can reach: painted, but not input, which is precisely the stuck sheet
     * this class must not produce. Both are taken down.
     */
    private final Runnable gateGuard = new Runnable() {
        @Override
        public void run() {
            if (gate == null) {
                // Nothing is tracked as the gate, but a window can still be on the
                // screen if an earlier removal was lost. Taking everything down
                // is cheap when there is nothing to take down, and it is the one
                // place a window outlives its reference.
                takeDownAll();
                return;
            }

            // The window the field is holding has gone from under it — a display
            // change, a service restart, or a platform that took it away without
            // saying so. Whatever is left is not a gate that is up, and nothing
            // should be believed about it any more.
            if (!gate.isAttachedToWindow()) {
                Log.d(TAG, "forgetting the gate over " + gatePackage + ": its window is gone");
                gate = null;
                gatePackage = null;
                gateFocused = false;
                gateUnfocused = 0;
                takeDownAll();
                return;
            }

            // The held app is no longer the screen the reader is on: the home
            // screen, Gospel Focus, or a different app. Anything but the app the
            // gate was drawn for means the gate is standing over somewhere the
            // reader asked to be, so it comes down. A transient window over the
            // held app (the shade, a system dialog, the lock screen) is not an app
            // and does not count, or the gate would drop for every one of them.
            boolean expected = lastPackage != null
                && !isHome(lastPackage)
                && !getPackageName().equals(lastPackage)
                && (!isLaunchableApp(lastPackage) || lastPackage.equals(gatePackage));
            if (!expected) {
                Log.d(TAG, "taking the gate down: " + lastPackage + " is in front, not " + gatePackage);
                // Recorded as a leave like every other exit. The held app is
                // about to be handed its window back behind whatever the reader
                // did go to, and its window change would otherwise be mistaken
                // for the app arriving — which is the gate coming back up over
                // the screen it was just taken down from.
                recordLeave(gatePackage);
                hideGate();
                return;
            }

            // A gate that has lost the window it needs is a gate that can no
            // longer take the reader's taps or the Back key: the window is still
            // painted, but the input is going somewhere else. Nothing that cannot
            // be closed can be allowed to stay on the screen, so after a few
            // seconds of it the gate is taken down. Only counted once the gate is
            // known to have had the focus at all, so a device that never gives its
            // overlays focus is not left ungated.
            if (gate.hasWindowFocus()) {
                gateFocused = true;
                gateUnfocused = 0;
            } else if (gateFocused && ++gateUnfocused >= 3) {
                Log.d(TAG, "taking the gate down over " + gatePackage + ": it lost the window focus");
                recordLeave(gatePackage);
                hideGate();
                return;
            }

            handler.postDelayed(this, 1000L);
        }
    };

    /**
     * Every few seconds, take down a tracked window that is not the gate in use.
     *
     * The gate can be lost from the field without being lost from the screen: an
     * `addView` that threw after attaching, or a removal the platform refused
     * whose retries have run out. Nothing else would ever look at a window like
     * that again, and a window nobody looks at is a window nobody can close. This
     * is the last net, and it is why the tracked set is worth keeping at all: what
     * the service is holding and not using is exactly what must not be on the
     * screen.
     */
    private static final long SWEEP_MS = 5000L;

    private final Runnable gateSweep = new Runnable() {
        @Override
        public void run() {
            for (View view : new ArrayList<>(drawnGates)) {
                if (view != gate) takeDown(view);
            }
            handler.postDelayed(this, SWEEP_MS);
        }
    };

    /**
     * The last *app* in front, as opposed to the last window.
     *
     * The difference is the whole of the wake case. The lock screen and the
     * notification shade are windows but not apps, and they are what the gate is
     * taken down for when the screen goes off. Remembering the app underneath —
     * rather than the window — is what lets the gate come back when the reader
     * wakes the phone without ever having left the held app: Android resumes an
     * activity that was already resumed without a window change of its own, so
     * no event would otherwise arrive to put the gate back.
     */
    private String appPackage;

    /** Whether the wake receiver is registered (onServiceConnected can run again). */
    private boolean listening;

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

    /**
     * The screen coming back on, the reader unlocking, or the screen going off.
     *
     * Waking is only a nudge: the work is wakeCheck's, run a moment later so the
     * window changes of waking up have all been seen first. Acting on this
     * broadcast directly would draw the gate for the app the reader was in and
     * then take it down again for whatever actually came up, which is a flash of
     * the very thing this is here to prevent.
     *
     * The screen going off is the other half of a counted stretch of Gospel
     * Library reading: time with the screen dark is not reading, so the clock is
     * banked there and then rather than left running until the next window
     * change (GospelStudy).
     */
    private final BroadcastReceiver wakeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                GospelStudy.bank(FocusAccessibilityService.this);
                return;
            }
            boolean unlocked = Intent.ACTION_USER_PRESENT.equals(intent.getAction());
            handler.removeCallbacks(wakeCheck);
            handler.postDelayed(wakeCheck, unlocked ? 500L : 900L);
        }
    };

    /**
     * The reader leaving for the home screen (or the overview) by the system's
     * own controls.
     *
     * This is the one exit that does not come back as a window change. Pressing
     * Home brings the launcher to the front *behind* the gate — the overlay is
     * above it — and the launcher was already visible there, so the framework
     * reports no window state change for it at all. The gate therefore never
     * heard about the one thing the reader did, and sat there over the home
     * screen with a dead-looking Home button behind it: the reader is home, and
     * the screen still says an app is locked. Measured on a device, the launcher
     * really is the resumed activity while the gate keeps the input focus.
     *
     * Android does say so, once, on its way: ACTION_CLOSE_SYSTEM_DIALOGS with
     * `reason` "homekey" (or "recentapps" for the overview). Taking the gate down
     * on it is the same leave as any other, keyed to the app it was drawn for, so
     * the app's own window change a moment later is not mistaken for a launch.
     */
    private final BroadcastReceiver systemUiReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || gate == null) return;
            String reason = intent.getStringExtra("reason");
            Log.d(TAG, "system took the screen: " + reason + "; taking the gate down");
            if (reason == null || "homekey".equals(reason) || "recentapps".equals(reason)) {
                recordLeave(gatePackage);
                // The reader is not in the held app any more, and no window change
                // is coming to say so: remembering it as the app in front would let
                // a wake, a fold, or a sync draw the gate over the home screen
                // later (see appPackage).
                lastPackage = null;
                appPackage = null;
                hideGate();
            }
        }
    };

    /**
     * Put the gate back after the screen has been away, if it belongs there.
     *
     * The reader has unlocked by now (or there is no lock screen to unlock), and
     * appPackage is the app that was in front before the screen went off — unless
     * something has taken its place since, in which case that app's own window
     * change has already been applied and this only repeats it. Whether the gate
     * actually goes up is still the stored state's decision: an earned day, a
     * running bypass, or a lock that is switched off leave the gate down.
     */
    private final Runnable wakeCheck = new Runnable() {
        @Override
        public void run() {
            if (windowManager == null) return;

            // Still on the lock screen: the gate must not cover the way in.
            KeyguardManager keyguard =
                (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguard != null && keyguard.isKeyguardLocked()) return;

            evaluate(appPackage);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        if (!listening) {
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_SCREEN_ON);
            filter.addAction(Intent.ACTION_SCREEN_OFF);
            filter.addAction(Intent.ACTION_USER_PRESENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(wakeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(wakeReceiver, filter);
            }

            // The system's own leave for Home and the overview; see
            // systemUiReceiver. Not exported either: nothing outside the platform
            // sends this, and the gate is not something another app gets to drop.
            IntentFilter systemUi = new IntentFilter(Intent.ACTION_CLOSE_SYSTEM_DIALOGS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(systemUiReceiver, systemUi, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(systemUiReceiver, systemUi);
            }
            listening = true;
        }

        // The sweep is re-armed rather than started twice: onServiceConnected can
        // run again for a service that was already connected.
        handler.removeCallbacks(gateSweep);
        handler.postDelayed(gateSweep, SWEEP_MS);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence name = event.getPackageName();
        if (name == null) return;
        String pkg = name.toString();

        boolean launchable = isLaunchableApp(pkg);

        // The Gospel Library's minutes are counted from the same event, and before
        // the gate has its say: leaving it is leaving it whether the reader is
        // going to the home screen, to this app, or to the gate over the app they
        // just opened (GospelStudy).
        //
        // Keyed to the app rather than the window, like appPackage below: the
        // keyboard coming up over a chapter is a window but not somewhere the
        // reader has gone, and the reading carries on underneath it.
        GospelStudy.see(this, launchable ? pkg : appPackage);

        // The gate is a window this app owns, so the system reports it going up
        // and coming down as a window change for this package. This package is
        // never held, so the plain answer would be to take the gate straight
        // back down — which puts the held app in front again, which brings the
        // gate back, which is another window change for this package. The two
        // take turns as fast as the system can report them: the gate strobes,
        // caught a frame at a time, instead of holding. Nothing there is an app
        // arriving, so it is ignored (see isGateEcho).
        if (pkg.equals(getPackageName()) && isGateEcho(event)) return;

        if (isLeaveEcho(pkg)) return;

        // A gate that was standing when the reader went somewhere else has been
        // left, and not necessarily by one of its own buttons: the home button,
        // the home gesture, Recents and another app taking the screen are all
        // one leave. Whichever it was, the gate coming down hands the held app
        // its window back for a moment, and the framework reports that as the
        // app arriving — so the leave is recorded before the gate goes, exactly
        // as the buttons record theirs. Without it, the home gesture took the
        // reader home, the gate came down on the home screen's own window change
        // and then straight back up on the echo, where nothing was left in front
        // to take it down again.
        //
        // Keyed to the app the reader was in, not to the gate still being up: a
        // window can take the gate down on the way past (the shade, a system
        // dialog), and the screen the reader actually went to arrives after it.
        //
        // Only for a screen the reader can stay on, though: the shade, the
        // volume panel and the lock screen are windows over the held app, not
        // places the reader has gone, and the gate is meant to come back over
        // the app once they are gone.
        if ((launchable || isHome(pkg)) && appPackage != null && !pkg.equals(appPackage)
            && FocusLockState.packages(this).contains(appPackage)) {
            recordLeave(appPackage);
        }

        gateAttempts = 0;
        lastPackage = pkg;
        if (launchable) {
            appPackage = pkg;
        } else if (isHome(pkg)) {
            // The home screen is not an app the reader is inside, even though it
            // is where they are. Left as the app in front, it would let the wake
            // check — or a fold — draw the gate over the home screen.
            appPackage = null;
        }
        evaluate(pkg);
    }

    /**
     * Whether a window change for `pkg` is the tail of leaving, not a launch.
     *
     * The app just left is the only thing whose events can arrive either side of
     * the next screen's during a leave, so that is what is ignored, and only for
     * the moment a leave takes to settle. Everything else — the home screen,
     * Gospel Focus, a different app, the reader opening the app again later — is
     * answered as usual. The elapsed time is logged: if a leave ever takes longer
     * than the settle on some launcher, the log says so rather than the gate
     * quietly reappearing.
     */
    private boolean isLeaveEcho(String pkg) {
        if (leftPackage == null) return false;
        long since = SystemClock.uptimeMillis() - leftAt;
        if (since >= LEAVE_SETTLE_MS) {
            leftPackage = null;
            return false;
        }
        if (!pkg.equals(leftPackage)) return false;

        Log.d(TAG, "ignoring " + pkg + " " + since + "ms after leaving the gate");
        return true;
    }

    /**
     * Whether a package is the device's home screen rather than an app in it.
     *
     * Asked of the launcher's own entry for the home button, the same test
     * `isLaunchableApp` uses in the other direction: an app that opens from the
     * home screen is one the reader can be inside, and the home screen itself is
     * not.
     */
    private boolean isHome(String pkg) {
        if (homePackage == null) {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo resolved = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            homePackage = resolved == null || resolved.activityInfo == null
                ? ""
                : resolved.activityInfo.packageName;
        }
        return pkg.equals(homePackage);
    }

    /**
     * Whether the package in front is an app the reader opens, rather than a
     * window the system put up over one.
     *
     * The launcher's own view of the device is the test: an app with something to
     * open from the home screen is one the reader can be inside, while the lock
     * screen, the notification shade, the keyboard and system dialogs have no
     * launcher entry. The gate comes down for both kinds, but only the first is
     * remembered as where the reader is — which is what the wake check needs.
     */
    private boolean isLaunchableApp(String pkg) {
        try {
            return getPackageManager().getLaunchIntentForPackage(pkg) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Whether a window change from this app is the gate itself, not the app.
     *
     * The gate's windows are built by the service (buildGate), so their class is
     * one of its own views; the app's screen is MainActivity. A change with no
     * class at all is treated as the gate's, because the gate is the only one of
     * the two that would loop.
     *
     * MainActivity is never the gate, and is never ignored: the lock cannot apply
     * to the app that opens it, so the reader reaching its screen is the gate
     * coming down — whether they tapped the gate's button, followed a
     * notification, or brought the app forward some other way. Ignoring it for a
     * moment after the gate went up (which is what this used to do) left the gate
     * standing over the one screen that can unlock it, with no way past it.
     */
    private boolean isGateEcho(AccessibilityEvent event) {
        if (gate == null) return false;

        CharSequence className = event.getClassName();
        if (className != null && className.toString().contains("MainActivity")) return false;
        return true;
    }

    @Override
    public void onInterrupt() {
        // The system can interrupt the service (it is about to be turned off, or
        // the device is going somewhere the overlay must not follow). The gate
        // must not be left behind on a screen nobody is watching.
        handler.removeCallbacksAndMessages(null);
        hideGate();
        // A stretch of Gospel Library reading in progress is banked rather than
        // lost with the service.
        GospelStudy.bank(this);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        hideGate();
        GospelStudy.bank(this);
        if (listening) {
            try {
                unregisterReceiver(wakeReceiver);
            } catch (Exception ignored) {
                // Already gone with the context; nothing is listening either way.
            }
            try {
                unregisterReceiver(systemUiReceiver);
            } catch (Exception ignored) {
                // As above.
            }
            listening = false;
        }
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

    /**
     * The device's own night mode turned over under a gate that follows it.
     *
     * An accessibility service is not recreated for a configuration change, so
     * without this the gate would keep the light it was built in until the next
     * window change — which, over a held app, may not come until the reader leaves.
     */
    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (windowManager == null) return;

        // The screen the gate was built for is not the screen it is over any
        // more: a foldable opened, the phone turned, or the device's night mode
        // turned over. An accessibility service is not recreated for any of it,
        // so the size and the palette the gate was built in would otherwise be
        // kept until the next window change — which, over a held app, may not
        // come until the reader leaves.
        //
        // A fold is also where the gate went missing altogether: the app comes
        // forward onto the new screen without a window change of its own to ask
        // for it again, and the window that was drawn for the old screen can be
        // gone. So both cases are answered here — the gate is taken down and
        // built again at the new size if it is up, and drawn if it is not.
        String pkg = gate != null ? gatePackage : appPackage;
        hideGate();
        evaluate(pkg);
    }

    /**
     * Redraw a gate that is already up, in a new look.
     *
     * Called by FocusLockPlugin after the reader changes their theme or skin. The
     * gate is built from the appearance, not restyled in place, so the honest way
     * to change it is to take it down and build it again over the same held app —
     * which is what `showGate` would do for a window change, and what nothing else
     * would do while the reader is sitting in the held app.
     */
    static void restyleIfRunning() {
        FocusAccessibilityService service = instance;
        if (service == null) return;
        service.handler.post(new Runnable() {
            @Override
            public void run() {
                if (service.gate == null || service.gatePackage == null) return;
                String pkg = service.gatePackage;
                service.hideGate();
                service.showGate(pkg);
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

        // The home screen is how the reader gets out of any gate, so the gate is
        // never drawn over it, whatever stale state asked for it (a wake, a
        // fold, a bypass deadline, a sync from the app). isHome also caches the
        // launcher's package on first use, which is why it is asked before the
        // lock's own rules rather than after them.
        if (isHome(pkg)) {
            hideGate();
            appPackage = null;
            return;
        }

        if (FocusLockState.shouldBlock(this, pkg, now)) {
            handler.removeCallbacks(bypassCheck);
            showGate(pkg);
            return;
        }

        // A window over the app rather than a screen the reader went to — the
        // notification shade, a system dialog, the keyboard, the lock screen — is
        // not somewhere to leave the app from, and the gate stays exactly where it
        // is under it. Taking it down for these made the gate blink off and back on
        // whenever the system put a window over the held app, which was visible
        // and, for the length of the blink, a held app that could be tapped. The
        // guard still takes the gate down if the reader has actually gone
        // somewhere: its package would be launchable, or the home screen (which
        // returned above). The timers below still run, so a bypass that expires
        // under the shade is enforced when it lifts.
        boolean overTheApp = gate != null && !isLaunchableApp(pkg);
        if (!overTheApp) hideGate();

        // A bypass is still running over a held app: the gate has to arrive when
        // the minutes are up even if the reader never leaves the app.
        handler.removeCallbacks(bypassCheck);
        long until = FocusLockState.bypassUntil(this);
        if (until > now && FocusLockState.packages(this).contains(pkg)) {
            handler.postDelayed(bypassCheck, until - now + 250L);
        }
    }

    private void showGate(String pkg) {
        // Gospel Focus is the screen that ends the lock, so the gate never stands
        // over it. Nothing asks for that in the ordinary way — the app is never a
        // held package — but a stale re-evaluation can (a wake, a fold, a sync
        // from a page that has since been brought forward), and if it could, the
        // reader would be looking at the app that unlocks the lock with the gate
        // covering it.
        if (getPackageName().equals(lastPackage)) {
            hideGate();
            return;
        }

        // The home screen is never gated either, whatever asked for it. evaluate()
        // already says so, but this is the one place a window is actually added,
        // and a gate drawn over the launcher is the state the reader cannot get
        // out of without a gate on top of it.
        if (isHome(pkg)) {
            hideGate();
            return;
        }

        // A window the system has taken away (a display change under it, or a
        // service restart it did not report) is not a gate that is up. Left
        // standing, the field below would say the gate is drawn for ever, and
        // every later evaluate() for the same app would return here without
        // drawing anything — which is what a fold left behind. hideGate takes the
        // window itself down too, in case it is only the field that has lost it.
        if (gate != null && !gate.isAttachedToWindow()) {
            hideGate();
        }

        if (gate != null) {
            if (pkg.equals(gatePackage)) return;
            hideGate();
        }

        // The gate is the whole screen of the app it covers, but never the
        // screen's own edges. Laid out over the system bars it takes away the
        // home button, the home gesture and the status bar — which is the trap
        // this window has to be incapable of: a gate over an app is a nudge, a
        // gate over the way out of the phone is a brick. The frame is measured
        // between the bars (betweenBars) so going home works whatever state the
        // gate is in.
        View view = buildGate(pkg);

        // NOT_TOUCH_MODAL is half of the same promise as the frame being short of
        // the bars: a focusable window without it takes every pointer event on the
        // display, including the ones outside its own frame — so the gate ended at
        // the navigation bar and still swallowed the taps on it, and the home
        // button was drawn, visible, and dead. With it, the bars are the system's
        // both to see and to touch.
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        );
        betweenBars(params);

        // Tracked before it is added, not after: `addView` can throw *after* the
        // window has been attached (a display change, a token the platform takes
        // away in the middle of it), and a gate that is on the screen with nothing
        // holding it is the one thing this class must never produce. Tracking
        // first means the catch below, the guard, and the app all still have a way
        // to it (takeDown).
        drawnGates.add(view);
        try {
            windowManager.addView(view, params);
        } catch (Exception e) {
            // Some devices refuse the overlay while another one is being drawn,
            // or while the display is changing under it. Tried again shortly
            // rather than given up on — but only so many times, so a phone that
            // will never allow it is not asked in a loop.
            Log.w(TAG, "Could not draw the gate over " + pkg, e);
            takeDown(view);
            gate = null;
            gatePackage = null;
            if (gateAttempts < GATE_ATTEMPTS) {
                gateAttempts++;
                handler.removeCallbacks(gateRetry);
                handler.postDelayed(gateRetry, 400L);
            }
            return;
        }

        gate = view;
        gatePackage = pkg;
        gateAttempts = 0;
        gateFocused = false;
        gateUnfocused = 0;
        // Asked once the window is attached: a view that requested focus before
        // it had a window can miss it, and the Back key is handled by this view
        // (GateRoot). It cannot fail a drawn window, and it is outside the try
        // above so that a throw here can never leave a window nobody tracks.
        view.requestFocus();
        handler.removeCallbacks(gateGuard);
        handler.postDelayed(gateGuard, 1000L);
        if (lastLeaveAt != 0) {
            Log.d(TAG, "gate over " + pkg + " "
                + (SystemClock.uptimeMillis() - lastLeaveAt) + "ms after the reader left");
        }
    }

    private void hideGate() {
        handler.removeCallbacks(gateGuard);
        handler.removeCallbacks(gateRetry);

        gate = null;
        gatePackage = null;
        gateFocused = false;
        gateUnfocused = 0;
        // Everything this process has drawn, not just the view the field still
        // holds: a removal that failed earlier can leave a window behind, and this
        // is the moment the reader has asked for the screen back.
        takeDownAll();
    }

    /**
     * Take every gate window down, whoever is asking.
     *
     * The app calls this when it comes to the front (MainActivity.onResume):
     * Gospel Focus is the screen that ends the lock, so a gate still on the screen
     * while this app is being looked at is a gate over the one place that can open
     * it. It is also the way a gate is cleared when the service that drew it has
     * since stopped — the window belongs to this process, and the app is the part
     * of it that the reader can reliably reach.
     */
    static void dismissAnyGate() {
        cleanup.post(new Runnable() {
            @Override
            public void run() {
                FocusAccessibilityService service = instance;
                if (service != null) {
                    service.hideGate();
                } else {
                    takeDownAll();
                }
            }
        });
    }

    /** Every tracked gate window, taken down. */
    private static void takeDownAll() {
        for (View view : new ArrayList<>(drawnGates)) {
            if (!takeDown(view)) retryTakeDown(view, 0);
        }
    }

    /**
     * Take one gate window off the screen, or leave it incapable of covering it.
     *
     * The order matters. The window is made harmless first (neutralise), so that
     * whatever happens in the removal that follows, the reader is not left with a
     * sheet over the screen. Then it is removed — `removeViewImmediate` as the
     * ordinary path, `removeView` when that refuses, and the view's own attachment
     * as the last word on whether it is actually gone.
     *
     * Returns whether the window is known to be gone. A view that is still
     * attached is kept in the tracked set so the next attempt, or the next time a
     * gate is dismissed, can try again (retryTakeDown).
     */
    private static boolean takeDown(View view) {
        if (view == null) return true;
        neutralise(view);

        WindowManager manager = managerFor(view.getContext());
        boolean removed = false;
        if (manager != null) {
            try {
                manager.removeViewImmediate(view);
                removed = true;
            } catch (Exception immediate) {
                try {
                    manager.removeView(view);
                    removed = true;
                } catch (Exception plain) {
                    // Left for the attachment check below: a view the platform no
                    // longer knows about has already left the screen.
                }
            }
        }

        if (removed || !view.isAttachedToWindow()) {
            drawnGates.remove(view);
            return true;
        }
        return false;
    }

    /**
     * Make a gate window harmless, whether or not it can be taken off the screen.
     *
     * This is the half of dismissal that has to hold even when the platform will
     * not give the window back: one pixel of nothing, drawing nothing, taking no
     * taps and no keys. A gate that cannot be removed must never also be a gate
     * that cannot be got past — the reader's phone stays usable either way.
     */
    private static void neutralise(View view) {
        try {
            view.setAlpha(0f);
            view.setVisibility(View.GONE);
        } catch (Exception ignored) {
            // No window to talk to any more; nothing is being drawn either way.
        }

        ViewGroup.LayoutParams params = view.getLayoutParams();
        if (!(params instanceof WindowManager.LayoutParams)) return;
        WindowManager.LayoutParams overlay = (WindowManager.LayoutParams) params;
        overlay.width = 1;
        overlay.height = 1;
        overlay.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        WindowManager manager = managerFor(view.getContext());
        if (manager == null) return;
        try {
            manager.updateViewLayout(view, overlay);
        } catch (Exception ignored) {
            // Already gone, or no longer ours to resize. Either way it is not
            // covering the screen in the meantime.
        }
    }

    /**
     * Keep asking the platform for a window that would not be given back.
     *
     * A removal can be refused while the display is changing under the window, or
     * while the window manager is still holding the token of a service that has
     * been stopped. The window is harmless by then (neutralise), so this is only
     * about not leaving a dead window on the display for the rest of the phone's
     * uptime. A few attempts at a quarter-second, then the view is forgotten: it
     * covers nothing, so there is nothing left to ask for.
     */
    private static void retryTakeDown(final View view, final int attempt) {
        cleanup.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (takeDown(view)) return;
                if (attempt < 12) {
                    retryTakeDown(view, attempt + 1);
                } else {
                    drawnGates.remove(view);
                }
            }
        }, 250L);
    }

    /** The window manager this process' overlay windows belong to. */
    private static WindowManager managerFor(Context context) {
        if (context == null) return null;
        try {
            return (WindowManager) context.getApplicationContext()
                .getSystemService(Context.WINDOW_SERVICE);
        } catch (Exception e) {
            return null;
        }
    }

    // ---------------------------------------------------------------------
    // The gate itself
    // ---------------------------------------------------------------------

    /**
     * The gate: the reader's own app name, the verse the lock is there for, what
     * it is waiting on, the way into the app, and the way out of the held app.
     *
     * Built in code rather than inflated from a layout so all of it lives in one
     * readable place and the two entrances (the gate and the pages) can share the
     * same palette without a second set of resource names. The colours are the
     * reader's own — whichever skin and light or dark the page last wrote (see
     * `palette` and GateAppearance) — so the gate does not look like a piece of a
     * different product than the app it is standing in front of.
     *
     * The primary action is deliberately "Open Gospel Focus" rather than
     * "Dismiss": a gate that only closes would be a bump in the road, and the
     * one thing that opens it for good is the day's study. The second button
     * leaves the held app for the home screen instead of dissolving the lock.
     * Nothing else is asked for in small type: the reader is looking at the one
     * screen they did not choose to open, so it says the one thing that opens it
     * and the one thing that leaves, and stops.
     *
     * The corner close is the exception, and it is there on purpose: it is the
     * smallest thing on the gate and the one that has to work when nothing else
     * does. A screen that has to be got past by a reader who cannot get past it is
     * a reboot, and there is no version of this window worth that (see takeDown).
     */
    private View buildGate(String pkg) {
        Palette palette = palette();
        String appName = labelFor(pkg);
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

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView tile = new TextView(this);
        tile.setText("🔒");
        tile.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        tile.setGravity(Gravity.CENTER);
        tile.setBackground(rounded(palette.surface2, 18, 0, 0));
        header.addView(tile, new LinearLayout.LayoutParams(dp(56), dp(56)));

        View gap = new View(this);
        header.addView(gap, new LinearLayout.LayoutParams(0, 1, 1f));

        // The corner close: the reader's way out that does not depend on any other
        // part of this window working, and the first thing a stuck gate needs.
        // It leaves the held app for the home screen, exactly as the "Close"
        // button below does — the lock is not dissolved, only this screen.
        TextView dismiss = new TextView(this);
        dismiss.setText("✕");
        dismiss.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        dismiss.setTextColor(palette.foreground);
        dismiss.setGravity(Gravity.CENTER);
        dismiss.setBackground(rounded(palette.surface2, 999, palette.border, 1));
        dismiss.setContentDescription("Close and go home");
        dismiss.setFocusable(true);
        dismiss.setClickable(true);
        dismiss.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                goHome();
            }
        });
        header.addView(dismiss, new LinearLayout.LayoutParams(dp(48), dp(48)));

        card.addView(header, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView eyebrow = label("FOCUS LOCK", 11, palette.accentStrong,
            Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        eyebrow.setLetterSpacing(0.14f);
        add(card, eyebrow, 20);

        TextView heading = label(appName + " is locked", 24, palette.foreground,
            face(palette, Typeface.BOLD));
        add(card, heading, 8);

        // The verse the lock is for, set the way a quote is set in print: a rule
        // down the side, the words in italic serif, the reference below them.
        VerseBlock verse = new VerseBlock(palette.accent, dp(3), dp(16));

        TextView quote = label(
            "Seek ye first the kingdom of God, and his righteousness; and all these things shall be "
                + "added unto you.",
            17, palette.foreground, face(palette, Typeface.ITALIC));
        quote.setLineSpacing(dp(5), 1f);
        verse.addView(quote, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView reference = label("Matthew 6:33", 13, palette.muted, null);
        add(verse, reference, 8);
        add(card, verse, 18);

        TextView body = label(
            "Today's gospel study isn't finished. Complete your daily goal to unlock blocked apps.",
            15, palette.muted, null);
        body.setLineSpacing(dp(3), 1f);
        add(card, body, 18);

        Button open = gateButton("Open Gospel Focus", palette.action, palette.actionContrast, 0);
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openApp();
            }
        });
        add(card, open, 22);

        Button close = gateButton("Close " + appName, palette.surface2, palette.foreground, palette.border);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                goHome();
            }
        });
        add(card, close, 10);

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

    /**
     * The verse the lock is for: a rule down the side, the words beside it, the
     * reference below.
     *
     * The block draws the rule itself rather than holding a bar view beside the
     * quote, because how many lines the quote takes depends on the font scale and
     * a sibling bar would have to know that height before the text had been
     * measured. The left padding is the rule plus the gap after it, so the words
     * never sit on it.
     */
    private final class VerseBlock extends LinearLayout {
        private final Paint rule = new Paint();
        private final int ruleWidth;

        VerseBlock(int color, int ruleWidth, int gap) {
            super(FocusAccessibilityService.this);
            setOrientation(VERTICAL);
            setPadding(ruleWidth + gap, 0, 0, 0);
            setWillNotDraw(false);
            rule.setColor(color);
            this.ruleWidth = ruleWidth;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            canvas.drawRect(0, 0, ruleWidth, getHeight(), rule);
        }
    }

    private GradientDrawable rounded(int fill, int radiusDp, int strokeColor, int strokeWidthDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.RECTANGLE);
        shape.setColor(fill);
        shape.setCornerRadius(dp(radiusDp));
        if (strokeWidthDp > 0) shape.setStroke(dp(strokeWidthDp), strokeColor);
        return shape;
    }

    /**
     * The gate's colours, read off one skin of globals.css.
     *
     * `accent` is the gold the verse's rule is drawn in; `accentStrong` is the same
     * voice as type, which is what the stylesheet calls the reading tone (`FOCUS
     * LOCK` and links) and what clears contrast where the gold does not. `action`
     * is the primary button's face, and it is the one place the two skins differ in
     * kind rather than degree: the focused skin's main action is its gold, while the
     * playful skin puts its gold on the supporting calls and its blue on the button
     * that matters.
     *
     * `playful` rides along because it is also a choice of face, not just of colour
     * (see `face`).
     */
    private static final class Palette {
        final boolean playful;
        final int background;
        final int surface;
        final int surface2;
        final int foreground;
        final int muted;
        final int border;
        final int accent;
        final int accentStrong;
        final int action;
        final int actionContrast;

        Palette(boolean playful, int background, int surface, int surface2, int foreground, int muted,
                int border, int accent, int accentStrong, int action, int actionContrast) {
            this.playful = playful;
            this.background = background;
            this.surface = surface;
            this.surface2 = surface2;
            this.foreground = foreground;
            this.muted = muted;
            this.border = border;
            this.accent = accent;
            this.accentStrong = accentStrong;
            this.action = action;
            this.actionContrast = actionContrast;
        }
    }

    /**
     * The palette of the skin the reader actually wears.
     *
     * Written by the page (GateAppearance), because neither choice is knowable from
     * here: light or dark is next-themes', and the skin is a preference of the
     * app's own. Until the page has said, the gate keeps the behaviour it had before
     * the styles were wired up — the device's night mode, in the focused skin — since
     * a guess in the wrong skin is worse than a gate that matches the system.
     */
    private Palette palette() {
        boolean known = GateAppearance.known(this);
        // A reader on "follow the device" is read from the device here, not from
        // the last value written: the screens can turn over while the app is
        // closed, which is the whole point of following them.
        boolean night = !known || GateAppearance.followsDevice(this)
            ? (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES
            : GateAppearance.dark(this);
        boolean playful = known && GateAppearance.playful(this);

        if (playful && night) {
            // .playful.dark: the lamp-lit charcoal, gold for the verse, blue action.
            return new Palette(true,
                Color.parseColor("#111111"), Color.parseColor("#1B1B1B"), Color.parseColor("#333333"),
                Color.parseColor("#F2F2F2"), Color.parseColor("#B0B0B0"), Color.parseColor("#424242"),
                Color.parseColor("#F8AE35"), Color.parseColor("#FFC861"),
                Color.parseColor("#1DADF1"), Color.parseColor("#FFFFFF"));
        }
        if (playful) {
            // .playful: the toy-like cream, orange for the verse, blue action.
            return new Palette(true,
                Color.parseColor("#FBF0DA"), Color.parseColor("#FFFDF7"), Color.parseColor("#F6E7CA"),
                Color.parseColor("#3B2A16"), Color.parseColor("#7A6244"), Color.parseColor("#E8D2A8"),
                Color.parseColor("#F8AE35"), Color.parseColor("#9A4A06"),
                Color.parseColor("#1DADF1"), Color.parseColor("#FFFFFF"));
        }
        if (night) {
            // .dark: paper and ink at night, the gold as the one warm thing.
            return new Palette(false,
                Color.parseColor("#111111"), Color.parseColor("#1B1B1B"), Color.parseColor("#333333"),
                Color.parseColor("#F2F2F2"), Color.parseColor("#B0B0B0"), Color.parseColor("#424242"),
                Color.parseColor("#E0B45C"), Color.parseColor("#F0C877"),
                Color.parseColor("#E0B45C"), Color.parseColor("#1A1A1A"));
        }
        // :root: the parchment, with the gold on the button as well as the verse.
        return new Palette(false,
            Color.parseColor("#F7F2E7"), Color.parseColor("#FFFDF7"), Color.parseColor("#F1E9D7"),
            Color.parseColor("#2A2118"), Color.parseColor("#7A6B53"), Color.parseColor("#E2D6BD"),
            Color.parseColor("#9A6B1F"), Color.parseColor("#7C5514"),
            Color.parseColor("#9A6B1F"), Color.parseColor("#FFFDF7"));
    }

    /**
     * The skin's display face: the voice its headings and verse are set in.
     *
     * The focused skin is paper and ink, so it sets them in the serif the app uses
     * for its passages. The playful skin speaks in Nunito, which is not on the
     * device — the platform's own sans is the honest stand-in, and it is closer to
     * that rounded voice than a serif would be.
     */
    private static Typeface face(Palette palette, int style) {
        return Typeface.create(palette.playful ? "sans-serif" : "serif", style);
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

    /**
     * Mark the gate as left, from whatever took the reader away from it.
     *
     * One place because all of the exits are the same moment: the held app is
     * put back behind something else, and the window change that follows is the
     * tail of the leave rather than a launch (isLeaveEcho). The Close button and
     * Back (goHome), Open Gospel Focus (openApp), any other window arriving
     * while the gate is up (onAccessibilityEvent), and the guard finding the
     * reader somewhere else (gateGuard) all record it here, so that no one of
     * them can remember half of it and leave the gate able to put itself back up
     * over the screen the reader asked for.
     *
     * Not a dismissal: nothing here opens the lock. The leave only covers the
     * moment it takes the app to go away, and opening the app after that is
     * opening the app, gated as usual.
     *
     * A leave already being settled is not moved on by the screen the reader is
     * on chattering — a launcher that reports every swipe of its own — because
     * the window is measured from leaving, not from the last thing the reader
     * did once they had gone. Left unguarded, a busy home screen could hold the
     * gate off the app the reader opens next for as long as it kept talking.
     */
    private void recordLeave(String held) {
        if (held == null) return;
        long now = SystemClock.uptimeMillis();
        if (held.equals(leftPackage) && now - leftAt < LEAVE_SETTLE_MS) return;
        leftPackage = held;
        leftAt = now;
        lastLeaveAt = now;
    }

    private void openApp() {
        // Taken down here rather than left to the app's own window change: the
        // service ignores this package's window changes while the gate is up
        // (isGateEcho), so nothing else would close it. This app is where the
        // reader now is, so a wake must not bring the gate back over it either.
        //
        // The held app is recorded as left for the same reason Close does it:
        // taking the gate down hands that app its window back for a moment, and
        // the framework reports that as the app arriving. Without this, the gate
        // went straight back up — over the Gospel Focus screen the button had
        // just opened, which is a button that looks like it does nothing.
        //
        // The window is taken down, made harmless and forgotten before anything
        // is started, so a launch that fails leaves the reader on a usable screen
        // rather than on a gate whose button looks dead.
        recordLeave(gatePackage);
        lastPackage = getPackageName();
        appPackage = getPackageName();
        hideGate();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            // The gate is already down and harmless, so a failed launch leaves
            // the reader where they were rather than on a button that looks dead.
        }
    }

    /**
     * Leave the held app for the home screen, gate and all.
     *
     * The gate is taken down here rather than left to the home screen's own
     * window change: the reader asked to leave, the home screen is where they
     * are going, and the gate that comes down hands the held app its window back
     * for a moment — which the system reports as that app's window change (see
     * leftPackage). Without both halves, the gate goes back up over the home
     * screen with nothing left in front to take it down.
     *
     * The window is made harmless before the home action is asked for (see
     * takeDown): the reader pressed a button that says it goes home, so whether
     * the action succeeds, is refused, or the window will not come off the screen,
     * the screen behind it is theirs again.
     */
    private void goHome() {
        recordLeave(gatePackage);
        lastPackage = null;
        appPackage = null;
        handler.removeCallbacks(bypassCheck);
        hideGate();

        // The service's own Home action rather than an activity launch. Starting
        // an activity from behind another app can be refused outright by newer
        // Androids, and a refusal used to look like a dead button: the gate had
        // already gone, the held app was still in front, and the window change
        // that follows drew the gate again over it. performGlobalAction is the
        // home button itself, not a launch, so there is nothing to refuse.
        boolean home = false;
        try {
            home = performGlobalAction(GLOBAL_ACTION_HOME);
        } catch (Exception ignored) {
            // Nothing thrown here is worth the reader's time; the launch below
            // is the other way home.
        }
        if (home) return;

        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_HOME);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            // Nowhere to send the reader. The gate stays down rather than coming
            // back: a Close that cannot close is the button that leaves the
            // reader with no way out, and an app left in front with no gate is
            // the far better failure. The next window change asks again whether
            // the gate belongs on it.
        }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /**
     * A system bar's own thickness, from the platform's resources, or 0.
     *
     * The same figure the system lays the bar out with, asked of the same package,
     * rather than a number guessed at here — the bars are 24dp on one device and
     * 48dp on the next, and an overlay built on the smaller guess covers the
     * larger bar.
     */
    private int systemBarSize(String name) {
        int id = getResources().getIdentifier(name, "dimen", "android");
        return id == 0 ? 0 : Math.round(getResources().getDimension(id));
    }

    /**
     * Keep the gate's frame between the system bars — measured, not asked for.
     *
     * `setFitInsetsTypes(systemBars())` is the documented way to say "end at the
     * bars", and this window used to say it — but it does not do what it says for
     * this window type on every platform. Measured on Android 14, a
     * `TYPE_ACCESSIBILITY_OVERLAY` whose height was `MATCH_PARENT` with those fit
     * insets set was laid out from just under the status bar to the very bottom of
     * the display: the status bar inset was applied and the navigation bar's was
     * not. Over the navigation bar is over the home button and the home gesture, so
     * the reader's way out of the phone was covered by the window that is there to
     * be a nuisance — the exact state this class must not be able to produce (see
     * the class comment, and `takeDown`).
     *
     * So the frame is computed here instead, from the display's bounds and the
     * bars' current insets, and the window is told to lay itself out against the
     * whole screen (`FLAG_LAYOUT_IN_SCREEN`) so those numbers mean what they say
     * rather than being relative to the status bar. Gesture navigation, button
     * navigation, cutouts and a fold are all the platform's own insets, asked of
     * the display this window is going on; nothing is guessed at in dp.
     *
     * The measured figures ignore the bars' visibility on purpose: a bar that is
     * hidden right now is still the system's to bring back, and a gate over it
     * would be over it when it came back.
     */
    private void betweenBars(WindowManager.LayoutParams params) {
        // The resource sizes, for the platforms with no better answer (see below)
        // and as the fallback if the display will not be asked.
        int bar = Math.max(
            systemBarSize("navigation_bar_height"), systemBarSize("navigation_bar_width"));
        int status = systemBarSize("status_bar_height");
        int width = getResources().getDisplayMetrics().widthPixels;
        int height = getResources().getDisplayMetrics().heightPixels;

        params.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Laid out against the whole screen, so x/y below are display
            // coordinates rather than offsets inside the app area the window
            // manager would otherwise place this window in.
            params.flags |= WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
            try {
                WindowMetrics metrics = windowManager.getCurrentWindowMetrics();
                Rect bounds = metrics.getBounds();
                android.graphics.Insets bars = metrics.getWindowInsets().getInsetsIgnoringVisibility(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                width = bounds.width();
                height = bounds.height();
                params.x = bars.left;
                params.y = bars.top;
                params.width = Math.max(dp(280), width - bars.left - bars.right);
                params.height = Math.max(dp(360), height - bars.top - bars.bottom);
                return;
            } catch (Exception e) {
                // Measured against the resources instead; the frame is still short
                // of both bars, which is the half that matters.
                Log.w(TAG, "Could not measure the system bars", e);
            }
        } else {
            // Fit insets arrived with API 30, and before them an overlay has no way
            // to say "end at the bars" — while this window type is drawn above the
            // navigation bar (layer 31 against its 24), so over them it goes. The
            // bars are measured out of the window instead, with a band wide enough
            // for one on any edge, and it is centred inside what is left.
            params.gravity = Gravity.CENTER;
        }

        params.width = Math.max(dp(280), width - bar);
        params.height = Math.max(dp(360), height - status - bar);
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
            int key = event.getKeyCode();
            if (key == KeyEvent.KEYCODE_BACK) {
                if (event.getAction() == KeyEvent.ACTION_UP) goHome();
                return true;
            }
            // Home reaches the focused window, which is this one, and left
            // unhandled it is the system's to act on behind a gate that stays
            // where it is. Handled here, the gate comes down on the way — the
            // same leave as the buttons, through the same call.
            if (key == KeyEvent.KEYCODE_HOME) {
                if (event.getAction() == KeyEvent.ACTION_UP) goHome();
                return true;
            }
            return super.dispatchKeyEvent(event);
        }
    }
}
