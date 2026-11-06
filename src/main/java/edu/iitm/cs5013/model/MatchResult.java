package edu.iitm.cs5013.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Result of exact timestamp matching between two sensor streams, including correlation and agreement statistics.
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
    private final Double pearsonR;
    private final Double regressionSlope;
    private final Double regressionIntercept;
    private final Double meanDiff;
    private final Double stdDiff;
    private final Double mae;
    private final Double rmse;
    private final List<PairedDataPoint> matchedPoints;

    public MatchResult(
            boolean hasSufficientMatches,
            int matchCount,
            int totalSeries1Points,
            int totalSeries2Points,
            String series1Name,
            String series2Name,
            String series1Unit,
            String series2Unit,
            String message,
            List<PairedDataPoint> matchedPoints) {
        this(
                hasSufficientMatches,
                matchCount,
                totalSeries1Points,
                totalSeries2Points,
                series1Name,
                series2Name,
                series1Unit,
                series2Unit,
                message,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                matchedPoints
        );
    }

    @JsonCreator
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
            @JsonProperty("pearsonR") Double pearsonR,
            @JsonProperty("regressionSlope") Double regressionSlope,
            @JsonProperty("regressionIntercept") Double regressionIntercept,
            @JsonProperty("meanDiff") Double meanDiff,
            @JsonProperty("stdDiff") Double stdDiff,
            @JsonProperty("mae") Double mae,
            @JsonProperty("rmse") Double rmse,
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
        this.pearsonR = pearsonR;
        this.regressionSlope = regressionSlope;
        this.regressionIntercept = regressionIntercept;
        this.meanDiff = meanDiff;
        this.stdDiff = stdDiff;
        this.mae = mae;
        this.rmse = rmse;
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

    public Double getPearsonR() {
        return pearsonR;
    }

    public Double getRegressionSlope() {
        return regressionSlope;
    }

    public Double getRegressionIntercept() {
        return regressionIntercept;
    }

    public Double getMeanDiff() {
        return meanDiff;
    }

    public Double getStdDiff() {
        return stdDiff;
    }

    public Double getMae() {
        return mae;
    }

    public Double getRmse() {
        return rmse;
    }

    public List<PairedDataPoint> getMatchedPoints() {
        return matchedPoints;
    }
}
