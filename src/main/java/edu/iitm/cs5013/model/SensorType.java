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
            List.of("heart_rate", "hr_bpm", "hr", "heartrate", "bpm", "pulse"),
            List.of("timestamp", "watch_timestamp_ms", "phone_received_ms", "time", "datetime", "ts", "date_time")
    ),
    CHEST_ECG_HEART_RATE(
            "chest_ecg_heart_rate",
            "Chest ECG Monitor",
            "BPM",
            "ECG-derived heart rate recorded via dedicated chest strap monitor.",
            List.of("heart_rate", "ecg_hr", "polar_hr_bpm", "hr", "heartrate", "bpm", "ecg_bpm"),
            List.of("timestamp", "time", "time_ist", "datetime", "ts", "date_time", "date")
    ),
    VEHICLE_VELOCITY(
            "vehicle_velocity",
            "Vehicle Velocity",
            "km/h",
            "Vehicle ground speed recorded in kilometers per hour.",
            List.of("velocity", "speed", "speed_kmh", "speed_kph", "speedkph", "vel", "velocity_kmh"),
            List.of("timestamp", "time", "time_ist", "datetime", "ts", "date_time", "date")
    ),
    VEHICLE_ACCELERATION(
            "vehicle_acceleration",
            "Vehicle Acceleration",
            "m/s²",
            "Longitudinal acceleration/deceleration recorded in meters per second squared.",
            List.of("acceleration", "accel", "acceleration_mps2", "accel_mps2", "acc", "longitudinal_acceleration"),
            List.of("timestamp", "time", "time_ist", "datetime", "ts", "date_time", "date")
    ),
    HEALTHYPI_GSR(
            "healthypi_gsr",
            "HealthyPi Watch (GSR)",
            "GSR (Detrended)",
            "Electrodermal activity / galvanic skin response recorded via HealthyPi wearable.",
            List.of("ch0_detrended", "gsr", "eda", "ch0", "skin_conductance"),
            List.of("timestamp_utc", "timestamp", "time", "datetime", "ts", "t_ms")
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
