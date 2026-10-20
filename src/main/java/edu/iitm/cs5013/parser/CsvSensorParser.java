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
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.util.*;

/**
 * Robust CSV parser for multi-modal sensor streams.
 * Compliant with CS5013 Phase 3 specifications.
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

            // Detect timestamp column
            String timestampCol = findColumn(headerMap, sensorType.getTimestampColumnAliases());
            // Detect value column
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

            // Sort by timestamp to ensure chronological order for time-series plotting
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
        // Direct matching or normalized lowercase matching
        for (String header : headerMap.keySet()) {
            String norm = normalize(header);
            for (String alias : aliases) {
                if (norm.equals(normalize(alias))) {
                    return header;
                }
            }
        }
        // Substring matching as secondary fallback
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

    private static String normalize(String s) {
        if (s == null) return "";
        return s.toLowerCase().replaceAll("[^a-z0-9]", "");
    }

    private static class ParsedTimestamp {
        final long epochMillis;
        final String formatted;

        ParsedTimestamp(long epochMillis, String formatted) {
            this.epochMillis = epochMillis;
            this.formatted = formatted;
        }
    }

    public static ParsedTimestamp parseTimestamp(String raw) {
        if (raw == null || raw.isEmpty()) return null;

        // Check if raw is a pure numeric epoch (seconds or milliseconds)
        if (raw.matches("^-?\\d+(\\.\\d+)?$")) {
            try {
                double num = Double.parseDouble(raw);
                long millis;
                if (num > 1e11) {
                    // Unix epoch milliseconds (e.g. 1697000000000)
                    millis = (long) num;
                } else if (num > 1e8) {
                    // Unix epoch seconds (e.g. 1697000000)
                    millis = (long) (num * 1000.0);
                } else {
                    // Relative seconds or small timestamp (e.g. 0.0, 1.0, 10.5)
                    // Anchor at 2026-10-11T00:00:00Z (a reasonable baseline for relative trip time)
                    millis = (long) (num * 1000.0);
                }
                String formatted = DISPLAY_FORMATTER.format(Instant.ofEpochMilli(millis));
                return new ParsedTimestamp(millis, formatted);
            } catch (Exception ignored) {
            }
        }

        // Try standard ISO Instant
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
