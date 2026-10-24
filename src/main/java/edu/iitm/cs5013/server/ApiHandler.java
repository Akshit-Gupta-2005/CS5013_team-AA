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

/**
 * REST API handler for sensor uploads, validation, and exact timestamp matching.
 */
public class ApiHandler implements HttpHandler {

    private final ObjectMapper mapper = new ObjectMapper();
    private final Path sampleDataDir;

    public ApiHandler(String sampleDataDirPath) {
        this.sampleDataDir = Paths.get(sampleDataDirPath);
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
        sendJson(exchange, 200, status);
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
        if (lower.contains("smartwatch")) return SensorType.SMARTWATCH_HEART_RATE.getId();
        if (lower.contains("chest") || lower.contains("ecg")) return SensorType.CHEST_ECG_HEART_RATE.getId();
        if (lower.contains("velocity") || lower.contains("speed")) return SensorType.VEHICLE_VELOCITY.getId();
        if (lower.contains("accel")) return SensorType.VEHICLE_ACCELERATION.getId();
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
