package edu.iitm.cs5013.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Represents a single parsed sensor measurement.
 */
public class SensorDataPoint {
    private final String rawTimestamp;
    private final long epochMillis;
    private final String formattedTime;
    private final double value;

    public SensorDataPoint(
            @JsonProperty("rawTimestamp") String rawTimestamp,
            @JsonProperty("epochMillis") long epochMillis,
            @JsonProperty("formattedTime") String formattedTime,
            @JsonProperty("value") double value) {
        this.rawTimestamp = rawTimestamp;
        this.epochMillis = epochMillis;
        this.formattedTime = formattedTime;
        this.value = value;
    }

    public String getRawTimestamp() {
        return rawTimestamp;
    }

    public long getEpochMillis() {
        return epochMillis;
    }

    public String getFormattedTime() {
        return formattedTime;
    }

    public double getValue() {
        return value;
    }

    @Override
    public String toString() {
        return "SensorDataPoint{" +
                "epochMillis=" + epochMillis +
                ", formattedTime='" + formattedTime + '\'' +
                ", value=" + value +
                '}';
    }
}
