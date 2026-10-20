package edu.iitm.cs5013.model;

import java.util.List;

/**
 * Enumeration of supported sensor types for the CS5013 Multi-Modal Transportation Data Visualization.
 */
public enum SensorType {
    SMARTWATCH_HEART_RATE(
            "smartwatch_heart_rate",
            "Smartwatch Heart Rate",
            "BPM",
            "Driver physiological heart rate recorded via wearable smartwatch.",
            List.of("heart_rate", "hr", "heartrate", "bpm", "pulse"),
            List.of("timestamp", "time", "datetime", "ts", "date_time")
    ),
    CHEST_ECG_HEART_RATE(
            "chest_ecg_heart_rate",
            "Chest ECG Monitor",
            "BPM",
            "ECG-derived heart rate recorded via dedicated chest strap monitor.",
            List.of("heart_rate", "ecg_hr", "hr", "heartrate", "bpm", "ecg_bpm"),
            List.of("timestamp", "time", "datetime", "ts", "date_time")
    ),
    VEHICLE_VELOCITY(
            "vehicle_velocity",
            "Vehicle Velocity",
            "km/h",
            "Vehicle ground speed recorded in kilometers per hour.",
            List.of("velocity", "speed", "speed_kmh", "vel", "velocity_kmh"),
            List.of("timestamp", "time", "datetime", "ts", "date_time")
    ),
    VEHICLE_ACCELERATION(
            "vehicle_acceleration",
            "Vehicle Acceleration",
            "m/s²",
            "Longitudinal acceleration/deceleration recorded in meters per second squared.",
            List.of("acceleration", "accel", "acceleration_ms2", "acc", "longitudinal_acceleration"),
            List.of("timestamp", "time", "datetime", "ts", "date_time")
    );

    private final String id;
    private final String displayName;
    private final String unit;
    private final String description;
    private final List<String> valueColumnAliases;
    private final List<String> timestampColumnAliases;

    SensorType(String id, String displayName, String unit, String description,
               List<String> valueColumnAliases, List<String> timestampColumnAliases) {
        this.id = id;
        this.displayName = displayName;
        this.unit = unit;
        this.description = description;
        this.valueColumnAliases = valueColumnAliases;
        this.timestampColumnAliases = timestampColumnAliases;
    }

    public String getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getUnit() {
        return unit;
    }

    public String getDescription() {
        return description;
    }

    public List<String> getValueColumnAliases() {
        return valueColumnAliases;
    }

    public List<String> getTimestampColumnAliases() {
        return timestampColumnAliases;
    }

    public static SensorType fromId(String id) {
        if (id == null) return null;
        for (SensorType type : values()) {
            if (type.id.equalsIgnoreCase(id.trim()) || type.name().equalsIgnoreCase(id.trim())) {
                return type;
            }
        }
        return null;
    }
}
