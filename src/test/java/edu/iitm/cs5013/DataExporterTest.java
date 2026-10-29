package edu.iitm.cs5013;

import edu.iitm.cs5013.export.DataExporter;
import edu.iitm.cs5013.matcher.ExactTimestampMatcher;
import edu.iitm.cs5013.model.MatchResult;
import edu.iitm.cs5013.model.SensorParseResult;
import edu.iitm.cs5013.model.SensorType;
import edu.iitm.cs5013.parser.CsvSensorParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class DataExporterTest {

    @Test
    @DisplayName("Should export individual processed sensor stream to CSV with metadata columns")
    void testToSensorCsv() {
        String csv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,72.5\n" +
                "2026-10-11T10:00:01Z,75.0\n";

        SensorParseResult parsed = CsvSensorParser.parse(csv, SensorType.SMARTWATCH_HEART_RATE, "watch.csv");
        assertTrue(parsed.isSuccess());

        String exported = DataExporter.toSensorCsv(parsed);
        assertNotNull(exported);
        assertTrue(exported.startsWith("timestamp_iso,formatted_time,epoch_millis,value,sensor_type,unit"));
        assertTrue(exported.contains("2026-10-11T10:00:00Z"));
        assertTrue(exported.contains("72.5000"));
        assertTrue(exported.contains("smartwatch_heart_rate"));
        assertTrue(exported.contains("BPM"));
    }

    @Test
    @DisplayName("Should export synchronized master CSV aligning multiple streams on identical timestamps")
    void testToMasterCsv() {
        String hrCsv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,70.0\n" +
                "2026-10-11T10:00:01Z,72.0\n";
        String velCsv = "timestamp,velocity\n" +
                "2026-10-11T10:00:01Z,35.5\n" +
                "2026-10-11T10:00:02Z,40.0\n";

        SensorParseResult hrParsed = CsvSensorParser.parse(hrCsv, SensorType.SMARTWATCH_HEART_RATE, "hr.csv");
        SensorParseResult velParsed = CsvSensorParser.parse(velCsv, SensorType.VEHICLE_VELOCITY, "vel.csv");

        Map<String, SensorParseResult> datasets = new LinkedHashMap<>();
        datasets.put(SensorType.SMARTWATCH_HEART_RATE.getId(), hrParsed);
        datasets.put(SensorType.VEHICLE_VELOCITY.getId(), velParsed);

        String masterCsv = DataExporter.toMasterCsv(datasets);
        assertNotNull(masterCsv);
        assertTrue(masterCsv.contains("smartwatch_heart_rate_bpm"));
        assertTrue(masterCsv.contains("vehicle_velocity_kmh"));

        // Timestamp 10:00:00 should have HR 70.00 and blank velocity
        assertTrue(masterCsv.contains("2026-10-11T10:00:00Z"));
        // Timestamp 10:00:01 should have both HR 72.00 and velocity 35.50
        assertTrue(masterCsv.contains("72.00,"));
        assertTrue(masterCsv.contains("35.50"));
    }

    @Test
    @DisplayName("Should export matched cross-sensor pairs CSV with headers and matched points")
    void testToMatchedCsv() {
        String velCsv = "timestamp,velocity\n" +
                "2026-10-11T10:00:00Z,20.0\n" +
                "2026-10-11T10:00:01Z,30.0\n" +
                "2026-10-11T10:00:02Z,40.0\n";
        String hrCsv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,70.0\n" +
                "2026-10-11T10:00:01Z,80.0\n" +
                "2026-10-11T10:00:02Z,90.0\n";

        SensorParseResult vel = CsvSensorParser.parse(velCsv, SensorType.VEHICLE_VELOCITY, "vel.csv");
        SensorParseResult hr = CsvSensorParser.parse(hrCsv, SensorType.SMARTWATCH_HEART_RATE, "hr.csv");

        MatchResult match = ExactTimestampMatcher.match(vel, hr, "Vehicle Velocity", "Smartwatch Heart Rate");
        assertTrue(match.isHasSufficientMatches());

        String matchedCsv = DataExporter.toMatchedCsv(match);
        assertNotNull(matchedCsv);
        assertTrue(matchedCsv.contains("# Total Matched Synchronized Points: 3"));
        assertTrue(matchedCsv.contains("20.0000,70.0000"));
    }

    @Test
    @DisplayName("Should export sensor agreement CSV with calculated difference delta")
    void testToAgreementCsv() {
        String chestCsv = "timestamp,ecg_hr\n" +
                "2026-10-11T10:00:00Z,75.0\n";
        String swCsv = "timestamp,heart_rate\n" +
                "2026-10-11T10:00:00Z,78.5\n";

        SensorParseResult chest = CsvSensorParser.parse(chestCsv, SensorType.CHEST_ECG_HEART_RATE, "chest.csv");
        SensorParseResult sw = CsvSensorParser.parse(swCsv, SensorType.SMARTWATCH_HEART_RATE, "sw.csv");

        MatchResult match = ExactTimestampMatcher.match(chest, sw, "Chest ECG Monitor", "Smartwatch Heart Rate");
        String agreementCsv = DataExporter.toAgreementCsv(match);

        assertNotNull(agreementCsv);
        assertTrue(agreementCsv.contains("diff_smartwatch_minus_chest_bpm"));
        assertTrue(agreementCsv.contains("75.00,78.50,3.50"));
    }

    @Test
    @DisplayName("Should handle empty and null inputs safely without exceptions")
    void testNullAndEmptyHandling() {
        String s1 = DataExporter.toSensorCsv(null);
        assertTrue(s1.contains("timestamp_iso"));

        String s2 = DataExporter.toMasterCsv(null);
        assertTrue(s2.contains("smartwatch_heart_rate_bpm"));

        String s3 = DataExporter.toMatchedCsv(null);
        assertTrue(s3.contains("timestamp_iso"));

        String s4 = DataExporter.toAgreementCsv(null);
        assertTrue(s4.contains("diff_smartwatch_minus_chest_bpm"));
    }
}
