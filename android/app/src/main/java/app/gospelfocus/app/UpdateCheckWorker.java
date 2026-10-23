package app.gospelfocus.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * The eight-hourly update check, and the one that runs when the app opens.
 *
 * WorkManager rather than an alarm or a service: the check is a single small
 * request to GitHub, it needs the network and nothing else, and it must happen
 * whether or not the app is running — which is exactly the job WorkManager
 * exists for. It survives reboots and Doze on its own (no boot receiver to
 * write), batches the wake-up with whatever else the system is doing, and holds
 * the work until there is a connection instead of firing into a phone that is
 * offline.
 *
 * The period is Android's own approximation of "about every eight hours": the
 * system may run it later, never sooner, and will not wake a sleeping phone to
 * do it. That is the right trade for something as unurgent as an update.
 *
 * `checkNow` is what the app-open half of the feature calls (MainActivity). It
 * is a one-off piece of work rather than a check on the main thread: the launch
 * path should not wait on DNS, and a reader who opens the app in a tunnel should
 * still get the page.
 */
public class UpdateCheckWorker extends Worker {

    /** How often the background check runs while the app is closed. */
    private static final long PERIOD_HOURS = 8;

    /** Named so a later launch replaces the one queued by an earlier one. */
    private static final String PERIODIC_WORK = "gospel-focus-update-check";
    private static final String NOW_WORK = "gospel-focus-update-check-now";

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            UpdateCheck.check(getApplicationContext());
        } catch (Exception e) {
            // No network, GitHub did not answer, or a release we cannot read:
            // there is nothing to tell the reader, and the next window will ask
            // again anyway. A retry here would only spend the battery on a check
            // nobody is waiting for.
        }
        return Result.success();
    }

    /**
     * Make sure the periodic check exists. Safe to call on every launch: the
     * request is unique, so this either creates it once or updates it in place
     * (which is how a change to the period reaches an installed app).
     */
    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            UpdateCheckWorker.class,
            PERIOD_HOURS,
            TimeUnit.HOURS
        ).setConstraints(constraints).build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    /** Check now — the launch half of the feature. */
    static void checkNow(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(UpdateCheckWorker.class)
            .setConstraints(constraints)
            .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }
}
