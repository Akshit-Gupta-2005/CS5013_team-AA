package edu.iitm.cs5013.server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Handles static web asset serving for the dashboard frontend.
 */
public class StaticFileHandler implements HttpHandler {

    private final String resourceBasePath;
    private final Path filesystemBasePath;

    public StaticFileHandler(String resourceBasePath, String filesystemBasePath) {
        this.resourceBasePath = resourceBasePath;
        this.filesystemBasePath = Paths.get(filesystemBasePath);
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path == null || path.equals("/") || path.isEmpty()) {
            path = "/index.html";
        }

        // Prevent path traversal
        if (path.contains("..")) {
            sendResponse(exchange, 403, "Access Denied", "text/plain");
            return;
        }

        byte[] content = null;
        String contentType = getContentType(path);

        // Try reading from filesystem first (useful for active live edits)
        Path filePath = filesystemBasePath.resolve(path.startsWith("/") ? path.substring(1) : path);
        if (Files.exists(filePath) && !Files.isDirectory(filePath)) {
            content = Files.readAllBytes(filePath);
        } else {
            // Fallback to classpath resources
            String resourcePath = resourceBasePath + (path.startsWith("/") ? path : "/" + path);
            try (InputStream is = getClass().getResourceAsStream(resourcePath)) {
                if (is != null) {
                    content = is.readAllBytes();
                }
            }
        }

        if (content == null) {
            sendResponse(exchange, 404, "404 Not Found: " + path, "text/plain");
            return;
        }

        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
        exchange.sendResponseHeaders(200, content.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(content);
        }
    }

    private void sendResponse(HttpExchange exchange, int statusCode, String message, String contentType) throws IOException {
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String getContentType(String path) {
        if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html; charset=UTF-8";
        if (path.endsWith(".css")) return "text/css; charset=UTF-8";
        if (path.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (path.endsWith(".json")) return "application/json; charset=UTF-8";
        if (path.endsWith(".csv")) return "text/csv; charset=UTF-8";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".ico")) return "image/x-icon";
        return "text/plain; charset=UTF-8";
    }
}
