package edu.iitm.cs5013;

import edu.iitm.cs5013.matcher.ExactTimestampMatcher;
import edu.iitm.cs5013.model.MatchResult;
import edu.iitm.cs5013.model.SensorParseResult;
import edu.iitm.cs5013.model.SensorType;
import edu.iitm.cs5013.parser.CsvSensorParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
        assertEquals(2, match.getMatchCount()); // matching at 10:00:00 and 10:00:02
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
}
