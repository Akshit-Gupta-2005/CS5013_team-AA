package edu.iitm.cs5013.server;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

/**
 * Embedded HTTP server hosting the visualization backend and frontend dashboard.
 */
public class DashboardServer {

    private final int port;
    private final String sampleDataPath;
    private final String webFilesPath;
    private HttpServer server;

    public DashboardServer(int port, String sampleDataPath, String webFilesPath) {
        this.port = port;
        this.sampleDataPath = sampleDataPath;
        this.webFilesPath = webFilesPath;
    }

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));

        // API routes
        ApiHandler apiHandler = new ApiHandler(sampleDataPath);
        server.createContext("/api", apiHandler);

        // Static frontend routes
        StaticFileHandler staticHandler = new StaticFileHandler("/web", webFilesPath);
        server.createContext("/", staticHandler);

        server.start();
        System.out.println("==================================================================");
        System.out.println("  CS5013: Multi-Modal Transportation Data Visualization Dashboard");
        System.out.println("  Team AA | Akshit Gupta (CE23B054) & Ayush Shukla (CE23B057)");
        System.out.println("==================================================================");
        System.out.println("  Server successfully started on: http://localhost:" + port);
        System.out.println("  Press Ctrl+C to stop.");
        System.out.println("==================================================================");
    }

    public void stop() {
        if (server != null) {
            server.stop(1);
            System.out.println("Dashboard server stopped.");
        }
    }

    public int getPort() {
        return port;
    }
}
