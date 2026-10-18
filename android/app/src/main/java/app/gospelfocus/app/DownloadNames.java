package app.gospelfocus.app;

import java.util.function.Predicate;

/**
 * The naming rules for a downloaded file: a name Android will accept, and one
 * that never overwrites an earlier download.
 *
 * Kept apart from the plugin so the rules can be exercised on their own — the
 * rest of the plugin needs a real device.
 */
final class DownloadNames {

    private DownloadNames() {}

    /** How many "name (1).ext" attempts before falling back to a timestamp. */
    private static final int MAX_ATTEMPTS = 100;

    /**
     * A file name the platform will accept. Names come from our own JavaScript,
     * but an invalid one would make MediaStore throw instead of saving the
     * file, so separators and control characters are neutralised.
     */
    static String sanitize(String name) {
        String cleaned = name == null ? "" : name.trim().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-");
        return cleaned.isEmpty() ? "download" : cleaned;
    }

    /**
     * The first free name — "backup.csv", then "backup (1).csv", "backup (2).csv" —
     * so a second export sits beside the first instead of replacing it.
     */
    static String unique(String name, Predicate<String> taken) {
        if (!taken.test(name)) return name;

        String[] parts = split(name);
        String candidate = name;
        for (int i = 1; i <= MAX_ATTEMPTS; i++) {
            candidate = parts[0] + " (" + i + ")" + parts[1];
            if (!taken.test(candidate)) return candidate;
        }
        return parts[0] + "-" + System.currentTimeMillis() + parts[1];
    }

    /** A name's stem and extension; a leading dot stays part of the stem. */
    static String[] split(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? new String[] { name.substring(0, dot), name.substring(dot) } : new String[] { name, "" };
    }
}
