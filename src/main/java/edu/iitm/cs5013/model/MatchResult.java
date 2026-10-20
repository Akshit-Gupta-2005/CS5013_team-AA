package edu.iitm.cs5013.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Result of exact timestamp matching between two sensor streams.
 */
public class MatchResult {
    private final boolean hasSufficientMatches;
    private final int matchCount;
    private final int totalSeries1Points;
    private final int totalSeries2Points;
    private final String series1Name;
    private final String series2Name;
    private final String series1Unit;
    private final String series2Unit;
    private final String message;
    private final List<PairedDataPoint> matchedPoints;

    public MatchResult(
            @JsonProperty("hasSufficientMatches") boolean hasSufficientMatches,
            @JsonProperty("matchCount") int matchCount,
            @JsonProperty("totalSeries1Points") int totalSeries1Points,
            @JsonProperty("totalSeries2Points") int totalSeries2Points,
            @JsonProperty("series1Name") String series1Name,
            @JsonProperty("series2Name") String series2Name,
            @JsonProperty("series1Unit") String series1Unit,
            @JsonProperty("series2Unit") String series2Unit,
            @JsonProperty("message") String message,
            @JsonProperty("matchedPoints") List<PairedDataPoint> matchedPoints) {
        this.hasSufficientMatches = hasSufficientMatches;
        this.matchCount = matchCount;
        this.totalSeries1Points = totalSeries1Points;
        this.totalSeries2Points = totalSeries2Points;
        this.series1Name = series1Name;
        this.series2Name = series2Name;
        this.series1Unit = series1Unit;
        this.series2Unit = series2Unit;
        this.message = message;
        this.matchedPoints = matchedPoints;
    }

    public boolean isHasSufficientMatches() {
        return hasSufficientMatches;
    }

    public int getMatchCount() {
        return matchCount;
    }

    public int getTotalSeries1Points() {
        return totalSeries1Points;
    }

    public int getTotalSeries2Points() {
        return totalSeries2Points;
    }

    public String getSeries1Name() {
        return series1Name;
    }

    public String getSeries2Name() {
        return series2Name;
    }

    public String getSeries1Unit() {
        return series1Unit;
    }

    public String getSeries2Unit() {
        return series2Unit;
    }

    public String getMessage() {
        return message;
    }

    public List<PairedDataPoint> getMatchedPoints() {
        return matchedPoints;
    }
}
