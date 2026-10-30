package edu.iitm.cs5013;

import edu.iitm.cs5013.matcher.ExactTimestampMatcher;
import edu.iitm.cs5013.model.MatchResult;
import edu.iitm.cs5013.model.SensorParseResult;
import edu.iitm.cs5013.model.SensorType;
import edu.iitm.cs5013.parser.CsvSensorParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

public class CsvSensorParserTest {

    @Test
    @DisplayName("Should successfully parse Smartwatch Heart Rate CSV with standard headers")
    void testParseSmartwatchHeartRate() {
        String csv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,72.0\n" +
                "2026-10-11T10:00:01Z,75.5\n" +
                "2026-10-11T10:00:02Z,78.0\n";

        SensorParseResult res = CsvSensorParser.parse(csv, SensorType.SMARTWATCH_HEART_RATE, "smartwatch.csv");
        assertTrue(res.isSuccess());
        assertEquals(3, res.getValidDataPointsCount());
        assertEquals(72.0, res.getMinValue());
        assertEquals(78.0, res.getMaxValue());
        assertEquals("BPM", res.getUnit());
    }

    @Test
    @DisplayName("Should parse Vehicle Acceleration with positive and negative values")
    void testParseVehicleAcceleration() {
        String csv = "timestamp,acceleration\n" +
                "2026-10-11T10:00:00Z,-2.4\n" +
                "2026-10-11T10:00:01Z,0.0\n" +
                "2026-10-11T10:00:02Z,1.8\n";

        SensorParseResult res = CsvSensorParser.parse(csv, SensorType.VEHICLE_ACCELERATION, "acceleration.csv");
        assertTrue(res.isSuccess());
        assertEquals(3, res.getValidDataPointsCount());
        assertEquals(-2.4, res.getMinValue());
        assertEquals(1.8, res.getMaxValue());
        assertEquals("m/s²", res.getUnit());
    }

    @Test
    @DisplayName("Should fail gracefully when required measurement column is missing")
    void testMissingRequiredColumn() {
        String csv = "timestamp,latitude,longitude\n" +
                "2026-10-11T10:00:00Z,12.99,80.23\n";

        SensorParseResult res = CsvSensorParser.parse(csv, SensorType.VEHICLE_VELOCITY, "gps_only.csv");
        assertFalse(res.isSuccess());
        assertFalse(res.getErrors().isEmpty());
        assertTrue(res.getErrors().get(0).contains("Missing required measurement column"));
    }

    @Test
    @DisplayName("Should match strictly on exact timestamp equality and reject unmatched records")
    void testExactTimestampMatching() {
        String hrCsv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,70\n" +
                "2026-10-11T10:00:02Z,75\n" +
                "2026-10-11T10:00:05Z,80\n";

        String velCsv = "timestamp,velocity\n" +
                "2026-10-11T10:00:00Z,30.0\n" +
                "2026-10-11T10:00:02Z,45.0\n" +
                "2026-10-11T10:00:03Z,50.0\n";

        SensorParseResult hrRes = CsvSensorParser.parse(hrCsv, SensorType.SMARTWATCH_HEART_RATE, "hr.csv");
        SensorParseResult velRes = CsvSensorParser.parse(velCsv, SensorType.VEHICLE_VELOCITY, "vel.csv");

        MatchResult match = ExactTimestampMatcher.match(velRes, hrRes, "Vehicle Velocity", "Smartwatch Heart Rate");
        assertTrue(match.isHasSufficientMatches());
        assertEquals(2, match.getMatchCount());
        assertEquals(30.0, match.getMatchedPoints().get(0).getxValue());
        assertEquals(70.0, match.getMatchedPoints().get(0).getyValue());
    }

    @Test
    @DisplayName("Should display informative message when zero exact timestamp matches exist")
    void testZeroMatchesMessage() {
        String hrCsv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,70\n";

        String velCsv = "timestamp,velocity\n" +
                "2026-10-11T11:00:00Z,40.0\n";

        SensorParseResult hrRes = CsvSensorParser.parse(hrCsv, SensorType.SMARTWATCH_HEART_RATE, "hr.csv");
        SensorParseResult velRes = CsvSensorParser.parse(velCsv, SensorType.VEHICLE_VELOCITY, "vel.csv");

        MatchResult match = ExactTimestampMatcher.match(velRes, hrRes, "Vehicle Velocity", "Smartwatch Heart Rate");
        assertFalse(match.isHasSufficientMatches());
        assertEquals(0, match.getMatchCount());
        assertTrue(match.getMessage().contains("Insufficient exact timestamp matches"));
    }

