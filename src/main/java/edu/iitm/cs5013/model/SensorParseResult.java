package edu.iitm.cs5013.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.List;

/**
 * Result of parsing an uploaded CSV sensor data file.
 */
public class SensorParseResult {
    private final boolean success;
    private final String sensorType;
    private final String displayName;
    private final String unit;
    private final String filename;
    private final int totalRowsRead;
    private final int validDataPointsCount;
    private final Double minValue;
    private final Double maxValue;
    private final Long minEpochMillis;
    private final Long maxEpochMillis;
    private final String minFormattedTime;
    private final String maxFormattedTime;
    private final List<SensorDataPoint> dataPoints;
    private final List<String> errors;
    private final List<String> warnings;

    public SensorParseResult(
            @JsonProperty("success") boolean success,
            @JsonProperty("sensorType") String sensorType,
            @JsonProperty("displayName") String displayName,
            @JsonProperty("unit") String unit,
            @JsonProperty("filename") String filename,
            @JsonProperty("totalRowsRead") int totalRowsRead,
            @JsonProperty("validDataPointsCount") int validDataPointsCount,
            @JsonProperty("minValue") Double minValue,
            @JsonProperty("maxValue") Double maxValue,
            @JsonProperty("minEpochMillis") Long minEpochMillis,
            @JsonProperty("maxEpochMillis") Long maxEpochMillis,
            @JsonProperty("minFormattedTime") String minFormattedTime,
            @JsonProperty("maxFormattedTime") String maxFormattedTime,
            @JsonProperty("dataPoints") List<SensorDataPoint> dataPoints,
            @JsonProperty("errors") List<String> errors,
            @JsonProperty("warnings") List<String> warnings) {
        this.success = success;
        this.sensorType = sensorType;
        this.displayName = displayName;
        this.unit = unit;
        this.filename = filename;
        this.totalRowsRead = totalRowsRead;
        this.validDataPointsCount = validDataPointsCount;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.minEpochMillis = minEpochMillis;
        this.maxEpochMillis = maxEpochMillis;
        this.minFormattedTime = minFormattedTime;
        this.maxFormattedTime = maxFormattedTime;
        this.dataPoints = dataPoints != null ? dataPoints : new ArrayList<>();
        this.errors = errors != null ? errors : new ArrayList<>();
        this.warnings = warnings != null ? warnings : new ArrayList<>();
    }

    public static SensorParseResult failure(String sensorType, String filename, List<String> errors) {
        return new SensorParseResult(
                false,
                sensorType,
                sensorType != null ? sensorType : "Unknown Sensor",
                "",
                filename,
                0,
                0,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(),
                errors,
                List.of()
        );
    }

    public boolean isSuccess() {
        return success;
    }

    public String getSensorType() {
        return sensorType;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getUnit() {
        return unit;
    }

    public String getFilename() {
        return filename;
    }

    public int getTotalRowsRead() {
        return totalRowsRead;
    }

    public int getValidDataPointsCount() {
        return validDataPointsCount;
    }

    public Double getMinValue() {
        return minValue;
    }

    public Double getMaxValue() {
        return maxValue;
    }

    public Long getMinEpochMillis() {
        return minEpochMillis;
    }

    public Long getMaxEpochMillis() {
        return maxEpochMillis;
    }

    public String getMinFormattedTime() {
        return minFormattedTime;
    }

    public String getMaxFormattedTime() {
        return maxFormattedTime;
    }

    public List<SensorDataPoint> getDataPoints() {
        return dataPoints;
    }

    public List<String> getErrors() {
        return errors;
    }

    public List<String> getWarnings() {
        return warnings;
    }
}
