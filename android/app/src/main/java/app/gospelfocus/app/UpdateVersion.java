package app.gospelfocus.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Release tags as the version codes Android compares.
 *
 * The app has one number to decide "is that newer than this": the version code
 * in the APK. Releases are named by tag, and CI derives the code from it with a
 * fixed formula — {@code vX.Y.Z} becomes {@code X * 10000 + Y * 100 + Z} (see
 * "Apply version from tag" in .github/workflows/android-apk.yml). This is that
 * formula, in one place, so the checker and the build cannot disagree about
 * what a tag means.
 *
 * A tag that is not {@code vX.Y.Z} returns 0, which the caller treats as "there
 * is nothing here to compare" rather than as a version: a release named
 * {@code nightly} or {@code v3.0.6-rc1} is ignored instead of being announced
 * as an update on every check. 0 is safe as a sentinel because no real release
 * is 0.0.0 — and a local debug build at version code 1 is deliberately older
 * than every tagged release, so the checker has something to say on a
 * development build too.
 */
final class UpdateVersion {

    private static final Pattern TAG = Pattern.compile("^v?(\\d+)\\.(\\d+)\\.(\\d+)$");

    private UpdateVersion() {}

    /**
     * The version code CI stamps for a release tag, or 0 when the tag is not a
     * release.
     *
     * The pieces are read as numbers rather than compared as strings, so
     * {@code v3.0.10} sorts above {@code v3.0.9}, and {@code v03.0.6} lands on
     * the same code as {@code v3.0.6}, because the installed app only knows the
     * number.
     */
    static int code(String tag) {
        if (tag == null) return 0;
        Matcher match = TAG.matcher(tag.trim());
        if (!match.matches()) return 0;
        try {
            long major = Long.parseLong(match.group(1));
            long minor = Long.parseLong(match.group(2));
            long patch = Long.parseLong(match.group(3));
            long code = major * 10000 + minor * 100 + patch;
            // A tag whose code will not fit an int is a mistake, not a release.
            return code > Integer.MAX_VALUE ? 0 : (int) code;
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