    @Test
    @DisplayName("Should successfully parse Nissan Magnite GNSS log for Vehicle Velocity")
    void testParseNissanMagniteGnssVelocity() throws Exception {
        Path path = Paths.get("Nissan Magnite", "gnss_log_2026_09_10_09_00_29.csv");
        if (!Files.exists(path)) return;

        String content = Files.readString(path);
        SensorParseResult res = CsvSensorParser.parse(content, SensorType.VEHICLE_VELOCITY, path.getFileName().toString());

        assertTrue(res.isSuccess());
        assertEquals("km/h", res.getUnit());
        assertEquals(12818, res.getValidDataPointsCount());
        assertEquals(0.0, res.getMinValue(), 0.001);
        assertTrue(res.getMaxValue() > 70.0);
    }

    @Test
    @DisplayName("Should successfully parse Nissan Magnite GNSS log for Vehicle Acceleration including negative decelerations")
    void testParseNissanMagniteGnssAcceleration() throws Exception {
        Path path = Paths.get("Nissan Magnite", "gnss_log_2026_09_10_09_00_29.csv");
        if (!Files.exists(path)) return;

        String content = Files.readString(path);
        SensorParseResult res = CsvSensorParser.parse(content, SensorType.VEHICLE_ACCELERATION, path.getFileName().toString());

        assertTrue(res.isSuccess());
        assertEquals("m/s²", res.getUnit());
        assertEquals(12817, res.getValidDataPointsCount());
        assertTrue(res.getMinValue() < -3.0, "Deceleration must be negative");
        assertTrue(res.getMaxValue() > 2.0, "Acceleration must be positive");

        long negCount = res.getDataPoints().stream().filter(p -> p.getValue() < 0).count();
        assertTrue(negCount > 4000, "Should have over 4000 negative acceleration records");
    }

    @Test
    @DisplayName("Should pair Nissan Magnite GNSS Velocity and Acceleration on exact timestamps")
    void testMatchNissanMagniteVelocityAndAcceleration() throws Exception {
        Path path = Paths.get("Nissan Magnite", "gnss_log_2026_09_10_09_00_29.csv");
        if (!Files.exists(path)) return;

        String content = Files.readString(path);
        SensorParseResult vel = CsvSensorParser.parse(content, SensorType.VEHICLE_VELOCITY, path.getFileName().toString());
        SensorParseResult acc = CsvSensorParser.parse(content, SensorType.VEHICLE_ACCELERATION, path.getFileName().toString());

        MatchResult match = ExactTimestampMatcher.match(vel, acc, "Vehicle Velocity", "Vehicle Acceleration");
        assertTrue(match.isHasSufficientMatches());
        assertEquals(12816, match.getMatchCount());
        assertNotNull(match.getMatchedPoints().get(0));
    }

    @Test
    @DisplayName("Should reject GNSS log file when uploaded to Smartwatch Heart Rate sensor")
    void testRejectGnssForHeartRate() throws Exception {
        Path path = Paths.get("Nissan Magnite", "gnss_log_2026_09_10_09_00_29.csv");
        if (!Files.exists(path)) return;

        String content = Files.readString(path);
        SensorParseResult res = CsvSensorParser.parse(content, SensorType.SMARTWATCH_HEART_RATE, path.getFileName().toString());

        assertFalse(res.isSuccess());
        assertTrue(res.getErrors().get(0).contains("GNSS motion log"));
    }

    @Test
    @DisplayName("Should parse 22 Oct 2026 GNSS + Polar log for Velocity, Acceleration, and Polar Chest ECG HR")
    void testParseOct22GnssAndPolarLog() throws Exception {
        Path path = Paths.get("22 Oct 2026 collected data", "22 Oct 2026", "gnss_log_2026_10_22_16_41_32.csv");
        if (!Files.exists(path)) return;

        String content = Files.readString(path);
        SensorParseResult vel = CsvSensorParser.parse(content, SensorType.VEHICLE_VELOCITY, path.getFileName().toString());
        SensorParseResult acc = CsvSensorParser.parse(content, SensorType.VEHICLE_ACCELERATION, path.getFileName().toString());
        SensorParseResult polar = CsvSensorParser.parse(content, SensorType.CHEST_ECG_HEART_RATE, path.getFileName().toString());

        assertTrue(vel.isSuccess());
        assertEquals(6193, vel.getValidDataPointsCount());
        assertTrue(vel.getMaxValue() > 75.0);

        assertTrue(acc.isSuccess());
        assertEquals(6192, acc.getValidDataPointsCount());
        assertTrue(acc.getMinValue() < -10.0);
        assertTrue(acc.getMaxValue() > 7.0);

        assertTrue(polar.isSuccess());
        assertEquals(6214, polar.getValidDataPointsCount());
        assertEquals(72.0, polar.getMinValue());
        assertEquals(104.0, polar.getMaxValue());
    }

