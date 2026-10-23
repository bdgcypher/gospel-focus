package app.gospelfocus.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * The minutes the reader spends in the Gospel Library, counted by the same
 * accessibility service that holds apps back.
 *
 * Reading in the Church's own app is studying, and the daily goal is about the
 * reading rather than about this app being open — so time there counts too
 * (lib/study.ts). The web half cannot see another app at all, which is why this
 * is the service's job: it already hears every window change, and the package in
 * front is the whole of what it needs to know.
 *
 * Seconds, not minutes, and per local day, because that is the unit the study
 * store counts in and the day it rolls on (lib/daily.ts). The day is the device's
 * own, written in the same shape the lock's day keys use.
 *
 * What the service cannot know is how much of this to *credit*: whether the day
 * still has room in it, and whether the reader has a goal at all. So nothing here
 * decides — this keeps a running total for today and the page takes what it can
 * use (components/gospel-library-sync.tsx). That is also what lets a goal raised
 * in the afternoon pick up the Gospel Library time already spent against the old
 * one, rather than throwing it away.
 *
 * The clock is held in memory rather than in the preferences: the span between
 * one window change and the next is seconds or minutes, and a bank is written
 * whenever the reader leaves the app, turns the screen off, or the service is
 * torn down. A process killed mid-read loses at most the current stretch, and
 * that is the price of not writing to disk on every app switch.
 */
final class GospelStudy {

    /**
     * The Gospel Library's package, as the app is published:
     * https://play.google.com/store/apps/details?id=org.lds.ldssa
     */
    static final String PACKAGE = "org.lds.ldssa";

    /** The preferences file this keeps today's total in. */
    private static final String PREFS = "gospel_study";

    private static final String DAY = "day";
    private static final String SECONDS = "seconds";

    /**
     * The longest a single bank can credit.
     *
     * A screen that never went off — a plugged-in phone left open on a page —
     * would otherwise credit hours it cannot vouch for. Three hours is far past
     * any day's goal, so the cap can only ever bite on a span that is already
     * suspect, and it keeps one bad evening from deciding a week of streaks.
     */
    private static final long MAX_BANK_MS = 3L * 60L * 60L * 1000L;

    /** Wall-clock time the Gospel Library came to the front, or 0 when it is not. */
    private static long since;

    private GospelStudy() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Note what is in front now.
     *
     * Called for every window change the service hears, and with null when the
     * screen goes off or the service is going away. The clock starts when the
     * Gospel Library arrives and is banked when anything else does — including
     * this app, which is what a reader leaving it for the gate looks like.
     */
    static void see(Context context, String front) {
        if (PACKAGE.equals(front)) {
            if (since == 0) since = System.currentTimeMillis();
            return;
        }
        bank(context);
    }

    /** Add the stretch since the Gospel Library came to the front, and stop. */
    static void bank(Context context) {
        if (since == 0) return;
        long now = System.currentTimeMillis();
        long elapsed = now - since;
        since = 0;
        if (elapsed <= 0) return;

        long seconds = Math.min(elapsed, MAX_BANK_MS) / 1000L;
        if (seconds <= 0) return;

        SharedPreferences prefs = prefs(context);
        String today = FocusLockState.dayKey();
        long kept = today.equals(prefs.getString(DAY, "")) ? prefs.getLong(SECONDS, 0L) : 0L;
        prefs.edit().putString(DAY, today).putLong(SECONDS, kept + seconds).apply();
    }

    /**
     * Today's seconds in the Gospel Library, or 0 once the day has turned over.
     *
     * The day is checked rather than rolled here: yesterday's total is not
     * today's, and a service that woke up after midnight should say so plainly
     * rather than carry the old number forward.
     */
    static long secondsToday(Context context) {
        SharedPreferences prefs = prefs(context);
        if (!FocusLockState.dayKey().equals(prefs.getString(DAY, ""))) return 0L;
        return prefs.getLong(SECONDS, 0L);
    }

}
