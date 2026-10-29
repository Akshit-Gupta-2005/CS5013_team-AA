package edu.iitm.cs5013.export;

import edu.iitm.cs5013.model.MatchResult;
import edu.iitm.cs5013.model.PairedDataPoint;
import edu.iitm.cs5013.model.SensorDataPoint;
import edu.iitm.cs5013.model.SensorParseResult;
import edu.iitm.cs5013.model.SensorType;

import java.util.*;

/**
 * Utility for exporting processed sensor streams, exact-matched cross-sensor pairs,
 * and time-synchronized master datasets into standard CSV formats.
 */
public class DataExporter {

    private static final String CSV_DELIMITER = ",";
    private static final String NEWLINE = "\r\n";

    /**
     * Exports a single processed SensorParseResult to CSV.
     */
    public static String toSensorCsv(SensorParseResult result) {
        if (result == null || result.getDataPoints() == null || result.getDataPoints().isEmpty()) {
            return "timestamp_iso,formatted_time,epoch_millis,value,sensor_type,unit" + NEWLINE;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("timestamp_iso,formatted_time,epoch_millis,value,sensor_type,unit").append(NEWLINE);

        String sensorId = result.getSensorType() != null ? result.getSensorType() : "";
        String unit = result.getUnit() != null ? result.getUnit() : "";

        for (SensorDataPoint pt : result.getDataPoints()) {
            sb.append(escape(pt.getRawTimestamp())).append(CSV_DELIMITER)
              .append(escape(pt.getFormattedTime())).append(CSV_DELIMITER)
              .append(pt.getEpochMillis()).append(CSV_DELIMITER)
              .append(String.format(Locale.US, "%.4f", pt.getValue())).append(CSV_DELIMITER)
              .append(escape(sensorId)).append(CSV_DELIMITER)
              .append(escape(unit)).append(NEWLINE);
        }

        return sb.toString();
    }

    /**
     * Exports a synchronized master time-series CSV combining all active streams
     * aligned on identical epoch milliseconds / timestamps.
     */
    public static String toMasterCsv(Map<String, SensorParseResult> datasets) {
        StringBuilder sb = new StringBuilder();
        sb.append("timestamp_iso,formatted_time,epoch_millis,")
          .append("smartwatch_heart_rate_bpm,")
          .append("chest_ecg_heart_rate_bpm,")
          .append("vehicle_velocity_kmh,")
          .append("vehicle_acceleration_ms2,")
          .append("healthypi_gsr_detrended")
          .append(NEWLINE);

        if (datasets == null || datasets.isEmpty()) {
            return sb.toString();
        }

        // Collect all distinct timestamps and map them
        Map<Long, String> epochToIso = new TreeMap<>();
        Map<Long, String> epochToFmt = new HashMap<>();

        Map<Long, Double> swMap = new HashMap<>();
        Map<Long, Double> chestMap = new HashMap<>();
        Map<Long, Double> velMap = new HashMap<>();
        Map<Long, Double> accMap = new HashMap<>();
        Map<Long, Double> gsrMap = new HashMap<>();

        populateStreamMap(datasets.get(SensorType.SMARTWATCH_HEART_RATE.getId()), swMap, epochToIso, epochToFmt);
        populateStreamMap(datasets.get(SensorType.CHEST_ECG_HEART_RATE.getId()), chestMap, epochToIso, epochToFmt);
        populateStreamMap(datasets.get(SensorType.VEHICLE_VELOCITY.getId()), velMap, epochToIso, epochToFmt);
        populateStreamMap(datasets.get(SensorType.VEHICLE_ACCELERATION.getId()), accMap, epochToIso, epochToFmt);
        populateStreamMap(datasets.get(SensorType.HEALTHYPI_GSR.getId()), gsrMap, epochToIso, epochToFmt);

        for (Map.Entry<Long, String> entry : epochToIso.entrySet()) {
            long epoch = entry.getKey();
            String iso = entry.getValue();
            String fmt = epochToFmt.getOrDefault(epoch, "");

            Double sw = swMap.get(epoch);
            Double chest = chestMap.get(epoch);
            Double vel = velMap.get(epoch);
            Double acc = accMap.get(epoch);
            Double gsr = gsrMap.get(epoch);

            sb.append(escape(iso)).append(CSV_DELIMITER)
              .append(escape(fmt)).append(CSV_DELIMITER)
              .append(epoch).append(CSV_DELIMITER)
              .append(sw != null ? String.format(Locale.US, "%.2f", sw) : "").append(CSV_DELIMITER)
              .append(chest != null ? String.format(Locale.US, "%.2f", chest) : "").append(CSV_DELIMITER)
              .append(vel != null ? String.format(Locale.US, "%.2f", vel) : "").append(CSV_DELIMITER)
              .append(acc != null ? String.format(Locale.US, "%.3f", acc) : "").append(CSV_DELIMITER)
              .append(gsr != null ? String.format(Locale.US, "%.2f", gsr) : "")
              .append(NEWLINE);
        }

        return sb.toString();
    }

    /**
     * Exports cross-sensor matched paired data points to CSV.
     */
    public static String toMatchedCsv(MatchResult match) {
        StringBuilder sb = new StringBuilder();
        if (match == null || match.getMatchedPoints() == null || match.getMatchedPoints().isEmpty()) {
            sb.append("timestamp_iso,formatted_time,epoch_millis,stream1_value,stream2_value").append(NEWLINE);
            return sb.toString();
        }

        sb.append("# CS5013 Multi-Modal Cross-Sensor Matched Dataset").append(NEWLINE)
          .append("# Stream 1: ").append(match.getSeries1Name()).append(" (").append(match.getSeries1Unit()).append(")").append(NEWLINE)
          .append("# Stream 2: ").append(match.getSeries2Name()).append(" (").append(match.getSeries2Unit()).append(")").append(NEWLINE)
          .append("# Total Matched Synchronized Points: ").append(match.getMatchCount()).append(NEWLINE);

        sb.append("timestamp_iso,formatted_time,epoch_millis,")
          .append(sanitizeHeader(match.getSeries1Name())).append("_").append(sanitizeHeader(match.getSeries1Unit())).append(",")
          .append(sanitizeHeader(match.getSeries2Name())).append("_").append(sanitizeHeader(match.getSeries2Unit()))
          .append(NEWLINE);

        for (PairedDataPoint pt : match.getMatchedPoints()) {
            String iso = pt.getRawTimestampX() != null ? pt.getRawTimestampX() : pt.getRawTimestampY();
            sb.append(escape(iso)).append(CSV_DELIMITER)
              .append(escape(pt.getFormattedTime())).append(CSV_DELIMITER)
              .append(pt.getEpochMillis()).append(CSV_DELIMITER)
              .append(String.format(Locale.US, "%.4f", pt.getxValue())).append(CSV_DELIMITER)
              .append(String.format(Locale.US, "%.4f", pt.getyValue()))
              .append(NEWLINE);
        }

        return sb.toString();
    }

    /**
     * Exports sensor agreement data (Smartwatch HR vs Chest ECG HR) with difference delta to CSV.
     */
    public static String toAgreementCsv(MatchResult match) {
        StringBuilder sb = new StringBuilder();
        if (match == null || match.getMatchedPoints() == null || match.getMatchedPoints().isEmpty()) {
            sb.append("timestamp_iso,formatted_time,epoch_millis,chest_ecg_hr_bpm,smartwatch_hr_bpm,diff_smartwatch_minus_chest_bpm").append(NEWLINE);
            return sb.toString();
        }

        sb.append("# CS5013 Sensor Agreement Analysis (Smartwatch HR vs Chest ECG Monitor)").append(NEWLINE)
          .append("# Total Synchronized Seconds: ").append(match.getMatchCount()).append(NEWLINE);

        sb.append("timestamp_iso,formatted_time,epoch_millis,chest_ecg_hr_bpm,smartwatch_hr_bpm,diff_smartwatch_minus_chest_bpm").append(NEWLINE);

        for (PairedDataPoint pt : match.getMatchedPoints()) {
            double chestVal = pt.getxValue();
            double watchVal = pt.getyValue();
            double diff = watchVal - chestVal;
            String iso = pt.getRawTimestampX() != null ? pt.getRawTimestampX() : pt.getRawTimestampY();

            sb.append(escape(iso)).append(CSV_DELIMITER)
              .append(escape(pt.getFormattedTime())).append(CSV_DELIMITER)
              .append(pt.getEpochMillis()).append(CSV_DELIMITER)
              .append(String.format(Locale.US, "%.2f", chestVal)).append(CSV_DELIMITER)
              .append(String.format(Locale.US, "%.2f", watchVal)).append(CSV_DELIMITER)
              .append(String.format(Locale.US, "%.2f", diff))
              .append(NEWLINE);
        }

        return sb.toString();
    }

    private static void populateStreamMap(SensorParseResult res,
                                          Map<Long, Double> targetMap,
                                          Map<Long, String> epochToIso,
                                          Map<Long, String> epochToFmt) {
        if (res == null || res.getDataPoints() == null) return;
        for (SensorDataPoint pt : res.getDataPoints()) {
            long ep = pt.getEpochMillis();
            if (!targetMap.containsKey(ep)) {
                targetMap.put(ep, pt.getValue());
            }
            if (!epochToIso.containsKey(ep) && pt.getRawTimestamp() != null) {
                epochToIso.put(ep, pt.getRawTimestamp());
            }
            if (!epochToFmt.containsKey(ep) && pt.getFormattedTime() != null) {
                epochToFmt.put(ep, pt.getFormattedTime());
            }
        }
    }

    private static String sanitizeHeader(String name) {
        if (name == null) return "value";
        return name.toLowerCase().replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
    }

    private static String escape(String val) {
        if (val == null) return "";
        if (val.contains(",") || val.contains("\"") || val.contains("\n") || val.contains("\r")) {
            return "\"" + val.replace("\"", "\"\"") + "\"";
        }
        return val;
    }
}