    @Test
    @DisplayName("Should parse 22 Oct 2026 Samsung Watch (HR and IBI) and match with Polar Chest ECG & GNSS")
    void testParseOct22SamsungWatchAndMatch() throws Exception {
        Path samsungPath = Paths.get("22 Oct 2026 collected data", "22 Oct 2026", "Samsung watch (HR and IBI).csv");
        Path gnssPath = Paths.get("22 Oct 2026 collected data", "22 Oct 2026", "gnss_log_2026_10_22_16_41_32.csv");
        if (!Files.exists(samsungPath) || !Files.exists(gnssPath)) return;

        String samsungContent = Files.readString(samsungPath);
        SensorParseResult swRes = CsvSensorParser.parse(samsungContent, SensorType.SMARTWATCH_HEART_RATE, samsungPath.getFileName().toString());

        assertTrue(swRes.isSuccess());
        assertEquals(4900, swRes.getValidDataPointsCount());
        assertEquals(64.0, swRes.getMinValue());
        assertEquals(99.0, swRes.getMaxValue());

        String gnssContent = Files.readString(gnssPath);
        SensorParseResult polarRes = CsvSensorParser.parse(gnssContent, SensorType.CHEST_ECG_HEART_RATE, gnssPath.getFileName().toString());

        MatchResult agreement = ExactTimestampMatcher.match(polarRes, swRes, "Chest ECG", "Smartwatch HR");
        assertTrue(agreement.isHasSufficientMatches());
        assertEquals(4891, agreement.getMatchCount());
    }

    @Test
    @DisplayName("Should parse 22 Oct 2026 HealthyPi Watch GSR and match exact seconds with GNSS velocity")
    void testParseOct22HealthyPiGsrAndMatch() throws Exception {
        Path gsrPath = Paths.get("22 Oct 2026 collected data", "22 Oct 2026", "Healthypi watch (GSR)", "hs_record_101_gsr.csv");
        Path gnssPath = Paths.get("22 Oct 2026 collected data", "22 Oct 2026", "gnss_log_2026_10_22_16_41_32.csv");
        if (!Files.exists(gsrPath) || !Files.exists(gnssPath)) return;

        String gsrContent = Files.readString(gsrPath);
        SensorParseResult gsrRes = CsvSensorParser.parse(gsrContent, SensorType.HEALTHYPI_GSR, gsrPath.getFileName().toString());

        assertTrue(gsrRes.isSuccess());
        assertEquals(597, gsrRes.getValidDataPointsCount());

        String gnssContent = Files.readString(gnssPath);
        SensorParseResult velRes = CsvSensorParser.parse(gnssContent, SensorType.VEHICLE_VELOCITY, gnssPath.getFileName().toString());

        MatchResult match = ExactTimestampMatcher.match(velRes, gsrRes, "Vehicle Velocity", "HealthyPi GSR");
        assertTrue(match.isHasSufficientMatches());
        assertTrue(match.getMatchCount() >= 590);
    }
    @Test
    @DisplayName("Should parse single unified CSV containing both velocity and acceleration")
    void testParseUnifiedVehicleDynamicsCsv() {
        String unifiedCsv = "timestamp,velocity,acceleration\n" +
                "2026-10-11T14:30:00Z,15.5,0.42\n" +
                "2026-10-11T14:30:01Z,18.0,0.55\n" +
                "2026-10-11T14:30:02Z,20.2,0.30\n";

        SensorParseResult vel = CsvSensorParser.parse(unifiedCsv, SensorType.VEHICLE_VELOCITY, "vehicle_dynamics.csv");
        SensorParseResult acc = CsvSensorParser.parse(unifiedCsv, SensorType.VEHICLE_ACCELERATION, "vehicle_dynamics.csv");

        assertTrue(vel.isSuccess());
        assertEquals(3, vel.getValidDataPointsCount());
        assertEquals(15.5, vel.getMinValue());
        assertEquals(20.2, vel.getMaxValue());

        assertTrue(acc.isSuccess());
        assertEquals(3, acc.getValidDataPointsCount());
        assertEquals(0.30, acc.getMinValue(), 1e-4);
        assertEquals(0.55, acc.getMaxValue(), 1e-4);

        MatchResult match = ExactTimestampMatcher.match(vel, acc, "Vehicle Velocity", "Vehicle Acceleration");
        assertTrue(match.isHasSufficientMatches());
        assertEquals(3, match.getMatchCount());
    }
}
