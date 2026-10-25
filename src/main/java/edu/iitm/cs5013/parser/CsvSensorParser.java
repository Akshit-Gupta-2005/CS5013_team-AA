package edu.iitm.cs5013.parser;

import edu.iitm.cs5013.model.SensorDataPoint;
import edu.iitm.cs5013.model.SensorParseResult;
import edu.iitm.cs5013.model.SensorType;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

import java.io.StringReader;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Robust CSV parser for multi-modal sensor streams.
 * Compliant with CS5013 Phase 3 specifications and 22 Oct 2026 field study logs.
 */
public class CsvSensorParser {

    private static final List<DateTimeFormatter> DATE_TIME_FORMATTERS = List.of(
            DateTimeFormatter.ISO_DATE_TIME,
            DateTimeFormatter.ISO_OFFSET_DATE_TIME,
            DateTimeFormatter.ISO_INSTANT,
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss.SSS"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm:ss"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")
    );

    private static final DateTimeFormatter DISPLAY_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneId.of("UTC"));

    private static final ZoneOffset IST_OFFSET = ZoneOffset.ofHoursMinutes(5, 30);

    public static SensorParseResult parse(String csvContent, SensorType sensorType, String filename) {
        if (csvContent == null || csvContent.trim().isEmpty()) {
            return SensorParseResult.failure(
                    sensorType != null ? sensorType.getId() : "unknown",
                    filename,
                    List.of("The uploaded CSV file is empty.")
            );
        }

        // Clean UTF-8 BOM if present
        String content = csvContent;
        if (content.startsWith("\uFEFF")) {
            content = content.substring(1);
        }

        try (StringReader reader = new StringReader(content)) {
            CSVFormat format = CSVFormat.DEFAULT.builder()
                    .setHeader()
                    .setSkipHeaderRecord(true)
                    .setIgnoreHeaderCase(true)
                    .setTrim(true)
                    .setIgnoreEmptyLines(true)
                    .build();

            CSVParser parser = format.parse(reader);
            Map<String, Integer> headerMap = parser.getHeaderMap();

            if (headerMap == null || headerMap.isEmpty()) {
                return SensorParseResult.failure(
                        sensorType.getId(),
                        filename,
                        List.of("No CSV header row detected. The file must include column headers.")
                );
            }

            // 1. Check if this file is a raw GNSS Logger stream (e.g. Nissan Magnite or Oct 22 Polar+GNSS log)
            if (isGnssLog(headerMap)) {
                return parseGnssLog(parser, headerMap, sensorType, filename);
            }

            // 2. Check if this file is a Samsung Watch (HR and IBI) multi-session export
            if (isSamsungWatchLog(headerMap)) {
                return parseSamsungWatchLog(parser, headerMap, sensorType, filename);
            }

            // 3. Check if this file is a HealthyPi Watch (GSR) 32-Hz recording
            if (isHealthyPiGsrLog(headerMap)) {
                return parseHealthyPiGsrLog(parser, headerMap, sensorType, filename);
            }

            // 4. Standard generic CSV parsing
            String timestampCol = findColumn(headerMap, sensorType.getTimestampColumnAliases());
            String valueCol = findColumn(headerMap, sensorType.getValueColumnAliases());

            List<String> errors = new ArrayList<>();
            if (timestampCol == null) {
                errors.add("Missing required timestamp column. Expected one of: " +
                        String.join(", ", sensorType.getTimestampColumnAliases()) +
                        ". Found headers: " + headerMap.keySet());
            }

            if (valueCol == null) {
                errors.add("Missing required measurement column for " + sensorType.getDisplayName() +
                        " (" + sensorType.getUnit() + "). Expected one of: " +
                        String.join(", ", sensorType.getValueColumnAliases()) +
                        ". Found headers: " + headerMap.keySet());
            }

            if (!errors.isEmpty()) {
                return SensorParseResult.failure(sensorType.getId(), filename, errors);
            }

            List<SensorDataPoint> points = new ArrayList<>();
            List<String> warnings = new ArrayList<>();
            int totalRows = 0;
            double minValue = Double.MAX_VALUE;
            double maxValue = -Double.MAX_VALUE;
            long minEpoch = Long.MAX_VALUE;
            long maxEpoch = Long.MIN_VALUE;

            for (CSVRecord record : parser) {
                totalRows++;
                String rawTs = record.get(timestampCol);
                String rawVal = record.get(valueCol);

                if (rawTs == null || rawTs.trim().isEmpty() || rawVal == null || rawVal.trim().isEmpty()) {
                    if (warnings.size() < 10) {
                        warnings.add("Row " + (totalRows + 1) + ": skipped due to empty timestamp or value.");
                    }
                    continue;
                }

                ParsedTimestamp parsedTime = parseTimestamp(rawTs.trim());
                if (parsedTime == null) {
                    if (warnings.size() < 10) {
                        warnings.add("Row " + (totalRows + 1) + ": unable to parse timestamp '" + rawTs + "'.");
                    }
                    continue;
                }

                double val;
                try {
                    val = Double.parseDouble(rawVal.trim());
                    if (Double.isNaN(val) || Double.isInfinite(val)) {
                        continue;
                    }
                } catch (NumberFormatException e) {
                    if (warnings.size() < 10) {
                        warnings.add("Row " + (totalRows + 1) + ": invalid numeric value '" + rawVal + "'.");
                    }
                    continue;
                }

                points.add(new SensorDataPoint(rawTs, parsedTime.epochMillis, parsedTime.formatted, val));

                if (val < minValue) minValue = val;
                if (val > maxValue) maxValue = val;
                if (parsedTime.epochMillis < minEpoch) minEpoch = parsedTime.epochMillis;
                if (parsedTime.epochMillis > maxEpoch) maxEpoch = parsedTime.epochMillis;
            }

            if (points.isEmpty()) {
                return SensorParseResult.failure(
                        sensorType.getId(),
                        filename,
                        List.of("No valid data rows could be parsed from the file.")
                );
            }

            points.sort(Comparator.comparingLong(SensorDataPoint::getEpochMillis));

            String minFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(minEpoch));
            String maxFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(maxEpoch));

            return new SensorParseResult(
                    true,
                    sensorType.getId(),
                    sensorType.getDisplayName(),
                    sensorType.getUnit(),
                    filename,
                    totalRows,
                    points.size(),
                    minValue,
                    maxValue,
                    minEpoch,
                    maxEpoch,
                    minFormatted,
                    maxFormatted,
                    points,
                    List.of(),
                    warnings
            );

        } catch (Exception e) {
            return SensorParseResult.failure(
                    sensorType != null ? sensorType.getId() : "unknown",
                    filename,
                    List.of("Failed to parse CSV file: " + e.getMessage())
            );
        }
    }

    private static String findColumn(Map<String, Integer> headerMap, List<String> aliases) {
        for (String header : headerMap.keySet()) {
            String norm = normalize(header);
            for (String alias : aliases) {
                if (norm.equals(normalize(alias))) {
                    return header;
                }
            }
        }
        for (String header : headerMap.keySet()) {
            String norm = normalize(header);
            for (String alias : aliases) {
                if (norm.contains(normalize(alias))) {
                    return header;
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // 1. GNSS + Polar BLE Logger Support (Speed_kph, Acceleration_mps2, Polar_HR_bpm)
    // -------------------------------------------------------------------------
    private static boolean isGnssLog(Map<String, Integer> headerMap) {
        if (headerMap == null) return false;
        boolean hasDateOrTime = false;
        boolean hasSpeedOrAccel = false;
        for (String key : headerMap.keySet()) {
            String norm = normalize(key);
            if (norm.equals("phonenumber") || norm.equals("measconstellationtype") || norm.equals("timeist")) {
                return true;
            }
            if (norm.equals("date") || norm.equals("time") || norm.equals("timeist")) {
                hasDateOrTime = true;
            }
            if (norm.equals("speedkph") || norm.equals("speedmps") || norm.equals("accelerationmps2")) {
                hasSpeedOrAccel = true;
            }
        }
        return hasDateOrTime && hasSpeedOrAccel;
    }

    private static SensorParseResult parseGnssLog(
            CSVParser parser,
            Map<String, Integer> headerMap,
            SensorType sensorType,
            String filename) {

        String polarHrCol = findExactColumn(headerMap, "polarhrbpm");
        boolean hasPolarHr = polarHrCol != null;
        boolean hasTimeIst = findExactColumn(headerMap, "timeist") != null;

        if (sensorType == SensorType.CHEST_ECG_HEART_RATE && !hasPolarHr) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("The uploaded file is a vehicle GNSS motion log without Polar Chest ECG columns. Please upload a GNSS log containing Polar_HR_bpm or a dedicated Chest ECG CSV.")
            );
        }

        if (sensorType != SensorType.VEHICLE_VELOCITY
                && sensorType != SensorType.VEHICLE_ACCELERATION
                && sensorType != SensorType.CHEST_ECG_HEART_RATE) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("The uploaded file is a vehicle GNSS motion log (velocity, acceleration & Polar chest HR), but the selected target is " +
                            sensorType.getDisplayName() + ". Please upload to Vehicle Velocity, Vehicle Acceleration, or Chest ECG Monitor.")
            );
        }

        List<SensorDataPoint> points = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        int totalRows = 0;
        double minValue = Double.MAX_VALUE;
        double maxValue = -Double.MAX_VALUE;
        long minEpoch = Long.MAX_VALUE;
        long maxEpoch = Long.MIN_VALUE;

        int dateIdx = -1;
        int timeIdx = -1;
        int spdKphIdx = -1;
        int accelIdx = -1;
        int polarHrIdx = hasPolarHr ? headerMap.get(polarHrCol) : -1;
        boolean detected = false;

        for (CSVRecord record : parser) {
            totalRows++;
            int size = record.size();
            if (size < 10) continue;

            if (!detected) {
                for (int i = 0; i < Math.min(size, 8); i++) {
                    String s = record.get(i).trim();
                    if (s.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
                        dateIdx = i;
                        break;
                    }
                }
                if (dateIdx != -1 && dateIdx + 1 < size) {
                    timeIdx = dateIdx + 1;
                    spdKphIdx = dateIdx + 6;
                    accelIdx = dateIdx + 7;
                    if (hasPolarHr && dateIdx > 1) {
                        polarHrIdx = headerMap.get(polarHrCol) + (dateIdx - 1);
                    }
                    detected = true;
                } else {
                    dateIdx = 2;
                    timeIdx = 3;
                    spdKphIdx = 8;
                    accelIdx = 9;
                    detected = true;
                }
            }

            int valIdx;
            if (sensorType == SensorType.VEHICLE_VELOCITY) {
                valIdx = spdKphIdx;
            } else if (sensorType == SensorType.VEHICLE_ACCELERATION) {
                valIdx = accelIdx;
            } else {
                valIdx = polarHrIdx;
            }

            if (valIdx < 0 || valIdx >= size || timeIdx >= size || dateIdx >= size) {
                continue;
            }

            String dateStr = record.get(dateIdx).trim();
            String timeStr = record.get(timeIdx).trim();
            String rawVal = record.get(valIdx).trim();

            if (dateStr.isEmpty() || timeStr.isEmpty() || rawVal.isEmpty()) {
                continue;
            }

            String fullTimestamp = dateStr + " " + timeStr;
            ParsedTimestamp parsedTime = hasTimeIst
                    ? parseTimestampWithZone(fullTimestamp, IST_OFFSET)
                    : parseTimestamp(fullTimestamp);
            if (parsedTime == null) {
                if (warnings.size() < 10) {
                    warnings.add("Row " + (totalRows + 1) + ": unable to parse timestamp '" + fullTimestamp + "'.");
                }
                continue;
            }

            double val;
            try {
                val = Double.parseDouble(rawVal);
                if (Double.isNaN(val) || Double.isInfinite(val)) {
                    continue;
                }
                if (sensorType == SensorType.CHEST_ECG_HEART_RATE && val <= 0) {
                    continue;
                }
            } catch (NumberFormatException e) {
                if (warnings.size() < 10) {
                    warnings.add("Row " + (totalRows + 1) + ": invalid numeric value '" + rawVal + "'.");
                }
                continue;
            }

            points.add(new SensorDataPoint(fullTimestamp, parsedTime.epochMillis, parsedTime.formatted, val));

            if (val < minValue) minValue = val;
            if (val > maxValue) maxValue = val;
            if (parsedTime.epochMillis < minEpoch) minEpoch = parsedTime.epochMillis;
            if (parsedTime.epochMillis > maxEpoch) maxEpoch = parsedTime.epochMillis;
        }

        if (points.isEmpty()) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("No valid " + sensorType.getDisplayName() + " data rows could be parsed from the GNSS log.")
            );
        }

        points.sort(Comparator.comparingLong(SensorDataPoint::getEpochMillis));

        String minFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(minEpoch));
        String maxFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(maxEpoch));

        return new SensorParseResult(
                true,
                sensorType.getId(),
                sensorType.getDisplayName(),
                sensorType.getUnit(),
                filename,
                totalRows,
                points.size(),
                minValue,
                maxValue,
                minEpoch,
                maxEpoch,
                minFormatted,
                maxFormatted,
                points,
                List.of(),
                warnings
        );
    }

    // -------------------------------------------------------------------------
    // 2. Samsung Watch (HR and IBI) Export Support
    // -------------------------------------------------------------------------
    private static boolean isSamsungWatchLog(Map<String, Integer> headerMap) {
        if (headerMap == null) return false;
        return findExactColumn(headerMap, "watchtimestampms") != null
                && findExactColumn(headerMap, "hrbpm") != null;
    }

    private static SensorParseResult parseSamsungWatchLog(
            CSVParser parser,
            Map<String, Integer> headerMap,
            SensorType sensorType,
            String filename) {

        if (sensorType != SensorType.SMARTWATCH_HEART_RATE) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("The uploaded file is a Samsung Smartwatch HR/IBI log, but the selected target is " +
                            sensorType.getDisplayName() + ". Please upload to Smartwatch Heart Rate.")
            );
        }

        String sessionCol = findExactColumn(headerMap, "sessionid");
        String tsCol = findExactColumn(headerMap, "watchtimestampms");
        String hrCol = findExactColumn(headerMap, "hrbpm");
        String statusCol = findExactColumn(headerMap, "hrstatus");

        List<String> warnings = new ArrayList<>();
        int totalRows = 0;

        // Group records by session_id so multi-day cumulative exports isolate the active trip session
        Map<String, List<SensorDataPoint>> pointsBySession = new LinkedHashMap<>();
        Map<String, Long> maxEpochBySession = new HashMap<>();

        for (CSVRecord record : parser) {
            totalRows++;
            String sessionId = sessionCol != null && record.isMapped(sessionCol) ? record.get(sessionCol).trim() : "default";
            String rawTs = record.get(tsCol).trim();
            String rawHr = record.get(hrCol).trim();
            String rawStatus = statusCol != null && record.isMapped(statusCol) ? record.get(statusCol).trim() : "1";

            if (rawTs.isEmpty() || rawHr.isEmpty()) continue;

            // Only include rows where watch sensor contact status is valid (1) and HR > 0
            if (!rawStatus.isEmpty() && !rawStatus.equals("1")) {
                continue;
            }

            long rawEpochMs;
            try {
                rawEpochMs = Long.parseLong(rawTs);
            } catch (NumberFormatException e) {
                continue;
            }

            double hrVal;
            try {
                hrVal = Double.parseDouble(rawHr);
                if (hrVal <= 0 || Double.isNaN(hrVal) || Double.isInfinite(hrVal)) {
                    continue;
                }
            } catch (NumberFormatException e) {
                continue;
            }

            // Align 1-Hz watch timestamp to integer second boundary (.000) to match 1-Hz GNSS/Polar logs
            long alignedEpochMs = (rawEpochMs / 1000L) * 1000L;
            String formatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(alignedEpochMs));

            pointsBySession.computeIfAbsent(sessionId, k -> new ArrayList<>())
                    .add(new SensorDataPoint(rawTs, alignedEpochMs, formatted, hrVal));
            maxEpochBySession.merge(sessionId, alignedEpochMs, Math::max);
        }

        if (pointsBySession.isEmpty()) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("No valid heart rate measurements (hr_status=1, hr_bpm>0) found in Samsung Watch CSV.")
            );
        }

        // Select the latest recording session if multiple historical sessions exist
        String selectedSession = pointsBySession.keySet().iterator().next();
        long latestSessionEpoch = Long.MIN_VALUE;
        for (Map.Entry<String, Long> entry : maxEpochBySession.entrySet()) {
            if (entry.getValue() > latestSessionEpoch) {
                latestSessionEpoch = entry.getValue();
                selectedSession = entry.getKey();
            }
        }

        if (pointsBySession.size() > 1) {
            warnings.add("Multi-session Samsung Watch file detected (" + pointsBySession.size()
                    + " sessions); automatically selected latest trip session (" + selectedSession + ").");
        }

        // Deduplicate multiple IBI sub-rows sharing the same 1-second timestamp
        List<SensorDataPoint> rawSessionPoints = pointsBySession.get(selectedSession);
        Map<Long, SensorDataPoint> uniqueBySecond = new LinkedHashMap<>();
        for (SensorDataPoint pt : rawSessionPoints) {
            uniqueBySecond.putIfAbsent(pt.getEpochMillis(), pt);
        }

        List<SensorDataPoint> points = new ArrayList<>(uniqueBySecond.values());
        points.sort(Comparator.comparingLong(SensorDataPoint::getEpochMillis));

        double minValue = Double.MAX_VALUE;
        double maxValue = -Double.MAX_VALUE;
        for (SensorDataPoint pt : points) {
            if (pt.getValue() < minValue) minValue = pt.getValue();
            if (pt.getValue() > maxValue) maxValue = pt.getValue();
        }

        long minEpoch = points.get(0).getEpochMillis();
        long maxEpoch = points.get(points.size() - 1).getEpochMillis();
        String minFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(minEpoch));
        String maxFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(maxEpoch));

        return new SensorParseResult(
                true,
                sensorType.getId(),
                sensorType.getDisplayName(),
                sensorType.getUnit(),
                filename,
                totalRows,
                points.size(),
                minValue,
                maxValue,
                minEpoch,
                maxEpoch,
                minFormatted,
                maxFormatted,
                points,
                List.of(),
                warnings
        );
    }

    // -------------------------------------------------------------------------
    // 3. HealthyPi Watch (GSR / Electrodermal Activity) Support
    // -------------------------------------------------------------------------
    private static boolean isHealthyPiGsrLog(Map<String, Integer> headerMap) {
        if (headerMap == null) return false;
        return findExactColumn(headerMap, "timestamputc") != null
                && (findExactColumn(headerMap, "ch0detrended") != null || findExactColumn(headerMap, "ch0") != null);
    }

    private static SensorParseResult parseHealthyPiGsrLog(
            CSVParser parser,
            Map<String, Integer> headerMap,
            SensorType sensorType,
            String filename) {

        if (sensorType != SensorType.HEALTHYPI_GSR) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("The uploaded file is a HealthyPi Watch GSR log, but the selected target is " +
                            sensorType.getDisplayName() + ". Please upload to HealthyPi Watch (GSR).")
            );
        }

        String tsCol = findExactColumn(headerMap, "timestamputc");
        String valCol = findExactColumn(headerMap, "ch0detrended");
        if (valCol == null) {
            valCol = findExactColumn(headerMap, "ch0");
        }

        List<SensorDataPoint> allValidPoints = new ArrayList<>();
        List<SensorDataPoint> exactSecondPoints = new ArrayList<>();
        Set<Long> seenSeconds = new HashSet<>();
        List<String> warnings = new ArrayList<>();
        int totalRows = 0;

        for (CSVRecord record : parser) {
            totalRows++;
            if (!record.isMapped(tsCol) || !record.isMapped(valCol)) continue;

            String rawTs = record.get(tsCol).trim();
            String rawVal = record.get(valCol).trim();

            if (rawTs.isEmpty() || rawVal.isEmpty() || rawTs.equalsIgnoreCase("timestamp_utc")) {
                continue;
            }

            ParsedTimestamp parsedTime = parseTimestamp(rawTs);
            if (parsedTime == null) continue;

            double val;
            try {
                val = Double.parseDouble(rawVal);
                if (Double.isNaN(val) || Double.isInfinite(val)) continue;
                // Filter out hardware ADC startup saturation spikes (e.g., 536892912 / -221080146)
                if (Math.abs(val) >= 50000.0) {
                    continue;
                }
            } catch (NumberFormatException e) {
                continue;
            }

            SensorDataPoint pt = new SensorDataPoint(rawTs, parsedTime.epochMillis, parsedTime.formatted, val);
            if (totalRows <= 2000) {
                allValidPoints.add(pt);
            }
            if (parsedTime.epochMillis % 1000L == 0 && seenSeconds.add(parsedTime.epochMillis)) {
                exactSecondPoints.add(pt);
            }
        }

        // For 32-Hz multi-thousand-row recordings, use 1-Hz exact-second points (.000Z)
        List<SensorDataPoint> points = (totalRows > 2000 && !exactSecondPoints.isEmpty())
                ? exactSecondPoints
                : allValidPoints;

        if (points.isEmpty()) {
            return SensorParseResult.failure(
                    sensorType.getId(),
                    filename,
                    List.of("No valid GSR data rows could be parsed from the HealthyPi file.")
            );
        }

        points.sort(Comparator.comparingLong(SensorDataPoint::getEpochMillis));

        double minValue = Double.MAX_VALUE;
        double maxValue = -Double.MAX_VALUE;
        for (SensorDataPoint pt : points) {
            if (pt.getValue() < minValue) minValue = pt.getValue();
            if (pt.getValue() > maxValue) maxValue = pt.getValue();
        }

        long minEpoch = points.get(0).getEpochMillis();
        long maxEpoch = points.get(points.size() - 1).getEpochMillis();
        String minFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(minEpoch));
        String maxFormatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(maxEpoch));

        return new SensorParseResult(
                true,
                sensorType.getId(),
                sensorType.getDisplayName(),
                sensorType.getUnit(),
                filename,
                totalRows,
                points.size(),
                minValue,
                maxValue,
                minEpoch,
                maxEpoch,
                minFormatted,
                maxFormatted,
                points,
                List.of(),
                warnings
        );
    }

    private static String findExactColumn(Map<String, Integer> headerMap, String normalizedTarget) {
        if (headerMap == null) return null;
        for (String key : headerMap.keySet()) {
            if (normalize(key).equals(normalizedTarget)) {
                return key;
            }
        }
        return null;
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return s.toLowerCase().replaceAll("[^a-z0-9]", "");
    }

    public static class ParsedTimestamp {
        final long epochMillis;
        final String formatted;

        ParsedTimestamp(long epochMillis, String formatted) {
            this.epochMillis = epochMillis;
            this.formatted = formatted;
        }
    }

    public static ParsedTimestamp parseTimestampWithZone(String raw, ZoneOffset defaultOffset) {
        if (raw == null || raw.isEmpty()) return null;
        for (DateTimeFormatter fmt : DATE_TIME_FORMATTERS) {
            try {
                LocalDateTime ldt = LocalDateTime.parse(raw, fmt);
                Instant instant = ldt.toInstant(defaultOffset);
                return new ParsedTimestamp(instant.toEpochMilli(), DISPLAY_FORMATTER.format(instant));
            } catch (Exception ignored) {
            }
        }
        return parseTimestamp(raw);
    }

    public static ParsedTimestamp parseTimestamp(String raw) {
        if (raw == null || raw.isEmpty()) return null;

        // Check if raw is a pure numeric epoch (seconds or milliseconds)
        if (raw.matches("^-?\\d+(\\.\\d+)?$")) {
            try {
                double num = Double.parseDouble(raw);
                long millis;
                if (num > 1e11) {
                    millis = (long) num;
                } else if (num > 1e8) {
                    millis = (long) (num * 1000.0);
                } else {
                    millis = (long) (num * 1000.0);
                }
                String formatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(millis));
                return new ParsedTimestamp(millis, formatted);
            } catch (Exception ignored) {
            }
        }

        // Try standard ISO Instant (handles microsecond precision e.g. 2026-10-22T11:19:05.031250Z)
        try {
            Instant instant = Instant.parse(raw);
            return new ParsedTimestamp(instant.toEpochMilli(), DISPLAY_FORMATTER.format(instant));
        } catch (Exception ignored) {
        }

        // Try OffsetDateTime
        try {
            OffsetDateTime odt = OffsetDateTime.parse(raw);
            return new ParsedTimestamp(odt.toInstant().toEpochMilli(), DISPLAY_FORMATTER.format(odt.toInstant()));
        } catch (Exception ignored) {
        }

        // Try Date Time formatters
        for (DateTimeFormatter fmt : DATE_TIME_FORMATTERS) {
            try {
                LocalDateTime ldt = LocalDateTime.parse(raw, fmt);
                Instant instant = ldt.toInstant(ZoneOffset.UTC);
                return new ParsedTimestamp(instant.toEpochMilli(), DISPLAY_FORMATTER.format(instant));
            } catch (Exception ignored) {
            }
        }

        // Try LocalTime (if only time like 10:15:30.000 is given)
        try {
            LocalTime lt = LocalTime.parse(raw);
            LocalDate date = LocalDate.of(2026, 10, 11);
            LocalDateTime ldt = LocalDateTime.of(date, lt);
            Instant instant = ldt.toInstant(ZoneOffset.UTC);
            return new ParsedTimestamp(instant.toEpochMilli(), DISPLAY_FORMATTER.format(instant));
        } catch (Exception ignored) {
        }

        return null;
    }
}
