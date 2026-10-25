package edu.iitm.cs5013.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import edu.iitm.cs5013.matcher.ExactTimestampMatcher;
import edu.iitm.cs5013.model.MatchResult;
import edu.iitm.cs5013.model.SensorParseResult;
import edu.iitm.cs5013.model.SensorType;
import edu.iitm.cs5013.parser.CsvSensorParser;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST API handler for sensor uploads, validation, and exact timestamp matching.
 */
public class ApiHandler implements HttpHandler {

    private final ObjectMapper mapper = new ObjectMapper();
    private final Path sampleDataDir;
    private final Path oct22DataDir;

    public ApiHandler(String sampleDataDirPath) {
        this.sampleDataDir = Paths.get(sampleDataDirPath);
        Path parent = this.sampleDataDir.getParent() != null ? this.sampleDataDir.getParent() : Paths.get(".");
        this.oct22DataDir = parent.resolve("22 Oct 2026 collected data").resolve("22 Oct 2026");

        this.mapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        try {
            com.fasterxml.jackson.core.StreamReadConstraints constraints =
                    com.fasterxml.jackson.core.StreamReadConstraints.builder()
                            .maxStringLength(100_000_000)
                            .build();
            this.mapper.getFactory().setStreamReadConstraints(constraints);
        } catch (Throwable ignored) {
            // Older jackson or constraints not supported
        }
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        // Add CORS headers
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        String path = exchange.getRequestURI().getPath();

        try {
            if ("/api/upload".equals(path) && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleUpload(exchange);
            } else if ("/api/match".equals(path) && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleMatch(exchange);
            } else if ("/api/status".equals(path) && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleStatus(exchange);
            } else if ("/api/samples".equals(path) && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleListSamples(exchange);
            } else if ("/api/oct22-data".equals(path) && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleLoadOct22Data(exchange);
            } else if (path.startsWith("/api/sample-data/") && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleGetSampleData(exchange, path.substring("/api/sample-data/".length()));
            } else {
                sendJson(exchange, 404, Map.of("error", "Endpoint not found: " + path));
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(exchange, 500, Map.of("error", "Internal server error: " + e.getMessage()));
        }
    }

    private void handleUpload(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode root = mapper.readTree(body);

        if (root == null || !root.has("sensorType") || !root.has("csvContent")) {
            sendJson(exchange, 400, Map.of("error", "Invalid request. Must include 'sensorType' and 'csvContent'."));
            return;
        }

        String sensorTypeId = root.get("sensorType").asText();
        String filename = root.has("filename") ? root.get("filename").asText() : "uploaded.csv";

        String csvContent = "";
        JsonNode contentNode = root.get("csvContent");
        if (contentNode.isTextual()) {
            csvContent = contentNode.asText();
        } else if (contentNode.has("value")) {
            csvContent = contentNode.get("value").asText();
        } else {
            csvContent = contentNode.asText();
        }

        SensorType sensorType = SensorType.fromId(sensorTypeId);
        if (sensorType == null) {
            sendJson(exchange, 400, Map.of("error", "Unknown sensor type: " + sensorTypeId));
            return;
        }

        SensorParseResult result = CsvSensorParser.parse(csvContent, sensorType, filename);
        sendJson(exchange, 200, result);
    }

    private void handleMatch(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode root = mapper.readTree(body);

        if (!root.has("seriesX") || !root.has("seriesY")) {
            sendJson(exchange, 400, Map.of("error", "Missing seriesX or seriesY in matching request."));
            return;
        }

        SensorParseResult seriesX = mapper.treeToValue(root.get("seriesX"), SensorParseResult.class);
        SensorParseResult seriesY = mapper.treeToValue(root.get("seriesY"), SensorParseResult.class);
        String labelX = root.has("seriesXLabel") ? root.get("seriesXLabel").asText() : "Series X";
        String labelY = root.has("seriesYLabel") ? root.get("seriesYLabel").asText() : "Series Y";

        MatchResult matchResult = ExactTimestampMatcher.match(seriesX, seriesY, labelX, labelY);
        sendJson(exchange, 200, matchResult);
    }

    private void handleStatus(HttpExchange exchange) throws IOException {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("status", "UP");
        status.put("application", "Multi-Modal Transportation Data Visualization");
        status.put("course", "CS5013");
        status.put("team", "Team AA");
        status.put("authors", List.of("Akshit Gupta (CE23B054)", "Ayush Shukla (CE23B057)"));
        status.put("runtime", System.getProperty("java.version"));
        status.put("oct22DataAvailable", Files.exists(oct22DataDir));
        sendJson(exchange, 200, status);
    }

    private void handleLoadOct22Data(HttpExchange exchange) throws IOException {
        if (!Files.exists(oct22DataDir) || !Files.isDirectory(oct22DataDir)) {
            sendJson(exchange, 404, Map.of("error", "22 Oct 2026 collected data folder not found at: " + oct22DataDir));
            return;
        }

        Map<String, SensorParseResult> datasets = new LinkedHashMap<>();

        // 1. Samsung Watch (HR and IBI)
        Path samsungFile = oct22DataDir.resolve("Samsung watch (HR and IBI).csv");
        if (Files.exists(samsungFile)) {
            String content = Files.readString(samsungFile, StandardCharsets.UTF_8);
            datasets.put(
                    SensorType.SMARTWATCH_HEART_RATE.getId(),
                    CsvSensorParser.parse(content, SensorType.SMARTWATCH_HEART_RATE, samsungFile.getFileName().toString())
            );
        }

        // 2. GNSS + Polar Chest ECG Log
        Path gnssFile = oct22DataDir.resolve("gnss_log_2026_10_22_16_41_32.csv");
        if (Files.exists(gnssFile)) {
            String gnssContent = Files.readString(gnssFile, StandardCharsets.UTF_8);
            String gnssName = gnssFile.getFileName().toString();
            datasets.put(
                    SensorType.CHEST_ECG_HEART_RATE.getId(),
                    CsvSensorParser.parse(gnssContent, SensorType.CHEST_ECG_HEART_RATE, gnssName)
            );
            datasets.put(
                    SensorType.VEHICLE_VELOCITY.getId(),
                    CsvSensorParser.parse(gnssContent, SensorType.VEHICLE_VELOCITY, gnssName)
            );
            datasets.put(
                    SensorType.VEHICLE_ACCELERATION.getId(),
                    CsvSensorParser.parse(gnssContent, SensorType.VEHICLE_ACCELERATION, gnssName)
            );
        }

        // 3. HealthyPi Watch (GSR) - merge all hs_record_*_gsr.csv chunks
        Path gsrDir = oct22DataDir.resolve("Healthypi watch (GSR)");
        if (Files.exists(gsrDir) && Files.isDirectory(gsrDir)) {
            List<Path> gsrFiles;
            try (var stream = Files.list(gsrDir)) {
                gsrFiles = stream.filter(p -> p.toString().toLowerCase().endsWith(".csv"))
                        .sorted()
                        .collect(Collectors.toList());
            }
            if (!gsrFiles.isEmpty()) {
                StringBuilder combinedGsr = new StringBuilder();
                for (Path p : gsrFiles) {
                    combinedGsr.append(Files.readString(p, StandardCharsets.UTF_8)).append("\n");
                }
                datasets.put(
                        SensorType.HEALTHYPI_GSR.getId(),
                        CsvSensorParser.parse(
                                combinedGsr.toString(),
                                SensorType.HEALTHYPI_GSR,
                                "Healthypi watch (GSR) [" + gsrFiles.size() + " files]"
                        )
                );
            }
        }

        sendJson(exchange, 200, Map.of(
                "success", true,
                "datasets", datasets
        ));
    }

    private void handleListSamples(HttpExchange exchange) throws IOException {
        List<Map<String, String>> samples = new ArrayList<>();
        if (Files.exists(sampleDataDir) && Files.isDirectory(sampleDataDir)) {
            try (var stream = Files.list(sampleDataDir)) {
                stream.filter(p -> p.toString().endsWith(".csv")).sorted().forEach(p -> {
                    String filename = p.getFileName().toString();
                    String sensorType = guessSensorType(filename);
                    samples.add(Map.of(
                            "filename", filename,
                            "sensorType", sensorType,
                            "path", p.toString()
                    ));
                });
            }
        }
        sendJson(exchange, 200, samples);
    }

    private void handleGetSampleData(HttpExchange exchange, String filename) throws IOException {
        Path filePath = sampleDataDir.resolve(filename);
        if (!Files.exists(filePath) || Files.isDirectory(filePath)) {
            sendJson(exchange, 404, Map.of("error", "Sample file not found: " + filename));
            return;
        }
        String content = Files.readString(filePath, StandardCharsets.UTF_8);
        String sensorType = guessSensorType(filename);
        Map<String, Object> resp = Map.of(
                "filename", filename,
                "sensorType", sensorType,
                "content", content
        );
        sendJson(exchange, 200, resp);
    }

    private String guessSensorType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.contains("smartwatch") || lower.contains("samsung")) return SensorType.SMARTWATCH_HEART_RATE.getId();
        if (lower.contains("chest") || lower.contains("ecg") || lower.contains("polar")) return SensorType.CHEST_ECG_HEART_RATE.getId();
        if (lower.contains("velocity") || lower.contains("speed")) return SensorType.VEHICLE_VELOCITY.getId();
        if (lower.contains("accel")) return SensorType.VEHICLE_ACCELERATION.getId();
        if (lower.contains("gsr") || lower.contains("healthypi") || lower.contains("hs_record")) return SensorType.HEALTHYPI_GSR.getId();
        return SensorType.SMARTWATCH_HEART_RATE.getId();
    }

    private void sendJson(HttpExchange exchange, int statusCode, Object data) throws IOException {
        byte[] bytes = mapper.writeValueAsBytes(data);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
