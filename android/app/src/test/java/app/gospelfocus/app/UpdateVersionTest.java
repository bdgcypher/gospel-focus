package app.gospelfocus.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The tag-to-version-code rule the update checker compares against.
 *
 * Worth a test because the two sides are written in different places: CI stamps
 * the installed app with a code derived from the tag, and this class derives the
 * released app's code from the same tag. If they ever disagree, every launch
 * either announces an update that is already installed or announces nothing at
 * all — and neither shows up as an error anywhere.
 */
public class UpdateVersionTest {

    @Test
    public void matchesTheVersionCodeCiStamps() {
        assertEquals(30006, UpdateVersion.code("v3.0.6"));
        assertEquals(10000, UpdateVersion.code("v1.0.0"));
        assertEquals(10203, UpdateVersion.code("v1.2.3"));
    }

    @Test
    public void ignoresAnythingThatIsNotARelease() {
        assertEquals(0, UpdateVersion.code(null));
        assertEquals(0, UpdateVersion.code(""));
        assertEquals(0, UpdateVersion.code("3.0"));
        assertEquals(0, UpdateVersion.code("3.0.6-beta"));
        assertEquals(0, UpdateVersion.code("nightly"));
        assertEquals(0, UpdateVersion.code("v3.0.x"));
    }

    @Test
    public void ordersReleasesTheWayVersionCodesDo() {
        assertTrue(UpdateVersion.code("v3.0.10") > UpdateVersion.code("v3.0.9"));
        assertTrue(UpdateVersion.code("v3.1.0") > UpdateVersion.code("v3.0.99"));
        assertTrue(UpdateVersion.code("v4.0.0") > UpdateVersion.code("v3.99.99"));
    }

    @Test
    public void readsLeadingZeroesAsNumbers() {
        assertEquals(30006, UpdateVersion.code("v03.00.06"));
    }
}
