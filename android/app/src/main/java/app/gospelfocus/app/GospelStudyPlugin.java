package app.gospelfocus.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reads back the Gospel Library minutes the accessibility service counted.
 *
 * One direction only. The reading happens in the service, which is the only half
 * that can see another app; this hands today's total to the page, and the page
 * decides how much of it the day's goal still has room for (lib/study.ts,
 * components/gospel-library-sync.tsx). Nothing is written from here, so there is
 * no state for the two sides to disagree about.
 *
 * The service has to be switched on for there to be anything to read — that is
 * the same accessibility grant Focus Lock asks for, and the reason the count
 * exists at all rather than being read from somewhere else.
 *
 * The JavaScript half is lib/native-study.ts.
 */
@CapacitorPlugin(name = "GospelStudy")
public class GospelStudyPlugin extends Plugin {

    /** Seconds spent in the Gospel Library today, on the device's own day. */
    @PluginMethod
    public void today(PluginCall call) {
        JSObject result = new JSObject();
        result.put("seconds", GospelStudy.secondsToday(getContext()));
        call.resolve(result);
    }
}
