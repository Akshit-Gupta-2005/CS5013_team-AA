package edu.iitm.cs5013.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Represents a pair of measurements matched strictly on exact timestamp equality.
 */
public class PairedDataPoint {
    private final long epochMillis;
    private final String formattedTime;
    private final double xValue;
    private final double yValue;
    private final String rawTimestampX;
    private final String rawTimestampY;

    public PairedDataPoint(
            @JsonProperty("epochMillis") long epochMillis,
            @JsonProperty("formattedTime") String formattedTime,
            @JsonProperty("xValue") double xValue,
            @JsonProperty("yValue") double yValue,
            @JsonProperty("rawTimestampX") String rawTimestampX,
            @JsonProperty("rawTimestampY") String rawTimestampY) {
        this.epochMillis = epochMillis;
        this.formattedTime = formattedTime;
        this.xValue = xValue;
        this.yValue = yValue;
        this.rawTimestampX = rawTimestampX;
        this.rawTimestampY = rawTimestampY;
    }

    public long getEpochMillis() {
        return epochMillis;
    }

    public String getFormattedTime() {
        return formattedTime;
    }

    public double getxValue() {
        return xValue;
    }

    public double getyValue() {
        return yValue;
    }

    public String getRawTimestampX() {
        return rawTimestampX;
    }

    public String getRawTimestampY() {
        return rawTimestampY;
    }
}
