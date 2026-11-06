package edu.iitm.cs5013.matcher;

import edu.iitm.cs5013.model.MatchResult;
import edu.iitm.cs5013.model.PairedDataPoint;
import edu.iitm.cs5013.model.SensorDataPoint;
import edu.iitm.cs5013.model.SensorParseResult;

import java.util.*;

/**
 * Strict exact-timestamp matcher for exploratory cross-sensor relationship visualizations.
 * Strictly adheres to project rule: No clock offsets, interpolation, or resampling.
 */
public class ExactTimestampMatcher {

    public static MatchResult match(
            SensorParseResult seriesX,
            SensorParseResult seriesY,
            String seriesXLabel,
            String seriesYLabel) {

        if (seriesX == null || !seriesX.isSuccess() || seriesX.getDataPoints().isEmpty()) {
            return new MatchResult(
                    false,
                    0,
                    0,
                    seriesY != null ? seriesY.getValidDataPointsCount() : 0,
                    seriesXLabel,
                    seriesYLabel,
                    seriesX != null ? seriesX.getUnit() : "",
                    seriesY != null ? seriesY.getUnit() : "",
                    "First sensor stream (" + seriesXLabel + ") has no data uploaded.",
                    List.of()
            );
        }

        if (seriesY == null || !seriesY.isSuccess() || seriesY.getDataPoints().isEmpty()) {
            return new MatchResult(
                    false,
                    0,
                    seriesX.getValidDataPointsCount(),
                    0,
                    seriesXLabel,
                    seriesYLabel,
                    seriesX.getUnit(),
                    seriesY != null ? seriesY.getUnit() : "",
                    "Second sensor stream (" + seriesYLabel + ") has no data uploaded.",
                    List.of()
            );
        }

        // Build index of series Y by exact epoch millisecond
        Map<Long, SensorDataPoint> yByMillis = new HashMap<>(seriesY.getDataPoints().size());
        for (SensorDataPoint pt : seriesY.getDataPoints()) {
            yByMillis.putIfAbsent(pt.getEpochMillis(), pt);
        }

        List<PairedDataPoint> matched = new ArrayList<>();
        // To prevent duplicate timestamp entries if series X had duplicates
        Set<Long> seenMillis = new HashSet<>();

        for (SensorDataPoint ptX : seriesX.getDataPoints()) {
            long ts = ptX.getEpochMillis();
            if (seenMillis.contains(ts)) {
                continue;
            }
            SensorDataPoint ptY = yByMillis.get(ts);
            if (ptY != null) {
                seenMillis.add(ts);
                matched.add(new PairedDataPoint(
                        ts,
                        ptX.getFormattedTime(),
                        ptX.getValue(),
                        ptY.getValue(),
                        ptX.getRawTimestamp(),
                        ptY.getRawTimestamp()
                ));
            }
        }

        int count = matched.size();
        boolean sufficient = count > 0;
        String message;

        Double pearsonR = null;
        Double regressionSlope = null;
        Double regressionIntercept = null;
        Double meanDiff = null;
        Double stdDiff = null;
        Double mae = null;
        Double rmse = null;

        if (!sufficient) {
            message = "Insufficient exact timestamp matches to plot this relationship (0 matches found out of "
                    + seriesX.getValidDataPointsCount() + " and " + seriesY.getValidDataPointsCount()
                    + " records). Exact timestamp equality is required; no clock offsets or interpolation are applied.";
        } else {
            message = "Identified " + count + " exact timestamp matches between " + seriesXLabel + " ("
                    + seriesX.getValidDataPointsCount() + " points) and " + seriesYLabel + " ("
                    + seriesY.getValidDataPointsCount() + " points).";

            double sumX = 0.0;
            double sumY = 0.0;
            double sumDiff = 0.0;
            double sumAbsDiff = 0.0;
            double sumSqDiff = 0.0;

            for (PairedDataPoint pt : matched) {
                double x = pt.getxValue();
                double y = pt.getyValue();
                double d = y - x;
                sumX += x;
                sumY += y;
                sumDiff += d;
                sumAbsDiff += Math.abs(d);
                sumSqDiff += d * d;
            }

            double meanX = sumX / count;
            double meanY = sumY / count;
            meanDiff = sumDiff / count;
            mae = sumAbsDiff / count;
            rmse = Math.sqrt(sumSqDiff / count);

            if (count > 1) {
                double sxx = 0.0;
                double syy = 0.0;
                double sxy = 0.0;
                double varDiff = 0.0;

                for (PairedDataPoint pt : matched) {
                    double dx = pt.getxValue() - meanX;
                    double dy = pt.getyValue() - meanY;
                    double dd = (pt.getyValue() - pt.getxValue()) - meanDiff;
                    sxx += dx * dx;
                    syy += dy * dy;
                    sxy += dx * dy;
                    varDiff += dd * dd;
                }

                stdDiff = Math.sqrt(varDiff / count);
                if (sxx > 1e-12) {
                    regressionSlope = sxy / sxx;
                    regressionIntercept = meanY - regressionSlope * meanX;
                    if (syy > 1e-12) {
                        pearsonR = Math.max(-1.0, Math.min(1.0, sxy / Math.sqrt(sxx * syy)));
                    } else {
                        pearsonR = 0.0;
                    }
                } else {
                    regressionSlope = 0.0;
                    regressionIntercept = meanY;
                    pearsonR = 0.0;
                }
            } else {
                stdDiff = 0.0;
                pearsonR = 0.0;
                regressionSlope = 0.0;
                regressionIntercept = meanY;
            }
        }

        return new MatchResult(
                sufficient,
                count,
                seriesX.getValidDataPointsCount(),
                seriesY.getValidDataPointsCount(),
                seriesXLabel,
                seriesYLabel,
                seriesX.getUnit(),
                seriesY.getUnit(),
                message,
                pearsonR,
                regressionSlope,
                regressionIntercept,
                meanDiff,
                stdDiff,
                mae,
                rmse,
                matched
        );
    }
}
